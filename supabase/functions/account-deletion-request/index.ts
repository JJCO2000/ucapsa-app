const PRIVACY_URL =
  'https://hrfecmviyiluubymsoeq.supabase.co/functions/v1/privacy-policy';
const SUPPORT_EMAIL = 'ucapsa84@gmail.com';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

Deno.serve((req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Método no permitido.', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  const subject = 'Solicitud de eliminación de cuenta UCAPSA App';
  const body = [
    'Hola, Administración de UCAPSA:',
    '',
    'Solicito la eliminación de mi cuenta de UCAPSA App y de los datos asociados que no exista obligación legal de conservar.',
    '',
    'Correo asociado a mi cuenta:',
    '',
    'Gracias.',
  ].join('\n');
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="index,follow" />
  <title>Eliminar cuenta · UCAPSA App</title>
  <style>
    :root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#202124;background:#f7f7f7}
    *{box-sizing:border-box}body{margin:0}.wrap{max-width:760px;margin:0 auto;padding:32px 18px 64px}
    .card{background:#fff;border:1px solid #e4e4e4;border-radius:20px;padding:22px;margin-bottom:14px}
    .brand{font-size:13px;font-weight:900;letter-spacing:.08em;color:#a71930;text-transform:uppercase}
    h1{font-size:30px;line-height:1.15;margin:8px 0 12px}h2{font-size:18px;margin:0 0 10px}
    p,li{color:#4b4b4b;line-height:1.65}.button{display:inline-block;margin-top:12px;padding:13px 18px;border-radius:14px;background:#a71930;color:#fff;text-decoration:none;font-weight:800}
    .link{color:#8a1027;font-weight:700}.muted{font-size:13px;color:#6b6b6b}.email{font-weight:800;word-break:break-word}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="card">
      <div class="brand">UCAPSA App</div>
      <h1>Eliminar tu cuenta y datos</h1>
      <p>
        Universidad de Crianza y Adiestramiento Peruano, S.A. de C.V. permite
        solicitar la eliminación de una cuenta de UCAPSA App sin necesidad de
        volver a instalar o abrir la aplicación.
      </p>
    </section>

    <section class="card">
      <h2>Opción más rápida: desde la app</h2>
      <p>
        Si todavía puedes iniciar sesión, entra a <strong>Ajustes → Eliminar cuenta</strong>.
        Para cuentas de clientes y socios, la app intenta completar la eliminación
        directamente y muestra el resultado.
      </p>
    </section>

    <section class="card">
      <h2>Si ya no tienes acceso a la app</h2>
      <p>
        Envía la solicitud desde el correo asociado a tu cuenta. Sólo necesitamos
        que indiques el correo de la cuenta y que deseas eliminarla. No envíes
        contraseñas, datos bancarios ni documentos que no te solicitemos.
      </p>
      <a class="button" href="${escapeHtml(mailto)}">Solicitar eliminación por correo</a>
      <p class="muted">
        Si el botón no abre tu correo, escribe directamente a
        <span class="email">${SUPPORT_EMAIL}</span> con el asunto
        “Solicitud de eliminación de cuenta UCAPSA App”.
      </p>
    </section>

    <section class="card">
      <h2>Qué ocurre con tus datos</h2>
      <ul>
        <li>Se elimina la cuenta y los datos asociados de UCAPSA App que no debamos conservar por obligación legal.</li>
        <li>Los datos que deban conservarse legalmente se bloquean y dejan de usarse para finalidades incompatibles hasta que proceda su supresión.</li>
        <li>La eliminación de la cuenta no sustituye obligaciones fiscales o contables que, en su caso, existan fuera del registro auxiliar de la app.</li>
      </ul>
      <p>
        Consulta el <a class="link" href="${PRIVACY_URL}" rel="noreferrer">Aviso de Privacidad de UCAPSA App</a>
        para conocer categorías de datos, finalidades, conservación y derechos ARCO.
      </p>
    </section>
  </main>
</body>
</html>`;

  return new Response(req.method === 'HEAD' ? null : html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
});
