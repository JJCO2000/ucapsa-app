// Permanent removal of private dog photos before deleting an Auth identity.
// Uses only Supabase Storage API: never delete rows from storage.objects in SQL.
type ListedEntry = { name: string; id?: string | null; metadata?: unknown };
type StorageBucket = {
  list: (path: string, options: { limit: number; offset: number }) =>
    Promise<{ data: ListedEntry[] | null; error: { message: string } | null }>;
  remove: (paths: string[]) =>
    Promise<{ error: { message: string } | null }>;
};

const PAGE_SIZE = 100;
const MAX_FILES = 5000;
const MAX_FOLDERS = 1000;
const MAX_DEPTH = 4;

function safeSegment(segment: string): boolean {
  return Boolean(segment && segment !== '.' && segment !== '..' &&
    !segment.includes('/') && !segment.includes('\\') && !/[\u0000-\u001f]/.test(segment));
}

export async function listOwnedDogPhotoPaths(bucket: StorageBucket, userId: string): Promise<string[]> {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(userId)) {
    throw new Error('Invalid Auth user for photo cleanup.');
  }
  const folders: Array<{ path: string; depth: number }> = [{ path: userId, depth: 0 }];
  const visited = new Set<string>();
  const paths = new Set<string>();
  while (folders.length) {
    const folder = folders.shift()!;
    if (visited.has(folder.path)) continue;
    visited.add(folder.path);
    if (visited.size > MAX_FOLDERS) throw new Error('Too many storage folders; manual review needed.');
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await bucket.list(folder.path, { limit: PAGE_SIZE, offset });
      if (error || !data) throw new Error('Could not enumerate owned dog photos.');
      for (const entry of data) {
        if (!safeSegment(entry.name)) throw new Error('Unsafe dog photo path; manual review needed.');
        const fullPath = folder.path + '/' + entry.name;
        if (!fullPath.startsWith(userId + '/')) throw new Error('Dog photo outside current user.');
        const isFolder = entry.id === null || (entry.id === undefined && entry.metadata === null);
        if (isFolder) {
          if (folder.depth >= MAX_DEPTH) throw new Error('Nested dog-photo folder requires manual review.');
          folders.push({ path: fullPath, depth: folder.depth + 1 });
        } else if (typeof entry.id === 'string' && entry.id.length) {
          paths.add(fullPath);
          if (paths.size > MAX_FILES) throw new Error('Too many dog photos; manual review needed.');
        } else {
          throw new Error('Unexpected Storage object shape; cannot confirm safe deletion.');
        }
      }
      if (data.length < PAGE_SIZE) break;
    }
  }
  return [...paths];
}

export async function removeOwnedDogPhotos(bucket: StorageBucket, userId: string): Promise<number> {
  const paths = await listOwnedDogPhotoPaths(bucket, userId);
  for (let i = 0; i < paths.length; i += PAGE_SIZE) {
    const { error } = await bucket.remove(paths.slice(i, i + PAGE_SIZE));
    if (error) throw new Error('Could not delete private dog photos; deletion remains pending.');
  }
  const remaining = await listOwnedDogPhotoPaths(bucket, userId);
  if (remaining.length) throw new Error('Dog photos remain in Storage; deletion remains pending.');
  return paths.length;
}
