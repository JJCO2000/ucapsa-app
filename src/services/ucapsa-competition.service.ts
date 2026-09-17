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

export type CompetitionExam = Database['public']['Tables']['ucapsa_exams']['Row'];
export type CompetitionExamItem = Database['public']['Tables']['ucapsa_exam_items']['Row'];

export type AdminCompetitionExamRow = CompetitionExam & {
  seasonName: string;
  itemCount: number;
  maxPoints: number;
};

export type AdminCompetitionExamWorkspace = {
  seasons: CompetitionSeason[];
  exams: AdminCompetitionExamRow[];
};

export type AdminCompetitionExamDetail = {
  exam: CompetitionExam;
  season: CompetitionSeason | null;
  items: CompetitionExamItem[];
  structureLocked: boolean;
};

export async function getAdminCompetitionExamWorkspace(): Promise<AdminCompetitionExamWorkspace> {
  const [seasons, examsResult, itemsResult] = await Promise.all([
    getAdminCompetitionSeasons(),
    supabase
      .from('ucapsa_exams')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true }),
    supabase
      .from('ucapsa_exam_items')
      .select('id,exam_id,max_points'),
  ]);

  if (examsResult.error) throw examsResult.error;
  if (itemsResult.error) throw itemsResult.error;

  const seasonById = new Map(seasons.map((season) => [season.id, season]));
  const itemStats = (itemsResult.data ?? []).reduce<Record<string, { count: number; maxPoints: number }>>((acc, item) => {
    const current = acc[item.exam_id] ?? { count: 0, maxPoints: 0 };
    current.count += 1;
    current.maxPoints += Number(item.max_points ?? 0);
    acc[item.exam_id] = current;
    return acc;
  }, {});

  return {
    seasons,
    exams: (examsResult.data ?? []).map((exam) => ({
      ...exam,
      seasonName: seasonById.get(exam.season_id)?.name ?? 'Temporada no disponible',
      itemCount: itemStats[exam.id]?.count ?? 0,
      maxPoints: itemStats[exam.id]?.maxPoints ?? 0,
    })),
  };
}

