import { supabase } from '../lib/supabase';

export type ClientAccountCompetitionSeason = {
  season_id: string;
  season_code: string;
  season_name: string;
  season_status: string;
  season_starts_at: string;
  season_ends_at: string;
};

/**
 * El catálogo de temporadas es independiente de perros, intentos y puntos.
 * Las reglas RLS sólo exponen temporadas no borrador a clientes.
 */
export async function getPublishedCompetitionSeasons(): Promise<ClientAccountCompetitionSeason[]> {
  const { data, error } = await supabase
    .from('ucapsa_competition_seasons')
    .select('id,code,name,status,starts_at,ends_at')
    .neq('status', 'draft')
    .order('starts_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((season) => ({
    season_id: season.id,
    season_code: season.code,
    season_name: season.name,
    season_status: season.status,
    season_starts_at: season.starts_at,
    season_ends_at: season.ends_at,
  }));
}
