import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';

type Audience = 'public' | 'clients' | 'members' | 'admins';
type Category = 'announcements_events' | 'classes' | 'membership' | 'achievements';

type NotificationRequest = {
  title?: string;
  body?: string;
  audience?: Audience;
  category?: Category;
  data?: Record<string, unknown>;
};

type TokenRow = {
  id: string;
  user_id: string;
  expo_push_token: string;
  is_active: boolean;
};

type ProfileRow = {
  user_id: string;
  role: string | null;
};

type PreferenceRow = {
  user_id: string;
  enabled: boolean;
  announcements_events: boolean;
  classes: boolean;
  membership: boolean;
  achievements: boolean;
};

type ExpoTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function audienceMatches(role: string | null | undefined, audience: Audience) {
  if (audience === 'public') return true;
  if (audience === 'clients') return role === 'client' || role === 'member';
  if (audience === 'members') return role === 'member';
  return role === 'admin' || role === 'super_admin';
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Metodo no permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Faltan variables de entorno de Supabase en la Edge Function.' }, 500);
  }

  const authorization = req.headers.get('Authorization') ?? '';

  if (!authorization) {
    return jsonResponse({ error: 'Falta Authorization header.' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userResult, error: userError } = await userClient.auth.getUser();
  const userId = userResult.user?.id ?? null;

  if (userError || !userId) {
    return jsonResponse({ error: 'Sesion invalida.' }, 401);
  }

  const { data: adminProfile, error: adminProfileError } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (adminProfileError) {
    return jsonResponse({ error: adminProfileError.message }, 500);
  }

  if (!adminProfile || !['admin', 'super_admin'].includes(String(adminProfile.role))) {
    return jsonResponse({ error: 'Solo administradores pueden enviar notificaciones.' }, 403);
  }

  let payload: NotificationRequest;

  try {
    payload = await req.json();
  } catch (_error) {
    return jsonResponse({ error: 'Body JSON invalido.' }, 400);
  }

  const title = cleanText(payload.title, 80);
  const body = cleanText(payload.body, 180);
  const audience = payload.audience ?? 'public';
  const category = payload.category ?? 'announcements_events';

  if (!title) return jsonResponse({ error: 'El titulo es obligatorio.' }, 400);
  if (!body) return jsonResponse({ error: 'El mensaje es obligatorio.' }, 400);
  if (!['public', 'clients', 'members', 'admins'].includes(audience)) {
    return jsonResponse({ error: 'Audiencia invalida.' }, 400);
  }
  if (!['announcements_events', 'classes', 'membership', 'achievements'].includes(category)) {
    return jsonResponse({ error: 'Categoria invalida.' }, 400);
  }

  const { data: tokenRows, error: tokenError } = await serviceClient
    .from('notification_tokens')
    .select('id,user_id,expo_push_token,is_active')
    .eq('is_active', true);

  if (tokenError) return jsonResponse({ error: tokenError.message }, 500);

  const tokens = (tokenRows ?? []) as TokenRow[];
  const uniqueUserIds = [...new Set(tokens.map((token) => token.user_id))];

  const [{ data: profileRows, error: profilesError }, { data: preferenceRows, error: preferencesError }] = await Promise.all([
    uniqueUserIds.length
      ? serviceClient.from('profiles').select('user_id,role').in('user_id', uniqueUserIds)
      : Promise.resolve({ data: [], error: null }),
    uniqueUserIds.length
      ? serviceClient.from('notification_preferences').select('user_id,enabled,announcements_events,classes,membership,achievements').in('user_id', uniqueUserIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesError) return jsonResponse({ error: profilesError.message }, 500);
  if (preferencesError) return jsonResponse({ error: preferencesError.message }, 500);

  const profileByUserId = new Map((profileRows ?? []).map((profile: ProfileRow) => [profile.user_id, profile]));
  const preferenceByUserId = new Map((preferenceRows ?? []).map((preference: PreferenceRow) => [preference.user_id, preference]));

  const recipients = tokens.filter((token) => {
    const profile = profileByUserId.get(token.user_id);
    const preference = preferenceByUserId.get(token.user_id);

    if (!preference?.enabled) return false;
    if (!preference[category]) return false;
    if (!audienceMatches(profile?.role, audience)) return false;
    return token.expo_push_token.startsWith('ExponentPushToken[') || token.expo_push_token.startsWith('ExpoPushToken[');
  });

  const { data: campaign, error: campaignError } = await serviceClient
    .from('notification_campaigns')
    .insert({
      title,
      body,
      audience,
      category,
      status: recipients.length ? 'sending' : 'no_targets',
      total_targets: recipients.length,
      created_by: userId,
      metadata: { source: 'admin_manual' },
    })
    .select('*')
    .single();

  if (campaignError) return jsonResponse({ error: campaignError.message }, 500);

  if (!recipients.length) {
    return jsonResponse({
      campaign_id: campaign.id,
      total_targets: 0,
      success_count: 0,
      failure_count: 0,
      status: 'no_targets',
      message: 'No hay dispositivos activos para esa audiencia/categoria.',
    });
  }

  const deliveries: Array<Record<string, unknown>> = [];
  let successCount = 0;
  let failureCount = 0;

  for (const batch of chunk(recipients, 100)) {
    const messages = batch.map((recipient) => ({
      to: recipient.expo_push_token,
      title,
      body,
      sound: 'default',
      data: {
        category,
        audience,
        campaign_id: campaign.id,
        ...(payload.data ?? {}),
      },
    }));

    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
        ...(expoAccessToken ? { Authorization: `Bearer ${expoAccessToken}` } : {}),
      },
      body: JSON.stringify(messages),
    });

    const expoJson = await expoResponse.json().catch(() => ({ errors: [{ message: 'Respuesta invalida de Expo.' }] }));
    const tickets = Array.isArray(expoJson?.data) ? expoJson.data as ExpoTicket[] : [];

    batch.forEach((recipient, index) => {
      const ticket = tickets[index] ?? (expoJson?.errors?.[0] as ExpoTicket | undefined) ?? { status: 'error', message: 'Sin ticket de Expo.' };
      const ok = expoResponse.ok && ticket.status === 'ok';

      if (ok) successCount += 1;
      else failureCount += 1;

      deliveries.push({
        campaign_id: campaign.id,
        user_id: recipient.user_id,
        token_id: recipient.id,
        expo_push_token: recipient.expo_push_token,
        status: ok ? 'sent' : 'error',
        expo_response: ticket,
        error_message: ok ? null : ticket.message ?? `HTTP ${expoResponse.status}`,
        sent_at: new Date().toISOString(),
      });
    });
  }

  if (deliveries.length) {
    const { error: deliveriesError } = await serviceClient.from('notification_deliveries').insert(deliveries);
    if (deliveriesError) return jsonResponse({ error: deliveriesError.message }, 500);
  }

  const finalStatus = successCount > 0 && failureCount === 0
    ? 'sent'
    : successCount > 0
      ? 'partial_failed'
      : 'failed';

  const { error: updateCampaignError } = await serviceClient
    .from('notification_campaigns')
    .update({
      status: finalStatus,
      success_count: successCount,
      failure_count: failureCount,
      sent_at: new Date().toISOString(),
    })
    .eq('id', campaign.id);

  if (updateCampaignError) return jsonResponse({ error: updateCampaignError.message }, 500);

  return jsonResponse({
    campaign_id: campaign.id,
    total_targets: recipients.length,
    success_count: successCount,
    failure_count: failureCount,
    status: finalStatus,
  });
});
