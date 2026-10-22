import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { DogAvatar } from '../../components/domain/DogAvatar';
import { ExpandablePhoto } from '../../components/ui/ExpandablePhoto';
import { CompetitionPodium } from '../../components/domain/CompetitionPodium';
import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { ucapsaBrand } from '../../constants/brand';
import { DEFAULT_DOG_AVATAR_COLOR, DEFAULT_DOG_AVATAR_KEY } from '../../constants/dogAvatar';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { devWarn } from '../../lib/client-diagnostics';
import { getPrivateDogPhotoUrls } from '../../services/dog-photos.service';
import { getMyDogs } from '../../services/dogs.service';
import {
  getCachedRequiredCompetitionExams,
  refreshRequiredCompetitionExams,
  type RequiredCompetitionExam,
} from '../../services/client-competition-required-exams.service';
import {
  getCachedCompetitionLeaderboard,
  getCachedMyCompetitionAccount,
  refreshMyCompetitionAccount,
  refreshCompetitionLeaderboard,
  type ClientAccountCompetitionSnapshot,
  type ClientCompetitionLeaderboardRow,
} from '../../services/client-competition.service';

function numberLabel(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

function medal(position: number) {
  if (position === 1) return '🥇';
  if (position === 2) return '🥈';
  if (position === 3) return '🥉';
  return null;
}

function podiumTone(position: number) {
  if (position === 1) {
    return { background: ucapsaBrand.colors.goldPale, border: ucapsaBrand.colors.gold, text: ucapsaBrand.colors.goldDark };
  }
  if (position === 2) {
    return { background: ucapsaBrand.colors.graySoft, border: ucapsaBrand.colors.gray, text: ucapsaBrand.colors.grayDark };
  }
  return { background: ucapsaBrand.colors.warningSoft, border: ucapsaBrand.colors.warning, text: ucapsaBrand.colors.warningDark };
}

export default function ClientCompetitionRankingScreen() {
  const params = useLocalSearchParams<{ seasonId?: string | string[] }>();
  const seasonId = Array.isArray(params.seasonId) ? params.seasonId[0] ?? '' : params.seasonId ?? '';

  const { user, role, isAdmin } = useSession();
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  const [rows, setRows] = useState<ClientCompetitionLeaderboardRow[]>([]);
  const [myCompetition, setMyCompetition] = useState<ClientAccountCompetitionSnapshot | null>(null);
  const [scoreUnavailable, setScoreUnavailable] = useState(false);
  const [requiredExams, setRequiredExams] = useState<RequiredCompetitionExam[] | null>(null);
  const [myDogs, setMyDogs] = useState<Array<{ id: string; name: string; avatarKey: string; avatarColor: string; photoUrl: string | null }>>([]);
  const [localReady, setLocalReady] = useState(false);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || isAdmin || !seasonId) {
      setLocalReady(true);
      return;
    }

    setError(null);
    setUsingSavedData(false);
    setScoreUnavailable(false);

    const [cachedRanking, cachedAccount, cachedRequired] = await Promise.all([
      getCachedCompetitionLeaderboard(user.id, seasonId),
      getCachedMyCompetitionAccount(user.id),
      getCachedRequiredCompetitionExams(user.id, seasonId),
    ]);
    setRequiredExams(cachedRequired?.data ?? null);
    if (cachedRanking) {
      setRows(cachedRanking.data);
      setSavedAt(cachedRanking.saved_at);
      setLocalReady(true);
    }
    if (cachedAccount) {
      setMyCompetition(cachedAccount.data);
      setMyDogs(cachedAccount.data.dogs.map((dog) => ({
        id: dog.dog_id,
        name: dog.dog_name,
        avatarKey: DEFAULT_DOG_AVATAR_KEY,
        avatarColor: DEFAULT_DOG_AVATAR_COLOR,
        photoUrl: null,
      })));
    }

    const [rankingResult, dogsResult, accountResult, requiredResult] = await Promise.allSettled([
      refreshCompetitionLeaderboard(user.id, seasonId),
      getMyDogs(),
      refreshMyCompetitionAccount(user.id),
      refreshRequiredCompetitionExams(user.id, seasonId),
    ]);
    if (requiredResult.status === 'fulfilled') setRequiredExams(requiredResult.value.data);

    if (accountResult.status === 'fulfilled') {
      setMyCompetition(accountResult.value.data);
    } else if (!cachedAccount) {
      setScoreUnavailable(true);
    }

    if (dogsResult.status === 'fulfilled') {
      const photoUrls = await getPrivateDogPhotoUrls(
        Object.fromEntries(dogsResult.value.map((dog) => [dog.id, dog.photo_path])),
      ).catch((cause) => {
        devWarn('competition-ranking: could not resolve private dog photo URLs; falling back to preset avatars.', cause);
        return {} as Record<string, string | null>;
      });
      setMyDogs(dogsResult.value.map((dog) => ({
        id: dog.id,
        name: dog.name,
        avatarKey: dog.avatar_key,
        avatarColor: dog.avatar_color,
        photoUrl: photoUrls[dog.id] ?? null,
      })));
    }

    if (rankingResult.status === 'fulfilled') {
      setRows(rankingResult.value.data);
      setSavedAt(rankingResult.value.saved_at);
      setUsingSavedData(accountResult.status === 'rejected' && Boolean(cachedAccount));
      setLocalReady(true);
      return;
    }

    setLocalReady(true);
    if (cachedRanking) {
      setUsingSavedData(true);
      setSavedAt(cachedRanking.saved_at);
    } else {
      const cause = rankingResult.reason;
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el Ranking.');
    }
  }, [isAdmin, seasonId, user]);

  useFocusEffect(useCallback(() => {
    void load();
    return undefined;
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  const myDogIds = new Set(myDogs.map((dog) => dog.id));
  const myRows = myDogs.map((dog) => ({
    dog,
    row: rows.find((row) => row.dog_id === dog.id) ?? null,
    season: myCompetition?.dogs.find((entry) => entry.dog_id === dog.id)
      ?.seasons.find((entry) => entry.season_id === seasonId) ?? null,
  }));
  const seasonName = rows[0]?.season_name
    || myCompetition?.seasons?.find((season) => season.season_id === seasonId)?.season_name
    || myRows.find(({ season }) => season)?.season?.season_name || 'Temporada UCAPSA';
  function missingExamExplanation(dogId: string, season: (typeof myRows)[number]['season']) {
    if (!season) return 'Puntaje no disponible en este dispositivo.';
    const requiredCount = Number(season.required_exams_count ?? 0);
    const missingCount = Number(season.missing_required_exams_count ?? 0);
    if (requiredCount === 0) return 'Sin exámenes obligatorios publicados: ningún examen bloquea el ranking.';
    if (missingCount === 0) return 'Exámenes completos. Actualiza para conocer tu posición.';
    const completedIds = new Set(
      myCompetition?.dogs.find((dog) => dog.dog_id === dogId)
        ?.official_exams.filter((exam) => exam.season_id === seasonId)
        .map((exam) => exam.exam_id) ?? [],
    );
    const missingTitles = requiredExams?.filter((exam) => !completedIds.has(exam.id)).map((exam) => exam.title) ?? [];
    return missingTitles.length
      ? 'Examen obligatorio pendiente: ' + missingTitles.join(', ') + '.'
      : 'Faltan ' + missingCount + ' de ' + requiredCount + ' exámenes obligatorios.';
  }
  const footerDogs = myRows.filter(({ row }) => !row || Number(row.ranking_position ?? 0) > 3);

  return (
    <View style={{ flex: 1, backgroundColor: format.background }}>
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="dog" />

      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>RANKING UCAPSA</Text>
        <Text style={[styles.title, { color: format.cardText }]}>{seasonName}</Text>
        <Text style={[styles.subtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Tu posición y el puntaje oficial de cada perro en esta temporada.</Text>
      </View>

      {usingSavedData ? (
        <OfflineDataNotice
          savedAt={savedAt}
          onRetry={() => void refresh()}
          premium={premium}
          label="Mostrando datos competitivos guardados"
        />
      ) : null}

      {!localReady ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={format.accent} />
          <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Cargando Ranking…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
          <MaterialIcons name="cloud-off" size={24} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
          <Text style={[styles.cardTitle, { color: format.cardText }]}>No pudimos cargar el Ranking</Text>
          <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Conéctate una vez para guardar esta clasificación en el dispositivo.</Text>
        </View>
      ) : null}

      {localReady && !error && scoreUnavailable ? (
        <View style={[styles.noteCard, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}>
          <MaterialIcons name="info-outline" size={19} color={format.accentDark} />
          <Text style={[styles.noteText, { color: format.muted }]}>No fue posible consultar tus puntos acumulados. Actualiza con conexión.</Text>
        </View>
      ) : null}

      {localReady && !error ? (
        rows.length === 0 ? (
          <>
            <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
              <Text style={[styles.cardTitle, { color: format.cardText }]}>Ranking oficial pendiente</Text>
              <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{'No hay posiciones oficiales todavía. El Ranking permanece visible: ' + (requiredExams === null ? 'verifica tus datos al reconectar.' : requiredExams.length > 0 ? 'faltan resultados de exámenes obligatorios.' : 'aún no hay participantes clasificados.')}</Text>
            </View>
            <Text style={[styles.sectionTitle, { color: format.cardText }]}>Podio</Text>
            <View style={styles.podiumRow}>
              {[2, 1, 3].map((position) => (
                <View key={position} style={[styles.podiumCard, position === 1 && styles.podiumChampion, {
                  backgroundColor: format.secondaryButton, borderColor: format.cardBorder,
                }]}>
                  <Text style={styles.medal}>{medal(position)}</Text>
                  <Text style={[styles.podiumName, { color: format.cardText }]}>Por definir</Text>
                  <Text style={[styles.podiumScore, { color: format.muted }]}>Sin clasificados</Text>
                  <View style={[styles.podiumPedestal, { backgroundColor: format.cardBorder }]}>
                    <Text style={styles.podiumPedestalNumber}>{position}</Text>
                  </View>
                </View>
              ))}
            </View>
            <Text style={[styles.sectionTitle, { color: format.cardText }]}>Clasificación</Text>
            <Text style={[styles.muted, { color: format.muted }]}>Sin posiciones oficiales todavía.</Text>
            {myRows.length > 0 ? (
              <View style={styles.myDogsBlock}>
                <Text style={[styles.sectionTitle, { color: format.cardText }]}>Puntos acumulados de tus perros</Text>
                {myRows.map(({ dog, season }) => (
                  <View key={dog.id} style={[styles.myCard, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}>
                    <RankingDogAvatar name={dog.name} photoUrl={dog.photoUrl} avatarKey={dog.avatarKey} avatarColor={dog.avatarColor} size={52} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.myLabel, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>SIN POSICIÓN OFICIAL</Text>
                      <Text style={[styles.cardTitle, { color: format.cardText }]}>
                        {dog.name} · {season ? numberLabel(season.competitive_score) + ' pts' : 'puntaje no disponible'}
                      </Text>
                      <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                        {season
                          ? Number(season.required_exams_count ?? 0) === 0
                            ? 'Sin exámenes obligatorios publicados; ninguno bloquea el ranking.'
                            : missingExamExplanation(dog.id, season)
                          : 'Actualiza para consultar el puntaje de esta temporada.'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.podiumIntro}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: format.cardText }]}>Podio</Text>
                <Text style={[styles.podiumSubtitle, { color: format.muted }]}>Los tres mejores de la temporada</Text>
              </View>
              <MaterialIcons name="emoji-events" size={27} color={ucapsaBrand.colors.goldDark} />
            </View>
            <CompetitionPodium
              rows={rows}
              myDogIds={myDogIds}
              photoUrlForDog={(id) => myDogs.find((dog) => dog.id === id)?.photoUrl ?? null}
            />

            <Text style={[styles.sectionTitle, { color: format.cardText }]}>Clasificación</Text>
            <View style={styles.list}>
              {rows.map((row) => {
                const mine = Boolean(row.dog_id && myDogIds.has(row.dog_id));
                const position = Number(row.ranking_position ?? 0);
                return (
                  <View
                    key={row.dog_id ?? String(row.ranking_position)}
                    style={[
                      styles.rankRow,
                      { backgroundColor: mine ? format.secondaryButton : format.cardBackground, borderColor: mine ? format.accent : format.cardBorder },
                    ]}
                  >
                    <View
                      style={[
                        styles.rankBox,
                        {
                          backgroundColor: position <= 3 ? podiumTone(position).background : format.pillBackground,
                          borderColor: position <= 3 ? podiumTone(position).border : format.cardBorder,
                        },
                      ]}
                    >
                      <Text style={[styles.rankText, { color: position <= 3 ? podiumTone(position).text : format.pillText }]}>
                        {position <= 3 ? medal(position) : position}
                      </Text>
                    </View>
                    <RankingDogAvatar
                      name={row.dog_name ?? 'perro'}
                      photoUrl={mine && row.dog_id ? myDogs.find((dog) => dog.id === row.dog_id)?.photoUrl ?? null : null}
                      avatarKey={row.dog_avatar_key}
                      avatarColor={row.dog_avatar_color}
                      size={38}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.titleLine}>
                        <Text numberOfLines={1} style={[styles.dogName, { color: format.cardText }]}>{row.dog_name || 'Perro'}</Text>
                        {mine ? <Text style={[styles.minePill, { color: premium ? ucapsaBrand.colors.premiumActionText : format.accentDark }]}>Tuyo</Text> : null}
                      </View>
                      <Text style={[styles.rangeText, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{row.range_name || 'Cobre'}</Text>
                      <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{Number(row.command_attendances_count ?? 0)} Comandos · {numberLabel(row.exam_points)} pts Exámenes</Text>
                    </View>
                    <View style={styles.scoreBlock}>
                      <Text style={[styles.scoreValue, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>{numberLabel(row.competitive_score)}</Text>
                      <Text style={[styles.scoreLabel, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>PTS</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {myRows.length > 0 ? (
              <View style={styles.myDogsBlock}>
                <Text style={[styles.sectionTitle, { color: format.cardText }]}>Tus perros</Text>
                {myRows.map(({ dog, row, season }) => (
                  <View key={dog.id} style={[styles.myCard, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}>
                    <RankingDogAvatar
                      name={dog.name}
                      photoUrl={dog.photoUrl}
                      avatarKey={dog.avatarKey}
                      avatarColor={dog.avatarColor}
                      size={52}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.myLabel, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>
                        {row ? `TU PERRO · #${Number(row.ranking_position ?? 0)}` : 'TU PERRO'}
                      </Text>
                      <Text style={[styles.cardTitle, { color: format.cardText }]}>
                        {dog.name + ' · ' + (row ? numberLabel(row.competitive_score) + ' pts' : season ? numberLabel(season.competitive_score) + ' pts acumulados' : 'puntaje no disponible')}
                      </Text>
                      <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                        {row ? (row.range_name || 'Cobre') + ' · ' + Number(row.command_attendances_count ?? 0) + ' Comandos' : missingExamExplanation(dog.id, season)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={[styles.noteCard, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}>
                <MaterialIcons name="info-outline" size={19} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                <Text style={[styles.noteText, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>No pudimos identificar tus perros en esta vista. Actualiza cuando tengas conexión.</Text>
              </View>
            )}

            <View style={[styles.noteCard, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}>
              <MaterialIcons name="rule" size={19} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
              <Text style={[styles.noteText, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Si hay empate, se comparan puntos, asistencias de Comandos y exámenes.</Text>
            </View>
          </>
        )
      ) : null}
    </KeyboardAwareScreen>
    {localReady && footerDogs.length > 0 ? (
      <View style={[styles.pinnedFooter, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
        <Text style={[styles.myLabel, { color: format.accentDark }]}>TU POSICIÓN</Text>
        {footerDogs.slice(0, 2).map(({ dog, row, season }) => (
          <View key={dog.id} style={styles.footerRow}>
            <RankingDogAvatar name={dog.name} photoUrl={dog.photoUrl} avatarKey={dog.avatarKey} avatarColor={dog.avatarColor} size={30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[styles.dogName, { color: format.cardText }]}>
                {dog.name} · {row ? '#' + Number(row.ranking_position) : 'SIN POSICIÓN OFICIAL'}
              </Text>
              <Text numberOfLines={2} style={[styles.footerReason, { color: format.muted }]}>
                {row ? 'Ya cumplió los requisitos de exámenes' : missingExamExplanation(dog.id, season)}
              </Text>
            </View>
            <Text style={[styles.footerPoints, { color: format.accentDark }]}>
              {numberLabel(row?.competitive_score ?? season?.competitive_score)} pts
            </Text>
          </View>
        ))}
        {footerDogs.length > 2 ? <Text style={[styles.footerReason, { color: format.muted }]}>
          Y {footerDogs.length - 2} perros más en la lista.
        </Text> : null}
      </View>
    ) : null}
    </View>
  );
}

function RankingDogAvatar({
  name,
  photoUrl,
  avatarKey,
  avatarColor,
  size,
}: {
  name: string;
  photoUrl: string | null;
  avatarKey: string | null | undefined;
  avatarColor: string | null | undefined;
  size: number;
}) {
  if (photoUrl) {
    return (
      <ExpandablePhoto uri={photoUrl} name={name}>
        <Image
          source={{ uri: photoUrl }}
          style={{ width: size, height: size, borderRadius: Math.round(size * 0.34) }}
          resizeMode="cover"
          accessibilityLabel={`Foto de ${name}`}
        />
      </ExpandablePhoto>
    );
  }
  return (
    <DogAvatar
      avatarKey={avatarKey}
      avatarColor={avatarColor}
      size={size}
      accessibilityLabel={`Avatar de ${name}`}
    />
  );
}

const styles = StyleSheet.create({
  header: { gap: 3, marginBottom: 14 },
  eyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 0.8 },
  title: { fontSize: 27, lineHeight: 33, fontWeight: '900' },
  subtitle: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 13 },
  muted: { fontSize: 10, lineHeight: 15, fontWeight: '700' },
  card: { gap: 7, borderRadius: 19, borderWidth: 1, padding: 14, marginBottom: 11 },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900' },
  myDogsBlock: { gap: 8, marginBottom: 13 },
  myCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, padding: 12 },
  myLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  sectionTitle: { fontSize: 18, lineHeight: 23, fontWeight: '900', marginBottom: 8 },
  podiumIntro: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5 },
  podiumSubtitle: { fontSize: 10, fontWeight: '700', marginTop: -3, marginBottom: 12 },
  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, marginBottom: 17 },
  podiumCard: { flex: 1, minWidth: 0, minHeight: 174, alignItems: 'center', justifyContent: 'flex-end', borderRadius: 18, borderWidth: 2, paddingTop: 9, paddingHorizontal: 5, paddingBottom: 0, overflow: 'hidden' },
  podiumChampion: { minHeight: 217, borderWidth: 3, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  podiumPlacement: { fontSize: 8, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center', marginBottom: 4 },
  medal: { fontSize: 22, marginBottom: 5 },
  medalChampion: { fontSize: 31 },
  podiumPosition: { fontSize: 11, fontWeight: '900', marginTop: 4 },
  podiumName: { width: '100%', textAlign: 'center', fontSize: 11, fontWeight: '900', paddingHorizontal: 2, marginTop: 3 },
  podiumScore: { fontSize: 11, fontWeight: '900', marginTop: 4, marginBottom: 7 },
  podiumMine: { fontSize: 8, fontWeight: '900', letterSpacing: 0.7, marginBottom: 6 },
  podiumPedestal: { alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center', minHeight: 22, marginTop: 4 },
  podiumPedestalChampion: { minHeight: 42 },
  podiumPedestalSecond: { minHeight: 29 },
  podiumPedestalThird: { minHeight: 22 },
  podiumPedestalNumber: { fontSize: 17, color: ucapsaBrand.colors.surface, fontWeight: '900' },
  list: { gap: 8 },
  rankRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 17, borderWidth: 1, padding: 10 },
  rankBox: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 13, fontWeight: '900' },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dogName: { flexShrink: 1, fontSize: 12, fontWeight: '900' },
  minePill: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  rangeText: { fontSize: 10, fontWeight: '900', marginTop: 2 },
  scoreBlock: { minWidth: 62, alignItems: 'flex-end', justifyContent: 'center' },
  scoreValue: { fontSize: 17, lineHeight: 20, fontWeight: '900' },
  scoreLabel: { marginTop: 1, fontSize: 8, lineHeight: 10, fontWeight: '900', letterSpacing: 0.8 },
  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, borderWidth: 1, padding: 11, marginTop: 12, marginBottom: 12 },
  noteText: { flex: 1, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  pinnedFooter: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, gap: 6, elevation: 12 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 3 },
  footerReason: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  footerPoints: { fontSize: 15, fontWeight: '900' },
});
