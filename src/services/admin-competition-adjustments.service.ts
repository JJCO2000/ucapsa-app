import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';

import {
  getAdminCompetitionSeason,
  getAdminCompetitionSeasons,
  type CompetitionSeason,
} from './admin-competition-seasons.service';

export type CompetitionInput = Database['public']['Views']['ucapsa_competition_inputs']['Row'];
export type CompetitionScore = Database['public']['Views']['ucapsa_competition_scores']['Row'];
export type CompetitionRange = Database['public']['Views']['ucapsa_competition_ranges']['Row'];
export type CompetitionLeaderboardRow = Database['public']['Views']['ucapsa_competition_leaderboard']['Row'];
export type CompetitionAdjustment = Database['public']['Tables']['ucapsa_competition_adjustments']['Row'];

export type CompetitionAdjustmentOverview = {
  seasons: CompetitionSeason[];
  selectedSeason: CompetitionSeason | null;
  dogs: CompetitionInput[];
};

export type CompetitionAdjustmentDetail = {
  season: CompetitionSeason;
  dog: CompetitionInput | null;
  movements: CompetitionAdjustment[];
};

function mutableCompetitionSeasons(seasons: CompetitionSeason[]) {
  return seasons.filter((season) => season.status === 'active' || season.status === 'reopened');
}

function resolveMutableSeason(seasons: CompetitionSeason[], requestedSeasonId?: string | null) {
  const mutable = mutableCompetitionSeasons(seasons);
  const requested = requestedSeasonId?.trim();
  if (requested) {
    const match = mutable.find((season) => season.id === requested);
    if (match) return { mutable, selected: match };
  }
  return {
    mutable,
    selected: mutable.find((season) => season.status === 'active') ?? mutable[0] ?? null,
  };
}

export async function getAdminCompetitionAdjustmentOverview(
  requestedSeasonId?: string | null,
): Promise<CompetitionAdjustmentOverview> {
  const allSeasons = await getAdminCompetitionSeasons();
  const { mutable, selected } = resolveMutableSeason(allSeasons, requestedSeasonId);

  if (!selected) {
    return { seasons: mutable, selectedSeason: null, dogs: [] };
  }

  const { data, error } = await supabase
    .from('ucapsa_competition_inputs')
    .select('*')
    .eq('season_id', selected.id)
    .order('dog_name', { ascending: true });

  if (error) throw error;

  const dogs = (data ?? []).filter(
    (row): row is CompetitionInput => Boolean(row.dog_id && row.dog_name),
  );

  return {
    seasons: mutable,
    selectedSeason: selected,
    dogs,
  };
}

export async function getAdminCompetitionAdjustmentDetail(
  seasonId: string,
  dogId: string,
): Promise<CompetitionAdjustmentDetail> {
  const cleanSeasonId = seasonId.trim();
  const cleanDogId = dogId.trim();
  if (!cleanSeasonId || !cleanDogId) throw new Error('Falta la temporada o el perro.');

  const [season, dogResult, movementsResult] = await Promise.all([
    getAdminCompetitionSeason(cleanSeasonId),
    supabase
      .from('ucapsa_competition_inputs')
      .select('*')
      .eq('season_id', cleanSeasonId)
      .eq('dog_id', cleanDogId)
      .maybeSingle(),
    supabase
      .from('ucapsa_competition_adjustments')
      .select('*')
      .eq('season_id', cleanSeasonId)
      .eq('dog_id', cleanDogId)
      .order('occurred_at', { ascending: false })
      .limit(500),
  ]);

  if (dogResult.error) throw dogResult.error;
  if (movementsResult.error) throw movementsResult.error;

  return {
    season,
    dog: dogResult.data,
    movements: movementsResult.data ?? [],
  };
}

export async function addCompetitionAdjustment(input: {
  seasonId: string;
  dogId: string;
  points: number;
  note?: string | null;
}) {
  const seasonId = input.seasonId.trim();
  const dogId = input.dogId.trim();
  if (!seasonId || !dogId) throw new Error('Selecciona temporada y perro.');
  if (!Number.isFinite(input.points) || input.points === 0) {
    throw new Error('El ajuste debe ser un número distinto de cero.');
  }

  const { data, error } = await supabase.rpc('admin_add_ucapsa_competition_adjustment', {
    p_season_id: seasonId,
    p_dog_id: dogId,
    p_points: input.points,
    p_note: input.note?.trim() || undefined,
  });
  if (error) throw error;
  return data;
}

export async function reverseCompetitionAdjustment(input: {
  adjustmentId: string;
  note?: string | null;
}) {
  const adjustmentId = input.adjustmentId.trim();
  if (!adjustmentId) throw new Error('Falta el ajuste a revertir.');

  const { data, error } = await supabase.rpc('admin_reverse_ucapsa_competition_adjustment', {
    p_adjustment_id: adjustmentId,
    p_note: input.note?.trim() || undefined,
  });
  if (error) throw error;
  return data;
}
