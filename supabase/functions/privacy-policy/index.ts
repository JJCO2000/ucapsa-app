import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function section(title: string, value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return `<section><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p></section>`;
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Método no permitido.', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return new Response('Configuración incompleta.', { status: 500 });

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: notice, error } = await supabase
    .from('privacy_notices')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !notice) {
    return new Response('Aviso de privacidad no disponible.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const effective = notice.effective_from
    ? new Date(notice.effective_from).toLocaleDateString('es-MX', {
        timeZone: 'America/Mexico_City',
      })
    : '';

  const body = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="index,follow" />
  <title>Aviso de Privacidad · UCAPSA App</title>
  <style>
    :root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#232323;background:#f7f7f7}
    body{margin:0}.wrap{max-width:880px;margin:0 auto;padding:32px 20px 64px}
    header,section,.integral{background:#fff;border:1px solid #e5e5e5;border-radius:18px;padding:20px;margin-bottom:14px}
    h1{font-size:30px;margin:4px 0 6px}h2{font-size:18px;margin:0 0 8px}
    p{white-space:pre-wrap;line-height:1.65;margin:0;color:#4d4d4d}
    .brand{font-weight:800;color:#a71930}.meta{font-size:14px;color:#666;margin-bottom:14px}
    .summary{font-size:16px;color:#232323}.integral{margin-top:22px}
  </style>
</head>
<body>
  <main class="wrap">
    <header>
      <div class="brand">UCAPSA APP</div>
      <h1>Aviso de Privacidad</h1>
      <div class="meta">Versión ${escapeHtml(notice.version)}${effective ? ` · Vigente desde ${escapeHtml(effective)}` : ''}</div>
      <p class="summary">${escapeHtml(notice.simplified_notice)}</p>
    </header>
    ${section('Responsable', notice.responsible_name)}
    ${section('Domicilio del responsable', notice.responsible_address)}
    ${section('Contacto de privacidad', notice.contact_email)}
    ${section('Datos personales tratados', notice.data_categories)}
    ${section('Datos personales sensibles', notice.sensitive_data_categories)}
    ${section('Finalidades', notice.purposes)}
    ${section('Finalidades que requieren consentimiento', notice.consent_required_purposes)}
    ${section('Limitación de uso o divulgación', notice.limitation_mechanisms)}
    ${section('Derechos ARCO', notice.arco_procedure)}
    ${section('Transferencias y encargados', notice.transfer_clause)}
    ${section('Cambios al aviso', notice.change_notice_method)}
    <div class="integral"><h2>Aviso integral</h2><p>${escapeHtml(notice.integral_notice)}</p></div>
  </main>
</body>
</html>`;

  return new Response(req.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
});
