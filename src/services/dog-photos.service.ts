import { File } from 'expo-file-system';

import { supabase } from '../lib/supabase';

const DOG_PHOTO_BUCKET = 'dog-photos';
const MAX_DOG_PHOTO_BYTES = 3 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type DogPhotoPathRow = {
  dog_id: string;
  photo_path: string | null;
};

async function currentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user?.id;
  if (!userId) throw new Error('Sesion requerida.');
  return userId;
}

export async function getMyDogPhotoPaths(): Promise<Record<string, string | null>> {
  const { data, error } = await supabase.rpc('get_my_dog_photo_paths');
  if (error) throw error;

  const result: Record<string, string | null> = {};
  for (const row of (data ?? []) as DogPhotoPathRow[]) {
    if (!row.dog_id) continue;
    result[String(row.dog_id)] = row.photo_path ? String(row.photo_path) : null;
  }
  return result;
}

export async function getPrivateDogPhotoUrl(photoPath: string | null | undefined) {
  const cleanPath = photoPath?.trim();
  if (!cleanPath) return null;
  const { data, error } = await supabase.storage
    .from(DOG_PHOTO_BUCKET)
    .createSignedUrl(cleanPath, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  return data?.signedUrl ?? null;
}

export async function getPrivateDogPhotoUrls(
  pathsByDogId: Record<string, string | null>,
): Promise<Record<string, string | null>> {
  const entries = Object.entries(pathsByDogId).filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (entries.length === 0) return {};

  const paths = entries.map(([, path]) => path);
  const { data, error } = await supabase.storage
    .from(DOG_PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;

  const urlByPath = new Map((data ?? []).map((item) => [item.path, item.signedUrl ?? null]));
  return Object.fromEntries(entries.map(([dogId, path]) => [dogId, urlByPath.get(path) ?? null]));
}

function extensionForMime(mime: string) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export async function uploadMyDogPhoto(dogId: string, localUri: string) {
  const cleanDogId = dogId.trim();
  if (!cleanDogId) throw new Error('No se encontro el perro.');

  const userId = await currentUserId();
  const paths = await getMyDogPhotoPaths();
  if (!(cleanDogId in paths)) throw new Error('No se encontro el perro.');

  const file = new File(localUri);
  const size = file.size ?? 0;
  if (size <= 0) throw new Error('La foto seleccionada no se pudo leer.');
  if (size > MAX_DOG_PHOTO_BYTES) throw new Error('La foto pesa mas de 3 MB.');

  const mime = file.type && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    ? file.type
    : 'image/jpeg';
  const extension = extensionForMime(mime);
  const path = `${userId}/${cleanDogId}/${Date.now()}.${extension}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(DOG_PHOTO_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false, cacheControl: '3600' });
  if (uploadError) throw uploadError;

  const oldPath = paths[cleanDogId] ?? null;
  const { error: rpcError } = await supabase.rpc('set_my_dog_photo_path', {
    p_dog_id: cleanDogId,
    p_photo_path: path,
  });
  if (rpcError) {
    await supabase.storage.from(DOG_PHOTO_BUCKET).remove([path]);
    throw rpcError;
  }

  if (oldPath && oldPath !== path) {
    await supabase.storage.from(DOG_PHOTO_BUCKET).remove([oldPath]);
  }

  return {
    photoPath: path,
    signedUrl: await getPrivateDogPhotoUrl(path),
  };
}

export async function removeMyDogPhoto(dogId: string) {
  const cleanDogId = dogId.trim();
  if (!cleanDogId) return;

  const paths = await getMyDogPhotoPaths();
  const oldPath = paths[cleanDogId] ?? null;

  const { error } = await supabase.rpc('set_my_dog_photo_path', {
    p_dog_id: cleanDogId,
    p_photo_path: '',
  });
  if (error) throw error;

  if (oldPath) await supabase.storage.from(DOG_PHOTO_BUCKET).remove([oldPath]);
}
