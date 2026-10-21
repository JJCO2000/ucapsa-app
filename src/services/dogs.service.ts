import {
  DEFAULT_DOG_AVATAR_COLOR,
  DEFAULT_DOG_AVATAR_KEY,
  normalizeDogAvatarColor,
  normalizeDogAvatarKey,
  type DogAvatarColor,
  type DogAvatarKey,
} from '../constants/dogAvatar';
import { supabase } from '../lib/supabase';
import { getMyDogPhotoPaths } from './dog-photos.service';

export type BasicDog = {
  id: string;
  name: string;
  avatar_key: DogAvatarKey;
  avatar_color: DogAvatarColor;
  photo_path: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type DogProfile = BasicDog & {
  breed: string | null;
  birth_date: string | null;
  sex: 'female' | 'male' | 'unknown' | null;
  weight_kg: number | null;
  allergies: string | null;
  medications: string | null;
  feeding_notes: string | null;
  behavior_notes: string | null;
  veterinarian_name: string | null;
  veterinarian_phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
};

export type DogProfileInput = {
  name: string;
  breed?: string | null;
  birth_date?: string | null;
  sex?: DogProfile['sex'];
  weight_kg?: number | null;
  avatar_key?: DogAvatarKey | null;
  avatar_color?: DogAvatarColor | null;
};

function normalizeRows(data: unknown): BasicDog[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => item as Partial<BasicDog>)
    .filter((item): item is BasicDog => Boolean(item.id && item.name))
    .map((item) => ({
      id: String(item.id),
      name: String(item.name),
      avatar_key: normalizeDogAvatarKey(item.avatar_key ?? DEFAULT_DOG_AVATAR_KEY),
      avatar_color: normalizeDogAvatarColor(item.avatar_color ?? DEFAULT_DOG_AVATAR_COLOR),
      photo_path: item.photo_path ? String(item.photo_path) : null,
      is_active: item.is_active !== false,
      created_at: String(item.created_at ?? ''),
      updated_at: String(item.updated_at ?? ''),
    }));
}

function normalizeNullableText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeDogProfile(data: unknown): DogProfile {
  const item = data as Partial<DogProfile> | null;
  if (!item?.id || !item.name) throw new Error('No se encontro el perro.');

  const sex = item.sex === 'female' || item.sex === 'male' || item.sex === 'unknown' ? item.sex : null;
  const numericWeight = item.weight_kg == null ? null : Number(item.weight_kg);

  return {
    id: String(item.id),
    name: String(item.name),
    avatar_key: normalizeDogAvatarKey(item.avatar_key ?? DEFAULT_DOG_AVATAR_KEY),
    avatar_color: normalizeDogAvatarColor(item.avatar_color ?? DEFAULT_DOG_AVATAR_COLOR),
    photo_path: item.photo_path ? String(item.photo_path) : null,
    breed: normalizeNullableText(item.breed),
    birth_date: normalizeNullableText(item.birth_date),
    sex,
    weight_kg: numericWeight != null && Number.isFinite(numericWeight) ? numericWeight : null,
    allergies: normalizeNullableText(item.allergies),
    medications: normalizeNullableText(item.medications),
    feeding_notes: normalizeNullableText(item.feeding_notes),
    behavior_notes: normalizeNullableText(item.behavior_notes),
    veterinarian_name: normalizeNullableText(item.veterinarian_name),
    veterinarian_phone: normalizeNullableText(item.veterinarian_phone),
    emergency_contact_name: normalizeNullableText(item.emergency_contact_name),
    emergency_contact_phone: normalizeNullableText(item.emergency_contact_phone),
    notes: normalizeNullableText(item.notes),
    is_active: item.is_active !== false,
    created_at: String(item.created_at ?? ''),
    updated_at: String(item.updated_at ?? ''),
  };
}

export async function getMyDogs(): Promise<BasicDog[]> {
  const [{ data, error }, photoPaths] = await Promise.all([
    supabase.rpc('get_my_basic_dogs'),
    getMyDogPhotoPaths(),
  ]);
  if (error) throw error;
  return normalizeRows(data).map((dog) => ({ ...dog, photo_path: photoPaths[dog.id] ?? null }));
}