export async function getAdminCompetitionExamDetail(examId: string): Promise<AdminCompetitionExamDetail> {
  const cleanId = examId.trim();
  if (!cleanId) throw new Error('Falta el examen.');

  const examResult = await supabase
    .from('ucapsa_exams')
    .select('*')
    .eq('id', cleanId)
    .single();
  if (examResult.error) throw examResult.error;

  const exam = examResult.data;
  const [seasons, itemsResult, lockedAttemptResult] = await Promise.all([
    getAdminCompetitionSeasons(),
    supabase
      .from('ucapsa_exam_items')
      .select('*')
      .eq('exam_id', cleanId)
      .order('sort_order', { ascending: true })
      .order('item_number', { ascending: true }),
    supabase
      .from('ucapsa_exam_attempts')
      .select('id')
      .eq('exam_id', cleanId)
      .in('status', ['reviewed', 'published'])
      .limit(1),
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (lockedAttemptResult.error) throw lockedAttemptResult.error;

  return {
    exam,
    season: seasons.find((season) => season.id === exam.season_id) ?? null,
    items: itemsResult.data ?? [],
    structureLocked: (lockedAttemptResult.data?.length ?? 0) > 0,
  };
}

export async function createCompetitionExam(input: {
  seasonId: string;
  code: string;
  title: string;
  description?: string | null;
  examDate?: string | null;
  isRequiredForRanking: boolean;
  sortOrder?: number;
}) {
  const seasonId = input.seasonId.trim();
  const code = input.code.trim();
  const title = input.title.trim();
  if (!seasonId || !code || !title) throw new Error('Temporada, código y título son obligatorios.');

  const args: Database['public']['Functions']['admin_create_ucapsa_exam']['Args'] = {
    p_season_id: seasonId,
    p_code: code,
    p_title: title,
    p_description: input.description?.trim() || undefined,
    p_is_required_for_ranking: input.isRequiredForRanking,
    p_sort_order: Number.isFinite(input.sortOrder) ? Math.round(input.sortOrder ?? 0) : 0,
  };
  const examDate = input.examDate?.trim();
  if (examDate) args.p_exam_date = examDate;

  const { data, error } = await supabase.rpc('admin_create_ucapsa_exam', args);
  if (error) throw error;
  return data;
}

export async function updateCompetitionExam(input: {
  examId: string;
  code: string;
  title: string;
  description?: string | null;
  examDate?: string | null;
  isRequiredForRanking: boolean;
  sortOrder: number;
}) {
  const examId = input.examId.trim();
  const code = input.code.trim();
  const title = input.title.trim();
  if (!examId || !code || !title) throw new Error('Examen, código y título son obligatorios.');

  const { data, error } = await supabase.rpc('admin_update_ucapsa_exam', {
    p_exam_id: examId,
    p_code: code,
    p_title: title,
    p_description: input.description?.trim() || '',
    // PostgreSQL acepta NULL aquí; los tipos generados de argumentos RPC no expresan nullabilidad.
    p_exam_date: (input.examDate?.trim() || null) as never,
    p_is_required_for_ranking: input.isRequiredForRanking,
    p_sort_order: Number.isFinite(input.sortOrder) ? Math.round(input.sortOrder) : 0,
  });
  if (error) throw error;
  return data;
}

export async function publishCompetitionExam(examId: string) {
  const cleanId = examId.trim();
  if (!cleanId) throw new Error('Falta el examen.');
  const { data, error } = await supabase.rpc('admin_publish_ucapsa_exam', { p_exam_id: cleanId });
  if (error) throw error;
  return data;
}

export async function addCompetitionExamItem(input: {
  examId: string;
  title: string;
  description?: string | null;
  maxPoints: number;
  itemNumber?: number | null;
  sortOrder?: number | null;
}) {
  const examId = input.examId.trim();
  const title = input.title.trim();
  if (!examId || !title) throw new Error('Examen y título del ejercicio son obligatorios.');
  if (!Number.isFinite(input.maxPoints) || input.maxPoints <= 0) throw new Error('El puntaje máximo debe ser mayor que cero.');

  const args: Database['public']['Functions']['admin_add_ucapsa_exam_item']['Args'] = {
    p_exam_id: examId,
    p_title: title,
    p_max_points: input.maxPoints,
    p_description: input.description?.trim() || undefined,
  };
  if (input.itemNumber != null && Number.isFinite(input.itemNumber)) args.p_item_number = Math.round(input.itemNumber);
  if (input.sortOrder != null && Number.isFinite(input.sortOrder)) args.p_sort_order = Math.round(input.sortOrder);

  const { data, error } = await supabase.rpc('admin_add_ucapsa_exam_item', args);
  if (error) throw error;
  return data;
}

export async function updateCompetitionExamItem(input: {
  examItemId: string;
  itemNumber: number;
  title: string;
  description?: string | null;
  maxPoints: number;
  sortOrder: number;
}) {
  const examItemId = input.examItemId.trim();
  const title = input.title.trim();
  if (!examItemId || !title) throw new Error('Ejercicio y título son obligatorios.');
  if (!Number.isFinite(input.itemNumber) || input.itemNumber <= 0) throw new Error('El número de ejercicio debe ser mayor que cero.');
  if (!Number.isFinite(input.maxPoints) || input.maxPoints <= 0) throw new Error('El puntaje máximo debe ser mayor que cero.');

  const { data, error } = await supabase.rpc('admin_update_ucapsa_exam_item', {
    p_exam_item_id: examItemId,
    p_item_number: Math.round(input.itemNumber),
    p_title: title,
    p_description: input.description?.trim() || '',
    p_max_points: input.maxPoints,
    p_sort_order: Number.isFinite(input.sortOrder) ? Math.round(input.sortOrder) : Math.round(input.itemNumber),
  });
  if (error) throw error;
  return data;
}

export async function deleteCompetitionExamItem(examItemId: string) {
  const cleanId = examItemId.trim();
  if (!cleanId) throw new Error('Falta el ejercicio.');
  const { data, error } = await supabase.rpc('admin_delete_ucapsa_exam_item', { p_exam_item_id: cleanId });
  if (error) throw error;
  return data;
}

export type CompetitionExamAttempt = Database['public']['Tables']['ucapsa_exam_attempts']['Row'];
export type CompetitionExamItemResult = Database['public']['Tables']['ucapsa_exam_item_results']['Row'];
export type CompetitionExamAttemptSummary = Database['public']['Views']['ucapsa_exam_attempt_summary']['Row'];

export type CompetitionExamDog = Pick<
  Database['public']['Tables']['dogs']['Row'],
  'id' | 'name' | 'user_id' | 'is_active'
> & {
  ownerName: string | null;
};

export type AdminCompetitionExamAttemptRow = {
  attempt: CompetitionExamAttempt;
  summary: CompetitionExamAttemptSummary;
  dogName: string;
  ownerName: string | null;
};

export type AdminCompetitionExamAttemptsWorkspace = {
  exam: CompetitionExam;
  season: CompetitionSeason | null;
  dogs: CompetitionExamDog[];
  attempts: AdminCompetitionExamAttemptRow[];
};

export type AdminCompetitionExamAttemptDetail = {
  attempt: CompetitionExamAttempt;
  exam: CompetitionExam;
  season: CompetitionSeason | null;
  dog: CompetitionExamDog;
  items: CompetitionExamItem[];
  results: CompetitionExamItemResult[];
  totalPointsAwarded: number;
  maxPoints: number;
  isComplete: boolean;
};

async function getCompetitionExamDogsWithOwners(): Promise<CompetitionExamDog[]> {
  const dogsResult = await supabase
    .from('dogs')
    .select('id,name,user_id,is_active')
    .order('name', { ascending: true })
    .limit(1000);
  if (dogsResult.error) throw dogsResult.error;

  const dogs = dogsResult.data ?? [];
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

  const profileByUserId = new Map(profiles.map((profile) => [profile.user_id, profile]));
  return dogs.map((dog) => {
    const profile = profileByUserId.get(dog.user_id);
    return {
      ...dog,
      ownerName: profile?.full_name?.trim() || profile?.email?.trim() || null,
    };
  });
}

export async function getAdminCompetitionExamAttemptsWorkspace(
  examId: string,
): Promise<AdminCompetitionExamAttemptsWorkspace> {
  const cleanExamId = examId.trim();
  if (!cleanExamId) throw new Error('Falta el examen.');

  const [examResult, seasons, dogs, attemptsResult, rawAttemptsResult] = await Promise.all([
    supabase.from('ucapsa_exams').select('*').eq('id', cleanExamId).single(),
    getAdminCompetitionSeasons(),
    getCompetitionExamDogsWithOwners(),
    supabase
      .from('ucapsa_exam_attempt_summary')
      .select('*')
      .eq('exam_id', cleanExamId)
      .order('presented_at', { ascending: false }),
    supabase
      .from('ucapsa_exam_attempts')
      .select('*')
      .eq('exam_id', cleanExamId)
      .order('presented_at', { ascending: false }),
  ]);

  if (examResult.error) throw examResult.error;
  if (attemptsResult.error) throw attemptsResult.error;
  if (rawAttemptsResult.error) throw rawAttemptsResult.error;

  const dogById = new Map(dogs.map((dog) => [dog.id, dog]));
  const rawAttemptById = new Map((rawAttemptsResult.data ?? []).map((attempt) => [attempt.id, attempt]));
  const attempts = (attemptsResult.data ?? []).flatMap<AdminCompetitionExamAttemptRow>((summary) => {
    if (!summary.attempt_id) return [];
    const attempt = rawAttemptById.get(summary.attempt_id);
    if (!attempt) return [];
    const dog = summary.dog_id ? dogById.get(summary.dog_id) : null;
    return [{
      attempt,
      summary,
      dogName: dog?.name ?? 'Perro no disponible',
      ownerName: dog?.ownerName ?? null,
    }];
  });

  return {
    exam: examResult.data,
    season: seasons.find((season) => season.id === examResult.data.season_id) ?? null,
    dogs,
    attempts,
  };
}

export async function getAdminCompetitionExamAttemptDetail(
  attemptId: string,
): Promise<AdminCompetitionExamAttemptDetail> {
  const cleanAttemptId = attemptId.trim();
  if (!cleanAttemptId) throw new Error('Falta el intento.');

  const attemptResult = await supabase
    .from('ucapsa_exam_attempts')
    .select('*')
    .eq('id', cleanAttemptId)
    .single();
  if (attemptResult.error) throw attemptResult.error;

  const attempt = attemptResult.data;
  const [examResult, itemsResult, resultsResult, dogResult, seasons] = await Promise.all([
    supabase.from('ucapsa_exams').select('*').eq('id', attempt.exam_id).single(),
    supabase
      .from('ucapsa_exam_items')
      .select('*')
      .eq('exam_id', attempt.exam_id)
      .order('sort_order', { ascending: true })
      .order('item_number', { ascending: true }),
    supabase
      .from('ucapsa_exam_item_results')
      .select('*')
      .eq('attempt_id', cleanAttemptId),
    supabase
      .from('dogs')
      .select('id,name,user_id,is_active')
      .eq('id', attempt.dog_id)
      .single(),
    getAdminCompetitionSeasons(),
  ]);

  if (examResult.error) throw examResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (resultsResult.error) throw resultsResult.error;
  if (dogResult.error) throw dogResult.error;

  const profileResult = await supabase
    .from('profiles')
    .select('user_id,full_name,email')
    .eq('user_id', dogResult.data.user_id)
    .maybeSingle();
  if (profileResult.error) throw profileResult.error;

  const dog: CompetitionExamDog = {
    ...dogResult.data,
    ownerName: profileResult.data?.full_name?.trim() || profileResult.data?.email?.trim() || null,
  };
  const items = itemsResult.data ?? [];
  const results = resultsResult.data ?? [];
  const itemIds = new Set(items.map((item) => item.id));
  const validResults = results.filter((result) => itemIds.has(result.exam_item_id));
  const totalPointsAwarded = validResults.reduce((sum, result) => sum + Number(result.points_awarded ?? 0), 0);
  const maxPoints = items.reduce((sum, item) => sum + Number(item.max_points ?? 0), 0);

  return {
    attempt,
    exam: examResult.data,
    season: seasons.find((season) => season.id === examResult.data.season_id) ?? null,
    dog,
    items,
    results: validResults,
    totalPointsAwarded,
    maxPoints,
    isComplete: items.length > 0 && validResults.length === items.length,
  };
}

export async function createCompetitionExamAttempt(input: {
  examId: string;
  dogId: string;
  presentedAt?: string | null;
}) {
  const examId = input.examId.trim();
  const dogId = input.dogId.trim();
  if (!examId || !dogId) throw new Error('Selecciona examen y perro.');

  const args: Database['public']['Functions']['admin_create_ucapsa_exam_attempt']['Args'] = {
    p_exam_id: examId,
    p_dog_id: dogId,
  };
  const presentedAt = input.presentedAt?.trim();
  if (presentedAt) args.p_presented_at = presentedAt;

  const { data, error } = await supabase.rpc('admin_create_ucapsa_exam_attempt', args);
  if (error) throw error;
  return data;
}

export async function saveCompetitionExamItemResult(input: {
  attemptId: string;
  examItemId: string;
  pointsAwarded: number;
  evaluatorNote?: string | null;
}) {
  const attemptId = input.attemptId.trim();
  const examItemId = input.examItemId.trim();
  if (!attemptId || !examItemId) throw new Error('Falta el intento o el ejercicio.');
  if (!Number.isFinite(input.pointsAwarded) || input.pointsAwarded < 0) {
    throw new Error('La puntuación debe ser cero o mayor.');
  }

  const { data, error } = await supabase.rpc('admin_upsert_ucapsa_exam_item_result', {
    p_attempt_id: attemptId,
    p_exam_item_id: examItemId,
    p_points_awarded: input.pointsAwarded,
    p_evaluator_note: input.evaluatorNote?.trim() || undefined,
  });
  if (error) throw error;
  return data;
}

export async function deleteCompetitionExamItemResult(input: {
  attemptId: string;
  examItemId: string;
}) {
  const attemptId = input.attemptId.trim();
  const examItemId = input.examItemId.trim();
  if (!attemptId || !examItemId) throw new Error('Falta el intento o el ejercicio.');

  const { data, error } = await supabase.rpc('admin_delete_ucapsa_exam_item_result', {
    p_attempt_id: attemptId,
    p_exam_item_id: examItemId,
  });
  if (error) throw error;
  return data;
}

export async function reviewCompetitionExamAttempt(attemptId: string) {
  const cleanId = attemptId.trim();
  if (!cleanId) throw new Error('Falta el intento.');
  const { data, error } = await supabase.rpc('admin_review_ucapsa_exam_attempt', { p_attempt_id: cleanId });
  if (error) throw error;
  return data;
}

export async function publishCompetitionExamAttempt(input: {
  attemptId: string;
  makeOfficial: boolean;
}) {
  const attemptId = input.attemptId.trim();
  if (!attemptId) throw new Error('Falta el intento.');
  const { data, error } = await supabase.rpc('admin_publish_ucapsa_exam_attempt', {
    p_attempt_id: attemptId,
    p_make_official: input.makeOfficial,
  });
  if (error) throw error;
  return data;
}

export async function setCompetitionExamOfficialAttempt(attemptId: string) {
  const cleanId = attemptId.trim();
  if (!cleanId) throw new Error('Falta el intento.');
  const { data, error } = await supabase.rpc('admin_set_ucapsa_exam_official_attempt', {
    p_attempt_id: cleanId,
  });
  if (error) throw error;
  return data;
}

export async function voidCompetitionExamAttempt(attemptId: string) {
  const cleanId = attemptId.trim();
  if (!cleanId) throw new Error('Falta el intento.');
  const { data, error } = await supabase.rpc('admin_void_ucapsa_exam_attempt', {
    p_attempt_id: cleanId,
  });
  if (error) throw error;
  return data;
}

export type CompetitionExamImportBatch = Database['public']['Tables']['ucapsa_import_batches']['Row'];
export type CompetitionExamImportPreviewRow = Database['public']['Views']['ucapsa_exam_import_preview']['Row'];

export type AdminCompetitionExamImportBatchRow = {
  batch: CompetitionExamImportBatch;
  rowsTotal: number;
  rowsValid: number;
  rowsInvalid: number;
  attemptsTotal: number;
  draftAttempts: number;
  reviewedAttempts: number;
  publishedAttempts: number;
  voidedAttempts: number;
  officialAttempts: number;
};

export type AdminCompetitionExamImportWorkspace = {
  exam: CompetitionExam;
  season: CompetitionSeason | null;
  items: CompetitionExamItem[];
  batches: AdminCompetitionExamImportBatchRow[];
};

export type AdminCompetitionExamImportDetail = {
  exam: CompetitionExam;
  season: CompetitionSeason | null;
  items: CompetitionExamItem[];
  batch: CompetitionExamImportBatch;
  preview: CompetitionExamImportPreviewRow[];
  attempts: CompetitionExamAttempt[];
  rowsTotal: number;
  rowsValid: number;
  rowsInvalid: number;
  draftAttempts: number;
  reviewedAttempts: number;
  publishedAttempts: number;
  voidedAttempts: number;
  officialAttempts: number;
};

function importMetadataNumber(batch: CompetitionExamImportBatch, key: string) {
  const metadata = batch.metadata;
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') return 0;
  const value = (metadata as Record<string, unknown>)[key];
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function importAttemptCounts(attempts: CompetitionExamAttempt[]) {
  return {
    attemptsTotal: attempts.length,
    draftAttempts: attempts.filter((attempt) => attempt.status === 'draft').length,
    reviewedAttempts: attempts.filter((attempt) => attempt.status === 'reviewed').length,
    publishedAttempts: attempts.filter((attempt) => attempt.status === 'published').length,
    voidedAttempts: attempts.filter((attempt) => attempt.status === 'voided').length,
    officialAttempts: attempts.filter((attempt) => attempt.is_official).length,
  };
}

export async function getAdminCompetitionExamImportWorkspace(
  examId: string,
): Promise<AdminCompetitionExamImportWorkspace> {
  const cleanExamId = examId.trim();
  if (!cleanExamId) throw new Error('Falta el examen.');

  const [examResult, seasons, itemsResult, batchesResult] = await Promise.all([
    supabase.from('ucapsa_exams').select('*').eq('id', cleanExamId).single(),
    getAdminCompetitionSeasons(),
    supabase
      .from('ucapsa_exam_items')
      .select('*')
      .eq('exam_id', cleanExamId)
      .order('sort_order', { ascending: true })
      .order('item_number', { ascending: true }),
    supabase
      .from('ucapsa_import_batches')
      .select('*')
      .eq('exam_id', cleanExamId)
      .eq('import_type', 'exam_results')
      .order('created_at', { ascending: false }),
  ]);

  if (examResult.error) throw examResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (batchesResult.error) throw batchesResult.error;

  const batches = batchesResult.data ?? [];
  const batchIds = batches.map((batch) => batch.id);
  let attempts: CompetitionExamAttempt[] = [];

  if (batchIds.length > 0) {
    const attemptsResult = await supabase
      .from('ucapsa_exam_attempts')
      .select('*')
      .in('import_batch_id', batchIds);
    if (attemptsResult.error) throw attemptsResult.error;
    attempts = attemptsResult.data ?? [];
  }

  const attemptsByBatch = new Map<string, CompetitionExamAttempt[]>();
  for (const attempt of attempts) {
    if (!attempt.import_batch_id) continue;
    const current = attemptsByBatch.get(attempt.import_batch_id) ?? [];
    current.push(attempt);
    attemptsByBatch.set(attempt.import_batch_id, current);
  }

  return {
    exam: examResult.data,
    season: seasons.find((season) => season.id === examResult.data.season_id) ?? null,
    items: itemsResult.data ?? [],
    batches: batches.map((batch) => {
      const counts = importAttemptCounts(attemptsByBatch.get(batch.id) ?? []);
      return {
        batch,
        rowsTotal: importMetadataNumber(batch, 'rows_total'),
        rowsValid: importMetadataNumber(batch, 'rows_valid'),
        rowsInvalid: importMetadataNumber(batch, 'rows_invalid'),
        ...counts,
      };
    }),
  };
}

export async function getAdminCompetitionExamImportDetail(
  batchId: string,
): Promise<AdminCompetitionExamImportDetail> {
  const cleanBatchId = batchId.trim();
  if (!cleanBatchId) throw new Error('Falta el lote de importación.');

  const batchResult = await supabase
    .from('ucapsa_import_batches')
    .select('*')
    .eq('id', cleanBatchId)
    .eq('import_type', 'exam_results')
    .single();
  if (batchResult.error) throw batchResult.error;

  const batch = batchResult.data;
  if (!batch.exam_id) throw new Error('El lote no tiene examen asociado.');

  const [examResult, seasons, itemsResult, previewResult, attemptsResult] = await Promise.all([
    supabase.from('ucapsa_exams').select('*').eq('id', batch.exam_id).single(),
    getAdminCompetitionSeasons(),
    supabase
      .from('ucapsa_exam_items')
      .select('*')
      .eq('exam_id', batch.exam_id)
      .order('sort_order', { ascending: true })
      .order('item_number', { ascending: true }),
    supabase
      .from('ucapsa_exam_import_preview')
      .select('*')
      .eq('batch_id', cleanBatchId)
      .order('row_number', { ascending: true }),
    supabase
      .from('ucapsa_exam_attempts')
      .select('*')
      .eq('import_batch_id', cleanBatchId)
      .order('created_at', { ascending: true }),
  ]);

  if (examResult.error) throw examResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (previewResult.error) throw previewResult.error;
  if (attemptsResult.error) throw attemptsResult.error;

  const attempts = attemptsResult.data ?? [];
  const counts = importAttemptCounts(attempts);

  return {
    exam: examResult.data,
    season: seasons.find((season) => season.id === batch.season_id) ?? null,
    items: itemsResult.data ?? [],
    batch,
    preview: previewResult.data ?? [],
    attempts,
    rowsTotal: importMetadataNumber(batch, 'rows_total'),
    rowsValid: importMetadataNumber(batch, 'rows_valid'),
    rowsInvalid: importMetadataNumber(batch, 'rows_invalid'),
    draftAttempts: counts.draftAttempts,
    reviewedAttempts: counts.reviewedAttempts,
    publishedAttempts: counts.publishedAttempts,
    voidedAttempts: counts.voidedAttempts,
    officialAttempts: counts.officialAttempts,
  };
}

export async function createCompetitionExamImportBatch(input: {
  examId: string;
  fileName: string;
}) {
  const examId = input.examId.trim();
  const fileName = input.fileName.trim();
  if (!examId) throw new Error('Falta el examen.');

  const { data, error } = await supabase.rpc('admin_create_ucapsa_exam_import_batch', {
    p_exam_id: examId,
    p_file_name: fileName || undefined,
  });
  if (error) throw error;
  return data;
}

export async function validateCompetitionExamImportBatch(input: {
  batchId: string;
  rows: Array<{
    member_number: string;
    dog_name: string;
    scores: Record<string, number | string>;
  }>;
}) {
  const batchId = input.batchId.trim();
  if (!batchId) throw new Error('Falta el lote de importación.');
  if (input.rows.length === 0) throw new Error('El Excel no contiene filas de resultados.');

  const { data, error } = await supabase.rpc('admin_validate_ucapsa_exam_import_batch', {
    p_batch_id: batchId,
    p_rows: input.rows as never,
  });
  if (error) throw error;
  return data;
}

export async function commitCompetitionExamImportBatch(batchId: string) {
  const cleanId = batchId.trim();
  if (!cleanId) throw new Error('Falta el lote de importación.');
  const { data, error } = await supabase.rpc('admin_commit_ucapsa_exam_import_batch', {
    p_batch_id: cleanId,
  });
  if (error) throw error;
  return data;
}

export async function reviewCompetitionExamImportBatch(batchId: string) {
  const cleanId = batchId.trim();
  if (!cleanId) throw new Error('Falta el lote de importación.');
  const { data, error } = await supabase.rpc('admin_review_ucapsa_exam_import_batch', {
    p_batch_id: cleanId,
  });
  if (error) throw error;
  return data;
}

export async function publishCompetitionExamImportBatch(input: {
  batchId: string;
  makeOfficial: boolean;
}) {
  const batchId = input.batchId.trim();
  if (!batchId) throw new Error('Falta el lote de importación.');

  const { data, error } = await supabase.rpc('admin_publish_ucapsa_exam_import_batch', {
    p_batch_id: batchId,
    p_make_official: input.makeOfficial,
  });
  if (error) throw error;
  return data;
}

export async function revertCompetitionExamImportBatch(batchId: string) {
  const cleanId = batchId.trim();
  if (!cleanId) throw new Error('Falta el lote de importación.');
  const { data, error } = await supabase.rpc('admin_revert_ucapsa_exam_import_batch', {
    p_batch_id: cleanId,
  });
  if (error) throw error;
  return data;
}

export type CompetitionConstancyEvent = Database['public']['Views']['ucapsa_constancy_events']['Row'];

export type AdminCompetitionConstancyDog = CompetitionInput & {
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

async function enrichCompetitionInputsWithOwners(
  rows: CompetitionInput[],
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
    .from('ucapsa_competition_inputs')
    .select('*')
    .eq('season_id', selected.id)
    .order('dog_name', { ascending: true });

  if (error) throw error;

  return {
    seasons: readable,
    selectedSeason: selected,
    dogs: await enrichCompetitionInputsWithOwners(data ?? []),
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
      .from('ucapsa_competition_inputs')
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

  const [dog] = await enrichCompetitionInputsWithOwners([inputResult.data]);

  return {
    season,
    dog,
    events: eventsResult.data ?? [],
  };
}

