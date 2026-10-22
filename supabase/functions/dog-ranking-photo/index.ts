import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';

const noStore = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0',
  'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Vary': 'Authorization, Origin',
};

function getCors(origin: string | null): Record<string, string> {
  // Orígenes web autorizados por configuración; aplicaciones nativas no envían Origin.
  const allowed = (Deno.env.get('UCAPSA_RANKING_IMAGE_ALLOWED_ORIGINS') ?? '')
    .split(',').map((o) => o.trim()).filter(Boolean);
  return origin && allowed.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, ...noStore }
    : noStore;
}

function reply(status: number, message: string, headers: Record<string, string>) {
  return new Response(message, {
    status, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const headers = getCors(origin);
  if (origin && !('Access-Control-Allow-Origin' in headers)) {
    return reply(403, 'Origen no autorizado.', headers);
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, apikey' },
    });
  }
  if (req.method !== 'GET') {
    return reply(405, 'Método no permitido.', { ...headers, Allow: 'GET, OPTIONS' });
  }

  const dogId = new URL(req.url).searchParams.get('dog_id')?.trim() ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dogId)) {
    return reply(400, 'Identificador inválido.', headers);
  }

  const token = req.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return reply(401, 'Inicia sesión para consultar el Ranking.', headers);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !serviceKey) return reply(503, 'Servicio no disponible.', headers);

  const userClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authResult, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authResult.user) return reply(401, 'Sesión no válida.', headers);

  // La lectura privilegiada se utiliza solo DESPUÉS de autenticar la petición.
  const service = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: consent, error: consentError } = await service
    .from('dog_ranking_photo_consents')
    .select('user_id, revoked_at')
    .eq('dog_id', dogId)
    .is('revoked_at', null)
    .maybeSingle();
  if (consentError) return reply(503, 'No se pudo comprobar el permiso.', headers);
  if (!consent) return reply(404, 'Imagen no disponible.', headers);

  const { data: dog, error: dogError } = await service
    .from('dogs')
    .select('user_id, photo_path, is_active')
    .eq('id', dogId)
    .eq('is_active', true)
    .maybeSingle();
  if (dogError) return reply(503, 'No se pudo comprobar la fotografía.', headers);
  if (!dog || dog.user_id !== consent.user_id || !dog.photo_path) {
    return reply(404, 'Imagen no disponible.', headers);
  }

  // Nunca devolver URL firmada ni compartir el bucket privado con otros clientes.
  const { data: image, error: imageError } = await service.storage
    .from('dog-photos').download(dog.photo_path);
  if (imageError || !image) return reply(404, 'Imagen no disponible.', headers);

  const contentType = image.type;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    return reply(415, 'Formato no permitido.', headers);
  }

  return new Response(image.stream(), {
    status: 200,
    headers: { ...headers, 'Content-Type': contentType,
      'Content-Disposition': 'inline', 'X-Frame-Options': 'DENY' },
  });
});
