import { supabase } from '../lib/supabase';
import type { Announcement, AudienceType } from '../types/app.types';

const ANNOUNCEMENT_COLUMNS =
  'id,title,content,audience,is_pinned,is_published,archived_at,created_by,created_at,updated_at';

export type AnnouncementInput = {
  title: string;
  content: string;
  audience: AudienceType;
  is_pinned: boolean;
  is_published?: boolean;
};

function cleanAnnouncementInput(input: AnnouncementInput) {
  return {
    title: input.title.trim(),
    content: input.content.trim(),
    audience: input.audience,
    is_pinned: input.is_pinned,
    is_published: input.is_published ?? true,
  };
}

function requireValidAnnouncement(input: AnnouncementInput) {
  if (!input.title.trim()) {
    throw new Error('El titulo es obligatorio.');
  }

  if (!input.content.trim()) {
    throw new Error('El contenido es obligatorio.');
  }
}

export async function listVisibleAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select(ANNOUNCEMENT_COLUMNS)
    .eq('is_published', true)
    .is('archived_at', null)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Announcement[];
}

export async function listAdminAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select(ANNOUNCEMENT_COLUMNS)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Announcement[];
}

export async function createAnnouncement(input: AnnouncementInput): Promise<Announcement> {
  requireValidAnnouncement(input);

  const { data: userData } = await supabase.auth.getUser();
  const payload = {
    ...cleanAnnouncementInput(input),
    archived_at: null,
    created_by: userData.user?.id ?? null,
  };

  const { data, error } = await supabase
    .from('announcements')
    .insert(payload)
    .select(ANNOUNCEMENT_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Announcement;
}

export async function updateAnnouncement(
  id: string,
  input: AnnouncementInput,
): Promise<Announcement> {
  requireValidAnnouncement(input);

  const { data, error } = await supabase
    .from('announcements')
    .update({
      ...cleanAnnouncementInput(input),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(ANNOUNCEMENT_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Announcement;
}

export async function setAnnouncementPublished(
  id: string,
  isPublished: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('announcements')
    .update({
      is_published: isPublished,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function archiveAnnouncement(id: string): Promise<void> {
  const { error } = await supabase
    .from('announcements')
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function restoreAnnouncement(id: string): Promise<void> {
  const { error } = await supabase
    .from('announcements')
    .update({
      archived_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase.from('announcements').delete().eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}
