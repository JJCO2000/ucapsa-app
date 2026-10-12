import { supabase } from '../lib/supabase';
import { readClientResource, writeClientResource, type CachedResource } from './client-read-cache.service';

export type RequiredCompetitionExam = { id: string; title: string; code: string };

function resourceKey(seasonId: string) {
  return 'competition-required-exams:' + seasonId;
}

export async function getCachedRequiredCompetitionExams(
  userId: string, seasonId: string,
): Promise<CachedResource<RequiredCompetitionExam[]> | null> {
  return readClientResource<RequiredCompetitionExam[]>(userId, resourceKey(seasonId));
}

export async function refreshRequiredCompetitionExams(
  userId: string, seasonId: string,
): Promise<CachedResource<RequiredCompetitionExam[]>> {
  if (!userId || !seasonId) throw new Error('Falta usuario o temporada.');
  const { data, error } = await supabase.from('ucapsa_exams')
    .select('id,title,code')
    .eq('season_id', seasonId)
    .eq('status', 'published')
    .eq('is_required_for_ranking', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return writeClientResource(userId, resourceKey(seasonId), data ?? []);
}
