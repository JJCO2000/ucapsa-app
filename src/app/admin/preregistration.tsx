import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { preregistrationDirectoryEnabled } from '../../constants/preregistrationFeature';
import { useSession } from '../../hooks/useSession';
import {
  getAdminPreregistrationRecords,
  preregistrationLevelLabel,
  preregistrationMemberLabel,
  type AdminPreregistrationRecord,
} from '../../services/preregistration-admin.service';

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value} selectable>{value}</Text>
  </View>;
}

export default function AdminPreregistrationDetailScreen() {
  const { isAdmin } = useSession();
  const { intakeProgramId } = useLocalSearchParams<{ intakeProgramId?: string }>();
  const recordId = typeof intakeProgramId === 'string' ? intakeProgramId : '';
  const [record, setRecord] = useState<AdminPreregistrationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const rows = await getAdminPreregistrationRecords(recordId);
      setRecord(rows[0] ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible abrir el expediente.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [recordId]);

  useFocusEffect(useCallback(() => {
    if (!isAdmin || !preregistrationDirectoryEnabled || !recordId) return;
    setLoading(true);
    void load();
  }, [isAdmin, recordId, load]));

  if (!isAdmin || !preregistrationDirectoryEnabled) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} tintColor={ucapsaBrand.colors.red}
      onRefresh={() => { setRefreshing(true); void load(); }} />}>
      <Pressable accessibilityRole="button" style={styles.back} onPress={() => router.back()}>
        <MaterialIcons name="arrow-back" size={20} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.backText}>Preinscripciones</Text>
      </Pressable>
      <Text style={styles.kicker}>Administración · Expediente</Text>
      <Text style={styles.heading}>{record?.dogName || 'Ficha de preinscripción'}</Text>
      {loading ? <ActivityIndicator style={styles.loading} color={ucapsaBrand.colors.red} /> : null}
      {error ? <View style={styles.card}><Text style={styles.warning}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={() => { setLoading(true); void load(); }}>
          <Text style={styles.link}>Reintentar</Text>
        </Pressable>
      </View> : null}
      {!loading && !error && !record ? (
        <View style={styles.card}><Text style={styles.value}>Este expediente no existe o no está disponible.</Text></View>
      ) : null}
      {record && !loading ? (
        <>
          <View style={styles.card}>
            <Text style={styles.groupTitle}>Tutor y perro</Text>
            <Detail label="Tutor" value={record.ownerName} />
            <Detail label="Correo" value={record.ownerEmail || 'No registrado'} />
            <Detail label="Teléfono" value={record.ownerPhone || 'No registrado'} />
            <Detail label="Perro" value={record.dogName} />
            <Detail label="Cuenta" value={record.status === 'linked' ? 'Vinculada' : 'Pendiente de vinculación'} />
          </View>
          <View style={styles.card}>
            <Text style={styles.groupTitle}>Programa y nivel</Text>
            <Detail label="Programa" value={record.programCode === 'puppy' ? 'Puppy' : 'Comandos'} />
            <Detail label="Etapa" value={preregistrationLevelLabel(record)} />
            <Detail label="Horario oficial" value={record.scheduleName + ' · ' + record.scheduleTime} />
            <Detail label="Autorizado desde" value={record.authorizedOn} />
            {record.programCode === 'puppy' ?
              <Detail label="Referencia física Puppy" value={record.physicalCardReference || 'No registrada'} /> : null}
            <Detail label="Membresía de Socio" value={preregistrationMemberLabel(record)} />
          </View>
          <View style={styles.card}>
            <Text style={styles.groupTitle}>Asistencias reconocidas</Text>
            <Detail label="Total" value={String(record.attendancesCount)} />
            <Detail label="Con fecha" value={String(record.datedAttendances)} />
            <Detail label="Sin fecha conocida" value={String(record.undatedAttendances)} />
            <Text style={styles.hint}>Se muestran asistencias documentadas en este expediente; no se generan registros ficticios.</Text>
          </View>
          {record.linkedUserId ? (
            <Pressable accessibilityRole="button" style={styles.primary}
              onPress={() => router.push(('/admin/customer?userId=' + encodeURIComponent(record.linkedUserId!)) as never)}>
              <MaterialIcons name="person" size={20} color={ucapsaBrand.colors.surface} />
              <Text style={styles.primaryText}>Abrir ficha oficial del cliente</Text>
            </Pressable>
          ) : (
            <Text style={styles.hint}>La membresía y el perfil oficial se administran cuando el titular tenga una cuenta verificada.</Text>
          )}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  backText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '800' },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  heading: { color: ucapsaBrand.colors.text, fontSize: 27, fontWeight: '900', marginTop: 5, marginBottom: 15 },
  loading: { marginTop: 20 },
  card: { backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border,
    borderRadius: 17, padding: 16, marginBottom: 12 },
  groupTitle: { color: ucapsaBrand.colors.text, fontWeight: '900', fontSize: 16, marginBottom: 6 },
  detail: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.border },
  label: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '800' },
  value: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '700', marginTop: 4 },
  warning: { color: ucapsaBrand.colors.danger, fontSize: 12 },
  link: { color: ucapsaBrand.colors.redDark, fontWeight: '900', fontSize: 13, paddingVertical: 8 },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, marginTop: 10 },
  primary: { backgroundColor: ucapsaBrand.colors.greenDark, borderRadius: 13, minHeight: 52,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  primaryText: { color: ucapsaBrand.colors.surface, fontWeight: '900', fontSize: 13 },
});
