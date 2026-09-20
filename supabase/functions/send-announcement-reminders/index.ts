import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';

type ReminderSetting = {
  days_before: number;
  hour: number;
  minute: number;
};

type RequestPayload = {
  action?: 'list' | 'save' | 'run_due';
  announcement_id?: string;
  announcement_date?: string;
  title?: string;
  body?: string;
  audience?: string;
  reminders?: ReminderSetting[];
  now?: string;
};

type ProfileRow = { user_id: string; role: string };
type TokenRow = { id: string; user_id: string; expo_push_token: string; is_active: boolean };
type PreferenceRow = { user_id: string; enabled: boolean; announcements_events: boolean };
type ExpoTicket = { status?: string; id?: string; message?: string; details?: Record<string, unknown> };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isUuid(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeReminder(value: Partial<ReminderSetting>) {
  return {
    days_before: Math.max(0, Math.min(60, Math.trunc(Number(value.days_before ?? 0)))),
    hour: Math.max(0, Math.min(23, Math.trunc(Number(value.hour ?? 9)))),
    minute: Math.max(0, Math.min(59, Math.trunc(Number(value.minute ?? 0)))),
  };
}

function audienceMatches(audience: string, role: string) {
  if (audience === 'public') return true;
  if (audience === 'clients') return role === 'client' || role === 'member';
  if (audience === 'members') return role === 'member';
  if (audience === 'admins') return role === 'admin' || role === 'super_admin';
  return false;
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Faltan variables de entorno de Supabase.' }, 500);
  }

  let payload: RequestPayload = {};
  try { payload = await req.json(); } catch { payload = {}; }
  const action = payload.action ?? 'list';

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const cronHeader = req.headers.get('x-cron-secret') ?? '';
  let vaultCronSecret = '';

  if (action === 'run_due') {
    const { data: storedSecret, error: storedSecretError } = await serviceClient.rpc('get_internal_cron_secret');
    if (!storedSecretError && typeof storedSecret === 'string') vaultCronSecret = storedSecret;
  }

  const isCronCall = action === 'run_due' && Boolean(
    cronHeader && (
      (cronSecret && cronHeader === cronSecret) ||
      (vaultCronSecret && cronHeader === vaultCronSecret)
    )
  );
  let adminUserId: string | null = null;
  let userClient: ReturnType<typeof createClient> | null = null;

  if (!isCronCall) {
    const authorization = req.headers.get('Authorization') ?? '';
    if (!authorization) return jsonResponse({ error: 'Falta Authorization header.' }, 401);

    userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: authResult, error: authError } = await userClient.auth.getUser();
    adminUserId = authResult.user?.id ?? null;
    if (authError || !adminUserId) return jsonResponse({ error: 'Sesión inválida.' }, 401);

    const { data: profile, error: profileError } = await serviceClient.from('profiles').select('role').eq('user_id', adminUserId).maybeSingle();
    if (profileError) return jsonResponse({ error: profileError.message }, 500);
    if (!profile || !['admin', 'super_admin'].includes(String(profile.role))) return jsonResponse({ error: 'Solo administradores pueden gestionar recordatorios.' }, 403);
  }

  if (action === 'list') {
    if (!isUuid(payload.announcement_id)) return jsonResponse({ error: 'announcement_id inválido.' }, 400);

    if (!userClient) return jsonResponse({ error: 'Sesión administrativa no disponible.' }, 401);

    const { data, error } = await userClient
      .from('notification_campaigns')
      .select('id,status,metadata,created_at')
      .eq('category', 'announcements_events')
      .eq('status', 'draft')
      .is('archived_at', null)
      .contains('metadata', { source: 'announcement_reminder', announcement_id: payload.announcement_id })
      .order('created_at', { ascending: true });

    if (error) return jsonResponse({ error: error.message }, 500);
    const reminders = (data ?? []).map((row) => ({
      days_before: Number(row.metadata?.days_before ?? 0),
      hour: Number(row.metadata?.hour ?? 9),
      minute: Number(row.metadata?.minute ?? 0),
      remind_at: String(row.metadata?.remind_at ?? ''),
      status: row.status,
    }));
    return jsonResponse({ reminders });
  }

  if (action === 'save') {
    if (!isUuid(payload.announcement_id)) return jsonResponse({ error: 'announcement_id inválido.' }, 400);
    if (!userClient) return jsonResponse({ error: 'Sesión administrativa no disponible.' }, 401);

    const normalized = Array.isArray(payload.reminders)
      ? payload.reminders
        .map(normalizeReminder)
        .filter((item, index, all) => all.findIndex((candidate) =>
          candidate.days_before === item.days_before
          && candidate.hour === item.hour
          && candidate.minute === item.minute
        ) === index)
        .slice(0, 5)
      : [];

    const { data, error } = await userClient.rpc('admin_replace_announcement_reminders', {
      p_announcement_id: payload.announcement_id,
      p_reminders: normalized,
    });

    if (error) return jsonResponse({ error: error.message }, 500);

    return jsonResponse({ reminders: (data ?? []).map((row) => ({
      days_before: Number(row.metadata?.days_before ?? 0),
      hour: Number(row.metadata?.hour ?? 9),
      minute: Number(row.metadata?.minute ?? 0),
      remind_at: String(row.metadata?.remind_at ?? ''),
      status: row.status,
    })) });
  }

  if (action !== 'run_due') return jsonResponse({ error: 'Acción no soportada.' }, 400);
  if (!isCronCall) return jsonResponse({ error: 'run_due requiere x-cron-secret.' }, 401);

  const referenceNow = payload.now ? new Date(payload.now) : new Date();
  if (Number.isNaN(referenceNow.getTime())) return jsonResponse({ error: 'now inválido.' }, 400);

  const { data: drafts, error: draftsError } = await serviceClient
    .from('notification_campaigns')
    .select('*')
    .eq('category', 'announcements_events')
    .eq('status', 'draft')
    .is('archived_at', null)
    .contains('metadata', { source: 'announcement_reminder' })
    .order('created_at', { ascending: true })
    .limit(100);
  if (draftsError) return jsonResponse({ error: draftsError.message }, 500);

  const due = (drafts ?? []).filter((campaign) => {
    const remindAt = new Date(String(campaign.metadata?.remind_at ?? ''));
    return !Number.isNaN(remindAt.getTime()) && remindAt.getTime() <= referenceNow.getTime();
  });
  if (!due.length) return jsonResponse({ processed: 0, sent: 0, message: 'No hay recordatorios vencidos.' });

  const announcementIds = [...new Set(due.map((campaign) => String(campaign.metadata?.announcement_id ?? '')).filter(Boolean))];
  const [announcementsResult, profilesResult, tokensResult, preferencesResult] = await Promise.all([
    serviceClient.from('announcements').select('id,title,content,audience,is_published,archived_at').in('id', announcementIds),
    serviceClient.from('profiles').select('user_id,role'),
    serviceClient.from('notification_tokens').select('id,user_id,expo_push_token,is_active').eq('is_active', true),
    serviceClient.from('notification_preferences').select('user_id,enabled,announcements_events'),
  ]);

  if (announcementsResult.error) return jsonResponse({ error: announcementsResult.error.message }, 500);
  if (profilesResult.error) return jsonResponse({ error: profilesResult.error.message }, 500);
  if (tokensResult.error) return jsonResponse({ error: tokensResult.error.message }, 500);
  if (preferencesResult.error) return jsonResponse({ error: preferencesResult.error.message }, 500);

  const announcementById = new Map((announcementsResult.data ?? []).map((item) => [item.id, item]));
  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const tokens = (tokensResult.data ?? []) as TokenRow[];
  const preferenceByUser = new Map(((preferencesResult.data ?? []) as PreferenceRow[]).map((item) => [item.user_id, item]));
  const tokensByUser = new Map<string, TokenRow[]>();
  for (const token of tokens) {
    if (!token.expo_push_token.startsWith('ExponentPushToken[') && !token.expo_push_token.startsWith('ExpoPushToken[')) continue;
    if (!tokensByUser.has(token.user_id)) tokensByUser.set(token.user_id, []);
    tokensByUser.get(token.user_id)?.push(token);
  }

  let sentCampaigns = 0;
  let failedCampaigns = 0;

  for (const campaign of due) {
    const announcementId = String(campaign.metadata?.announcement_id ?? '');
    const announcement = announcementById.get(announcementId);

    if (!announcement || !announcement.is_published || announcement.archived_at) {
      await serviceClient.from('notification_campaigns').update({ status: 'no_targets', sent_at: new Date().toISOString() }).eq('id', campaign.id);
      continue;
    }

    const { data: claimedCampaign, error: lockError } = await serviceClient
      .from('notification_campaigns')
      .update({ status: 'sending' })
      .eq('id', campaign.id)
      .eq('status', 'draft')
      .select('id')
      .maybeSingle();
    if (lockError) {
      failedCampaigns += 1;
      continue;
    }
    if (!claimedCampaign) {
      // Otra ejecución ganó el compare-and-set draft -> sending.
      continue;
    }

    const eligibleUsers = profiles.filter((profile) => {
      if (!audienceMatches(String(announcement.audience), profile.role)) return false;
      const preference = preferenceByUser.get(profile.user_id);
      return Boolean(preference?.enabled && preference.announcements_events && tokensByUser.has(profile.user_id));
    });

    const targets = eligibleUsers.flatMap((profile) => (tokensByUser.get(profile.user_id) ?? []).map((token) => ({ profile, token })));
    if (!targets.length) {
      await serviceClient.from('notification_campaigns').update({ status: 'no_targets', total_targets: 0, sent_at: new Date().toISOString() }).eq('id', campaign.id);
      continue;
    }

    const deliveries: Array<Record<string, unknown>> = [];
    let successCount = 0;
    let failureCount = 0;

    for (const batch of chunk(targets, 100)) {
      const messages = batch.map(({ token }) => ({
        to: token.expo_push_token,
        title: `Recordatorio: ${announcement.title}`,
        body: String(announcement.content ?? '').slice(0, 220),
        sound: 'default',
        data: { category: 'announcements_events', source: 'announcement_reminder', announcement_id: announcement.id, campaign_id: campaign.id },
      }));

      const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
          ...(expoAccessToken ? { Authorization: `Bearer ${expoAccessToken}` } : {}),
        },
        body: JSON.stringify(messages),
      });
      const expoJson = await expoResponse.json().catch(() => ({ errors: [{ message: 'Respuesta inválida de Expo.' }] }));
      const tickets = Array.isArray(expoJson?.data) ? expoJson.data as ExpoTicket[] : [];

      batch.forEach(({ profile, token }, index) => {
        const ticket = tickets[index] ?? (expoJson?.errors?.[0] as ExpoTicket | undefined) ?? { status: 'error', message: 'Sin ticket de Expo.' };
        const ok = expoResponse.ok && ticket.status === 'ok';
        if (ok) successCount += 1;
        else failureCount += 1;
        deliveries.push({
          campaign_id: campaign.id,
          user_id: profile.user_id,
          token_id: token.id,
          expo_push_token: token.expo_push_token,
          status: ok ? 'sent' : 'error',
          expo_response: ticket,
          error_message: ok ? null : ticket.message ?? `HTTP ${expoResponse.status}`,
          sent_at: new Date().toISOString(),
        });
      });
    }

    if (deliveries.length) {
      const { error: deliveryError } = await serviceClient.from('notification_deliveries').insert(deliveries);
      if (deliveryError) {
        await serviceClient.from('notification_campaigns').update({ status: 'failed', failure_count: targets.length, total_targets: targets.length, sent_at: new Date().toISOString() }).eq('id', campaign.id);
        failedCampaigns += 1;
        continue;
      }
    }

    const finalStatus = successCount > 0 && failureCount === 0 ? 'sent' : successCount > 0 ? 'partial_failed' : 'failed';
    await serviceClient.from('notification_campaigns').update({
      status: finalStatus,
      total_targets: targets.length,
      success_count: successCount,
      failure_count: failureCount,
      sent_at: new Date().toISOString(),
    }).eq('id', campaign.id);

    if (finalStatus === 'sent' || finalStatus === 'partial_failed') sentCampaigns += 1;
    else failedCampaigns += 1;
  }

  return jsonResponse({ processed: due.length, sent: sentCampaigns, failed: failedCampaigns });
});
