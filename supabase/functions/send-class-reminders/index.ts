import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';

type ReminderRequest = {
  target_date?: string;
  days_ahead?: number;
  reminder_type?: string;
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
  day_of_week: number;
  start_time: string;
  repeat_type: 'weekly' | 'biweekly' | string;
  cycle_start_date: string | null;
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

type CancellationRow = {
  schedule_id: string;
  cancellation_date: string;
  restored_at: string | null;
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
  class_date: string;
  reminder_type: string;
};

type ExpoTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
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

function dateKeyFromDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isValidDateKey(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isScheduleActiveOnDate(schedule: ScheduleRow, classDateKey: string) {
  if (!schedule.is_active) return false;
  const classDate = parseDateKey(classDateKey);
  if (Number.isNaN(classDate.getTime())) return false;
  if (classDate.getUTCDay() !== schedule.day_of_week) return false;

  if (schedule.repeat_type !== 'biweekly') return true;

  const baseKey = schedule.cycle_start_date || classDateKey;
  const baseDate = parseDateKey(baseKey);
  if (Number.isNaN(baseDate.getTime())) return false;

  const diffDays = Math.floor((classDate.getTime() - baseDate.getTime()) / 86_400_000);
  if (diffDays < 0) return false;
  const diffWeeks = Math.floor(diffDays / 7);
  return diffWeeks % 2 === 0;
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
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Faltan variables de entorno de Supabase en la Edge Function.' }, 500);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cronHeader = req.headers.get('x-cron-secret') ?? '';
  const isCronCall = Boolean(cronSecret && cronHeader && cronHeader === cronSecret);
  let userId: string | null = null;

  if (!isCronCall) {
    const authorization = req.headers.get('Authorization') ?? '';
    if (!authorization) return jsonResponse({ error: 'Falta Authorization header o x-cron-secret.' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });

    const { data: userResult, error: userError } = await userClient.auth.getUser();
    userId = userResult.user?.id ?? null;
    if (userError || !userId) return jsonResponse({ error: 'Sesion invalida.' }, 401);

    const { data: adminProfile, error: adminProfileError } = await serviceClient
      .from('profiles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (adminProfileError) return jsonResponse({ error: adminProfileError.message }, 500);
    if (!adminProfile || !['admin', 'super_admin'].includes(String(adminProfile.role))) {
      return jsonResponse({ error: 'Solo administradores pueden enviar recordatorios de clases.' }, 403);
    }
  }

  let payload: ReminderRequest = {};
  try {
    payload = await req.json();
  } catch (_error) {
    payload = {};
  }

  const daysAhead = Number.isFinite(Number(payload.days_ahead))
    ? Math.max(0, Math.min(14, Number(payload.days_ahead)))
    : 1;
  const classDateKey = isValidDateKey(payload.target_date)
    ? String(payload.target_date)
    : dateKeyFromDate(addDays(new Date(), daysAhead));
  const reminderType = typeof payload.reminder_type === 'string' && payload.reminder_type.trim()
    ? payload.reminder_type.trim().slice(0, 40)
    : 'class_24h';
  const dryRun = Boolean(payload.dry_run);

  const [programsResult, schedulesResult, enrollmentsResult, cancellationsResult, tokenResult] = await Promise.all([
    serviceClient.from('programs').select('id,code,name,is_active').eq('is_active', true),
    serviceClient.from('program_schedules').select('id,program_id,name,day_of_week,start_time,repeat_type,cycle_start_date,sequence_order,is_active').eq('is_active', true),
    serviceClient.from('program_enrollments').select('id,user_id,program_id,schedule_id,dog_name,status').eq('status', 'active'),
    serviceClient.from('program_class_cancellations').select('schedule_id,cancellation_date,restored_at').eq('cancellation_date', classDateKey).is('restored_at', null),
    serviceClient.from('notification_tokens').select('id,user_id,expo_push_token,is_active').eq('is_active', true),
  ]);

  if (programsResult.error) return jsonResponse({ error: programsResult.error.message }, 500);
  if (schedulesResult.error) return jsonResponse({ error: schedulesResult.error.message }, 500);
  if (enrollmentsResult.error) return jsonResponse({ error: enrollmentsResult.error.message }, 500);
  if (cancellationsResult.error) return jsonResponse({ error: cancellationsResult.error.message }, 500);
  if (tokenResult.error) return jsonResponse({ error: tokenResult.error.message }, 500);

  const programs = (programsResult.data ?? []) as ProgramRow[];
  const schedules = (schedulesResult.data ?? []) as ScheduleRow[];
  const enrollments = (enrollmentsResult.data ?? []) as EnrollmentRow[];
  const cancellations = (cancellationsResult.data ?? []) as CancellationRow[];
  const tokens = (tokenResult.data ?? []) as TokenRow[];

  const programById = new Map(programs.map((program) => [program.id, program]));
  const cancelledScheduleIds = new Set(cancellations.map((item) => item.schedule_id));
  const targetSchedules = schedules.filter((schedule) => {
    if (cancelledScheduleIds.has(schedule.id)) return false;
    if (!programById.has(schedule.program_id)) return false;
    return isScheduleActiveOnDate(schedule, classDateKey);
  });

  const targetScheduleIds = new Set(targetSchedules.map((schedule) => schedule.id));
  const scheduleById = new Map(targetSchedules.map((schedule) => [schedule.id, schedule]));
  const candidateEnrollments = enrollments.filter((enrollment) => targetScheduleIds.has(enrollment.schedule_id));
  const candidateEnrollmentIds = candidateEnrollments.map((enrollment) => enrollment.id);
  const candidateUserIds = [...new Set(candidateEnrollments.map((enrollment) => enrollment.user_id))];

  const [preferencesResult, existingLocksResult] = await Promise.all([
    candidateUserIds.length
      ? serviceClient.from('notification_preferences').select('user_id,enabled,classes').in('user_id', candidateUserIds)
      : Promise.resolve({ data: [], error: null }),
    candidateEnrollmentIds.length
      ? serviceClient
        .from('notification_class_reminder_locks')
        .select('enrollment_id,schedule_id,class_date,reminder_type')
        .eq('class_date', classDateKey)
        .eq('reminder_type', reminderType)
        .in('enrollment_id', candidateEnrollmentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (preferencesResult.error) return jsonResponse({ error: preferencesResult.error.message }, 500);
  if (existingLocksResult.error) return jsonResponse({ error: existingLocksResult.error.message }, 500);

  const preferencesByUserId = new Map(((preferencesResult.data ?? []) as PreferenceRow[]).map((preference) => [preference.user_id, preference]));
  const existingLockKeys = new Set(((existingLocksResult.data ?? []) as ExistingLockRow[]).map((lock) => `${lock.enrollment_id}:${lock.schedule_id}:${lock.class_date}:${lock.reminder_type}`));

  const tokenByUserId = new Map<string, TokenRow[]>();
  tokens.forEach((token) => {
    if (!token.expo_push_token.startsWith('ExponentPushToken[') && !token.expo_push_token.startsWith('ExpoPushToken[')) return;
    if (!tokenByUserId.has(token.user_id)) tokenByUserId.set(token.user_id, []);
    tokenByUserId.get(token.user_id)?.push(token);
  });

  const reminderTargets = candidateEnrollments.filter((enrollment) => {
    const preference = preferencesByUserId.get(enrollment.user_id);
    if (!preference?.enabled || !preference.classes) return false;
    if (!tokenByUserId.has(enrollment.user_id)) return false;
    const lockKey = `${enrollment.id}:${enrollment.schedule_id}:${classDateKey}:${reminderType}`;
    return !existingLockKeys.has(lockKey);
  });

  const { data: campaign, error: campaignError } = await serviceClient
    .from('notification_campaigns')
    .insert({
      title: `Recordatorio de clase ${classDateKey}`,
      body: 'Recordatorio automatico de clases UCAPSA.',
      audience: 'clients',
      category: 'classes',
      status: reminderTargets.length ? 'sending' : 'no_targets',
      total_targets: reminderTargets.length,
      created_by: userId,
      metadata: {
        source: 'class_reminder',
        class_date: classDateKey,
        reminder_type: reminderType,
        candidate_enrollments: candidateEnrollments.length,
        target_schedules: targetSchedules.length,
        dry_run: dryRun,
        triggered_by: isCronCall ? 'cron_secret' : 'admin_user',
      },
    })
    .select('*')
    .single();

  if (campaignError) return jsonResponse({ error: campaignError.message }, 500);

  if (!reminderTargets.length || dryRun) {
    return jsonResponse({
      campaign_id: campaign.id,
      class_date: classDateKey,
      reminder_type: reminderType,
      target_schedules: targetSchedules.length,
      candidate_enrollments: candidateEnrollments.length,
      total_targets: reminderTargets.length,
      success_count: 0,
      failure_count: 0,
      status: reminderTargets.length ? 'dry_run' : 'no_targets',
      message: reminderTargets.length
        ? 'Prueba seca completada; no se enviaron notificaciones.'
        : 'No hay destinatarios activos para recordatorios de clase.',
    });
  }

  const lockRows = reminderTargets.map((enrollment) => ({
    enrollment_id: enrollment.id,
    user_id: enrollment.user_id,
    program_id: enrollment.program_id,
    schedule_id: enrollment.schedule_id,
    class_date: classDateKey,
    reminder_type: reminderType,
    campaign_id: campaign.id,
    status: 'locked',
  }));

  const { error: lockError } = await serviceClient.from('notification_class_reminder_locks').insert(lockRows);
  if (lockError) return jsonResponse({ error: lockError.message }, 500);

  const deliveries: Array<Record<string, unknown>> = [];
  let successCount = 0;
  let failureCount = 0;

  const deliveryTargets = reminderTargets.flatMap((enrollment) => {
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
        title: `Recordatorio ${programLabel}`,
        body: `Tu clase${dogPart} (${scheduleLabel}) es el ${classDateKey} a las ${timeLabel}.`,
        sound: 'default',
        data: {
          category: 'classes',
          source: 'class_reminder',
          campaign_id: campaign.id,
          class_date: classDateKey,
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
      .from('notification_class_reminder_locks')
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
    class_date: classDateKey,
    reminder_type: reminderType,
    target_schedules: targetSchedules.length,
    candidate_enrollments: candidateEnrollments.length,
    total_targets: reminderTargets.length,
    success_count: successCount,
    failure_count: failureCount,
    status: finalStatus,
  });
});
