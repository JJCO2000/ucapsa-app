import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';

type CancellationRequest = {
  schedule_ids?: string[];
  cancellation_date?: string;
  reason?: string | null;
  dry_run?: boolean;
};

type ProgramRow = {
  id: string;
  code: string | null;
  name: string;
  is_active: boolean;
};

type ScheduleRow = {
  id: string;
  program_id: string;
  name: string | null;
  start_time: string;
  sequence_order: number | null;
  is_active: boolean;
};

type EnrollmentRow = {
  id: string;
  user_id: string;
  program_id: string;
  schedule_id: string;
  dog_name: string | null;
  status: string;
};

type TokenRow = {
  id: string;
  user_id: string;
  expo_push_token: string;
  is_active: boolean;
};

type PreferenceRow = {
  user_id: string;
  enabled: boolean;
  classes: boolean;
};

type ExistingLockRow = {
  enrollment_id: string;
  schedule_id: string;
  cancellation_date: string;
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

function isValidDateKey(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatTime(value: string | null | undefined) {
  return String(value ?? '').slice(0, 5) || '--:--';
}

function getProgramLabel(program: ProgramRow | undefined) {
  if (!program) return 'Clase UCAPSA';
  if (program.code === 'puppy') return 'Puppy';
  if (program.code === 'comandos') return 'Comandos';
  return program.name || 'Clase UCAPSA';
}

function getScheduleLabel(schedule: ScheduleRow) {
  return schedule.name?.trim() || `Clase ${Math.max(1, Number(schedule.sequence_order ?? 1))}`;
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

  if (adminProfileError) return jsonResponse({ error: adminProfileError.message }, 500);
  if (!adminProfile || !['admin', 'super_admin'].includes(String(adminProfile.role))) {
    return jsonResponse({ error: 'Solo administradores pueden notificar cancelaciones.' }, 403);
  }

  let payload: CancellationRequest;

  try {
    payload = await req.json();
  } catch (_error) {
    return jsonResponse({ error: 'Body JSON invalido.' }, 400);
  }

  const scheduleIds = [...new Set((payload.schedule_ids ?? []).map((item) => String(item).trim()).filter(Boolean))];
  const cancellationDate = payload.cancellation_date;
  const reason = cleanText(payload.reason, 180) || 'Clase cancelada por UCAPSA.';
  const dryRun = Boolean(payload.dry_run);

  if (scheduleIds.length === 0) return jsonResponse({ error: 'No hay horarios para notificar.' }, 400);
  if (!isValidDateKey(cancellationDate)) return jsonResponse({ error: 'Fecha de cancelacion invalida.' }, 400);

  const [schedulesResult, cancellationsResult, enrollmentsResult, tokenResult] = await Promise.all([
    serviceClient
      .from('program_schedules')
      .select('id,program_id,name,start_time,sequence_order,is_active')
      .in('id', scheduleIds)
      .eq('is_active', true),
    serviceClient
      .from('program_class_cancellations')
      .select('schedule_id,cancellation_date,restored_at')
      .in('schedule_id', scheduleIds)
      .eq('cancellation_date', cancellationDate)
      .is('restored_at', null),
    serviceClient
      .from('program_enrollments')
      .select('id,user_id,program_id,schedule_id,dog_name,status')
      .in('schedule_id', scheduleIds)
      .eq('status', 'active'),
    serviceClient
      .from('notification_tokens')
      .select('id,user_id,expo_push_token,is_active')
      .eq('is_active', true),
  ]);

  if (schedulesResult.error) return jsonResponse({ error: schedulesResult.error.message }, 500);
  if (cancellationsResult.error) return jsonResponse({ error: cancellationsResult.error.message }, 500);
  if (enrollmentsResult.error) return jsonResponse({ error: enrollmentsResult.error.message }, 500);
  if (tokenResult.error) return jsonResponse({ error: tokenResult.error.message }, 500);

  const schedules = (schedulesResult.data ?? []) as ScheduleRow[];
  const activeCancelledScheduleIds = new Set((cancellationsResult.data ?? []).map((item) => String(item.schedule_id)));
  const targetSchedules = schedules.filter((schedule) => activeCancelledScheduleIds.has(schedule.id));

  if (targetSchedules.length === 0) {
    return jsonResponse({ error: 'No hay cancelaciones activas para esos horarios/fecha.' }, 400);
  }

  const targetScheduleIds = new Set(targetSchedules.map((schedule) => schedule.id));
  const candidateEnrollments = ((enrollmentsResult.data ?? []) as EnrollmentRow[])
    .filter((enrollment) => targetScheduleIds.has(enrollment.schedule_id));

  const candidateEnrollmentIds = candidateEnrollments.map((enrollment) => enrollment.id);
  const candidateUserIds = [...new Set(candidateEnrollments.map((enrollment) => enrollment.user_id))];

  const [programsResult, preferencesResult, existingLocksResult] = await Promise.all([
    targetSchedules.length
      ? serviceClient.from('programs').select('id,code,name,is_active').in('id', [...new Set(targetSchedules.map((schedule) => schedule.program_id))])
      : Promise.resolve({ data: [], error: null }),
    candidateUserIds.length
      ? serviceClient.from('notification_preferences').select('user_id,enabled,classes').in('user_id', candidateUserIds)
      : Promise.resolve({ data: [], error: null }),
    candidateEnrollmentIds.length
      ? serviceClient
        .from('notification_class_cancellation_locks')
        .select('enrollment_id,schedule_id,cancellation_date')
        .eq('cancellation_date', cancellationDate)
        .in('enrollment_id', candidateEnrollmentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (programsResult.error) return jsonResponse({ error: programsResult.error.message }, 500);
  if (preferencesResult.error) return jsonResponse({ error: preferencesResult.error.message }, 500);
  if (existingLocksResult.error) return jsonResponse({ error: existingLocksResult.error.message }, 500);

  const programs = (programsResult.data ?? []) as ProgramRow[];
  const tokens = (tokenResult.data ?? []) as TokenRow[];
  const programById = new Map(programs.map((program) => [program.id, program]));
  const scheduleById = new Map(targetSchedules.map((schedule) => [schedule.id, schedule]));
  const preferencesByUserId = new Map(((preferencesResult.data ?? []) as PreferenceRow[]).map((preference) => [preference.user_id, preference]));
  const existingLockKeys = new Set(((existingLocksResult.data ?? []) as ExistingLockRow[]).map((lock) => `${lock.enrollment_id}:${lock.schedule_id}:${lock.cancellation_date}`));

  const tokenByUserId = new Map<string, TokenRow[]>();
  tokens.forEach((token) => {
    if (!token.expo_push_token.startsWith('ExponentPushToken[') && !token.expo_push_token.startsWith('ExpoPushToken[')) return;
    if (!tokenByUserId.has(token.user_id)) tokenByUserId.set(token.user_id, []);
    tokenByUserId.get(token.user_id)?.push(token);
  });

  const cancellationTargets = candidateEnrollments.filter((enrollment) => {
    const preference = preferencesByUserId.get(enrollment.user_id);
    if (!preference?.enabled || !preference.classes) return false;
    if (!tokenByUserId.has(enrollment.user_id)) return false;
    const lockKey = `${enrollment.id}:${enrollment.schedule_id}:${cancellationDate}`;
    return !existingLockKeys.has(lockKey);
  });

  const { data: campaign, error: campaignError } = await serviceClient
    .from('notification_campaigns')
    .insert({
      title: `Clase cancelada ${cancellationDate}`,
      body: `UCAPSA cancelo una o mas clases del ${cancellationDate}.`,
      audience: 'clients',
      category: 'classes',
      status: cancellationTargets.length ? 'sending' : 'no_targets',
      total_targets: cancellationTargets.length,
      created_by: userId,
      metadata: {
        source: 'class_cancellation',
        cancellation_date: cancellationDate,
        schedule_ids: scheduleIds,
        candidate_enrollments: candidateEnrollments.length,
        target_schedules: targetSchedules.length,
        dry_run: dryRun,
      },
    })
    .select('*')
    .single();

  if (campaignError) return jsonResponse({ error: campaignError.message }, 500);

  if (!cancellationTargets.length || dryRun) {
    return jsonResponse({
      campaign_id: campaign.id,
      cancellation_date: cancellationDate,
      schedule_ids: scheduleIds,
      candidate_enrollments: candidateEnrollments.length,
      total_targets: cancellationTargets.length,
      success_count: 0,
      failure_count: 0,
      status: cancellationTargets.length ? 'dry_run' : 'no_targets',
      message: cancellationTargets.length
        ? 'Prueba seca completada; no se enviaron notificaciones.'
        : 'No hay dispositivos activos para notificar esta cancelacion.',
    });
  }

  const lockRows = cancellationTargets.map((enrollment) => ({
    enrollment_id: enrollment.id,
    user_id: enrollment.user_id,
    program_id: enrollment.program_id,
    schedule_id: enrollment.schedule_id,
    cancellation_date: cancellationDate,
    campaign_id: campaign.id,
    status: 'locked',
  }));

  const { error: lockError } = await serviceClient.from('notification_class_cancellation_locks').insert(lockRows);
  if (lockError) return jsonResponse({ error: lockError.message }, 500);

  const deliveries: Array<Record<string, unknown>> = [];
  let successCount = 0;
  let failureCount = 0;

  const deliveryTargets = cancellationTargets.flatMap((enrollment) => {
    const schedule = scheduleById.get(enrollment.schedule_id);
    const program = programById.get(enrollment.program_id);
    const userTokens = tokenByUserId.get(enrollment.user_id) ?? [];
    return userTokens.map((token) => ({ enrollment, schedule, program, token }));
  });

  for (const batch of chunk(deliveryTargets, 100)) {
    const messages = batch.map(({ enrollment, schedule, program, token }) => {
      const programLabel = getProgramLabel(program);
      const scheduleLabel = schedule ? getScheduleLabel(schedule) : 'Clase';
      const timeLabel = schedule ? formatTime(schedule.start_time) : '--:--';
      const dogPart = enrollment.dog_name ? ` de ${enrollment.dog_name}` : '';

      return {
        to: token.expo_push_token,
        title: `Clase cancelada - ${programLabel}`,
        body: `La clase${dogPart} (${scheduleLabel}) del ${cancellationDate} a las ${timeLabel} fue cancelada. Motivo: ${reason}`,
        sound: 'default',
        data: {
          category: 'classes',
          source: 'class_cancellation',
          campaign_id: campaign.id,
          cancellation_date: cancellationDate,
          enrollment_id: enrollment.id,
          schedule_id: enrollment.schedule_id,
          program_id: enrollment.program_id,
        },
      };
    });

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

    batch.forEach(({ enrollment, token }, index) => {
      const ticket = tickets[index] ?? (expoJson?.errors?.[0] as ExpoTicket | undefined) ?? { status: 'error', message: 'Sin ticket de Expo.' };
      const ok = expoResponse.ok && ticket.status === 'ok';

      if (ok) successCount += 1;
      else failureCount += 1;

      deliveries.push({
        campaign_id: campaign.id,
        user_id: enrollment.user_id,
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
    const { error: deliveriesError } = await serviceClient.from('notification_deliveries').insert(deliveries);
    if (deliveriesError) return jsonResponse({ error: deliveriesError.message }, 500);
  }

  const finalStatus = successCount > 0 && failureCount === 0
    ? 'sent'
    : successCount > 0
      ? 'partial_failed'
      : 'failed';

  const now = new Date().toISOString();

  const [{ error: campaignUpdateError }, { error: lockUpdateError }] = await Promise.all([
    serviceClient
      .from('notification_campaigns')
      .update({
        status: finalStatus,
        success_count: successCount,
        failure_count: failureCount,
        sent_at: now,
      })
      .eq('id', campaign.id),
    serviceClient
      .from('notification_class_cancellation_locks')
      .update({
        status: finalStatus === 'sent' || finalStatus === 'partial_failed' ? 'sent' : 'failed',
        sent_at: now,
        updated_at: now,
      })
      .eq('campaign_id', campaign.id),
  ]);

  if (campaignUpdateError) return jsonResponse({ error: campaignUpdateError.message }, 500);
  if (lockUpdateError) return jsonResponse({ error: lockUpdateError.message }, 500);

  return jsonResponse({
    campaign_id: campaign.id,
    cancellation_date: cancellationDate,
    schedule_ids: scheduleIds,
    candidate_enrollments: candidateEnrollments.length,
    total_targets: cancellationTargets.length,
    success_count: successCount,
    failure_count: failureCount,
    status: finalStatus,
  });
});
