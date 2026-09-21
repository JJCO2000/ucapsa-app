import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AdminCustomerContextHeader, adminCustomerDisplayName } from '../../components/domain/AdminCustomerContextHeader';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { isProgramCompletionAchievementCode } from '../../constants/programCompletion';
import {
  awardAchievementToUser,
  getAchievementsForDog,
  getAchievementsForUser,
  grantTrainingAchievementToDog,
  type AchievementWithState,
} from '../../services/achievements.service';
import { getDogsForUser, type BasicDog } from '../../services/dogs.service';
import { getProfileByUserId } from '../../services/profiles.service';
import type { Profile } from '../../types/app.types';

export default function AdminCustomerAchievementsScreen() {
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = typeof params.userId === 'string' ? params.userId.trim() : '';

  const [profile, setProfile] = useState<Profile | null>(null);
  const [globalItems, setGlobalItems] = useState<AchievementWithState[]>([]);
  const [trainingItems, setTrainingItems] = useState<AchievementWithState[]>([]);
  const [dogs, setDogs] = useState<BasicDog[]>([]);
  const [selectedDogId, setSelectedDogId] = useState('');
  const [loading, setLoading] = useState(Boolean(userId));
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [nextProfile, achievements, nextDogs] = await Promise.all([
        getProfileByUserId(userId),
        getAchievementsForUser(userId),
        getDogsForUser(userId),
      ]);

      const resolvedDogId = nextDogs.some((dog) => dog.id === selectedDogId)
        ? selectedDogId
        : nextDogs[0]?.id ?? '';
      const nextTrainingItems = resolvedDogId
        ? await getAchievementsForDog(userId, resolvedDogId)
        : [];

      setProfile(nextProfile);
      setDogs(nextDogs);
      setSelectedDogId(resolvedDogId);
      setTrainingItems(nextTrainingItems);
      setGlobalItems(
        achievements.filter((item) => !isProgramCompletionAchievementCode(item.definition.code)),
      );
    } catch (cause) {
      Alert.alert(
        'No se pudieron cargar los logros',
        cause instanceof Error ? cause.message : 'Intenta de nuevo.',
      );
    } finally {
      setLoading(false);
    }
  }, [selectedDogId, userId]);

  useFocusEffect(useCallback(() => {
    void load();
    return undefined;
  }, [load]));

  if (!userId) {
    return (
      <KeyboardAwareScreen>
        <View style={styles.center}>
          <Text style={styles.title}>Cliente no disponible</Text>
          <Pressable style={styles.primary} onPress={() => router.replace('/admin-clients' as never)}>
            <Text style={styles.primaryText}>Ir a Clientes</Text>
          </Pressable>
        </View>
      </KeyboardAwareScreen>
    );
  }

  const selectedDog = dogs.find((dog) => dog.id === selectedDogId) ?? null;

  function grantTraining(item: AchievementWithState) {
    if (item.unlocked || !profile || !selectedDog) return;
    if (!isProgramCompletionAchievementCode(item.definition.code)) return;

    Alert.alert(
      'Otorgar logro de entrenamiento',
      `Se otorgará ${item.definition.title} a ${selectedDog.name}, perro de ${adminCustomerDisplayName(profile)}. El otorgamiento quedará como evidencia histórica y no se elimina desde la app.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Otorgar logro',
          onPress: async () => {
            try {
              setSavingCode(item.definition.code);
              await grantTrainingAchievementToDog(selectedDog.id, item.definition.code);
              await load();
              Alert.alert('Logro actualizado', 'El logro formal quedó asociado al perro seleccionado.');
            } catch (cause) {
              Alert.alert(
                'No se pudo actualizar el logro',
                cause instanceof Error ? cause.message : 'Intenta de nuevo.',
              );
            } finally {
              setSavingCode(null);
            }
          },
        },
      ],
    );
  }

  function grantGlobal(item: AchievementWithState) {
    if (item.unlocked || !profile) return;

    Alert.alert(
      'Marcar logro completado',
      `Se otorgará ${item.definition.title} a ${adminCustomerDisplayName(profile)}. El otorgamiento quedará en su historial.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Otorgar logro',
          onPress: async () => {
            try {
              setSavingCode(item.definition.code);
              await awardAchievementToUser(userId, item.definition.code);
              await load();
              Alert.alert('Logro actualizado', 'El logro fue marcado como completado.');
            } catch (cause) {
              Alert.alert(
                'No se pudo actualizar el logro',
                cause instanceof Error ? cause.message : 'Intenta de nuevo.',
              );
            } finally {
              setSavingCode(null);
            }
          },
        },
      ],
    );
  }

  function renderAchievementRow(
    item: AchievementWithState,
    onPress: (item: AchievementWithState) => void,
  ) {
    const saving = savingCode === item.definition.code;
    return (
      <Pressable
        key={item.definition.code}
        disabled={item.unlocked || Boolean(savingCode)}
        style={[styles.row, item.unlocked && styles.rowUnlocked]}
        onPress={() => onPress(item)}
      >
        <View style={[styles.iconBox, item.unlocked && styles.iconBoxUnlocked]}>
          <MaterialCommunityIcons
            name={item.definition.icon as never}
            size={24}
            color={item.unlocked ? ucapsaBrand.colors.premiumActionText : ucapsaBrand.colors.muted}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, item.unlocked && styles.rowTitleUnlocked]}>
            {item.definition.title}
          </Text>
          <Text style={styles.rowMeta}>
            {saving ? 'Guardando...' : item.unlocked ? 'Completado' : 'Toca para marcar completado'}
          </Text>
        </View>
        <MaterialCommunityIcons
          name={item.unlocked ? 'check-circle' : 'chevron-right'}
          size={22}
          color={item.unlocked ? ucapsaBrand.colors.warningDark : ucapsaBrand.colors.redDark}
        />
      </Pressable>
    );
  }

  const hasAnyAchievements = trainingItems.length > 0 || globalItems.length > 0;

  return (
    <KeyboardAwareScreen>
      <AdminCustomerContextHeader
        customerName={adminCustomerDisplayName(profile)}
        section="Logros"
        subtitle="Reconocimientos del cliente seleccionado."
        onBack={() => router.back()}
      />

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Cargando logros...</Text>
        </View>
      ) : null}

      {!loading && !hasAnyAchievements ? (
        <View style={styles.empty}>
          <Text style={styles.title}>Sin logros configurados</Text>
          <Text style={styles.muted}>No hay definiciones disponibles para este cliente.</Text>
        </View>
      ) : null}

      {!loading && dogs.length > 0 && trainingItems.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Logros de entrenamiento</Text>
            <Text style={styles.muted}>Puppy y Comandos se otorgan al perro concreto, no a la cuenta en general.</Text>
          </View>

          <View style={styles.dogSelector}>
            {dogs.map((dog) => {
              const selected = dog.id === selectedDogId;
              return (
                <Pressable
                  key={dog.id}
                  disabled={Boolean(savingCode)}
                  style={[styles.dogButton, selected && styles.dogButtonSelected]}
                  onPress={() => setSelectedDogId(dog.id)}
                >
                  <Text style={[styles.dogButtonText, selected && styles.dogButtonTextSelected]}>
                    {dog.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.list}>
            {trainingItems.map((item) => renderAchievementRow(item, grantTraining))}
          </View>
        </View>
      ) : null}

      {!loading && dogs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.title}>Sin perro activo</Text>
          <Text style={styles.muted}>
            Los logros formales de Puppy y Comandos requieren un perro registrado para conservar la historia correctamente.
          </Text>
        </View>
      ) : null}

      {!loading && globalItems.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Otros logros</Text>
            <Text style={styles.muted}>Reconocimientos que pertenecen a la cuenta y no a un perro específico.</Text>
          </View>
          <View style={styles.list}>
            {globalItems.map((item) => renderAchievementRow(item, grantGlobal))}
          </View>
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 14 },
  empty: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 18, gap: 5 },
  section: { gap: 10 },
  sectionHeading: { gap: 3 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  title: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  primary: { borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 16, paddingVertical: 12 },
  primaryText: { color: ucapsaBrand.colors.surface, fontWeight: '900' },
  dogSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dogButton: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, paddingVertical: 9 },
  dogButtonSelected: { borderColor: ucapsaBrand.colors.red, backgroundColor: ucapsaBrand.colors.redSoft },
  dogButtonText: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '900' },
  dogButtonTextSelected: { color: ucapsaBrand.colors.redDark },
  list: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  rowUnlocked: { backgroundColor: ucapsaBrand.colors.goldPale },
  iconBox: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.background },
  iconBoxUnlocked: { backgroundColor: ucapsaBrand.colors.goldPale },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  rowTitleUnlocked: { color: ucapsaBrand.colors.premiumActionText },
  rowMeta: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '700', marginTop: 3 },
});
