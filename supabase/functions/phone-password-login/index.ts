import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

const badCredentials = () => reply(401, { error: 'Credenciales incorrectas.' });

/** Identidad canónica: nunca construir otra cuenta a partir del teléfono. */
function legacyPhoneCandidates(phone: string): string[] {
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) return [];
  if (/^\+52[0-9]{10}$/.test(phone)) {
    return [phone, phone.slice(3), phone.slice(1)];
  }
  return [phone];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return reply(405, { error: 'Método no permitido.' });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) return reply(503, { error: 'Servicio no disponible.' });

  // Un máximo explícito evita cuerpos ilimitados y entradas inesperadas.
  const raw = await req.text();
  if (raw.length > 1200) return badCredentials();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return reply(400, { error: 'Solicitud inválida.' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return badCredentials();
  const input = payload as Record<string, unknown>;
  if (typeof input.phone !== 'string' || typeof input.password !== 'string' ||
      input.password.length < 1 || input.password.length > 256) return badCredentials();
  const phones = legacyPhoneCandidates(input.phone);
  if (phones.length === 0) return badCredentials();

  // El service role solo vive en la Edge Function, nunca en el cliente.
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: matches, error: lookupError } = await admin
    .from('profiles')
    .select('user_id,phone')
    .in('phone', phones)
    .limit(2);

  if (lookupError) return reply(503, { error: 'Servicio no disponible.' });
  // Cero o más de un usuario: no revelar existencia del número ni su correo.
  if (!matches || matches.length !== 1) return badCredentials();

  const userId = matches[0].user_id;
  if (typeof userId !== 'string' || !userId) return badCredentials();
  const { data: account, error: accountError } = await admin.auth.admin.getUserById(userId);
  if (accountError || !account?.user?.email) return badCredentials();

  // GoTrue valida la CONTRASEÑA real, nunca una comparación propia.
  const anonymous = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verified, error: passwordError } = await anonymous.auth.signInWithPassword({
    email: account.user.email,
    password: input.password,
  });
  if (passwordError || verified.user?.id !== userId || !verified.session?.access_token ||
      !verified.session?.refresh_token) return badCredentials();

  // Solo se regresan credenciales de GoTrue tras coincidencia única y contraseña válida.
  return reply(200, {
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
    user_id: userId,
  });
});
