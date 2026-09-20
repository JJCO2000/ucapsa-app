import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';

import {
  getAdminCompetitionSeasons,
  type CompetitionSeason,
} from './admin-competition-seasons.service';

export type CompetitionAwardDefinition = Database['public']['Tables']['ucapsa_award_definitions']['Row'];
export type DogAward = Database['public']['Tables']['dog_awards']['Row'];
export type CompetitionAwardDog = Pick<
  Database['public']['Tables']['dogs']['Row'],
  'id' | 'name' | 'user_id' | 'is_active'
>;

export type AdminCompetitionAwardRow = DogAward & {
  dogName: string;
  ownerName: string | null;
  awardTitle: string;
  awardDescription: string | null;
  seasonName: string | null;
};

export type AdminCompetitionAwardWorkspace = {
  definitions: CompetitionAwardDefinition[];
  seasons: CompetitionSeason[];
  dogs: Array<CompetitionAwardDog & { ownerName: string | null }>;
  awards: AdminCompetitionAwardRow[];
};

export async function getAdminCompetitionAwardWorkspace(): Promise<AdminCompetitionAwardWorkspace> {
  const [definitionsResult, seasons, dogsResult, awardsResult] = await Promise.all([
    supabase
      .from('ucapsa_award_definitions')
      .select('*')
      .order('title', { ascending: true }),
    getAdminCompetitionSeasons(),
    supabase
      .from('dogs')
      .select('id,name,user_id,is_active')
      .order('name', { ascending: true })
      .limit(1000),
    supabase
      .from('dog_awards')
      .select('*')
      .order('awarded_at', { ascending: false })
      .limit(1000),
  ]);

  if (definitionsResult.error) throw definitionsResult.error;
  if (dogsResult.error) throw dogsResult.error;
  if (awardsResult.error) throw awardsResult.error;

  const definitions = definitionsResult.data ?? [];
  const dogs = dogsResult.data ?? [];
  const awards = awardsResult.data ?? [];
  const ownerIds = [...new Set(dogs.map((dog) => dog.user_id).filter(Boolean))];

  let profiles: Array<Pick<Database['public']['Tables']['profiles']['Row'], 'user_id' | 'full_name' | 'email'>> = [];
  if (ownerIds.length > 0) {
    const profilesResult = await supabase
      .from('profiles')
      .select('user_id,full_name,email')
      .in('user_id', ownerIds);
    if (profilesResult.error) throw profilesResult.error;
    profiles = profilesResult.data ?? [];
  }

  const definitionByCode = new Map(definitions.map((definition) => [definition.code, definition]));
  const seasonById = new Map(seasons.map((season) => [season.id, season]));
  const dogById = new Map(dogs.map((dog) => [dog.id, dog]));
  const profileByUserId = new Map(profiles.map((profile) => [profile.user_id, profile]));

  const enrichedDogs = dogs.map((dog) => {
    const profile = profileByUserId.get(dog.user_id);
    return {
      ...dog,
      ownerName: profile?.full_name?.trim() || profile?.email?.trim() || null,
    };
  });

  const enrichedAwards = awards.map<AdminCompetitionAwardRow>((award) => {
    const dog = dogById.get(award.dog_id);
    const profile = dog ? profileByUserId.get(dog.user_id) : null;
    const definition = definitionByCode.get(award.award_code);
    const season = award.season_id ? seasonById.get(award.season_id) : null;
    return {
      ...award,
      dogName: dog?.name ?? 'Perro no disponible',
      ownerName: profile?.full_name?.trim() || profile?.email?.trim() || null,
      awardTitle: definition?.title ?? award.award_code,
      awardDescription: definition?.description ?? null,
      seasonName: season?.name ?? null,
    };
  });

  return {
    definitions,
    seasons: seasons.filter((season) => season.status !== 'draft'),
    dogs: enrichedDogs,
    awards: enrichedAwards,
  };
}

export function awardRequiresSeason(awardCode: string) {
  return awardCode === 'dog_of_year';
}

export async function grantCompetitionDogAward(input: {
  dogId: string;
  awardCode: string;
  seasonId?: string | null;
  note?: string | null;
}) {
  const dogId = input.dogId.trim();
  const awardCode = input.awardCode.trim();
  const seasonId = input.seasonId?.trim() || undefined;
  if (!dogId || !awardCode) throw new Error('Selecciona un perro y un premio.');
  if (awardRequiresSeason(awardCode) && !seasonId) {
    throw new Error('Perro del Año requiere una temporada.');
  }

  const { data, error } = await supabase.rpc('admin_grant_ucapsa_dog_award', {
    p_dog_id: dogId,
    p_award_code: awardCode,
    p_season_id: seasonId,
    p_note: input.note?.trim() || undefined,
  });
  if (error) throw error;
  return data;
}

export async function revokeCompetitionDogAward(input: {
  awardId: string;
  note?: string | null;
}) {
  const awardId = input.awardId.trim();
  if (!awardId) throw new Error('Falta el premio a revocar.');

  const { data, error } = await supabase.rpc('admin_revoke_ucapsa_dog_award', {
    p_award_id: awardId,
    p_note: input.note?.trim() || undefined,
  });
  if (error) throw error;
  return data;
}
