import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  deleteAdminNotificationCampaign,
  getAdminNotificationCampaigns,
  sendAdminNotification,
  type AdminNotificationCategory,
  type NotificationCampaign,
} from '../../services/admin-notifications.service';
import type { AudienceType } from '../../types/app.types';

type ViewMode = 'send' | 'history';

type Option<T extends string> = { value: T; label: string; description: string };

const audienceOptions: Option<AudienceType>[] = [
  { value: 'public', label: 'Todos', description: 'Todos los usuarios con notificaciones activas.' },
  { value: 'clients', label: 'Clientes', description: 'Clientes y socios.' },
  { value: 'members', label: 'Socios', description: 'Solo socios.' },
  { value: 'admins', label: 'Admins', description: 'Solo equipo administrativo.' },
];

const categoryOptions: Option<AdminNotificationCategory>[] = [
  { value: 'announcements_events', label: 'Anuncios', description: 'Avisos, eventos y comunicados.' },
  { value: 'classes', label: 'Clases', description: 'Puppy, Comandos y cambios operativos.' },
  { value: 'membership', label: 'Membresia', description: 'Pagos, vigencia y estado.' },
  { value: 'achievements', label: 'Logros', description: 'Avances y reconocimientos.' },
];

const statusLabels: Record<NotificationCampaign['status'], string> = {
  draft: 'Borrador',
  sending: 'Enviando',
  sent: 'Enviada',
  partial_failed: 'Parcial',
  failed: 'Fallida',
  no_targets: 'Sin destinatarios',
};

function formatDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AdminNotificationsScreen() {
  const { loading, user, isAdmin } = useSession();
  const [mode, setMode] = useState<ViewMode>('send');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AudienceType>('clients');
  const [category, setCategory] = useState<AdminNotificationCategory>('announcements_events');
  const [campaigns, setCampaigns] = useState<NotificationCampaign[]>([]);
  const [visibleCount, setVisibleCount] = useState(8);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const selectedAudience = useMemo(() => audienceOptions.find((item) => item.value === audience) ?? audienceOptions[0], [audience]);
  const selectedCategory = useMemo(() => categoryOptions.find((item) => item.value === category) ?? categoryOptions[0], [category]);

  const loadHistory = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingHistory(true);
    try {
      setCampaigns(await getAdminNotificationCampaigns(30));
    } catch (cause) {
      Alert.alert('No se pudo cargar historial', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setLoadingHistory(false);
    }
  }, [isAdmin]);

  useFocusEffect(useCallback(() => { void loadHistory(); return undefined; }, [loadHistory]));

  function askSend() {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Faltan datos', 'Agrega titulo y mensaje.');
      return;
    }
    Alert.alert(
      'Enviar notificacion',
      `Audiencia: ${selectedAudience.label}\nCategoria: ${selectedCategory.label}\n\n${title.trim()}\n\n${body.trim()}`,
      [
        { text: 'Volver', style: 'cancel' },
        { text: 'Enviar', style: 'destructive', onPress: () => void send() },
      ],
    );
  }

  async function send() {
    try {
      setSending(true);
      const result = await sendAdminNotification({ title, body, audience, category });
      await loadHistory();
      if (result.status === 'no_targets') {
        Alert.alert('Sin destinatarios', result.message ?? 'No hay dispositivos activos para esa audiencia.');
        return;
      }
      Alert.alert('Envio registrado', `Destinatarios: ${result.total_targets}\nEnviadas: ${result.success_count}\nFallidas: ${result.failure_count}`);
      setTitle('');
      setBody('');
      setMode('history');
    } catch (cause) {
      Alert.alert('No se pudo enviar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSending(false);
    }
  }

  function askDelete(campaign: NotificationCampaign) {
    Alert.alert('Quitar del historial', campaign.title, [
      { text: 'Volver', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          try {
            setDeletingId(campaign.id);
            await deleteAdminNotificationCampaign(campaign.id);
            setCampaigns((current) => current.filter((item) => item.id !== campaign.id));
          } catch (cause) {
            Alert.alert('No se pudo quitar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  }

  if (loading) return <KeyboardAwareScreen><Text style={styles.muted}>Revisando acceso...</Text></KeyboardAwareScreen>;
  if (!user || !isAdmin) return <KeyboardAwareScreen><Text style={styles.title}>Acceso restringido</Text><Pressable style={styles.backButton} onPress={() => router.back()}><Text style={styles.backText}>Volver</Text></Pressable></KeyboardAwareScreen>;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={loadingHistory} onRefresh={() => void loadHistory()} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Comunicacion</Text>
        <Text style={styles.title}>Notificaciones</Text>
        <Text style={styles.subtitle}>Enviar e historial estan separados para no mezclar acciones con resultados.</Text>
      </View>

      <View style={styles.modeTabs}>
        <Pressable style={[styles.modeTab, mode === 'send' && styles.modeTabActive]} onPress={() => setMode('send')}><MaterialIcons name="send" size={18} color={mode === 'send' ? '#fff' : ucapsaBrand.colors.redDark} /><Text style={[styles.modeText, mode === 'send' && styles.modeTextActive]}>Enviar</Text></Pressable>
        <Pressable style={[styles.modeTab, mode === 'history' && styles.modeTabActive]} onPress={() => setMode('history')}><MaterialIcons name="history" size={18} color={mode === 'history' ? '#fff' : ucapsaBrand.colors.redDark} /><Text style={[styles.modeText, mode === 'history' && styles.modeTextActive]}>Historial</Text></Pressable>
      </View>

      {mode === 'send' ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Nuevo envio</Text>
          <Text style={styles.muted}>Usa mensajes cortos y solo cuando aporten valor.</Text>

          <Text style={styles.label}>Titulo</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Ej. Cambio de clase" maxLength={120} style={styles.input} />
          <Text style={styles.label}>Mensaje</Text>
          <TextInput value={body} onChangeText={setBody} placeholder="Mensaje para el usuario" maxLength={500} multiline style={[styles.input, styles.textArea]} />

          <Text style={styles.label}>Audiencia</Text>
          <View style={styles.choiceGrid}>{audienceOptions.map((option) => <Choice key={option.value} label={option.label} active={audience === option.value} onPress={() => setAudience(option.value)} />)}</View>
          <Text style={styles.help}>{selectedAudience.description}</Text>

          <Text style={styles.label}>Categoria</Text>
          <View style={styles.choiceGrid}>{categoryOptions.map((option) => <Choice key={option.value} label={option.label} active={category === option.value} onPress={() => setCategory(option.value)} />)}</View>
          <Text style={styles.help}>{selectedCategory.description}</Text>

          <View style={styles.preview}>
            <Text style={styles.previewLabel}>Vista previa</Text>
            <Text style={styles.previewTitle}>{title.trim() || 'Titulo de la notificacion'}</Text>
            <Text style={styles.previewBody}>{body.trim() || 'El mensaje aparecera aqui.'}</Text>
          </View>

          <Pressable disabled={sending || !title.trim() || !body.trim()} style={[styles.primary, (sending || !title.trim() || !body.trim()) && styles.disabled]} onPress={askSend}><Text style={styles.primaryText}>{sending ? 'Enviando...' : 'Revisar y enviar'}</Text></Pressable>
        </View>
      ) : (
        <View>
          {loadingHistory && campaigns.length === 0 ? <Text style={styles.muted}>Cargando historial...</Text> : null}
          {campaigns.length === 0 && !loadingHistory ? <View style={styles.empty}><Text style={styles.emptyTitle}>Sin envios</Text><Text style={styles.muted}>Los envios manuales apareceran aqui.</Text></View> : null}
          <View style={styles.list}>
            {campaigns.slice(0, visibleCount).map((campaign, index) => (
              <View key={campaign.id} style={[styles.historyRow, index === Math.min(campaigns.length, visibleCount) - 1 && styles.rowLast]}>
                <View style={{ flex: 1 }}>
                  <View style={styles.historyTitleLine}><Text numberOfLines={1} style={styles.historyTitle}>{campaign.title}</Text><Text style={styles.status}>{statusLabels[campaign.status]}</Text></View>
                  <Text numberOfLines={2} style={styles.historyBody}>{campaign.body}</Text>
                  <Text style={styles.historyMeta}>{formatDate(campaign.sent_at ?? campaign.created_at)} - {campaign.success_count}/{campaign.total_targets} enviadas</Text>
                </View>
                <Pressable disabled={deletingId === campaign.id} style={styles.deleteButton} onPress={() => askDelete(campaign)}><MaterialIcons name="delete-outline" size={19} color={ucapsaBrand.colors.redDark} /></Pressable>
              </View>
            ))}
          </View>
          {campaigns.length > visibleCount ? <Pressable style={styles.moreButton} onPress={() => setVisibleCount((count) => count + 8)}><Text style={styles.moreText}>Ver 8 mas</Text></Pressable> : null}
        </View>
      )}
    </KeyboardAwareScreen>
  );
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable style={[styles.choice, active && styles.choiceActive]} onPress={onPress}><Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  hero: { marginBottom: 14 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 3 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  backButton: { alignSelf: 'flex-start', marginTop: 10, borderRadius: 12, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 12, paddingVertical: 9 },
  backText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  modeTabs: { flexDirection: 'row', gap: 7, marginBottom: 12 },
  modeTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', paddingVertical: 10 },
  modeTabActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  modeText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  modeTextActive: { color: '#fff' },
  card: { borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 14 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 12, marginBottom: 5 },
  input: { borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#FFF8F8', paddingHorizontal: 12, paddingVertical: 11, color: ucapsaBrand.colors.text },
  textArea: { minHeight: 92, textAlignVertical: 'top' },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 8 },
  choiceActive: { backgroundColor: ucapsaBrand.colors.redSoft, borderColor: ucapsaBrand.colors.red },
  choiceText: { color: ucapsaBrand.colors.text, fontSize: 10, fontWeight: '900' },
  choiceTextActive: { color: ucapsaBrand.colors.redDark },
  help: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  preview: { borderRadius: 15, backgroundColor: '#F8F2F3', padding: 12, marginTop: 13 },
  previewLabel: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  previewTitle: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900', marginTop: 4 },
  previewBody: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  primary: { alignItems: 'center', borderRadius: 14, backgroundColor: ucapsaBrand.colors.red, paddingVertical: 13, marginTop: 12 },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.48 },
  empty: { alignItems: 'center', gap: 5, padding: 28 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  list: { borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', overflow: 'hidden' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderBottomWidth: 1, borderBottomColor: '#F4E5E8' },
  rowLast: { borderBottomWidth: 0 },
  historyTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  historyTitle: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  status: { color: ucapsaBrand.colors.redDark, fontSize: 9, fontWeight: '900', backgroundColor: ucapsaBrand.colors.redSoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  historyBody: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  historyMeta: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3, fontWeight: '700' },
  deleteButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  moreButton: { alignItems: 'center', paddingVertical: 11 },
  moreText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
});
