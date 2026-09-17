import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  createCompetitionSeason,
  getAdminCompetitionSeason,
  seasonEndInput,
  seasonStartInput,
  updateCompetitionSeason,
} from '../../services/ucapsa-competition.service';

export default function AdminCompetitionSeasonFormScreen() {
  const { seasonId } = useLocalSearchParams<{ seasonId?: string }>();
  const { role, loading: sessionLoading } = useSession();
  const resolvedSeasonId = typeof seasonId === 'string' ? seasonId : '';
  const editing = Boolean(resolvedSeasonId);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isSuperAdmin = role === 'super_admin';
  const title = useMemo(() => editing ? 'Editar temporada' : 'Nueva temporada', [editing]);

  const load = useCallback(async () => {
    if (!resolvedSeasonId) {
      setLoading(false);
      return;
    }

    setLoadError(null);
    try {
      const season = await getAdminCompetitionSeason(resolvedSeasonId);
      if (season.status !== 'draft') {
        setLoadError('Sólo una temporada en borrador puede editar su configuración.');
        return;
      }
      setCode(season.code);
      setName(season.name);
      setStartsOn(seasonStartInput(season));
      setEndsOn(seasonEndInput(season));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'No se pudo cargar la temporada.');
    } finally {
      setLoading(false);
    }
  }, [resolvedSeasonId]);

  useFocusEffect(useCallback(() => {
    if (editing) {
      setLoading(true);
      void load();
    }
    return undefined;
  }, [editing, load]));

  if (sessionLoading) return null;
  if (!isSuperAdmin) return <Redirect href="/admin/competition-seasons" />;

  async function save() {
    if (!code.trim() || !name.trim() || !startsOn.trim() || !endsOn.trim()) {
      Alert.alert('Falta información', 'Completa código, nombre, inicio y fin.');
      return;
    }

    setSaving(true);
    try {
      const id = editing
        ? await updateCompetitionSeason({
            seasonId: resolvedSeasonId,
            code,
            name,
            startsOn,
            endsOn,
          })
        : await createCompetitionSeason({
            code,
            name,
            startsOn,
            endsOn,
          });

      router.replace(`/admin/competition-season-detail?seasonId=${id}` as never);
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Revisa las fechas e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Text style={styles.kicker}>Competencia UCAPSA</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>La temporada inicia en borrador. Crear o editarla no activa competencia automáticamente.</Text>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Cargando temporada…</Text>
        </View>
      ) : null}

      {loadError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No se puede editar</Text>
          <Text style={styles.muted}>{loadError}</Text>
        </View>
      ) : null}

      {!loading && !loadError ? (
        <>
          <View style={styles.card}>
            <Field
              label="Código"
              value={code}
              onChangeText={(value) => setCode(value.toUpperCase())}
              placeholder="Ej. 2027"
              autoCapitalize="characters"
            />
            <Field
              label="Nombre"
              value={name}
              onChangeText={setName}
              placeholder="Ej. Temporada UCAPSA 2027"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Periodo</Text>
            <Text style={styles.muted}>Usa formato AAAA-MM-DD. La fecha final sí cuenta como día completo de temporada.</Text>
            <Field label="Inicio" value={startsOn} onChangeText={setStartsOn} placeholder="2027-01-15" />
            <Field label="Fin" value={endsOn} onChangeText={setEndsOn} placeholder="2027-12-15" />
          </View>

          <View style={styles.noteCard}>
            <MaterialIcons name="info-outline" size={20} color={ucapsaBrand.colors.redDark} />
            <Text style={styles.noteText}>UCAPSA impide temporadas superpuestas. Después de guardar, un Superadmin decide cuándo activarla.</Text>
          </View>

          <Pressable disabled={saving} style={[styles.primaryButton, saving && styles.disabled]} onPress={() => void save()}>
            {saving ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> : <MaterialIcons name="save" size={20} color={ucapsaBrand.colors.surface} />}
            <Text style={styles.primaryButtonText}>{saving ? 'Guardando…' : 'Guardar temporada'}</Text>
          </Pressable>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize = 'none',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 3, marginBottom: 15 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 13 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  card: { gap: 11, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 15, marginBottom: 12 },
  cardTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  field: { gap: 6 },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  input: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, color: ucapsaBrand.colors.text, fontSize: 15, paddingHorizontal: 13, paddingVertical: 10 },
  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 16, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 12, marginBottom: 14 },
  noteText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  primaryButton: { minHeight: 50, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 16 },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.5 },
});
