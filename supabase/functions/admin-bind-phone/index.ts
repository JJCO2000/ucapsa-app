import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';

// Restricted server capability: NEVER expose service_role to the client.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function samePhone(raw: string | null | undefined, normalized: string): boolean {
  if (!raw) return false;
  const input = raw.trim().replace(/[\s(),.-]/g, '');
  return input === normalized || (/^\+52[0-9]{10}$/.test(normalized) &&
    (input === normalized.slice(3) || input === normalized.slice(1)));
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply({ error: 'Método no permitido.' }, 405);
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return reply({ error: 'Sesión requerida.' }, 401);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) return reply({ error: 'Configuración de servidor incompleta.' }, 503);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return reply({ error: 'La sesión ya no es válida.' }, 401);
    const actorId = identity.user.id;
    const { data: actor, error: actorError } = await admin.from('profiles').select('role').eq('user_id', actorId).maybeSingle();
    if (actorError) return reply({ error: 'No se pudo comprobar la autorización.' }, 503);
    if (actor?.role !== 'super_admin') return reply({ error: 'Operación reservada a Superadmin.' }, 403);

    const payload = await request.json() as Record<string, unknown>;
    const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
    const action = payload.action;
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(userId) || userId === actorId || (action !== 'status' && action !== 'approve')) {
      return reply({ error: 'Usuario u operación inválidos.' }, 422);
    }
    const { data: target, error: targetError } = await admin.from('profiles').select('role,phone').eq('user_id', userId).maybeSingle();
    if (targetError) return reply({ error: 'No se pudo consultar el cliente.' }, 503);
    if (!target || !['member','client'].includes(target.role)) return reply({ error: 'Cliente no autorizado para esta operación.' }, 403);
    const raw = typeof target.phone === 'string' ? target.phone.trim() : '';
    if (!raw) return reply({ status: 'missing', phone: null });
    if (!/^\+[1-9][0-9]{7,14}$/.test(raw)) return reply({ status: 'invalid', phone: null });
    const phone = raw;

    // Reuse the existing server-side guard for confirmed Auth phones AND
    // outstanding phone_change reservations (Supabase's ambiguous OTP edge case).
    const { data: canReserve, error: reservationError } = await userClient.rpc(
      'can_request_my_phone_verification', { p_phone: phone },
    );
    if (reservationError) return reply({ error: 'No se pudo comprobar la reserva del celular.' }, 503);
    if (canReserve !== true) return reply({ status: 'conflict', phone });

    const { data: account, error: accountError } = await admin.auth.admin.getUserById(userId);
    if (accountError || !account.user) return reply({ error: 'La identidad Auth no está disponible.' }, 503);
    if (account.user.phone_confirmed_at && account.user.phone === phone) {
      return reply({ status: 'already_active', phone });
    }
    if (account.user.phone && account.user.phone !== phone) return reply({ status: 'different_auth_phone', phone });

    // Refuse any phone shared by other UCAPSA profiles, even with legacy Mexican formatting.
    // Read every page (PostgREST may limit the number of returned rows).
    let offset = 0;
    while (true) {
      const { data: batch, error: listError } = await admin.from('profiles')
        .select('user_id,phone').not('phone', 'is', null).range(offset, offset + 499);
      if (listError) return reply({ error: 'No fue posible descartar duplicidades.' }, 503);
      if (batch?.some((entry) => entry.user_id !== userId && samePhone(entry.phone, phone))) {
        return reply({ status: 'conflict', phone });
      }
      if (!batch || batch.length < 500) break;
      offset += batch.length;
    }

    if (action === 'status') return reply({ status: 'ready', phone });
    const note = typeof payload.proofNote === 'string' ? payload.proofNote.trim() : '';
    if (payload.verifiedByOutboundCall !== true || note.length < 20 || note.length > 300) {
      return reply({ error: 'Falta la confirmación de llamada y la nota de comprobación de identidad.' }, 422);
    }
    // The pre-authorization audit must succeed before touching Auth.
    const details = { phone, proof_method: 'outbound_call_identity_check', note };
    const { error: preAuditError } = await admin.from('admin_audit_logs').insert({
      admin_user_id: actorId, action: 'phone_auth_bind_authorized', entity_type: 'auth_user',
      entity_id: userId, details,
    });
    if (preAuditError) {
      console.error('admin-bind-phone.audit_precondition_failed', preAuditError);
      return reply({ error: 'No se pudo registrar la autorización. No se modificó Auth.' }, 503);
    }

    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(
      userId, { phone, phone_confirm: true },
    );
    if (updateError || updated.user?.phone !== phone || !updated.user?.phone_confirmed_at) {
      console.error('admin-bind-phone.auth_update_failed', updateError?.message || 'Unconfirmed result');
      return reply({ error: 'Auth no pudo confirmar el celular. Revisa el estado antes de repetir.' }, 503);
    }
    const { error: successAuditError } = await admin.from('admin_audit_logs').insert({
      admin_user_id: actorId, action: 'phone_auth_bind_completed', entity_type: 'auth_user',
      entity_id: userId, details: { phone, proof_method: 'outbound_call_identity_check' },
    });
    if (successAuditError) {
      console.error('admin-bind-phone.final_audit_failed', successAuditError);
    }
    return reply({ status: 'enabled', phone });
  } catch (error) {
    console.error('admin-bind-phone.unexpected', error);
    return reply({ error: 'No fue posible comprobar la operación. Consulta a Superadmin.' }, 503);
  }
});
