import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { updateMyProfile } from '../../services/profiles.service';
import { getMyProgramEnrollments, getProgramCodeLabel, getProgramLevelLabel } from '../../services/programs.service';
import type { ProgramEnrollmentWithDetails } from '../../types/app.types';

export default function DogTab() {
  const { user, profile, isAdmin, refreshProfile } = useSession();
  const [rows, setRows] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [dogName, setDogName] = useState(profile?.dog_name ?? '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    setDogName(profile?.dog_name ?? '');
    try { setRows(await getMyProgramEnrollments()); } finally { setLoading(false); }
  }, [isAdmin, profile?.dog_name, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));
  const active = useMemo(() => rows.filter((item) => item.enrollment.status === 'active'), [rows]);

  async function refresh() {
    setRefreshing(true);
    try { await refreshProfile(); await load(); } finally { setRefreshing(false); }
  }

  async function saveName() {
    const next = dogName.trim();
    if (!next) {
      Alert.alert('Falta el nombre', 'Escribe el nombre de tu perro.');
      return;
    }
    setSaving(true);
    try {
      await updateMyProfile({ dog_name: next });
      await refreshProfile();
      setEditing(false);
    } catch (err) {
      Alert.alert('No se pudo guardar', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.hero}>
        <View style={styles.petIcon}><MaterialIcons name="pets" size={34} color={ucapsaBrand.colors.redDark} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Mi perro</Text>
          <Text style={styles.title}>{profile?.dog_name || 'Sin nombre'}</Text>
          <Text style={styles.subtitle}>Perfil basico y clases relacionadas.</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Datos basicos</Text>
          {!editing ? <Pressable onPress={() => setEditing(true)}><Text style={styles.link}>Editar</Text></Pressable> : null}
        </View>
        {!editing ? (
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Nombre</Text><Text style={styles.infoValue}>{profile?.dog_name || 'Pendiente'}</Text></View>
        ) : (
          <>
            <Text style={styles.label}>Nombre de tu perro</Text>
            <TextInput value={dogName} onChangeText={setDogName} placeholder="Nombre" style={styles.input} />
            <View style={styles.actions}>
              <Pressable style={styles.secondaryButton} onPress={() => { setDogName(profile?.dog_name ?? ''); setEditing(false); }}><Text style={styles.secondaryButtonText}>Cancelar</Text></Pressable>
              <Pressable style={styles.primaryButton} disabled={saving} onPress={() => void saveName()}><Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar'}</Text></Pressable>
            </View>
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Clases</Text>
        {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando...</Text></View> : null}
        {!loading && active.length === 0 ? <Text style={styles.muted}>No hay clases activas relacionadas con tu cuenta.</Text> : null}
        {active.map((item) => (
          <Pressable key={item.enrollment.id} style={styles.classRow} onPress={() => router.push(`/client/class-detail?enrollmentId=${encodeURIComponent(item.enrollment.id)}` as never)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.classTitle}>{getProgramCodeLabel(item.program.code)}</Text>
              <Text style={styles.muted}>{getProgramLevelLabel(item.enrollment.program_level)} - {item.enrollment.dog_name || profile?.dog_name || 'Sin nombre'}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.redDark} />
          </Pressable>
        ))}
      </View>

      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>Perfil simple por ahora</Text>
        <Text style={styles.muted}>Vacunas, documentos y perfiles avanzados siguen desactivados. Aqui solo mostramos datos que ya forman parte de tu cuenta.</Text>
      </View>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 16 },
  petIcon: { width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '700', marginTop: 2 },
  card: { gap: 10, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 16, marginBottom: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  link: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: '#F4E5E8', paddingTop: 10 },
  infoLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '900' },
  infoValue: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  input: { borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', paddingHorizontal: 13, paddingVertical: 11, color: ucapsaBrand.colors.text, fontSize: 15 },
  actions: { flexDirection: 'row', gap: 9 },
  primaryButton: { flex: 1, alignItems: 'center', borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingVertical: 11 },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  secondaryButton: { flex: 1, alignItems: 'center', borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, paddingVertical: 11 },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  loading: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#F4E5E8', paddingTop: 11 },
  classTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  noteCard: { gap: 5, borderRadius: 18, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', padding: 15 },
  noteTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
});
