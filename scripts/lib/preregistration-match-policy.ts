/**
 * Deterministic decision policy for linking an unclaimed UCAPSA preregistration.
 * This is a pure planning helper, NOT a live Auth/DB mutation.
 *
 * All contact values MUST arrive pre-normalized and independently confirmed by
 * Supabase Auth. The caller (future RPC) must also check unique bindings among
 * both provisional records and existing Auth identities.
 */
export type VerifiedAccountContacts = {
  userId: string;
  emailKey: string | null;
  emailVerified: boolean;
  phoneE164: string | null;
  phoneVerified: boolean;
  emailUniqueAcrossAuth: boolean;
  phoneUniqueAcrossAuth: boolean;
};

export type ProvisionalPersonCandidate = {
  id: string;
  emailKey: string | null;
  phoneE164: string | null;
  linkedUserId: string | null;
  status: 'pending' | 'linked' | 'rejected';
};

export type PreregLinkDecision =
  | { action: 'link'; provisionalId: string; verifiedBy: 'email' | 'phone' | 'both' }
  | { action: 'already-linked'; provisionalId: string }
  | { action: 'no-match' }
  | { action: 'blocked'; reason: 'conflicting-contacts' | 'ambiguous' | 'existing-binding' | 'untrusted-contact' };

export function decidePreregistrationLink(
  account: VerifiedAccountContacts,
  people: readonly ProvisionalPersonCandidate[],
): PreregLinkDecision {
  if (!account.userId) return { action: 'blocked', reason: 'untrusted-contact' };
  const emailEligible = Boolean(account.emailVerified && account.emailKey && account.emailUniqueAcrossAuth);
  const phoneEligible = Boolean(account.phoneVerified && account.phoneE164 && account.phoneUniqueAcrossAuth);
  // Celular confirmado por Auth es prioritario; correo confirmado es alternativa.
  // Un teléfono digitado en el perfil no cuenta como verificado.
  if (!emailEligible && !phoneEligible) return { action: 'no-match' };

  const emailMatches = emailEligible
    ? people.filter((p) => p.status !== 'rejected' && p.emailKey === account.emailKey)
    : [];
  const phoneMatches = phoneEligible
    ? people.filter((p) => p.status !== 'rejected' && p.phoneE164 === account.phoneE164)
    : [];

  // There must not be competing candidates for the same verified contact.
  if (emailMatches.length > 1 || phoneMatches.length > 1) {
    return { action: 'blocked', reason: 'ambiguous' };
  }
  const byPhone = phoneMatches[0];
  const byEmail = emailMatches[0];
  if (byPhone && byEmail && byPhone.id !== byEmail.id) {
    return { action: 'blocked', reason: 'conflicting-contacts' };
  }
  const candidate = byPhone ?? byEmail;
  if (!candidate) return { action: 'no-match' };

  // If verified profile contacts conflict with a stored contact, do not
  // silently prefer the other verified contact. Phone number recycling and
  // shared family numbers make this especially important.
  if ((emailEligible && candidate.emailKey && candidate.emailKey !== account.emailKey) ||
      (phoneEligible && candidate.phoneE164 && candidate.phoneE164 !== account.phoneE164)) {
    return { action: 'blocked', reason: 'conflicting-contacts' };
  }

  if (candidate.linkedUserId) {
    return candidate.linkedUserId === account.userId
      ? { action: 'already-linked', provisionalId: candidate.id }
      : { action: 'blocked', reason: 'existing-binding' };
  }
  if (candidate.status !== 'pending') return { action: 'blocked', reason: 'existing-binding' };

  return {
    action: 'link',
    provisionalId: candidate.id,
    verifiedBy: byPhone && byEmail ? 'both' : byPhone ? 'phone' : 'email',
  };
}
