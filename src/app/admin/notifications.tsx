import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { UcapsaRoleCard, UcapsaRoleHero } from '../../components/layout/UcapsaRoleLayout';
import { AppButton } from '../../components/ui/AppButton';
import { Screen } from '../../components/ui/Screen';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import {
  getAdminNotificationCampaigns,
  sendAdminNotification,
  type AdminNotificationCategory,
  type NotificationCampaign,
} from '../../services/admin-notifications.service';
import type { AudienceType } from '../../types/app.types';

type SelectOption<T extends string> = {
  value: T;
  label: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
};

const audienceOptions: SelectOption<AudienceType>[] = [
  { value: 'public', label: 'Todos', description: 'Clientes, socios y admins con notificaciones activas.', icon: 'public' },
  { value: 'clients', label: 'Clientes', description: 'Clientes y socios. Util para avisos generales de escuela.', icon: 'groups' },
  { value: 'members', label: 'Socios', description: 'Solo usuarios con rol de socio.', icon: 'badge' },
  { value: 'admins', label: 'Admins', description: 'Solo equipo administrativo.', icon: 'admin-panel-settings' },
];

const categoryOptions: SelectOption<AdminNotificationCategory>[] = [
  { value: 'announcements_events', label: 'Anuncios y eventos', description: 'Avisos oficiales, calendario y comunicados.', icon: 'campaign' },
  { value: 'classes', label: 'Clases', description: 'Puppy, Comandos y cambios operativos.', icon: 'school' },
  { value: 'membership', label: 'Membresia', description: 'Pagos, vigencia y estado de socio.', icon: 'verified-user' },
  { value: 'achievements', label: 'Logros', description: 'Medallas y avances del alumno/perro.', icon: 'emoji-events' },
];

const statusLabels: Record<NotificationCampaign['status'], string> = {
  draft: 'Borrador',
  sending: 'Enviando',
  sent: 'Enviada',
  partial_failed: 'Parcial',
  failed: 'Fallida',
  no_targets: 'Sin destinatarios',
};

