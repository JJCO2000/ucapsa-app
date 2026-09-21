import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';

type Audience = 'public' | 'clients' | 'members' | 'admins';
type Category = 'announcements_events' | 'classes' | 'membership' | 'achievements';

type NotificationRequest = {
  campaign_id?: string;
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

type CampaignRow = {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  category: Category;
  status: 'draft' | 'sending' | 'sent' | 'partial_failed' | 'failed' | 'no_targets';
  total_targets: number;
  success_count: number;
  failure_count: number;
  created_by: string | null;
  metadata: Record<string, unknown> | null;
};

type PreparedDeliveryRow = {
  id: string;
  token_id: string | null;
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

function campaignResponse(campaign: CampaignRow, message?: string, reused = false) {
  return {
    campaign_id: campaign.id,
    total_targets: campaign.total_targets,
    success_count: campaign.success_count,
    failure_count: campaign.failure_count,
    status: campaign.status,
    ...(message ? { message } : {}),
    ...(reused ? { reused: true } : {}),
  };
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

  let campaign: CampaignRow | null = null;
  const requestedCampaignId = cleanText(payload.campaign_id, 80);

  if (requestedCampaignId) {
    const { data, error } = await serviceClient
      .from('notification_campaigns')
      .select('id,title,body,audience,category,status,total_targets,success_count,failure_count,created_by,metadata')
      .eq('id', requestedCampaignId)
      .eq('created_by', userId)
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 500);
    if (!data) return jsonResponse({ error: 'Campana preparada no encontrada.' }, 404);

    const metadata = (data.metadata ?? {}) as Record<string, unknown>;
    if (metadata.source !== 'admin_manual') {
      return jsonResponse({ error: 'La campana no pertenece al flujo manual.' }, 409);
    }

    campaign = data as CampaignRow;
  } else {
    // Compatibilidad con clientes anteriores: una solicitud equivalente reciente
    // reutiliza la misma campaña bajo lock transaccional en PostgreSQL.
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

    const { data, error } = await userClient.rpc('admin_prepare_notification_campaign', {
      p_title: title,
      p_body: body,
      p_audience: audience,
      p_category: category,
      p_reuse_recent: true,
    });

    if (error) return jsonResponse({ error: error.message }, 500);
    if (!data) return jsonResponse({ error: 'No se pudo preparar la campana.' }, 500);

    campaign = data as CampaignRow;
  }

  if (campaign.status !== 'draft') {
    const message = campaign.status === 'sending'
      ? 'Este envio ya fue reclamado. No se reenvio para evitar duplicados; revisa el historial.'
      : 'Este envio ya fue procesado. No se genero un segundo envio.';

    return jsonResponse(campaignResponse(campaign, message, true));
  }

  const title = campaign.title;
  const body = campaign.body;
  const audience = campaign.audience;
  const category = campaign.category;

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

  if (!recipients.length) {
    const now = new Date().toISOString();
    const { data: noTargets, error: noTargetsError } = await serviceClient
      .from('notification_campaigns')
      .update({
        status: 'no_targets',
        total_targets: 0,
        success_count: 0,
        failure_count: 0,
        sent_at: now,
      })
      .eq('id', campaign.id)
      .eq('status', 'draft')
      .select('id,title,body,audience,category,status,total_targets,success_count,failure_count,created_by,metadata')
      .maybeSingle();

    if (noTargetsError) return jsonResponse({ error: noTargetsError.message }, 500);

    if (!noTargets) {
      const { data: current, error: currentError } = await serviceClient
        .from('notification_campaigns')
        .select('id,title,body,audience,category,status,total_targets,success_count,failure_count,created_by,metadata')
        .eq('id', campaign.id)
        .single();

      if (currentError) return jsonResponse({ error: currentError.message }, 500);
      return jsonResponse(campaignResponse(current as CampaignRow, 'Este envio ya fue reclamado. No se duplico.', true));
    }

    return jsonResponse(campaignResponse(
      noTargets as CampaignRow,
      'No hay dispositivos activos para esa audiencia/categoria.',
    ));
  }

  const { data: claimed, error: claimError } = await serviceClient
    .from('notification_campaigns')
    .update({
      status: 'sending',
      total_targets: recipients.length,
      success_count: 0,
      failure_count: 0,
    })
    .eq('id', campaign.id)
    .eq('status', 'draft')
    .select('id,title,body,audience,category,status,total_targets,success_count,failure_count,created_by,metadata')
    .maybeSingle();

  if (claimError) return jsonResponse({ error: claimError.message }, 500);

  if (!claimed) {
    const { data: current, error: currentError } = await serviceClient
      .from('notification_campaigns')
      .select('id,title,body,audience,category,status,total_targets,success_count,failure_count,created_by,metadata')
      .eq('id', campaign.id)
      .single();

    if (currentError) return jsonResponse({ error: currentError.message }, 500);
    return jsonResponse(campaignResponse(
      current as CampaignRow,
      'Este envio ya fue reclamado. No se reenvio para evitar duplicados.',
      true,
    ));
  }

  const queuedRows = recipients.map((recipient) => ({
    campaign_id: campaign.id,
    user_id: recipient.user_id,
    token_id: recipient.id,
    expo_push_token: recipient.expo_push_token,
    status: 'queued',
  }));

  const { data: preparedDeliveries, error: prepareDeliveriesError } = await serviceClient
    .from('notification_deliveries')
    .insert(queuedRows)
    .select('id,token_id');

  if (prepareDeliveriesError) {
    // Todavia no hubo efecto externo: es seguro liberar la campaña para reintento.
    await serviceClient
      .from('notification_campaigns')
      .update({ status: 'draft', total_targets: 0 })
      .eq('id', campaign.id)
      .eq('status', 'sending');

    return jsonResponse({ error: prepareDeliveriesError.message, campaign_id: campaign.id }, 500);
  }

  const deliveryIdByTokenId = new Map(
    ((preparedDeliveries ?? []) as PreparedDeliveryRow[])
      .filter((row) => row.token_id)
      .map((row) => [String(row.token_id), row.id]),
  );

  let successCount = 0;
  let failureCount = 0;

  for (const batch of chunk(recipients, 100)) {
    const deliveryIds = batch
      .map((recipient) => deliveryIdByTokenId.get(recipient.id))
      .filter((value): value is string => Boolean(value));

    if (deliveryIds.length !== batch.length) {
      return jsonResponse({
        error: 'No se pudieron identificar todas las entregas preparadas.',
        campaign_id: campaign.id,
      }, 500);
    }

    const { error: markSendingError } = await serviceClient
      .from('notification_deliveries')
      .update({ status: 'sending' })
      .in('id', deliveryIds)
      .eq('status', 'queued');

    if (markSendingError) {
      return jsonResponse({
        error: markSendingError.message,
        campaign_id: campaign.id,
        message: 'La campana queda reclamada para evitar un reenvio inseguro.',
      }, 500);
    }

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

    let expoResponse: Response;

    try {
      expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
          ...(expoAccessToken ? { Authorization: `Bearer ${expoAccessToken}` } : {}),
        },
        body: JSON.stringify(messages),
      });
    } catch (cause) {
      return jsonResponse({
        error: cause instanceof Error ? cause.message : 'No se pudo confirmar la respuesta de Expo.',
        campaign_id: campaign.id,
        message: 'El resultado del envio es incierto. No se reenvio automaticamente.',
      }, 502);
    }

    const expoJson = await expoResponse.json().catch(() => ({ errors: [{ message: 'Respuesta invalida de Expo.' }] }));
    const tickets = Array.isArray(expoJson?.data) ? expoJson.data as ExpoTicket[] : [];

    const resultUpdates = batch.map(async (recipient, index) => {
      const ticket = tickets[index] ?? (expoJson?.errors?.[0] as ExpoTicket | undefined) ?? { status: 'error', message: 'Sin ticket de Expo.' };
      const ok = expoResponse.ok && ticket.status === 'ok';
      const deliveryId = deliveryIdByTokenId.get(recipient.id);

      if (ok) successCount += 1;
      else failureCount += 1;

      if (!deliveryId) {
        return { error: new Error('Entrega preparada sin id.') };
      }

      const { error } = await serviceClient
        .from('notification_deliveries')
        .update({
          status: ok ? 'sent' : 'error',
          expo_response: ticket,
          error_message: ok ? null : ticket.message ?? `HTTP ${expoResponse.status}`,
          sent_at: new Date().toISOString(),
        })
        .eq('id', deliveryId)
        .eq('status', 'sending');

      const expoErrorCode = typeof ticket.details?.error === 'string'
        ? ticket.details.error
        : null;

      if (expoErrorCode === 'DeviceNotRegistered') {
        const disabledAt = new Date().toISOString();
        const { error: disableTokenError } = await serviceClient
          .from('notification_tokens')
          .update({
            is_active: false,
            disabled_at: disabledAt,
            updated_at: disabledAt,
          })
          .eq('id', recipient.id)
          .eq('expo_push_token', recipient.expo_push_token)
          .eq('is_active', true);

        if (disableTokenError) {
          console.warn(
            'Could not disable DeviceNotRegistered Expo token.',
            recipient.id,
            disableTokenError.message,
          );
        }
      }

      return { error };
    });

    const updateResults = await Promise.all(resultUpdates);
    const firstUpdateError = updateResults.find((result) => result.error)?.error;

    if (firstUpdateError) {
      return jsonResponse({
        error: firstUpdateError instanceof Error ? firstUpdateError.message : String(firstUpdateError),
        campaign_id: campaign.id,
        message: 'Expo ya respondio. La campana queda reclamada para impedir un segundo envio.',
      }, 500);
    }
  }

  const finalStatus = successCount > 0 && failureCount === 0
    ? 'sent'
    : successCount > 0
      ? 'partial_failed'
      : 'failed';

  const sentAt = new Date().toISOString();
  const { data: completedCampaign, error: updateCampaignError } = await serviceClient
    .from('notification_campaigns')
    .update({
      status: finalStatus,
      success_count: successCount,
      failure_count: failureCount,
      sent_at: sentAt,
    })
    .eq('id', campaign.id)
    .eq('status', 'sending')
    .select('id,title,body,audience,category,status,total_targets,success_count,failure_count,created_by,metadata')
    .single();

  if (updateCampaignError) {
    return jsonResponse({
      error: updateCampaignError.message,
      campaign_id: campaign.id,
      message: 'Las entregas ya quedaron registradas. No se reenvio automaticamente.',
    }, 500);
  }

  return jsonResponse(campaignResponse(completedCampaign as CampaignRow));
});
