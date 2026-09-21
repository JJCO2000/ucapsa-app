import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Metodo no permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Faltan variables de entorno de Supabase.' }, 500);
  }

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization) return jsonResponse({ error: 'Falta Authorization header.' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userResult, error: userError } = await userClient.auth.getUser();
  const userId = userResult.user?.id ?? null;

  if (userError || !userId) {
    return jsonResponse({ error: 'Sesion invalida.' }, 401);
  }

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileError) return jsonResponse({ error: profileError.message }, 500);
  if (profile && ['admin', 'super_admin'].includes(String(profile.role))) {
    return jsonResponse({ error: 'Las cuentas administrativas no pueden eliminarse por autoservicio.' }, 403);
  }

  const { error: purgeError } = await serviceClient.rpc('service_purge_self_delete_data', {
    p_user_id: userId,
  });

  if (purgeError) return jsonResponse({ error: purgeError.message }, 500);

  const { error: deleteError } = await serviceClient.auth.admin.deleteUser(userId, false);
  if (deleteError) {
    return jsonResponse({
      error: deleteError.message,
      message: 'La limpieza previa termino, pero Auth no pudo eliminar la cuenta. Reintenta.',
    }, 500);
  }

  return jsonResponse({ deleted: true });
});
