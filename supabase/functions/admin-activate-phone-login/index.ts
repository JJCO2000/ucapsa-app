import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** Input is never proof of ownership; Superadmin must explicitly attest to checking it. */
function canonicalPhone(raw: string): string | null {
  const input = raw.trim().replace(/[\s(),.\-]/g, '');
  if (/^[0-9]{10}$/.test(input)) return '+52' + input;
  if (/^52[0-9]{10}$/.test(input)) return '+' + input;
  if (/^\+[1-9][0-9]{7,14}$/.test(input)) return input;
  return null;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  const authorization = request.headers.get('Authorization') ?? '';
  const jwt = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!jwt) return jsonResponse({ error: 'Inicia sesión.' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRole) return jsonResponse({ error: 'Servidor sin configurar.' }, 503);

  try {
    const input = await request.json() as { targetUserId?: unknown; confirmedByStaff?: unknown };
    const userId = typeof input?.targetUserId === 'string' ? input.targetUserId.trim() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) || input.confirmedByStaff !== true) {
      return jsonResponse({ error: 'Selecciona un cliente y confirma la revisión del celular.' }, 400);
    }

    // The service-role key never leaves this server; auth and role are validated here.
    const admin = createClient(url, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: callerData, error: callerError } = await admin.auth.getUser(jwt);
    const caller = callerData.user;
    if (callerError || !caller) return jsonResponse({ error: 'Sesión vencida.' }, 401);
    const { data: operator, error: operatorError } = await admin
      .from('profiles').select('role').eq('user_id', caller.id).maybeSingle();
    if (operatorError) return jsonResponse({ error: 'No se pudo verificar autorización.' }, 503);
    if (operator?.role !== 'super_admin') return jsonResponse({ error: 'Solo Superadmin puede activar este acceso.' }, 403);
    if (caller.id === userId) return jsonResponse({ error: 'Esta operación es exclusiva de cuentas de clientes.' }, 403);

    const { data: target, error: targetError } = await admin
      .from('profiles').select('user_id,role,phone').eq('user_id', userId).maybeSingle();
    if (targetError) return jsonResponse({ error: 'No se pudo consultar la cuenta.' }, 503);
    if (!target || (target.role !== 'client' && target.role !== 'member')) {
      return jsonResponse({ error: 'La cuenta seleccionada no es un cliente o socio.' }, 403);
    }
    const phone = target.phone ? canonicalPhone(target.phone) : null;
    if (!phone) return jsonResponse({ error: 'Corrige primero el celular del cliente. Debe tener diez dígitos o formato internacional.' }, 409);

    // Fail closed on pagination: incomplete contact lists cannot prove uniqueness.
    const { data: contacts, count, error: contactsError } = await admin
      .from('profiles').select('user_id,phone', { count: 'exact' }).not('phone', 'is', null).limit(1000);
    if (contactsError || count === null || !contacts || count > contacts.length) {
      return jsonResponse({ error: 'No se pudo comprobar que el celular sea único.' }, 503);
    }
    if (contacts.some(row => row.user_id !== userId && row.phone && canonicalPhone(row.phone) === phone)) {
      return jsonResponse({ error: 'Este celular aparece en más de un perfil. Corrige el duplicado antes de activar acceso.' }, 409);
    }

    const { data: targetAuth, error: authError } = await admin.auth.admin.getUserById(userId);
    if (authError || !targetAuth.user) return jsonResponse({ error: 'La cuenta de acceso no existe.' }, 404);
    if (targetAuth.user.phone && targetAuth.user.phone !== phone) {
      return jsonResponse({ error: 'La cuenta ya tiene otro celular en Auth. Solicita revisión manual.' }, 409);
    }
    if (targetAuth.user.phone === phone && targetAuth.user.phone_confirmed_at) {
      return jsonResponse({ activated: true, alreadyActive: true });
    }

    // Auditing the request before the Auth operation prevents untraceable approvals.
    const last4 = phone.slice(-4);
    const auditBase = {
      admin_user_id: caller.id,
      entity_type: 'auth_user',
      entity_id: userId,
      details: { phone_last4: last4, verification_method: 'superadmin_attestation', no_sms: true },
    };
    const { error: logError } = await admin.from('admin_audit_logs').insert({
      ...auditBase, action: 'phone_login_activation_requested',
    });
    if (logError) return jsonResponse({ error: 'No se pudo registrar la autorización; no se modificó el acceso.' }, 503);

    // Official GoTrue admin API: update the existing identity, never create a new user.
    const { error: setError } = await admin.auth.admin.updateUserById(userId, {
      phone, phone_confirm: true,
    });
    if (setError) {
      const { error: failureLogError } = await admin.from('admin_audit_logs').insert({
        ...auditBase, action: 'phone_login_activation_failed',
      });
      if (failureLogError) console.error('phone_activation_failure_audit_failed');
      return jsonResponse({ error: 'Supabase no pudo asociar el celular. Comprueba que no esté ocupado.' }, 409);
    }
    const { data: checked, error: checkError } = await admin.auth.admin.getUserById(userId);
    if (checkError || checked.user?.id !== userId ||
      checked.user.phone !== phone || !checked.user.phone_confirmed_at) {
      console.error('phone_activation_post_check_failed');
      return jsonResponse({ error: 'La activación requiere revisión: no se pudo confirmar el estado de Auth.' }, 502);
    }

    const { error: completionError } = await admin.from('admin_audit_logs').insert({
      ...auditBase, action: 'phone_login_activation_completed',
    });
    if (completionError) {
      // The requested audit event exists and remains available for reconciliation.
      console.error('phone_activation_completion_audit_failed');
    }
    return jsonResponse({ activated: true, alreadyActive: false, auditPending: Boolean(completionError) });
  } catch (error) {
    console.error('phone_activation_unexpected_error', error instanceof Error ? error.name : 'unknown');
    return jsonResponse({ error: 'No fue posible activar el acceso. Intenta de nuevo o revisa el registro de auditoría.' }, 500);
  }
});
