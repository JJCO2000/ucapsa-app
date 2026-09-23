import fs from 'node:fs';

const register = fs.readFileSync('src/app/auth/register.tsx', 'utf8');
const auth = fs.readFileSync('src/services/auth.service.ts', 'utf8');
const settings = fs.readFileSync('src/app/account-settings.tsx', 'utf8');
const deletion = fs.readFileSync('src/services/account-deletion.service.ts', 'utf8');
const dogProfile = fs.readFileSync('src/app/client/dog-profile.tsx', 'utf8');
const dogsService = fs.readFileSync('src/services/dogs.service.ts', 'utf8');
const terms = fs.readFileSync('src/app/terms.tsx', 'utf8');
const legal = fs.readFileSync('src/constants/legal.ts', 'utf8');
const deleteFunction = fs.readFileSync('supabase/functions/delete-account/index.ts', 'utf8');
const privacyFunction = fs.readFileSync('supabase/functions/privacy-policy/index.ts', 'utf8');

for (const token of [
  'adultConfirmed',
  'legalAccepted',
  'Confirmo que tengo 18 años o más',
  'href="/privacy"',
  'href="/terms"',
  'privacyNotice.version',
]) {
  if (!register.includes(token)) throw new Error('App Store registration contract missing: ' + token);
}

for (const token of ['age_attested', 'privacy_notice_version', 'terms_version', 'legal_accepted_at']) {
  if (!auth.includes(token)) throw new Error('Signup legal evidence missing: ' + token);
}

if (!settings.includes('deleteMyAccount') || !deletion.includes("functions.invoke('delete-account'")) {
  throw new Error('Account settings are not wired to real account deletion.');
}

for (const forbidden of ['Alergias', 'Medicamentos', 'Alimentación', 'Conducta y notas']) {
  if (dogProfile.includes(forbidden)) throw new Error('Dog minimization regression: ' + forbidden);
}

for (const forbidden of ['allergies: normalizeNullableText(input.allergies)', 'medications: normalizeNullableText(input.medications)', 'feeding_notes: normalizeNullableText(input.feeding_notes)', 'behavior_notes: normalizeNullableText(input.behavior_notes)']) {
  if (dogsService.includes(forbidden)) throw new Error('Dog service still writes disabled fields: ' + forbidden);
}

for (const token of ['UCAPSA_TERMS_VERSION', 'UCAPSA_TERMS_SECTIONS']) {
  if (!legal.includes(token) || !terms.includes(token)) throw new Error('Terms contract missing: ' + token);
}

for (const token of ['auth.admin.deleteUser', 'auth.admin.signOut', 'request_my_account_deletion']) {
  if (!deleteFunction.includes(token)) throw new Error('Delete-account edge function missing: ' + token);
}

for (const token of ['privacy_notices', "status', 'published'", 'text/html']) {
  if (!privacyFunction.includes(token)) throw new Error('Public privacy function missing: ' + token);
}

console.log('UCAPSA App Store privacy readiness: PASS');
