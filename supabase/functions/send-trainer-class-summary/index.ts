import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';

type ScheduleRow = {
  id: string;
  program_id: string;
  name: string | null;
  day_of_week: number;
  start_time: string;
  repeat_type: string;
  cycle_start_date: string | null;
  is_active: boolean;
};

type EnrollmentRow = {
  id: string;
  user_id: string;
  program_id: string;
  schedule_id: string;
  program_level: string | null;
  status: string;
  access_mode: string | null;
  card_started_on: string | null;
  card_expires_on: string | null;
};

type ProgramRow = {
  id: string;
  code: string | null;
  name: string;
  is_active: boolean;
};

type RsvpRow = {
  enrollment_id: string;
  response: 'yes' | 'no' | string;
};

type TokenRow = {
  id: string;
  user_id: string;
  expo_push_token: string;
};

type PreferenceRow = {
  user_id: string;
  enabled: boolean;
  classes: boolean;
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function mexicoDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function isScheduleActiveOnDate(schedule: ScheduleRow, classDate: string) {
  if (!schedule.is_active) return false;
  const target = parseDateKey(classDate);
  if (target.getUTCDay() !== schedule.day_of_week) return false;
  if (schedule.repeat_type !== 'biweekly') return true;
  if (!schedule.cycle_start_date || classDate < schedule.cycle_start_date) return false;
  const base = parseDateKey(schedule.cycle_start_date);
  const weeks = Math.floor((target.getTime() - base.getTime()) / 604_800_000);
  return weeks >= 0 && weeks % 2 === 0;
}

function enrollmentEligible(enrollment: EnrollmentRow, classDate: string) {
  if (enrollment.access_mode === 'membership') return true;
  return Boolean(enrollment.card_started_on)
    && Boolean(enrollment.card_expires_on)
    && classDate >= String(enrollment.card_started_on)
    && classDate <= String(enrollment.card_expires_on);
}

function levelLabel(level: string | null) {
  if (level === 'medio') return 'Intermedio';
  if (level === 'avanzado') return 'Avanzado';
  return 'Básico';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';
  const configuredCronSecret = Deno.env.get('CRON_SECRET') ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Faltan variables de entorno de Supabase.' }, 500);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const headerSecret = req.headers.get('x-cron-secret') ?? '';
  const { data: storedSecret } = headerSecret
    ? await service.rpc('get_internal_cron_secret')
    : { data: null };

  const authorized = Boolean(
    headerSecret
    && (
      (configuredCronSecret && headerSecret === configuredCronSecret)
      || (typeof storedSecret === 'string' && storedSecret && headerSecret === storedSecret)
    ),
  );

  if (!authorized) return json({ error: 'Cron no autorizado.' }, 401);

  let payload: { target_date?: string; dry_run?: boolean } = {};
  try { payload = await req.json(); } catch { payload = {}; }

  const today = parseDateKey(mexicoDateKey());
  const classDate = payload.target_date && /^\d{4}-\d{2}-\d{2}$/.test(payload.target_date)
    ? payload.target_date
    : dateKey(addDays(today, 1));
  const dryRun = Boolean(payload.dry_run);

  const [
    programsResult,
    schedulesResult,
    enrollmentsResult,
    cancellationsResult,
    rsvpsResult,
    trainersResult,
  ] = await Promise.all([
    service.from('programs').select('id,code,name,is_active').eq('is_active', true),
    service.rpc('get_effective_program_schedules', { p_date: classDate }),
    service.from('program_enrollments').select('id,user_id,program_id,schedule_id,program_level,status,access_mode,card_started_on,card_expires_on').eq('status', 'active'),
    service.from('program_class_cancellations').select('schedule_id').eq('cancellation_date', classDate).is('restored_at', null),
    service.from('program_class_rsvps').select('enrollment_id,response').eq('class_date', classDate),
    service.from('profiles').select('user_id').eq('role', 'trainer'),
  ]);

  for (const result of [programsResult, schedulesResult, enrollmentsResult, cancellationsResult, rsvpsResult, trainersResult]) {
    if (result.error) return json({ error: result.error.message }, 500);
  }

  const programs = (programsResult.data ?? []) as ProgramRow[];
  const schedules = (schedulesResult.data ?? []) as ScheduleRow[];
  const enrollments = (enrollmentsResult.data ?? []) as EnrollmentRow[];
  const cancelled = new Set((cancellationsResult.data ?? []).map((row) => String(row.schedule_id)));
  const rsvpByEnrollment = new Map(
    ((rsvpsResult.data ?? []) as RsvpRow[]).map((row) => [row.enrollment_id, row.response]),
  );
  const programById = new Map(programs.map((row) => [row.id, row]));

  const activeSchedules = schedules.filter((schedule) => (
    !cancelled.has(schedule.id)
    && isScheduleActiveOnDate(schedule, classDate)
    && programById.has(schedule.program_id)
  ));
  const activeScheduleIds = new Set(activeSchedules.map((row) => row.id));

  const eligible = enrollments.filter((enrollment) => (
    activeScheduleIds.has(enrollment.schedule_id)
    && enrollmentEligible(enrollment, classDate)
  ));

  if (eligible.length === 0) {
    return json({ class_date: classDate, status: 'no_classes', total_targets: 0 });
  }

  const groupMap = new Map<string, {
    programCode: string;
    programName: string;
    startTime: string;
    eligible: number;
    yes: number;
    no: number;
    levels: Map<string, { eligible: number; yes: number }>;
  }>();

  const scheduleById = new Map(activeSchedules.map((row) => [row.id, row]));
  for (const enrollment of eligible) {
    const schedule = scheduleById.get(enrollment.schedule_id);
    const program = programById.get(enrollment.program_id);
    if (!schedule || !program) continue;
    const code = program.code || program.name;
    const key = `${schedule.id}:${code}:${String(schedule.start_time).slice(0, 5)}`;
    const current = groupMap.get(key) ?? {
      programCode: code,
      programName: program.name,
      startTime: String(schedule.start_time).slice(0, 5),
      eligible: 0,
      yes: 0,
      no: 0,
      levels: new Map<string, { eligible: number; yes: number }>(),
    };
    const response = rsvpByEnrollment.get(enrollment.id);
    current.eligible += 1;
    if (response === 'yes') current.yes += 1;
    if (response === 'no') current.no += 1;

    if (code === 'comandos') {
      const label = levelLabel(enrollment.program_level);
      const level = current.levels.get(label) ?? { eligible: 0, yes: 0 };
      level.eligible += 1;
      if (response === 'yes') level.yes += 1;
      current.levels.set(label, level);
    }
    groupMap.set(key, current);
  }

  const groups = [...groupMap.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const summary = groups.map((group) => {
    const label = group.programCode === 'puppy' ? 'Puppy' : group.programCode === 'comandos' ? 'Comandos' : group.programName;
    return `${label} ${group.yes}/${group.eligible}`;
  }).join(' · ');

  const trainerIds = (trainersResult.data ?? []).map((row) => String(row.user_id));
  if (trainerIds.length === 0) {
    return json({ class_date: classDate, status: 'no_trainers', total_targets: 0, summary });
  }

  const [preferencesResult, tokensResult, locksResult] = await Promise.all([
    service.from('notification_preferences').select('user_id,enabled,classes').in('user_id', trainerIds),
    service.from('notification_tokens').select('id,user_id,expo_push_token').in('user_id', trainerIds).eq('is_active', true),
    service.from('notification_trainer_summary_locks').select('user_id,status').eq('class_date', classDate).eq('summary_type', 'next_day_classes'),
  ]);

  for (const result of [preferencesResult, tokensResult, locksResult]) {
    if (result.error) return json({ error: result.error.message }, 500);
  }

  const preferences = new Map(
    ((preferencesResult.data ?? []) as PreferenceRow[]).map((row) => [row.user_id, row]),
  );
  const blockedUsers = new Set(
    (locksResult.data ?? [])
      .filter((row) => row.status !== 'failed')
      .map((row) => String(row.user_id)),
  );

  const tokens = ((tokensResult.data ?? []) as TokenRow[]).filter((token) => (
    (token.expo_push_token.startsWith('ExponentPushToken[') || token.expo_push_token.startsWith('ExpoPushToken['))
    && preferences.get(token.user_id)?.enabled
    && preferences.get(token.user_id)?.classes
    && !blockedUsers.has(token.user_id)
  ));

  if (dryRun) {
    return json({
      class_date: classDate,
      status: 'dry_run',
      summary,
      groups: groups.map((group) => ({
        program: group.programCode,
        start_time: group.startTime,
        eligible: group.eligible,
        confirmed: group.yes,
        declined: group.no,
        no_response: group.eligible - group.yes - group.no,
        levels: Object.fromEntries(group.levels),
      })),
      total_targets: tokens.length,
    });
  }

  if (tokens.length === 0) {
    return json({ class_date: classDate, status: 'no_targets', total_targets: 0, summary });
  }

  const targetUserIds = [...new Set(tokens.map((token) => token.user_id))];

  const { data: campaign, error: campaignError } = await service
    .from('notification_campaigns')
    .insert({
      title: `Clases de mañana · ${classDate}`,
      body: summary,
      audience: 'admins',
      category: 'classes',
      status: 'sending',
      total_targets: tokens.length,
      metadata: {
        source: 'trainer_class_summary',
        target_role: 'trainer',
        class_date: classDate,
        groups: groups.map((group) => ({
          program: group.programCode,
          start_time: group.startTime,
          eligible: group.eligible,
          confirmed: group.yes,
          declined: group.no,
          no_response: group.eligible - group.yes - group.no,
          levels: Object.fromEntries(group.levels),
        })),
      },
    })
    .select('id')
    .single();

  if (campaignError) return json({ error: campaignError.message }, 500);

  const { data: claimedLocks, error: lockError } = await service
    .from('notification_trainer_summary_locks')
    .upsert(
      targetUserIds.map((userId) => ({
        user_id: userId,
        class_date: classDate,
        summary_type: 'next_day_classes',
        campaign_id: campaign.id,
        status: 'locked',
      })),
      { onConflict: 'user_id,class_date,summary_type', ignoreDuplicates: true },
    )
    .select('user_id');

  if (lockError) {
    await service.from('notification_campaigns').update({ status: 'failed', sent_at: new Date().toISOString() }).eq('id', campaign.id);
    return json({ error: lockError.message }, 500);
  }

  const claimedUsers = new Set((claimedLocks ?? []).map((row) => String(row.user_id)));
  const claimedTokens = tokens.filter((token) => claimedUsers.has(token.user_id));

  if (claimedTokens.length === 0) {
    await service.from('notification_campaigns').update({ status: 'no_targets', total_targets: 0, sent_at: new Date().toISOString() }).eq('id', campaign.id);
    return json({ class_date: classDate, status: 'no_targets', total_targets: 0, summary });
  }

  const { data: deliveries, error: deliveryError } = await service
    .from('notification_deliveries')
    .insert(claimedTokens.map((token) => ({
      campaign_id: campaign.id,
      user_id: token.user_id,
      token_id: token.id,
      expo_push_token: token.expo_push_token,
      status: 'queued',
    })))
    .select('id,token_id');

  if (deliveryError) {
    await Promise.all([
      service.from('notification_campaigns').update({ status: 'failed', sent_at: new Date().toISOString() }).eq('id', campaign.id),
      service.from('notification_trainer_summary_locks').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('campaign_id', campaign.id),
    ]);
    return json({ error: deliveryError.message }, 500);
  }

  const deliveryIdByToken = new Map((deliveries ?? []).map((row) => [String(row.token_id), String(row.id)]));
  const messages = claimedTokens.map((token) => ({
    to: token.expo_push_token,
    title: 'Aforo de mañana',
    body: `${summary}. Abre UCAPSA para ver niveles y quién viene.`,
    sound: 'default',
    channelId: 'ucapsa-classes',
    data: {
      category: 'classes',
      source: 'trainer_class_summary',
      campaign_id: campaign.id,
      class_date: classDate,
    },
  }));

  let response: Response;
  try {
    response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
        ...(expoAccessToken ? { Authorization: `Bearer ${expoAccessToken}` } : {}),
      },
      body: JSON.stringify(messages),
    });
  } catch (cause) {
    return json({
      error: cause instanceof Error ? cause.message : 'No se pudo confirmar la respuesta de Expo.',
      campaign_id: campaign.id,
      message: 'El lock se conserva para evitar duplicados ante un resultado incierto.',
    }, 502);
  }

  const expoJson = await response.json().catch(() => ({ errors: [{ message: 'Respuesta inválida de Expo.' }] }));
  const tickets = Array.isArray(expoJson?.data) ? expoJson.data as ExpoTicket[] : [];

  let success = 0;
  let failure = 0;
  await Promise.all(claimedTokens.map(async (token, index) => {
    const ticket = tickets[index] ?? (expoJson?.errors?.[0] as ExpoTicket | undefined) ?? { status: 'error', message: 'Sin ticket de Expo.' };
    const ok = response.ok && ticket.status === 'ok';
    if (ok) success += 1;
    else failure += 1;

    const deliveryId = deliveryIdByToken.get(token.id);
    if (deliveryId) {
      await service.from('notification_deliveries').update({
        status: ok ? 'sent' : 'error',
        expo_response: ticket,
        error_message: ok ? null : ticket.message ?? `HTTP ${response.status}`,
        sent_at: new Date().toISOString(),
      }).eq('id', deliveryId);
    }

    if (ticket.details?.error === 'DeviceNotRegistered') {
      const now = new Date().toISOString();
      await service.from('notification_tokens').update({
        is_active: false,
        disabled_at: now,
        updated_at: now,
      }).eq('id', token.id);
    }
  }));

  const finalStatus = success > 0 && failure === 0 ? 'sent' : success > 0 ? 'partial_failed' : 'failed';
  const now = new Date().toISOString();

  await Promise.all([
    service.from('notification_campaigns').update({
      status: finalStatus,
      success_count: success,
      failure_count: failure,
      total_targets: claimedTokens.length,
      sent_at: now,
    }).eq('id', campaign.id),
    service.from('notification_trainer_summary_locks').update({
      status: finalStatus === 'failed' ? 'failed' : 'sent',
      sent_at: finalStatus === 'failed' ? null : now,
      updated_at: now,
    }).eq('campaign_id', campaign.id),
  ]);

  return json({
    campaign_id: campaign.id,
    class_date: classDate,
    status: finalStatus,
    total_targets: claimedTokens.length,
    success_count: success,
    failure_count: failure,
    summary,
  });
});
