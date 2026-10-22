import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';
import type { ClientCompetitionLeaderboardRow } from '../../services/client-competition.service';
import { DogAvatar } from './DogAvatar';

type Props = {
  rows: ClientCompetitionLeaderboardRow[];
  myDogIds?: ReadonlySet<string>;
  photoUrlForDog?: (dogId: string) => string | null;
  compact?: boolean;
};

const PLACES = [2, 1, 3] as const;

function podiumTone(place: number) {
  if (place === 1) {
    return { edge: ucapsaBrand.colors.goldDark, fill: ucapsaBrand.colors.goldPale, step: ucapsaBrand.colors.gold, label: 'PRIMERO' };
  }
  if (place === 2) {
    return { edge: ucapsaBrand.colors.grayDark, fill: ucapsaBrand.colors.graySoft, step: ucapsaBrand.colors.gray, label: 'SEGUNDO' };
  }
  return { edge: ucapsaBrand.colors.warningDark, fill: ucapsaBrand.colors.warningSoft, step: ucapsaBrand.colors.warning, label: 'TERCERO' };
}

function scoreLabel(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '0';
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/**
 * Un solo podio para Servicios/Competencia y Ranking.
 * Las posiciones y los puntos llegan exclusivamente del leaderboard oficial.
 * Nunca resuelve fotos de otros usuarios ni modifica el resultado.
 */
export function CompetitionPodium({ rows, myDogIds, photoUrlForDog, compact = false }: Props) {
  const official = new Map<number, ClientCompetitionLeaderboardRow>();
  for (const row of rows) {
    const position = Number(row.ranking_position ?? 0);
    if ((position === 1 || position === 2 || position === 3) && !official.has(position)) {
      official.set(position, row);
    }
  }
  return (
    <View style={styles.row} accessibilityLabel="Podio de los tres primeros lugares">
      {PLACES.map((place) => {
        const row = official.get(place);
        const tone = podiumTone(place);
        const dogId = row?.dog_id ?? null;
        const mine = Boolean(dogId && myDogIds?.has(dogId));
        const photoUrl = mine && dogId ? photoUrlForDog?.(dogId) : null;
        const name = row?.dog_name || 'Sin clasificar';
        const size = compact ? (place === 1 ? 49 : 40) : (place === 1 ? 59 : 46);
        return (
          <View key={place} style={[styles.column, { minHeight: compact ? 165 : 209 }]}>
            <Text style={[styles.placeLabel, { color: tone.edge }]}>{tone.label}</Text>
            <View style={[styles.avatarShell, { backgroundColor: tone.fill, borderColor: tone.edge }]}>
              {row ? (photoUrl ? (
                <Image source={{ uri: photoUrl }} resizeMode="cover"
                  style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
                  accessibilityLabel={'Foto de ' + name} />
              ) : (
                <DogAvatar avatarKey={row.dog_avatar_key} avatarColor={row.dog_avatar_color}
                  size={size} accessibilityLabel={'Avatar de ' + name} />
              )) : (
                <MaterialIcons name="pets" size={26} color={tone.edge} />
              )}
            </View>
            <Text numberOfLines={1} style={[styles.name, { color: ucapsaBrand.colors.text }]}>{name}</Text>
            <Text style={[styles.score, { color: tone.edge }]}>{row ? scoreLabel(row.competitive_score) + ' pts' : '—'}</Text>
            <View style={[styles.pedestal, {
              backgroundColor: tone.step,
              height: compact ? (place === 1 ? 71 : place === 2 ? 51 : 36)
                : (place === 1 ? 89 : place === 2 ? 65 : 47),
            }]}>
              <MaterialIcons name={place === 1 ? 'emoji-events' : 'military-tech'} size={compact ? 17 : 20}
                color={place === 1 ? ucapsaBrand.colors.goldDark : ucapsaBrand.colors.surface} />
              <Text style={[styles.pedestalNumber, { color: place === 1 ? ucapsaBrand.colors.goldDark : ucapsaBrand.colors.surface }]}>
                {place}
              </Text>
              {mine ? <Text style={[styles.mine, { color: place === 1 ? ucapsaBrand.colors.goldDark : ucapsaBrand.colors.surface }]}>TU PERRO</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, marginTop: 9, marginBottom: 6 },
  column: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'flex-end' },
  placeLabel: { fontSize: 9, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  avatarShell: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, padding: 4, borderRadius: 18 },
  name: { fontSize: 11, fontWeight: '900', marginTop: 7, maxWidth: '100%', textAlign: 'center' },
  score: { fontSize: 10, fontWeight: '900', marginTop: 2, marginBottom: 8 },
  pedestal: { alignSelf: 'stretch', borderTopLeftRadius: 12, borderTopRightRadius: 12,
    alignItems: 'center', justifyContent: 'center', gap: 1 },
  pedestalNumber: { fontSize: 20, fontWeight: '900', lineHeight: 22 },
  mine: { fontSize: 8, fontWeight: '900' },
});
