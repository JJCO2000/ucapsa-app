import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../constants/brand';
import {
  cacheRestaurantMenu,
  getCachedRestaurantMenu,
  getRestaurantMenu,
  type RestaurantMenuSection,
} from '../services/restaurant-menu.service';

function money(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value);
}

export default function RestaurantScreen() {
  const [sections, setSections] = useState<RestaurantMenuSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [usingCache, setUsingCache] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    setUsingCache(false);

    const cached = await getCachedRestaurantMenu();
    if (cached) {
      setSections(cached);
      setLoading(false);
    }

    try {
      const next = await getRestaurantMenu();
      setSections(next);
      await cacheRestaurantMenu(next);
    } catch (cause) {
      if (cached) {
        setUsingCache(true);
      } else {
        setError(cause instanceof Error ? cause.message : 'No se pudo cargar el menú.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(false); } finally { setRefreshing(false); }
  }

  const visibleSections = sections.filter((section) => section.category.is_active && section.items.length > 0);

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.headerRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Regresar" onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={ucapsaBrand.colors.redDark} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Restaurante UCAPSA</Text>
          <Text style={styles.title}>Menú</Text>
          <Text style={styles.subtitle}>Precios y disponibilidad publicados por UCAPSA.</Text>
        </View>
      </View>

      {usingCache ? (
        <View style={styles.cacheNotice}>
          <MaterialIcons name="cloud-off" size={20} color={ucapsaBrand.colors.warningDark} />
          <Text style={styles.cacheText}>Sin conexión al menú actual. Mostramos la última versión guardada.</Text>
        </View>
      ) : null}

      {loading && sections.length === 0 ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando menú...</Text></View> : null}

      {error && sections.length === 0 ? (
        <View style={styles.errorCard}>
          <MaterialIcons name="restaurant-menu" size={30} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.emptyTitle}>El menú aún no está disponible</Text>
          <Text style={styles.muted}>Cuando UCAPSA publique el menú aparecerá aquí. Desliza hacia abajo para reintentar.</Text>
        </View>
      ) : null}

      {!loading && !error && visibleSections.length === 0 ? (
        <View style={styles.errorCard}>
          <MaterialIcons name="menu-book" size={30} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.emptyTitle}>Menú en preparación</Text>
          <Text style={styles.muted}>Aún no hay productos publicados.</Text>
        </View>
      ) : null}

      {visibleSections.map((section) => (
        <View key={section.category.id} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.category.name}</Text>
          <View style={styles.card}>
            {section.items.map((item, index) => (
              <View key={item.id} style={[styles.itemRow, index === section.items.length - 1 && styles.itemRowLast]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  {item.description ? <Text style={styles.itemDescription}>{item.description}</Text> : null}
                </View>
                <Text style={styles.price}>{money(item.price)}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
  backButton: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: ucapsaBrand.colors.text, fontSize: 30, lineHeight: 36, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 2 },
  cacheNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.warningBorder, backgroundColor: ucapsaBrand.colors.warningSoft, padding: 12, marginBottom: 14 },
  cacheText: { flex: 1, color: ucapsaBrand.colors.warningDark, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  errorCard: { alignItems: 'center', gap: 9, borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 24 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  section: { marginBottom: 18 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 20, lineHeight: 25, fontWeight: '900', marginBottom: 8 },
  card: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, paddingHorizontal: 15, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.border },
  itemRowLast: { borderBottomWidth: 0 },
  itemName: { color: ucapsaBrand.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  itemDescription: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
  price: { color: ucapsaBrand.colors.redDark, fontSize: 15, lineHeight: 20, fontWeight: '900' },
});
