import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';

export type CompetitionSeason = Database['public']['Tables']['ucapsa_competition_seasons']['Row'];

export type CompetitionHubSummary = {
  activeSeason: CompetitionSeason | null;
  dogsInSeason: number;
  dogsWithActivity: number;
  eligibleDogs: number;
  publishedExams: number;
};

function ensureDateInput(value: string) {
  const clean = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    throw new Error('Usa fechas con formato AAAA-MM-DD.');
  }
  return clean;
}

export function formatSeasonDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function seasonStartInput(season: CompetitionSeason) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(season.starts_at));
}

export function seasonEndInput(season: CompetitionSeason) {
  const lastIncludedMoment = new Date(new Date(season.ends_at).getTime() - 1);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(lastIncludedMoment);
}

export async function getAdminCompetitionHubSummary(): Promise<CompetitionHubSummary> {
  const { data: activeSeason, error: seasonError } = await supabase
    .from('ucapsa_competition_seasons')
    .select('*')
    .eq('status', 'active')
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (seasonError) throw seasonError;

  if (!activeSeason) {
    return {
      activeSeason: null,
      dogsInSeason: 0,
      dogsWithActivity: 0,
      eligibleDogs: 0,
      publishedExams: 0,
    };
  }

  const [inputsResult, examsResult] = await Promise.all([
    supabase
      .from('ucapsa_competition_inputs')
      .select('dog_id,is_ranking_eligible,has_competition_activity')
      .eq('season_id', activeSeason.id),
    supabase
      .from('ucapsa_exams')
      .select('id,status')
      .eq('season_id', activeSeason.id),
  ]);

  if (inputsResult.error) throw inputsResult.error;
  if (examsResult.error) throw examsResult.error;

  const inputs = inputsResult.data ?? [];
  return {
    activeSeason,
    dogsInSeason: inputs.length,
    dogsWithActivity: inputs.filter((row) => row.has_competition_activity).length,
    eligibleDogs: inputs.filter((row) => row.is_ranking_eligible).length,
    publishedExams: (examsResult.data ?? []).filter((row) => row.status === 'published').length,
  };
}

export async function getAdminCompetitionSeasons(): Promise<CompetitionSeason[]> {
  const { data, error } = await supabase
    .from('ucapsa_competition_seasons')
    .select('*')
    .order('starts_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getAdminCompetitionSeason(seasonId: string): Promise<CompetitionSeason> {
  const cleanId = seasonId.trim();
  if (!cleanId) throw new Error('Falta la temporada.');

  const { data, error } = await supabase
    .from('ucapsa_competition_seasons')
    .select('*')
    .eq('id', cleanId)
    .single();

  if (error) throw error;
  return data;
}

export async function createCompetitionSeason(input: {
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
}) {
  const code = input.code.trim();
  const name = input.name.trim();
  const startsOn = ensureDateInput(input.startsOn);
  const endsOn = ensureDateInput(input.endsOn);
  if (!code || !name) throw new Error('Código y nombre son obligatorios.');
  if (endsOn < startsOn) throw new Error('La fecha final no puede ser anterior a la inicial.');

  const { data, error } = await supabase.rpc('admin_create_ucapsa_competition_season', {
    p_code: code,
    p_name: name,
    p_starts_on: startsOn,
    p_ends_on: endsOn,
  });
  if (error) throw error;
  return data;
}

export async function updateCompetitionSeason(input: {
  seasonId: string;
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
}) {
  const code = input.code.trim();
  const name = input.name.trim();
  const startsOn = ensureDateInput(input.startsOn);
  const endsOn = ensureDateInput(input.endsOn);
  if (!input.seasonId.trim() || !code || !name) throw new Error('Completa la temporada.');
  if (endsOn < startsOn) throw new Error('La fecha final no puede ser anterior a la inicial.');

  const { data, error } = await supabase.rpc('admin_update_ucapsa_competition_season', {
    p_season_id: input.seasonId.trim(),
    p_code: code,
    p_name: name,
    p_starts_on: startsOn,
    p_ends_on: endsOn,
  });
  if (error) throw error;
  return data;
}

export async function activateCompetitionSeason(seasonId: string) {
  const { data, error } = await supabase.rpc('admin_activate_ucapsa_competition_season', {
    p_season_id: seasonId,
  });
  if (error) throw error;
  return data;
}

export async function closeCompetitionSeason(seasonId: string) {
  const { data, error } = await supabase.rpc('admin_close_ucapsa_competition_season', {
    p_season_id: seasonId,
  });
  if (error) throw error;
  return data;
}

export async function reopenCompetitionSeason(seasonId: string) {
  const { data, error } = await supabase.rpc('admin_reopen_ucapsa_competition_season', {
    p_season_id: seasonId,
  });
  if (error) throw error;
  return data;
}

export type CompetitionInput = Database['public']['Views']['ucapsa_competition_inputs']['Row'];
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

