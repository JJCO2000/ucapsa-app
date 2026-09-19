import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AdminCustomerContextHeader, adminCustomerDisplayName } from '../../components/domain/AdminCustomerContextHeader';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  awardAchievementToUser,
  getAchievementsForUser,
  type AchievementWithState,
} from '../../services/achievements.service';
import { getProfileByUserId } from '../../services/profiles.service';
import type { Profile } from '../../types/app.types';

export default function AdminCustomerAchievementsScreen() {
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = typeof params.userId === 'string' ? params.userId.trim() : '';

  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<AchievementWithState[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [nextProfile, achievements] = await Promise.all([
        getProfileByUserId(userId),
        getAchievementsForUser(userId),
      ]);
      setProfile(nextProfile);
      setItems(achievements);
    } catch (cause) {
      Alert.alert('No se pudieron cargar los logros', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

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

  function award(item: AchievementWithState) {
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
              setItems(await getAchievementsForUser(userId));
              Alert.alert('Logro actualizado', 'El logro fue marcado como completado.');
            } catch (cause) {
              Alert.alert('No se pudo actualizar el logro', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
            } finally {
              setSavingCode(null);
            }
          },
        },
      ],
    );
  }

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

      {!loading && items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.title}>Sin logros configurados</Text>
          <Text style={styles.muted}>No hay definiciones disponibles para este cliente.</Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {items.map((item) => {
          const saving = savingCode === item.definition.code;
          return (
            <Pressable
              key={item.definition.code}
              disabled={item.unlocked || Boolean(savingCode)}
              style={[styles.row, item.unlocked && styles.rowUnlocked]}
              onPress={() => award(item)}
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
        })}
      </View>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 14 },
  empty: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 18, gap: 5 },
  title: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  primary: { borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 16, paddingVertical: 12 },
  primaryText: { color: ucapsaBrand.colors.surface, fontWeight: '900' },
  list: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  rowUnlocked: { backgroundColor: ucapsaBrand.colors.goldPale },
  iconBox: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.background },
  iconBoxUnlocked: { backgroundColor: ucapsaBrand.colors.goldPale },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  rowTitleUnlocked: { color: ucapsaBrand.colors.premiumActionText },
  rowMeta: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '700', marginTop: 3 },
});
