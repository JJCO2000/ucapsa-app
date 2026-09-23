const TARGET_URL = 'https://github.com/JJCO2000/ucapsa-app/blob/main/docs/legal/ELIMINAR_CUENTA_UCAPSA_APP.md';

Deno.serve((req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Método no permitido.', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  return new Response(req.method === 'HEAD' ? null : 'Redirigiendo al recurso público de eliminación de cuenta de UCAPSA App.', {
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
