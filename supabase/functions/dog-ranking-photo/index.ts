import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';

const HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  Vary: 'Authorization, Origin',
};
const MAX_THUMBNAIL_BYTES = 300_000;
const DOG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cors(origin: string | null) {
  // No "*" wildcard: web origins are explicit, mobile requests have no Origin.
  const allowed = (Deno.env.get('UCAPSA_RANKING_IMAGE_ALLOWED_ORIGINS') ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return origin && allowed.includes(origin)
    ? { ...HEADERS, 'Access-Control-Allow-Origin': origin }
    : HEADERS;
}
function message(status: number, text: string, headers: Record<string, string>) {
  return new Response(text, {
    status, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
function publicationAllowed(notice: {
  version?: string | null;
  ranking_photo_publication_approved?: boolean | null;
  integral_notice?: string | null;
  simplified_notice?: string | null;
} | null, expected: string): boolean {
  // Revoking/changing the published notice immediately disables all old consents.
  return Boolean(notice && /^1\.4(?:[.-]|$)/.test(notice.version ?? '')
    && notice.version === expected
    && notice.ranking_photo_publication_approved === true
    && (notice.integral_notice ?? '').toLowerCase().includes('foto pública')
    && (notice.simplified_notice ?? '').toLowerCase().includes('foto pública'));
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const headers = cors(origin);
  if (origin && !('Access-Control-Allow-Origin' in headers)) {
    return message(403, 'Origen no autorizado.', headers);
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, apikey' },
    });
  }
  if (req.method !== 'GET') return message(405, 'Método no permitido.', headers);

  const id = new URL(req.url).searchParams.get('dog_id')?.trim() ?? '';
  if (!DOG_ID.test(id)) return message(400, 'Solicitud inválida.', headers);
  const jwt = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!jwt) return message(401, 'Inicia sesión para ver esta imagen.', headers);

  const url = Deno.env.get('SUPABASE_URL');
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
  const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !publicKey || !secretKey) {
    return message(503, 'Imagen temporalmente no disponible.', headers);
  }
  const authClient = createClient(url, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authResult, error: authError } = await authClient.auth.getUser(jwt);
  if (authError || !authResult.user) return message(401, 'Sesión no válida.', headers);

  const service = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Always revalidate every request. The private source path is never returned.
  async function authorizedSource() {
    const [permission, record, notice] = await Promise.all([
      service.from('dog_ranking_photo_consents')
        .select('user_id,notice_version').eq('dog_id', id)
        .is('revoked_at', null).maybeSingle(),
      service.from('dogs').select('user_id,photo_path,is_active')
        .eq('id', id).eq('is_active', true).maybeSingle(),
      service.from('privacy_notices')
        .select('version,ranking_photo_publication_approved,integral_notice,simplified_notice')
        .eq('status', 'published').order('published_at', { ascending: false })
        .limit(1).maybeSingle(),
    ]);
    if (permission.error || record.error || notice.error) return { error: true, path: null };
    const consent = permission.data;
    const dog = record.data;
    if (!consent || !dog || !dog.photo_path || consent.user_id !== dog.user_id
      || !publicationAllowed(notice.data, consent.notice_version)) {
      return { error: false, path: null };
    }
    return { error: false, path: dog.photo_path as string };
  }

  const first = await authorizedSource();
  if (first.error) return message(503, 'No se pudo comprobar el permiso.', headers);
  if (!first.path) return message(404, 'Imagen no disponible.', headers);

  // Supabase's documented server-side private image transformation.
  // If image transformations aren't enabled (e.g. Free plan), FAIL CLOSED.
  // Never fall back to downloading and exposing the original photograph.
  const { data: image, error: imageError } = await service.storage
    .from('dog-photos').download(first.path, {
      transform: { width: 256, height: 256, resize: 'cover', quality: 70 },
    });
  if (imageError || !image) return message(404, 'Miniatura no disponible.', headers);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type)
      || image.size <= 0 || image.size > MAX_THUMBNAIL_BYTES) {
    return message(415, 'Imagen no admitida.', headers);
  }

  // Narrow the time-of-check/time-of-use window. Even a change of source path
  // or revocation during image processing must prevent sending a response.
  const latest = await authorizedSource();
  if (latest.error) return message(503, 'No se pudo comprobar el permiso.', headers);
  if (!latest.path || latest.path !== first.path) {
    return message(404, 'Imagen no disponible.', headers);
  }

  return new Response(image.stream(), {
    status: 200,
    headers: { ...headers,
      'Content-Type': image.type,
      'Content-Disposition': 'inline',
      'X-Frame-Options': 'DENY',
    },
  });
});
