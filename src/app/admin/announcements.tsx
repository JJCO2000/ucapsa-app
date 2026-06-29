import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { AnnouncementCard } from '../../components/domain/AnnouncementCard';
import { useSession } from '../../hooks/useSession';
import {
  archiveAnnouncement,
  createAnnouncement,
  deleteAnnouncement,
  getAdminAnnouncements,
  restoreAnnouncement,
  setAnnouncementPublished,
  updateAnnouncement,
} from '../../services/announcements.service';
import { getAdminEvents } from '../../services/events.service';
import type { Announcement, AudienceType, UcapsaEvent } from '../../types/app.types';

type AnnouncementFormState = {
  title: string;
  content: string;
  audience: AudienceType;
  is_pinned: boolean;
  is_published: boolean;
  event_id: string | null;
};

const emptyForm: AnnouncementFormState = {
  title: '',
  content: '',
  audience: 'public',
  is_pinned: false,
  is_published: true,
  event_id: null,
};

export default function AdminAnnouncementsScreen() {
  const { isAdmin } = useSession();
  const params = useLocalSearchParams<{ announcementId?: string }>();
  const openedAnnouncementParamRef = useRef<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<UcapsaEvent[]>([]);
  const [form, setForm] = useState<AnnouncementFormState>(emptyForm);
  const [editForm, setEditForm] = useState<AnnouncementFormState>(emptyForm);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [announcementResult, eventResult] = await Promise.all([
        getAdminAnnouncements(),
        getAdminEvents(),
      ]);
      setAnnouncements(announcementResult);
      setEvents(eventResult);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudieron cargar los anuncios.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) void loadData();
  }, [isAdmin]);

  useEffect(() => {
    if (!params.announcementId || openedAnnouncementParamRef.current === params.announcementId || announcements.length === 0) return;

    const announcementToOpen = announcements.find((announcement) => announcement.id === params.announcementId);
    if (!announcementToOpen) return;

    openedAnnouncementParamRef.current = params.announcementId;
    openEditor(announcementToOpen);
  }, [announcements, params.announcementId]);

  function openEditor(announcement: Announcement) {
    setSelectedAnnouncement(announcement);
    setEditForm({
      title: announcement.title,
      content: announcement.content,
      audience: announcement.audience,
      is_pinned: announcement.is_pinned,
      is_published: announcement.is_published,
      event_id: announcement.event_id,
    });
  }

  function validateForm(value: AnnouncementFormState) {
    if (!value.title.trim()) throw new Error('El título es obligatorio.');
    if (!value.content.trim()) throw new Error('El contenido es obligatorio.');
  }

  async function handleCreate() {
    try {
      validateForm(form);
      setSaving(true);
      await createAnnouncement(form);
      setForm(emptyForm);
      await loadData();
    } catch (err) {
      Alert.alert('No se pudo crear', err instanceof Error ? err.message : 'Error desconocido.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!selectedAnnouncement) return;

    try {
      validateForm(editForm);
      setSaving(true);
      await updateAnnouncement(selectedAnnouncement.id, editForm);
      setSelectedAnnouncement(null);
      await loadData();
    } catch (err) {
      Alert.alert('No se pudo actualizar', err instanceof Error ? err.message : 'Error desconocido.');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: () => Promise<void>) {
    try {
      setSaving(true);
      await action();
      await loadData();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo completar la acción.');
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <View style={styles.deniedContainer}>
        <MaterialIcons name="lock" size={42} color="#991b1b" />
        <Text style={styles.deniedTitle}>Acceso restringido</Text>
        <Text style={styles.deniedText}>Solo administradores pueden gestionar anuncios.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Admin</Text>
        <Text style={styles.title}>Anuncios</Text>
        <Text style={styles.subtitle}>Gestiona comunicados y vinculos con eventos del calendario.</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Nuevo anuncio</Text>
        <AnnouncementForm form={form} events={events} onChange={setForm} />
        <Pressable disabled={saving} style={styles.primaryButton} onPress={handleCreate}>
          <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Crear anuncio'}</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Anuncios registrados</Text>
        <Text style={styles.sectionCount}>{announcements.length}</Text>
      </View>

      {loading ? <Text style={styles.muted}>Cargando anuncios...</Text> : null}

      {announcements.map((announcement) => (
        <View key={announcement.id} style={styles.adminItem}>
          <AnnouncementCard announcement={announcement} onPress={() => openEditor(announcement)} showAdminStatus />

          <View style={styles.actionsRow}>
            <ActionButton
              label={announcement.is_published ? 'Despublicar' : 'Publicar'}
              onPress={() => runAction(() => setAnnouncementPublished(announcement.id, !announcement.is_published))}
            />
            <ActionButton
              label={announcement.archived_at ? 'Restaurar' : 'Archivar'}
              onPress={() =>
                runAction(() =>
                  announcement.archived_at
                    ? restoreAnnouncement(announcement.id)
                    : archiveAnnouncement(announcement.id),
                )
              }
            />
            <ActionButton
              label="Eliminar"
              danger
              onPress={() =>
                Alert.alert('Eliminar anuncio', 'Esta acción no se puede deshacer.', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Eliminar', style: 'destructive', onPress: () => runAction(() => deleteAnnouncement(announcement.id)) },
                ])
              }
            />
          </View>
        </View>
      ))}

      <Modal
        visible={Boolean(selectedAnnouncement)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedAnnouncement(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar anuncio</Text>
              <Pressable onPress={() => setSelectedAnnouncement(null)}>
                <MaterialIcons name="close" size={26} color="#0f172a" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              <AnnouncementForm form={editForm} events={events} onChange={setEditForm} />
              <Pressable disabled={saving} style={styles.primaryButton} onPress={handleUpdate}>
                <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar cambios'}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function AnnouncementForm({
  form,
  events,
  onChange,
}: {
  form: AnnouncementFormState;
  events: UcapsaEvent[];
  onChange: (form: AnnouncementFormState) => void;
}) {
  return (
    <View style={styles.formFields}>
      <TextInput value={form.title} onChangeText={(title) => onChange({ ...form, title })} placeholder="Titulo" style={styles.input} />
      <TextInput
        value={form.content}
        onChangeText={(content) => onChange({ ...form, content })}
        placeholder="Contenido"
        multiline
        style={[styles.input, styles.textArea]}
      />

      <Text style={styles.label}>Audiencia</Text>
      <View style={styles.segmentRow}>
        {(['public', 'clients', 'members', 'admins'] as AudienceType[]).map((audience) => (
          <Pressable key={audience} onPress={() => onChange({ ...form, audience })} style={[styles.segment, form.audience === audience && styles.segmentActive]}>
            <Text style={[styles.segmentText, form.audience === audience && styles.segmentTextActive]}>{audience}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Evento vinculado</Text>
      <View style={styles.eventPicker}>
        <Pressable onPress={() => onChange({ ...form, event_id: null })} style={[styles.eventOption, !form.event_id && styles.eventOptionActive]}>
          <Text style={[styles.eventOptionText, !form.event_id && styles.eventOptionTextActive]}>Sin evento</Text>
        </Pressable>
        {events.map((event) => (
          <Pressable key={event.id} onPress={() => onChange({ ...form, event_id: event.id })} style={[styles.eventOption, form.event_id === event.id && styles.eventOptionActive]}>
            <Text style={[styles.eventOptionText, form.event_id === event.id && styles.eventOptionTextActive]}>{event.title}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.label}>Fijado</Text>
        <Switch value={form.is_pinned} onValueChange={(is_pinned) => onChange({ ...form, is_pinned })} />
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.label}>Publicado</Text>
        <Switch value={form.is_published} onValueChange={(is_published) => onChange({ ...form, is_published })} />
      </View>
    </View>
  );
}

function ActionButton({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable style={[styles.actionButton, danger && styles.dangerButton]} onPress={onPress}>
      <Text style={[styles.actionButtonText, danger && styles.dangerButtonText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { gap: 16, padding: 20, paddingBottom: 100 },
  hero: { gap: 8, padding: 22, borderRadius: 26, backgroundColor: '#0f172a' },
  kicker: { color: '#5eead4', fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: '#ffffff', fontSize: 28, fontWeight: '900' },
  subtitle: { color: '#cbd5e1', fontSize: 14, lineHeight: 20 },
  formCard: { gap: 14, padding: 16, borderRadius: 22, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  formTitle: { color: '#0f172a', fontSize: 18, fontWeight: '900' },
  formFields: { gap: 10 },
  input: { minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', color: '#0f172a' },
  textArea: { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' },
  label: { color: '#0f172a', fontSize: 13, fontWeight: '900' },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: '#f1f5f9' },
  segmentActive: { backgroundColor: '#0f766e' },
  segmentText: { color: '#64748b', fontSize: 12, fontWeight: '900' },
  segmentTextActive: { color: '#ffffff' },
  eventPicker: { gap: 8 },
  eventOption: { padding: 12, borderRadius: 14, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  eventOptionActive: { backgroundColor: '#ccfbf1', borderColor: '#0f766e' },
  eventOptionText: { color: '#64748b', fontSize: 13, fontWeight: '800' },
  eventOptionTextActive: { color: '#0f766e' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primaryButton: { alignItems: 'center', padding: 15, borderRadius: 16, backgroundColor: '#0f766e' },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#0f172a', fontSize: 20, fontWeight: '900' },
  sectionCount: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, color: '#0f766e', backgroundColor: '#ccfbf1', fontSize: 12, fontWeight: '900' },
  muted: { color: '#64748b', fontSize: 14 },
  adminItem: { gap: 10 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionButton: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: '#e0f2fe' },
  actionButtonText: { color: '#0369a1', fontSize: 12, fontWeight: '900' },
  dangerButton: { backgroundColor: '#fee2e2' },
  dangerButtonText: { color: '#991b1b' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.55)' },
  modalCard: { maxHeight: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#ffffff' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  modalTitle: { color: '#0f172a', fontSize: 20, fontWeight: '900' },
  modalContent: { gap: 14, padding: 20, paddingBottom: 40 },
  deniedContainer: { flex: 1, gap: 10, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f8fafc' },
  deniedTitle: { color: '#991b1b', fontSize: 22, fontWeight: '900' },
  deniedText: { color: '#64748b', textAlign: 'center' },
});