export async function getMyDogProfile(dogId: string): Promise<DogProfile> {
  const cleanDogId = dogId.trim();
  if (!cleanDogId) throw new Error('No se encontro el perro.');

  const { data, error } = await supabase.rpc('get_my_basic_dog_profile', {
    p_dog_id: cleanDogId,
  });
  if (error) throw error;
  if (!data?.[0]) throw new Error('No se encontro el perro.');
  const profile = normalizeDogProfile(data[0]);
  const photoPaths = await getMyDogPhotoPaths();
  return { ...profile, photo_path: photoPaths[profile.id] ?? null };
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

export async function updateMyDogProfile(dogId: string, input: DogProfileInput): Promise<DogProfile> {
  const cleanDogId = dogId.trim();
  const cleanName = input.name.trim();
  if (!cleanDogId) throw new Error('No se encontro el perro.');
  if (!cleanName) throw new Error('Escribe el nombre de tu perro.');

  const weight = input.weight_kg == null ? null : Number(input.weight_kg);
  if (weight != null && (!Number.isFinite(weight) || weight < 0)) {
    throw new Error('El peso debe ser un numero igual o mayor a cero.');
  }

  const { data, error } = await supabase.rpc('update_my_basic_dog_profile', {
    p_dog_id: cleanDogId,
    p_name: cleanName,
    p_breed: normalizeNullableText(input.breed) ?? undefined,
    p_birth_date: normalizeNullableText(input.birth_date) ?? undefined,
    p_sex: input.sex ?? undefined,
    p_weight_kg: weight ?? undefined,
    p_avatar_key: input.avatar_key ?? undefined,
    p_avatar_color: input.avatar_color ?? undefined,
  });

  if (error) throw error;
  if (!data?.[0]) throw new Error('No se pudo actualizar el perro.');
  const profile = normalizeDogProfile(data[0]);
  const photoPaths = await getMyDogPhotoPaths();
  return { ...profile, photo_path: photoPaths[profile.id] ?? null };
}

/**
 * Solo modifica preferencias visuales: nunca envía nombre, raza, fecha,
 * nivel, asistencia ni otros campos del borrador de la ficha.
 * dogs_owner_update_enabled + dogs_owner_select_enabled validan propiedad en RLS.
 */
export async function updateMyDogAvatar(dogId: string, avatarKey: DogAvatarKey, avatarColor: DogAvatarColor):
  Promise<Pick<BasicDog, 'avatar_key' | 'avatar_color'>> {
  const id = dogId.trim();
  if (!id) throw new Error('No se encontró el perro.');
  const { data, error } = await supabase.from('dogs')
    .update({ avatar_key: avatarKey, avatar_color: avatarColor })
    .eq('id', id)
    .eq('is_active', true)
    .select('avatar_key,avatar_color')
    .single();
  if (error) throw error;
  if (!data) throw new Error('No se pudo guardar el avatar.');
  return {
    avatar_key: normalizeDogAvatarKey(data.avatar_key),
    avatar_color: normalizeDogAvatarColor(data.avatar_color),
  };
}

export async function createDogForUserAdmin(userId: string, name: string): Promise<BasicDog> {
  const cleanUserId = userId.trim();
  const cleanName = name.trim();
  if (!cleanUserId) throw new Error('No se encontro el cliente.');
  if (!cleanName) throw new Error('Escribe el nombre del perro.');

  const { data, error } = await supabase.rpc('admin_create_basic_dog', {
    p_user_id: cleanUserId,
    p_name: cleanName,
  });
  if (error) throw error;

  const rows = normalizeRows(data);
  if (!rows[0]) throw new Error('No se pudo registrar el perro en la cuenta del cliente.');
  return rows[0];
}

export async function getActiveDogNamesByUserIds(userIds: string[]): Promise<Record<string, string[]>> {
  const ids = [...new Set(userIds.map((value) => value.trim()).filter(Boolean))];
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from('dogs')
    .select('user_id,name')
    .in('user_id', ids)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const namesByUser: Record<string, string[]> = {};
  for (const row of (data ?? []) as Array<{ user_id: string; name: string }>) {
    namesByUser[row.user_id] = namesByUser[row.user_id] ?? [];
    if (!namesByUser[row.user_id].includes(row.name)) namesByUser[row.user_id].push(row.name);
  }
  return namesByUser;
}

export async function getDogsForUser(userId: string): Promise<BasicDog[]> {
  const cleanUserId = userId.trim();
  if (!cleanUserId) return [];

  const { data, error } = await supabase
    .from('dogs')
    .select('id,name,avatar_key,avatar_color,photo_path,is_active,created_at,updated_at')
    .eq('user_id', cleanUserId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return normalizeRows(data);
}
