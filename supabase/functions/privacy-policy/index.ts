const TARGET_URL = 'https://jjco2000.github.io/ucapsa-app/privacidad/';

Deno.serve((req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Método no permitido.', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  return new Response(req.method === 'HEAD' ? null : 'Redirigiendo a la Política y Aviso de Privacidad de UCAPSA App.', {
    status: 302,
    headers: {
      Location: TARGET_URL,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
});
