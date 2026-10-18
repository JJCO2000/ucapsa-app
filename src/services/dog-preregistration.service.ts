import { supabase } from '../lib/supabase';

export type DogClaimResult = {
  status: 'linked' | 'none' | 'unverified' | 'not_applicable' | 'conflict';
  linkedDogs: number;
};

export async function adminPreregisterDog(input: {
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  dogName: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('admin_preregister_dog', {
    p_owner_name: input.ownerName.trim(),
    p_owner_email: input.ownerEmail.trim(),
    p_owner_phone: input.ownerPhone.trim(),
    p_dog_name: input.dogName.trim(),
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data) throw new Error('No se pudo confirmar la preinscripción.');
  return data;
}

export async function claimMyPreregisteredDogs(): Promise<DogClaimResult> {
  const { data, error } = await supabase.rpc('claim_my_preregistered_dogs');
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Respuesta de vinculación inválida.');
  }
  const result = data as Record<string, unknown>;
  const status = result.status;
  if (status !== 'linked' && status !== 'none' && status !== 'unverified' &&
    status !== 'not_applicable' && status !== 'conflict') {
    throw new Error('Estado de vinculación inesperado.');
  }
  return {
    status,
    linkedDogs: typeof result.linked_dogs === 'number' ? result.linked_dogs : 0,
  };
}
