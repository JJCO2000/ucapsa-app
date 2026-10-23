import { supabase } from '../lib/supabase';
import { getPublishedPrivacyNotice } from './privacy-notice.service';

/**
 * Only a published approved notice enables the client control. The owner-scoped
 * RPC verifies all conditions again on the SERVER; this UI check grants nothing.
 */
export async function isRankingPhotoChoiceAvailable(): Promise<boolean> {
  const notice = await getPublishedPrivacyNotice();
  if (!notice) return false;
  const value = notice as unknown as { version?: unknown; ranking_photo_publication_approved?: unknown };
  return typeof value.version === 'string'
    && /^1\.4(?:[.-]|$)/.test(value.version)
    && value.ranking_photo_publication_approved === true;
}

type RpcResponse = { data: unknown; error: { message: string } | null };
const ownerRpc = supabase.rpc.bind(supabase) as unknown as
  (fn: string, params?: Record<string, unknown>) => PromiseLike<RpcResponse>;

export async function getMyRankingPhotoChoice(dogId: string): Promise<boolean> {
  if (!dogId.trim()) throw new Error('Selecciona un perro.');
  const { data, error } = await ownerRpc('get_my_dog_ranking_photo_consents');
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error('No se pudo consultar la elección de imagen.');
  const matching = data.find((candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object') return false;
    return (candidate as { dog_id?: unknown }).dog_id === dogId;
  });
  return Boolean(matching && typeof matching === 'object'
    && (matching as { enabled?: unknown }).enabled === true);
}

export async function setMyRankingPhotoChoice(dogId: string, enabled: boolean): Promise<boolean> {
  const id = dogId.trim();
  if (!id) throw new Error('Selecciona un perro.');
  if (enabled && !await isRankingPhotoChoiceAvailable()) {
    throw new Error('La foto en el Ranking todavía no está disponible.');
  }
  const { data, error } = await ownerRpc('set_my_dog_ranking_photo_consent', {
    p_dog_id: id, p_enabled: enabled,
  });
  if (error) throw new Error(error.message);
  if (data !== enabled) throw new Error('No se pudo confirmar el cambio de imagen.');
  return enabled;
}
