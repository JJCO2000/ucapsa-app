import {
  getAccountCompetitionSeasons,
  getCachedCompetitionLeaderboard,
  getCachedMyCompetitionAccount,
  refreshCompetitionLeaderboard,
  refreshMyCompetitionAccount,
} from './client-competition.service';

export type ClientCompetitionHomeDog = {
  dogId: string;
  dogName: string;
  rankingPosition: number | null;
};

export type ClientCompetitionHomeSummary = {
  seasonId: string;
  seasonName: string;
  dogs: ClientCompetitionHomeDog[];
};

function selectCurrentSeason(snapshot: Awaited<ReturnType<typeof refreshMyCompetitionAccount>>['data']) {
  const seasons = getAccountCompetitionSeasons(snapshot);
  return seasons.find((season) => season.season_status === 'active')
    ?? seasons.find((season) => season.season_status === 'reopened')
    ?? null;
}

function buildSummary(
  snapshot: Awaited<ReturnType<typeof refreshMyCompetitionAccount>>['data'],
  seasonId: string,
  seasonName: string,
  leaderboard: Awaited<ReturnType<typeof refreshCompetitionLeaderboard>>['data'],
): ClientCompetitionHomeSummary {
  const positionByDogId = new Map(
    leaderboard
      .filter((row) => row.dog_id)
      .map((row) => [row.dog_id as string, Number(row.ranking_position ?? 0) || null]),
  );

  return {
    seasonId,
    seasonName,
    dogs: snapshot.dogs.map((dog) => ({
      dogId: dog.dog_id,
      dogName: dog.dog_name,
      rankingPosition: positionByDogId.get(dog.dog_id) ?? null,
    })),
  };
}

export async function getCachedCompetitionHomeSummary(
  userId: string,
): Promise<ClientCompetitionHomeSummary | null> {
  const account = await getCachedMyCompetitionAccount(userId);
  if (!account) return null;

  const season = selectCurrentSeason(account.data);
  if (!season?.season_id) return null;

  const leaderboard = await getCachedCompetitionLeaderboard(userId, season.season_id);
  return buildSummary(
    account.data,
    season.season_id,
    season.season_name || 'Temporada UCAPSA',
    leaderboard?.data ?? [],
  );
}

export async function refreshCompetitionHomeSummary(
  userId: string,
): Promise<ClientCompetitionHomeSummary | null> {
  const account = await refreshMyCompetitionAccount(userId);
  const season = selectCurrentSeason(account.data);
  if (!season?.season_id) return null;

  try {
    const leaderboard = await refreshCompetitionLeaderboard(userId, season.season_id);
    return buildSummary(
      account.data,
      season.season_id,
      season.season_name || 'Temporada UCAPSA',
      leaderboard.data,
    );
  } catch {
    const cachedLeaderboard = await getCachedCompetitionLeaderboard(userId, season.season_id);
    return buildSummary(
      account.data,
      season.season_id,
      season.season_name || 'Temporada UCAPSA',
      cachedLeaderboard?.data ?? [],
    );
  }
}