function formatDate(value: string | null) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AdminNotificationsScreen() {
  const { loading, user, role, isAdmin } = useSession();
  const format = resolveUcapsaFormat({ user, role, isAdmin: true });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AudienceType>('clients');
  const [category, setCategory] = useState<AdminNotificationCategory>('announcements_events');
  const [campaigns, setCampaigns] = useState<NotificationCampaign[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);

  const selectedAudience = useMemo(() => audienceOptions.find((item) => item.value === audience) ?? audienceOptions[0], [audience]);
  const selectedCategory = useMemo(() => categoryOptions.find((item) => item.value === category) ?? categoryOptions[0], [category]);
  const canSend = title.trim().length > 0 && body.trim().length > 0 && !sending;

  async function loadHistory() {
    if (!isAdmin) return;
    setLoadingHistory(true);
    try {
      const nextCampaigns = await getAdminNotificationCampaigns();
      setCampaigns(nextCampaigns);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo cargar el historial.');
    } finally {
      setLoadingHistory(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
      return undefined;
    }, [isAdmin]),
  );

  function resetForm() {
    setTitle('');
    setBody('');
    setAudience('clients');
    setCategory('announcements_events');
  }

  function handleSendPress() {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Faltan datos', 'Agrega titulo y mensaje antes de enviar.');
      return;
    }

    Alert.alert(
      'Enviar notificacion',
      `Se enviara a: ${selectedAudience.label}\nCategoria: ${selectedCategory.label}\n\nTitulo:\n${title.trim()}\n\nMensaje:\n${body.trim()}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Enviar', style: 'destructive', onPress: () => void handleSendConfirmed() },
      ],
    );
  }

  async function handleSendConfirmed() {
    setSending(true);
    try {
      const result = await sendAdminNotification({
        title,
        body,
        audience,
        category,
      });

      await loadHistory();

      if (result.status === 'no_targets') {
        Alert.alert('Sin destinatarios', result.message ?? 'No hay dispositivos activos para esa audiencia/categoria.');
        return;
      }

      Alert.alert(
        'Envio registrado',
        `Destinatarios: ${result.total_targets}\nEnviadas: ${result.success_count}\nFallidas: ${result.failure_count}`,
      );
      resetForm();
    } catch (error) {
      Alert.alert('No se pudo enviar', error instanceof Error ? error.message : 'Error desconocido.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <Screen backgroundColor={format.background}>
        <Denied title="Revisando acceso" text="Cargando sesion administrativa..." icon="notifications-none" format={format} />
      </Screen>
    );
  }

  if (!user || !isAdmin) {
    return (
      <Screen backgroundColor={format.background}>
        <Denied
          title="Acceso restringido"
          text="Solo administradores pueden enviar notificaciones."
          icon="lock"
          format={format}
          actionLabel="Volver"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <Screen
      backgroundColor={format.background}
      keyboardAware
      refreshControl={<RefreshControl refreshing={loadingHistory} onRefresh={() => void loadHistory()} />}
    >
      <UcapsaRoleHero
        format={format}
        eyebrow="UCAPSA Admin"
        title="Notificaciones"
        subtitle="Envia avisos manuales solo a usuarios que activaron notificaciones."
        icon="notifications-none"
      />

      <UcapsaRoleCard
        format={format}
        title="Control antes de automatizar"
        subtitle="3.3 es envio manual. Recordatorios de clases y cancelaciones automaticas van en fases posteriores."
        icon="verified"
      />

      <View style={[styles.card, { backgroundColor: format.surface, borderColor: format.border }]}> 
        <Text style={[styles.sectionTitle, { color: format.text }]}>Nuevo envio</Text>
        <Text style={[styles.sectionSubtitle, { color: format.muted }]}>MantÃ©n el mensaje corto. Si notificas demasiado, la gente apaga permisos.</Text>

        <Text style={[styles.label, { color: format.text }]}>Titulo</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Ej. Clase Puppy de hoy"
          placeholderTextColor={format.muted}
          maxLength={80}
          style={[styles.input, { borderColor: format.border, color: format.text, backgroundColor: format.background }]}
        />
        <Text style={[styles.counter, { color: format.muted }]}>{title.trim().length}/80</Text>

        <Text style={[styles.label, { color: format.text }]}>Mensaje</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Escribe el aviso que vera el usuario."
          placeholderTextColor={format.muted}
          maxLength={180}
          multiline
          style={[styles.input, styles.messageInput, { borderColor: format.border, color: format.text, backgroundColor: format.background }]}
        />
        <Text style={[styles.counter, { color: format.muted }]}>{body.trim().length}/180</Text>

        <Text style={[styles.label, { color: format.text }]}>Audiencia</Text>
        <View style={styles.optionGrid}>
          {audienceOptions.map((item) => (
            <OptionButton
              key={item.value}
              item={item}
              selected={audience === item.value}
              onPress={() => setAudience(item.value)}
              format={format}
            />
          ))}
        </View>

        <Text style={[styles.label, { color: format.text }]}>Categoria</Text>
        <View style={styles.optionGrid}>
          {categoryOptions.map((item) => (
            <OptionButton
              key={item.value}
              item={item}
              selected={category === item.value}
              onPress={() => setCategory(item.value)}
              format={format}
            />
          ))}
        </View>

        <View style={[styles.previewBox, { backgroundColor: format.accentSoft, borderColor: format.border }]}> 
          <MaterialIcons name="visibility" size={20} color={format.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.previewTitle, { color: format.text }]}>{title.trim() || 'Vista previa del titulo'}</Text>
            <Text style={[styles.previewBody, { color: format.muted }]}>{body.trim() || 'Aqui se vera el mensaje antes de enviarlo.'}</Text>
          </View>
        </View>

        <AppButton label={sending ? 'Enviando...' : 'Enviar notificacion'} disabled={!canSend} variant="danger" onPress={handleSendPress} />
      </View>

      <View style={[styles.card, { backgroundColor: format.surface, borderColor: format.border }]}> 
        <View style={styles.sectionHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: format.text }]}>Historial reciente</Text>
            <Text style={[styles.sectionSubtitle, { color: format.muted }]}>Ultimos envios manuales registrados.</Text>
          </View>
          <Pressable style={[styles.refreshButton, { backgroundColor: format.accentSoft }]} onPress={() => void loadHistory()}>
            <MaterialIcons name="refresh" size={20} color={format.accent} />
          </Pressable>
        </View>

        {campaigns.length === 0 ? (
          <Text style={[styles.emptyText, { color: format.muted }]}>Todavia no hay envios registrados.</Text>
        ) : (
          <View style={styles.historyList}>
            {campaigns.map((campaign) => (
              <View key={campaign.id} style={[styles.historyItem, { borderColor: format.border }]}> 
                <View style={styles.historyTopRow}>
                  <Text style={[styles.historyTitle, { color: format.text }]} numberOfLines={1}>{campaign.title}</Text>
                  <Text style={[styles.statusPill, { color: format.accent, backgroundColor: format.accentSoft }]}>{statusLabels[campaign.status]}</Text>
                </View>
                <Text style={[styles.historyBody, { color: format.muted }]} numberOfLines={2}>{campaign.body}</Text>
                <Text style={[styles.historyMeta, { color: format.muted }]}>Audiencia: {campaign.audience} Â· Categoria: {campaign.category}</Text>
                <Text style={[styles.historyMeta, { color: format.muted }]}>Objetivo: {campaign.total_targets} Â· Enviadas: {campaign.success_count} Â· Fallidas: {campaign.failure_count}</Text>
                <Text style={[styles.historyMeta, { color: format.muted }]}>Fecha: {formatDate(campaign.sent_at ?? campaign.created_at)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

function OptionButton<T extends string>({ item, selected, onPress, format }: { item: SelectOption<T>; selected: boolean; onPress: () => void; format: ReturnType<typeof resolveUcapsaFormat> }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.optionButton,
        {
          backgroundColor: selected ? format.accentSoft : format.background,
          borderColor: selected ? format.accent : format.border,
        },
      ]}
    >
      <MaterialIcons name={item.icon} size={20} color={selected ? format.accent : format.muted} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionTitle, { color: format.text }]}>{item.label}</Text>
        <Text style={[styles.optionDescription, { color: format.muted }]}>{item.description}</Text>
      </View>
    </Pressable>
  );
}

function Denied({ title, text, icon, actionLabel, onAction, format }: { title: string; text: string; icon: keyof typeof MaterialIcons.glyphMap; actionLabel?: string; onAction?: () => void; format: ReturnType<typeof resolveUcapsaFormat> }) {
  return (
    <View style={styles.deniedBox}>
      <MaterialIcons name={icon} size={42} color={format.accent} />
      <Text style={[styles.deniedTitle, { color: format.text }]}>{title}</Text>
      <Text style={[styles.deniedText, { color: format.muted }]}>{text}</Text>
      {actionLabel && onAction ? <AppButton label={actionLabel} variant="secondary" onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 24, padding: 16, gap: 12, marginBottom: 16 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '900' },
  sectionSubtitle: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  label: { marginTop: 4, fontSize: 14, fontWeight: '900' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontWeight: '700' },
  messageInput: { minHeight: 96, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', fontSize: 12, fontWeight: '800' },
  optionGrid: { gap: 10 },
  optionButton: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderWidth: 1, borderRadius: 18, padding: 12 },
  optionTitle: { fontSize: 14, fontWeight: '900' },
  optionDescription: { marginTop: 2, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  previewBox: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 18, padding: 13 },
  previewTitle: { fontSize: 15, fontWeight: '900' },
  previewBody: { marginTop: 3, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  refreshButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  historyList: { gap: 10 },
  historyItem: { borderWidth: 1, borderRadius: 18, padding: 12 },
  historyTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyTitle: { flex: 1, fontSize: 15, fontWeight: '900' },
  historyBody: { marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  historyMeta: { marginTop: 4, fontSize: 12, fontWeight: '800' },
  statusPill: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, fontSize: 11, fontWeight: '900' },
  deniedBox: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  deniedTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  deniedText: { fontSize: 14, lineHeight: 20, textAlign: 'center', fontWeight: '700' },
});
