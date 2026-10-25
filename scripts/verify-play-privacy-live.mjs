import assert from 'node:assert/strict';
import fs from 'node:fs';

// Explicit pre-submission check. Never use a service_role or secret API key.
// CI self-tests the comparison; actual checks run ONLY with --live so that
// development/PR pushes cannot access production accounts or publish anything.
function websiteUrl() {
  const legal = fs.readFileSync('src/constants/legal.ts','utf8');
  const match = legal.match(/UCAPSA_PRIVACY_PUBLIC_URL\s*=\s*['"]([^'"]+)['"]/);
  if (!match) throw new Error('La URL pública canónica ya no existe.');
  return match[1];
}

function publicVersion(html) {
  const plain = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]*>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/\s+/g,' ');
  const heading = plain.slice(0,8000).match(/\bVersi[oó]n\s*:\s*(\d+\.\d+(?:\.\d+)?)/i);
  if (!heading) throw new Error('La página pública no muestra una versión comprobable del aviso.');
  return heading[1];
}
function check(rows,html) {
  if (!Array.isArray(rows) || rows.length !== 1 ||
    rows[0]?.status !== 'published' || typeof rows[0]?.version !== 'string') {
    throw new Error('Supabase no devuelve exactamente un aviso published.');
  }
  const notice = rows[0];
  const serverVersion = notice.version.match(/^(\d+\.\d+(?:\.\d+)?)(?:-|$)/)?.[1];
  if (!serverVersion) throw new Error('Identificador de versión publicada inválido.');
  if (!notice.integral_notice || !notice.simplified_notice) {
    throw new Error('Supabase no tiene los dos textos completos.');
  }
  const websiteVersion = publicVersion(html);
  if (serverVersion !== websiteVersion) {
    throw new Error('AVISO DIVERGENTE: Supabase '+serverVersion+
      ' y página pública '+websiteVersion+'. No enviar AAB ni cerrar Data Safety.');
  }

  // A coverage signal, never a legal compliance verdict.
  const simplified=notice.simplified_notice;
  const integral=notice.integral_notice;
  if (!/preinscripci[oó]n|preinscripciones/i.test(simplified+' '+integral)
    || !/familiares|familiar/i.test(simplified+' '+integral)) {
    throw new Error('AVISO INCOMPLETO PARA EL MVP: no cubre explícitamente preinscripciones y familiares.');
  }
  if (!/limit(ar|aci[oó]n)\b|limitar el uso/i.test(simplified)) {
    throw new Error('El simplificado no describe cómo limitar uso o divulgación.');
  }
  if (!/derechos ARCO|acceso, rectificaci[oó]n, cancelaci[oó]n/i.test(integral)) {
    throw new Error('No se detecta referencia a los derechos ARCO en el aviso integral.');
  }
  return serverVersion;
}
const example=(version)=>[{
  version:version+'-appstores-2026',status:'published',
  simplified_notice:'Datos de preinscripciones y familiares; para limitar el uso escribir a privacidad.',
  integral_notice:'Datos de preinscripción y familiares. Derechos ARCO.',
}];
function runSelfTest() {
  const html=(version)=>'<html><body><h1>Aviso de privacidad</h1>'+
    '<p><strong>Versión:</strong> '+version+' App Stores</p></body></html>';
  assert.equal(check(example('1.4'),html('1.4')),'1.4');
  assert.throws(()=>check(example('1.2'),html('1.3')),/AVISO DIVERGENTE/);
  assert.throws(()=>check([],html('1.4')),/exactamente un aviso/);
  assert.throws(()=>check([...example('1.4'),...example('1.4')],html('1.4')),/exactamente/);
  assert.throws(()=>check(example('1.4'),'<h1>Sin versión</h1>'),/versión comprobable/);
  assert.throws(()=>check([{...example('1.4')[0],
    integral_notice:'Datos de cuenta sin preinscripciones ni derechos.'}],html('1.4')),/ARCO/);
  assert.throws(()=>check([{...example('1.4')[0],
    simplified_notice:'Aviso de privacidad simple.'}],html('1.4')),/limitar uso/);
  assert.throws(()=>check([{...example('1.4')[0],
    integral_notice:'Datos de cuenta. Derechos ARCO.',
    simplified_notice:'Para limitar uso de sus datos.'}],html('1.4')),/preinscripciones y familiares/);
  console.log('PLAY PRIVACY PREFLIGHT SELF-TEST PASS: versiones, dos textos, alcance y divergencia protegidos.');
}
async function fetchContent(url, options={}) {
  const response = await fetch(url,{...options,signal:AbortSignal.timeout(12000),
    headers:{Accept:'application/json',...options.headers}});
  if (!response.ok) throw new Error('HTTP '+response.status+' consultando '+new URL(url).hostname);
  return response;
}
async function runLive() {
  const root=(process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const anon=(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(root) || !anon) {
    throw new Error('Falta URL/clave pública de Supabase de UCAPSA. No uses service_role. Carga EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }
  if (anon.startsWith('sb_secret_')) throw new Error('Está prohibido usar una clave secreta en esta auditoría.');
  const url=new URL('/rest/v1/privacy_notices',root);
  url.searchParams.set('select','version,status,simplified_notice,integral_notice');
  url.searchParams.set('status','eq.published');
  const headers={apikey:anon};
  if (anon.startsWith('eyJ')) headers.Authorization='Bearer '+anon;
  const [response, page] = await Promise.all([
    fetchContent(url.toString(),{headers}),
    fetchContent(websiteUrl(),{headers:{Accept:'text/html'}}),
  ]);
  const rows=await response.json();
  const html=await page.text();
  const version=check(rows,html);
  console.log('PLAY PRIVACY PREFLIGHT: versiones alineadas '+version+
    '; comprobaciones técnicas de alcance OK. NO acredita aprobación jurídica ni revisión de AAB/Play Console.');
}
if (process.argv.includes('--self-test')) runSelfTest();
else if (process.argv.includes('--live')) await runLive();
else throw new Error('Indica --self-test (CI) o --live (auditoría real antes de Google Play).');
