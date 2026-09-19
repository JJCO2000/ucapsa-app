import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';

import {
  getAdminCompetitionSeason,
  getAdminCompetitionSeasons,
  type CompetitionLeaderboardRow,
  type CompetitionRange,
  type CompetitionSeason,
} from './admin-competition-core.service';

export type CompetitionConstancyEvent = Database['public']['Views']['ucapsa_constancy_events']['Row'];

export type AdminCompetitionConstancyDog = CompetitionRange & {
  ownerName: string | null;
};

export type AdminCompetitionConstancyOverview = {
  seasons: CompetitionSeason[];
  selectedSeason: CompetitionSeason | null;
  dogs: AdminCompetitionConstancyDog[];
};

export type AdminCompetitionConstancyDetail = {
  season: CompetitionSeason;
  dog: AdminCompetitionConstancyDog;
  events: CompetitionConstancyEvent[];
};

function readableCompetitionSeasons(seasons: CompetitionSeason[]) {
  return seasons.filter((season) => season.status !== 'draft');
}

function resolveReadableSeason(seasons: CompetitionSeason[], requestedSeasonId?: string | null) {
  const readable = readableCompetitionSeasons(seasons);
  const requested = requestedSeasonId?.trim();

  if (requested) {
    const match = readable.find((season) => season.id === requested);
    if (match) return { readable, selected: match };
  }

  return {
    readable,
    selected: readable.find((season) => season.status === 'active')
      ?? readable.find((season) => season.status === 'reopened')
      ?? readable[0]
      ?? null,
  };
}

async function enrichCompetitionRangesWithOwners(
  rows: CompetitionRange[],
): Promise<AdminCompetitionConstancyDog[]> {
  const ownerIds = [...new Set(
    rows
      .map((row) => row.owner_user_id)
      .filter((value): value is string => Boolean(value)),
  )];

  let profiles: Array<Pick<Database['public']['Tables']['profiles']['Row'], 'user_id' | 'full_name' | 'email'>> = [];

  if (ownerIds.length > 0) {
    const profilesResult = await supabase
      .from('profiles')
      .select('user_id,full_name,email')
      .in('user_id', ownerIds);

    if (profilesResult.error) throw profilesResult.error;
    profiles = profilesResult.data ?? [];
  }

  const profileByUserId = new Map(profiles.map((profile) => [profile.user_id, profile]));

  return rows.map((row) => {
    const profile = row.owner_user_id ? profileByUserId.get(row.owner_user_id) : null;
    return {
      ...row,
      ownerName: profile?.full_name?.trim() || profile?.email?.trim() || null,
    };
  });
}

export async function getAdminCompetitionConstancyOverview(
  requestedSeasonId?: string | null,
): Promise<AdminCompetitionConstancyOverview> {
  const allSeasons = await getAdminCompetitionSeasons();
  const { readable, selected } = resolveReadableSeason(allSeasons, requestedSeasonId);

  if (!selected) {
    return {
      seasons: readable,
      selectedSeason: null,
      dogs: [],
    };
  }

  const { data, error } = await supabase
    .from('ucapsa_competition_ranges')
    .select('*')
    .eq('season_id', selected.id)
    .order('dog_name', { ascending: true });

  if (error) throw error;

  return {
    seasons: readable,
    selectedSeason: selected,
    dogs: await enrichCompetitionRangesWithOwners(data ?? []),
  };
}

export async function getAdminCompetitionConstancyDetail(input: {
  seasonId: string;
  dogId: string;
}): Promise<AdminCompetitionConstancyDetail> {
  const seasonId = input.seasonId.trim();
  const dogId = input.dogId.trim();
  if (!seasonId || !dogId) throw new Error('Falta el perro o la temporada.');

  const [season, inputResult, eventsResult] = await Promise.all([
    getAdminCompetitionSeason(seasonId),
    supabase
      .from('ucapsa_competition_ranges')
      .select('*')
      .eq('season_id', seasonId)
      .eq('dog_id', dogId)
      .single(),
    supabase
      .from('ucapsa_constancy_events')
      .select('*')
      .eq('season_id', seasonId)
      .eq('dog_id', dogId)
      .order('event_date', { ascending: false })
      .order('source_id', { ascending: false }),
  ]);

  if (season.status === 'draft') {
    throw new Error('La constancia no se consulta sobre temporadas en borrador.');
  }
  if (inputResult.error) throw inputResult.error;
  if (eventsResult.error) throw eventsResult.error;

  const [dog] = await enrichCompetitionRangesWithOwners([inputResult.data]);

  return {
    season,
    dog,
    events: eventsResult.data ?? [],
  };
}


export type AdminCompetitionRankingOverview = {
  seasons: CompetitionSeason[];
  selectedSeason: CompetitionSeason | null;
  rows: CompetitionLeaderboardRow[];
};

export async function getAdminCompetitionRankingOverview(
  requestedSeasonId?: string | null,
): Promise<AdminCompetitionRankingOverview> {
  const allSeasons = await getAdminCompetitionSeasons();
  const { readable, selected } = resolveReadableSeason(allSeasons, requestedSeasonId);

  if (!selected) {
    return {
      seasons: readable,
      selectedSeason: null,
      rows: [],
    };
  }

  const { data, error } = await supabase
    .from('ucapsa_competition_leaderboard')
    .select('*')
    .eq('season_id', selected.id)
    .order('ranking_position', { ascending: true });

  if (error) throw error;

  return {
    seasons: readable,
    selectedSeason: selected,
    rows: data ?? [],
  };
}
