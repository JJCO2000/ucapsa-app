import { supabase } from '../lib/supabase';

export type BasicDog = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type DogProfile = BasicDog & {
  photo_path: string | null;
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
};

const DOG_PHOTO_BUCKET = 'dog-profile-photos' as const;
const DOG_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

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
    photo_path: normalizeNullableText(item.photo_path),
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
  const { data, error } = await supabase.rpc('get_my_basic_dogs');
  if (error) throw error;
  return normalizeRows(data);
}

export async function getMyDogProfile(dogId: string): Promise<DogProfile> {
  const cleanDogId = dogId.trim();
  if (!cleanDogId) throw new Error('No se encontro el perro.');

  const { data, error } = await supabase.rpc('get_my_basic_dog_profile', {
    p_dog_id: cleanDogId,
  });
  if (error) throw error;
  if (!data?.[0]) throw new Error('No se encontro el perro.');
  return normalizeDogProfile(data[0]);
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
    p_breed: normalizeNullableText(input.breed),
    p_birth_date: normalizeNullableText(input.birth_date),
    p_sex: input.sex ?? null,
    p_weight_kg: weight,
  });

  if (error) throw error;
  if (!data?.[0]) throw new Error('No se pudo actualizar el perro.');
  return normalizeDogProfile(data[0]);
}

function dogPhotoExtension(mimeType: string | null | undefined) {
  const normalized = (mimeType ?? '').toLowerCase();
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  return 'jpg';
}

export async function getMyDogPhotoUrl(photoPath: string | null | undefined): Promise<string | null> {
  const cleanPath = photoPath?.trim();
  if (!cleanPath) return null;
  const { data, error } = await supabase.storage
    .from(DOG_PHOTO_BUCKET)
    .createSignedUrl(cleanPath, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadMyDogPhoto(
  dogId: string,
  uri: string,
  mimeType?: string | null,
): Promise<DogProfile> {
  const cleanDogId = dogId.trim();
  if (!cleanDogId || !uri.trim()) throw new Error('No se encontro la foto.');

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const userId = authData.user?.id;
  if (!userId) throw new Error('No hay sesion activa.');

  const previous = await getMyDogProfile(cleanDogId);
  const response = await fetch(uri);
  if (!response.ok) throw new Error('No se pudo leer la foto seleccionada.');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > DOG_PHOTO_MAX_BYTES) {
    throw new Error('La foto debe pesar menos de 5 MB.');
  }

  const contentType = mimeType === 'image/png' || mimeType === 'image/webp'
    ? mimeType
    : 'image/jpeg';
  const path = `${userId}/${cleanDogId}/profile.${dogPhotoExtension(contentType)}`;

  const { error: uploadError } = await supabase.storage
    .from(DOG_PHOTO_BUCKET)
    .upload(path, bytes, {
      contentType,
      upsert: true,
      cacheControl: '3600',
    });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.rpc('set_my_dog_photo_path', {
    p_dog_id: cleanDogId,
    p_photo_path: path,
  });
  if (error) {
    await supabase.storage.from(DOG_PHOTO_BUCKET).remove([path]).catch(() => undefined);
    throw error;
  }

  if (previous.photo_path && previous.photo_path !== path) {
    void supabase.storage.from(DOG_PHOTO_BUCKET).remove([previous.photo_path]);
  }

  if (!data?.[0]) throw new Error('No se pudo guardar la foto.');
  return normalizeDogProfile(data[0]);
}

export async function removeMyDogPhoto(dogId: string): Promise<DogProfile> {
  const cleanDogId = dogId.trim();
  if (!cleanDogId) throw new Error('No se encontro el perro.');

  const previous = await getMyDogProfile(cleanDogId);
  const { data, error } = await supabase.rpc('set_my_dog_photo_path', {
    p_dog_id: cleanDogId,
    p_photo_path: '',
  });
  if (error) throw error;

  if (previous.photo_path) {
    void supabase.storage.from(DOG_PHOTO_BUCKET).remove([previous.photo_path]);
  }

  if (!data?.[0]) throw new Error('No se pudo quitar la foto.');
  return normalizeDogProfile(data[0]);
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
    .select('id,name,is_active,created_at,updated_at')
    .eq('user_id', cleanUserId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return normalizeRows(data);
}
