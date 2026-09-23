import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';

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
      'Cache-Control': 'no-store',
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  const authorization = req.headers.get('Authorization') ?? '';
  const jwt = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!jwt) return jsonResponse({ error: 'Sesión requerida.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ error: 'Configuración del servidor incompleta.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const user = userData.user;
  if (userError || !user) return jsonResponse({ error: 'La sesión ya no es válida.' }, 401);

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) return jsonResponse({ error: 'No se pudo verificar la cuenta.' }, 500);
  if (profile?.role === 'admin' || profile?.role === 'super_admin') {
    return jsonResponse(
      { error: 'Las cuentas administrativas requieren un proceso interno separado.' },
      403,
    );
  }

  const { data: requestRow, error: requestError } = await userClient.rpc(
    'request_my_account_deletion',
    { p_reason: 'Eliminación iniciada por la persona titular desde Ajustes de cuenta.' },
  );

  if (requestError || !requestRow?.id) {
    return jsonResponse({ error: requestError?.message ?? 'No se pudo registrar la solicitud.' }, 500);
  }

  // Revoca refresh tokens/sesiones antes de eliminar la identidad. El JWT de acceso
  // puede seguir siendo criptográficamente válido hasta su expiración, pero ya no
  // tendrá una sesión renovable y las filas propiedad del usuario se eliminan por FK.
  const { error: signOutError } = await admin.auth.admin.signOut(jwt);
  if (signOutError) {
    console.warn('delete-account: no se pudieron revocar todas las sesiones antes del borrado', signOutError);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return jsonResponse(
      {
        error:
          'No se pudo completar la eliminación automática. La solicitud quedó registrada para atención.',
        detail: deleteError.message,
      },
      409,
    );
  }

  const now = new Date().toISOString();
  const completionNote =
    'Cuenta de Auth y datos asociados de UCAPSA App eliminados automáticamente desde la app.';

  const { error: completionError } = await admin
    .from('account_deletion_requests')
    .update({
      status: 'completed',
      resolution_note: completionNote,
      retention_until: null,
      snapshot_name: null,
      snapshot_email: null,
      notification_method: 'in_app',
      notification_reference: 'delete-account',
      notified_at: now,
      resolved_at: now,
      resolved_by: null,
      updated_at: now,
    })
    .eq('id', requestRow.id);

  if (completionError) {
    console.error('delete-account: la cuenta fue eliminada pero falló el cierre del ledger', completionError);
  } else {
    const { error: eventError } = await admin.from('account_deletion_request_events').insert({
      request_id: requestRow.id,
      actor_user_id: null,
      event_type: 'completed',
      from_status: requestRow.status ?? 'pending',
      to_status: 'completed',
      note: completionNote,
      retention_until: null,
      notification_method: 'in_app',
      notification_reference: 'delete-account',
      created_at: now,
    });
    if (eventError) {
      console.error('delete-account: no se pudo escribir el evento final', eventError);
    }
  }

  return jsonResponse({ deleted: true });
});
