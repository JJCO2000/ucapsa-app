import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { devWarn } from '../../lib/client-diagnostics';
import {
  getMyFamilyAccountLinks, getMyFamilyProgress, setMyFamilyConsent,
  type FamilyAccountLink, type FamilyProgress,
} from '../../services/family-account-links.service';

export default function MyFamilyScreen() {
  const { user, loading: sessionLoading } = useSession();
  const [links, setLinks] = useState<FamilyAccountLink[]>([]);
  const [progress, setProgress] = useState<FamilyProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const ownerId = user?.id;
    if (!ownerId) return;
    const requestId = ++requestIdRef.current;
    try {
      const [related, summary] = await Promise.all([
        getMyFamilyAccountLinks(), getMyFamilyProgress(),
      ]);
      if (requestId !== requestIdRef.current) return;
      setLinks(related);
      setProgress(summary);
      setNotice('');
      setLoadedForUserId(ownerId);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      devWarn('family: failed to read consent or progress.', error);
      setLinks([]);
      setProgress([]);
      setNotice('No pudimos actualizar la información familiar. Revisa tu conexión.');
      setLoadedForUserId(ownerId);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    requestIdRef.current += 1;
    setLinks([]);
    setProgress([]);
    setLoadedForUserId(null);
    if (sessionLoading || !user) return;
    setLoading(true);
    void load();
    return () => { requestIdRef.current += 1; };
  }, [load, sessionLoading, user?.id]);

  async function changeConsent(link: FamilyAccountLink) {
    if (busyId) return;
    setBusyId(link.id);
    setNotice('');
    try {
      await setMyFamilyConsent(link.id, !link.myAccepted);
      await load();
    } catch (error) {
      devWarn('family: consent update failed.', error);
      setNotice('No pudimos guardar tu decisión. Inténtalo de nuevo.');
    } finally {
      setBusyId(null);
    }
  }

  if (sessionLoading) {
    return <KeyboardAwareScreen><ActivityIndicator /></KeyboardAwareScreen>;
  }
  if (!user) return <Redirect href="/auth/login" />;
  return (
    <KeyboardAwareScreen>
      <Pressable accessibilityRole="button" style={styles.back} onPress={() => router.back()}>
        <MaterialIcons name="arrow-back" size={21} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.backText}>Perfil</Text>
      </Pressable>
      <Text style={styles.title}>Mi familia</Text>
      <Text style={styles.intro}>
        Cada persona conserva su cuenta y sus perros. Compartir el progreso es opcional
        y solo permite consultar nombres de propietarios y perros, programas, niveles
        y número de asistencias.
      </Text>
      <Text style={styles.hint}>
        No se comparten pagos, credenciales, fotos privadas ni la posibilidad de modificar
        perros o inscripciones. Estar en una familia tampoco activa una membresía compartida.
        Tu permiso se registra bajo el aviso de privacidad vigente y, si cambia, tendrás
        que volver a autorizarlo.
      </Text>
      <Pressable accessibilityRole="link" accessibilityLabel="Consultar aviso de privacidad"
        onPress={() => router.push('/privacy' as never)} style={styles.privacyLink}>
        <Text style={styles.privacyLinkText}>Consultar aviso de privacidad</Text>
      </Pressable>
      {notice ? <Text accessibilityRole="alert" style={styles.error}>{notice}</Text> : null}
      {loading || loadedForUserId !== user.id ? <ActivityIndicator color={ucapsaBrand.colors.red} style={{ marginTop: 16 }} /> : (
        <>
          {!links.length ? (
            <View style={styles.card}>
              <Text style={styles.subtitle}>Sin vinculaciones</Text>
              <Text style={styles.hint}>
                Si Administración registró a tu familia, podrá autorizar el vínculo
                cuando ambos tengan su cuenta. No es necesario verificar el correo.
              </Text>
            </View>
          ) : links.map((link) => (
            <View key={link.id} style={styles.card}>
              <Text style={styles.subtitle}>{link.otherName}</Text>
              <Text style={styles.hint}>
                {link.myRole === 'titular' ? 'Integrante de tu familia' : 'Titular de la familia'}
              </Text>
              <Text style={styles.state}>
                {!link.noticeAvailable ? 'Consulta familiar aún no disponible' :
                  link.active ? 'Progreso compartido' :
                  link.myAccepted ? 'Esperando a la otra persona' : 'Esperando tu autorización'}
              </Text>
              {!link.noticeAvailable ? (
                <Text style={styles.hint}>
                  Cuando se publique el aviso correspondiente, podrás decidir si
                  compartes el progreso. Ningún dato se comparte por ahora.
                </Text>
              ) : null}
              {link.noticeAvailable ? (
              <Pressable accessibilityRole="button"
                accessibilityLabel={(link.myAccepted ? 'Dejar de compartir progreso con ' :
                  'Autorizar compartir progreso con ') + link.otherName}
                disabled={Boolean(busyId)} style={[styles.button, Boolean(busyId) && styles.disabled]}
                onPress={() => { void changeConsent(link); }}>
                <Text style={styles.buttonText}>
                  {busyId === link.id ? 'Guardando…' :
                    link.myAccepted ? 'Dejar de compartir' : 'Autorizar compartir progreso'}
                </Text>
              </Pressable>
              ) : null}
              <Text style={styles.hint}>
                {link.myAccepted
                  ? 'Puedes retirar tu autorización aquí cuando quieras.'
                  : 'Solo verán el progreso cuando ambos acepten.'}
              </Text>
            </View>
          ))}
          {progress.length > 0 ? (
            <>
              <Text style={styles.section}>Progreso de familiares</Text>
              {progress.map((item, index) => (
                <View key={index} style={styles.card}>
                  <Text style={styles.subtitle}>{item.dogName}</Text>
                  <Text style={styles.hint}>De: {item.ownerName}</Text>
                  <Text style={styles.state}>
                    {item.programName
                      ? item.programName + (item.programLevel ? ' · ' + item.programLevel : '') +
                        (item.attendancesCount !== null ? ' · ' + item.attendancesCount + ' asistencias' : '')
                      : 'Sin clases registradas'}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
          <Pressable accessibilityRole="button" onPress={() => { setLoading(true); void load(); }}
            style={styles.refresh}><Text style={styles.refreshText}>Actualizar familia</Text></Pressable>
        </>
      )}
    </KeyboardAwareScreen>
  );
}
const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  backText: { color: ucapsaBrand.colors.redDark, fontWeight: '800' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  intro: { color: ucapsaBrand.colors.text, fontSize: 14, lineHeight: 21, marginTop: 12 },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 19, marginTop: 8 },
  card: { backgroundColor: ucapsaBrand.colors.surface,
    borderColor: ucapsaBrand.colors.border, borderWidth: 1,
    borderRadius: 16, padding: 16, marginTop: 14 },
  subtitle: { color: ucapsaBrand.colors.text, fontWeight: '900', fontSize: 16 },
  state: { color: ucapsaBrand.colors.greenDark, fontWeight: '800', fontSize: 13, marginTop: 11 },
  button: { backgroundColor: ucapsaBrand.colors.greenDark, minHeight: 49,
    marginTop: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.6 },
  error: { color: ucapsaBrand.colors.danger, fontSize: 13, marginTop: 12 },
  section: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginTop: 20 },
  privacyLink: { paddingVertical: 10, alignItems: 'flex-start' },
  privacyLinkText: { fontSize: 13, fontWeight: '800', color: ucapsaBrand.colors.redDark },
  refresh: { paddingVertical: 16, alignItems: 'center' },
  refreshText: { color: ucapsaBrand.colors.redDark, fontWeight: '800', fontSize: 13 },
});
