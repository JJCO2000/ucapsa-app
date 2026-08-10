import { supabase } from '../lib/supabase';

export type BasicDog = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function normalizeRows(data: unknown): BasicDog[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => item as Partial<BasicDog>)
    .filter((item): item is BasicDog => Boolean(item.id && item.name))
    .map((item) => ({
      id: String(item.id),
      name: String(item.name),
      is_active: item.is_active !== false,
      created_at: String(item.created_at ?? ''),
      updated_at: String(item.updated_at ?? ''),
    }));
}

export async function getMyDogs(): Promise<BasicDog[]> {
  const { data, error } = await supabase.rpc('get_my_basic_dogs');
  if (error) throw error;
  return normalizeRows(data);
}

export async function createMyDog(name: string): Promise<BasicDog> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Escribe el nombre de tu perro.');

  const { data, error } = await supabase.rpc('create_my_basic_dog', { p_name: cleanName });
  if (error) throw error;

  const rows = normalizeRows(data);
  if (!rows[0]) throw new Error('No se pudo crear el perro.');
  return rows[0];
}

export async function renameMyDog(dogId: string, name: string): Promise<BasicDog> {
  const cleanName = name.trim();
  if (!dogId) throw new Error('No se encontro el perro.');
  if (!cleanName) throw new Error('Escribe el nombre de tu perro.');

  const { data, error } = await supabase.rpc('rename_my_basic_dog', { p_dog_id: dogId, p_name: cleanName });
  if (error) throw error;

  const rows = normalizeRows(data);
  if (!rows[0]) throw new Error('No se pudo actualizar el perro.');
  return rows[0];
}

export async function getDogsForUser(userId: string): Promise<BasicDog[]> {
  const cleanUserId = userId.trim();
  if (!cleanUserId) return [];

  const { data, error } = await supabase
    .from('dogs')
    .select('id,name,is_active,created_at,updated_at')
    .eq('user_id', cleanUserId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return normalizeRows(data);
}
