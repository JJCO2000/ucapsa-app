import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

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
import { getProgramClassCancellationByAnnouncementId } from '../../services/programs.service';
import type { Announcement, AudienceType, UcapsaColorKey, UcapsaEvent, UcapsaPriority } from '../../types/app.types';

type AnnouncementFormState = {
  title: string;
  content: string;
  audience: AudienceType;
  is_pinned: boolean;
  is_published: boolean;
  event_id: string | null;
  has_announcement_date: boolean;
  announcement_date_day: string;
  color_key: UcapsaColorKey;
  priority: UcapsaPriority;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function dateKeyFromIso(value: string | null | undefined) {
  if (!value) return todayKey();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return todayKey();
  return date.toISOString().slice(0, 10);
}

function formatDateKeyLabel(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'Elegir fecha';
  const date = new Date(`${day}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return 'Elegir fecha';
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildAnnouncementDateIso(day: string, enabled: boolean) {
  if (!enabled) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('La fecha del anuncio debe tener formato AAAA-MM-DD.');
  return `${day}T12:00:00.000Z`;
}

function createEmptyForm(): AnnouncementFormState {
  return {
    title: '',
    content: '',
    audience: 'public',
    is_pinned: false,
    is_published: true,
    event_id: null,
    has_announcement_date: false,
    announcement_date_day: todayKey(),
    color_key: 'red',
    priority: 'normal',
  };
}

function formToPayload(form: AnnouncementFormState) {
  return {
    title: form.title,
    content: form.content,
    audience: form.audience,
    is_pinned: form.is_pinned,
    is_published: form.is_published,
    event_id: form.event_id,
    announcement_date: buildAnnouncementDateIso(form.announcement_date_day, form.has_announcement_date),
    color_key: form.color_key,
    priority: form.priority,
  };
}

const colorOptions: Array<{ value: UcapsaColorKey; label: string }> = [
  { value: 'red', label: 'Rojo' },
  { value: 'blue', label: 'Azul' },
  { value: 'yellow', label: 'Amarillo' },
  { value: 'green', label: 'Verde' },
  { value: 'purple', label: 'Morado' },
  { value: 'gray', label: 'Gris' },
];

const priorityOptions: Array<{ value: UcapsaPriority; label: string }> = [
  { value: 'low', label: 'Baja' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

const audienceLabels: Record<AudienceType, string> = {
  public: 'Publico',
  clients: 'Clientes',
  members: 'Socios',
  admins: 'Admins',
};

export default function AdminAnnouncementsScreen() {
  const { isAdmin } = useSession();
  const params = useLocalSearchParams<{ announcementId?: string }>();
  const openedAnnouncementParamRef = useRef<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<UcapsaEvent[]>([]);
  const [form, setForm] = useState<AnnouncementFormState>(() => createEmptyForm());
  const [editForm, setEditForm] = useState<AnnouncementFormState>(() => createEmptyForm());
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [announcementResult, eventResult] = await Promise.all([getAdminAnnouncements(), getAdminEvents()]);
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

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void loadData();
      return undefined;
    }, [isAdmin]),
  );

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
      has_announcement_date: Boolean(announcement.announcement_date),
      announcement_date_day: dateKeyFromIso(announcement.announcement_date),
      color_key: announcement.color_key ?? 'red',
      priority: announcement.priority ?? 'normal',
    });
  }

  function validateForm(value: AnnouncementFormState) {
    if (!value.title.trim()) throw new Error('El titulo es obligatorio.');
    if (!value.content.trim()) throw new Error('El contenido es obligatorio.');
    buildAnnouncementDateIso(value.announcement_date_day, value.has_announcement_date);
  }

  async function handleCreate() {
    try {
      validateForm(form);
      setSaving(true);
      await createAnnouncement(formToPayload(form));
      setForm(createEmptyForm());
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
      await updateAnnouncement(selectedAnnouncement.id, formToPayload(editForm));
      setSelectedAnnouncement(null);
      await loadData();
    } catch (err) {
      Alert.alert('No se pudo actualizar', err instanceof Error ? err.message : 'Error desconocido.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAnnouncement(announcement: Announcement) {
    try {
      setSaving(true);
      const cancellation = await getProgramClassCancellationByAnnouncementId(announcement.id);
      setSaving(false);

      if (cancellation && !cancellation.restored_at) {
        Alert.alert(
          'Anuncio de clase cancelada',
          'Este anuncio esta ligado a una clase cancelada. Para reactivar o eliminar la cancelacion, ve a Cancelaciones activas.',
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Ir a cancelaciones',
              onPress: () => router.push(`/admin/classes?cancellations=1&date=${cancellation.cancellation_date}` as never),
            },
          ],
        );
        return;
      }

      Alert.alert('Eliminar anuncio', 'Esta accion no se puede deshacer.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => runAction(() => deleteAnnouncement(announcement.id)) },
      ]);
    } catch (err) {
      setSaving(false);
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo revisar el anuncio.');
    }
  }

  async function runAction(action: () => Promise<void>) {
    try {
      setSaving(true);
      await action();
      await loadData();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo completar la accion.');
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <View style={styles.deniedContainer}>
        <MaterialIcons name="lock" size={42} color="#8F1324" />
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
        <Text style={styles.subtitle}>Gestiona comunicados, fecha opcional y vinculo con calendario.</Text>
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
            <ActionButton label={announcement.is_published ? 'Despublicar' : 'Publicar'} onPress={() => runAction(() => setAnnouncementPublished(announcement.id, !announcement.is_published))} />
            <ActionButton label={announcement.archived_at ? 'Restaurar' : 'Archivar'} onPress={() => runAction(() => announcement.archived_at ? restoreAnnouncement(announcement.id) : archiveAnnouncement(announcement.id))} />
            <ActionButton
              label="Eliminar"
              danger
              onPress={() => handleDeleteAnnouncement(announcement)}
            />
          </View>
        </View>
      ))}

      <Modal visible={Boolean(selectedAnnouncement)} transparent animationType="slide" onRequestClose={() => setSelectedAnnouncement(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar anuncio</Text>
              <Pressable onPress={() => setSelectedAnnouncement(null)}>
                <MaterialIcons name="close" size={26} color="#25151A" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <AnnouncementForm form={editForm} events={events} onChange={setEditForm} />
              <Pressable disabled={saving} style={styles.primaryButton} onPress={handleUpdate}>
                <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar cambios'}</Text>
              </Pressable>

              {selectedAnnouncement ? (
                <View style={styles.modalActionsGrid}>
                  <ActionButton
                    label={selectedAnnouncement.is_published ? 'Despublicar' : 'Publicar'}
                    onPress={() => runAction(() => setAnnouncementPublished(selectedAnnouncement.id, !selectedAnnouncement.is_published))}
                  />
                  <ActionButton
                    label={selectedAnnouncement.archived_at ? 'Restaurar' : 'Archivar'}
                    onPress={() => runAction(() => selectedAnnouncement.archived_at ? restoreAnnouncement(selectedAnnouncement.id) : archiveAnnouncement(selectedAnnouncement.id))}
                  />
                  <ActionButton
                    label="Eliminar"
                    danger
                    onPress={() => handleDeleteAnnouncement(selectedAnnouncement)}
                  />
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function AnnouncementForm({ form, events, onChange }: { form: AnnouncementFormState; events: UcapsaEvent[]; onChange: (form: AnnouncementFormState) => void }) {
  const [eventPickerOpen, setEventPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [eventSearch, setEventSearch] = useState('');
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [priorityPickerOpen, setPriorityPickerOpen] = useState(false);
  const selectedColor = colorOptions.find((option) => option.value === form.color_key)?.label ?? 'Rojo';
  const selectedPriority = priorityOptions.find((option) => option.value === form.priority)?.label ?? 'Normal';
  const selectedEvent = useMemo(() => events.find((event) => event.id === form.event_id) ?? null, [events, form.event_id]);
  const filteredEvents = useMemo(() => {
    const term = eventSearch.trim().toLowerCase();
    const base = term
      ? events.filter((event) => `${event.title} ${event.description ?? ''} ${event.location ?? ''}`.toLowerCase().includes(term))
      : events;
    return base.slice(0, 5);
  }, [events, eventSearch]);

  return (
    <View style={styles.formFields}>
      <TextInput value={form.title} onChangeText={(title) => onChange({ ...form, title })} placeholder="Titulo" style={styles.input} />
      <TextInput value={form.content} onChangeText={(content) => onChange({ ...form, content })} placeholder="Contenido" multiline style={[styles.input, styles.textArea]} />

      <Text style={styles.label}>Audiencia</Text>
      <View style={styles.segmentRow}>
        {(['public', 'clients', 'members', 'admins'] as AudienceType[]).map((audience) => (
          <Pressable key={audience} onPress={() => onChange({ ...form, audience })} style={[styles.segment, form.audience === audience && styles.segmentActive]}>
            <Text style={[styles.segmentText, form.audience === audience && styles.segmentTextActive]}>{audienceLabels[audience]}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Color del anuncio</Text>
      <Pressable style={styles.dropdownButton} onPress={() => { setColorPickerOpen((current) => !current); setPriorityPickerOpen(false); setEventPickerOpen(false); }}>
        <Text style={styles.dropdownButtonText}>{selectedColor}</Text>
        <MaterialIcons name={colorPickerOpen ? 'expand-less' : 'expand-more'} size={22} color="#8F1324" />
      </Pressable>
      {colorPickerOpen ? (
        <View style={styles.eventDropdown}>
          {colorOptions.map((option) => (
            <Pressable key={option.value} onPress={() => { onChange({ ...form, color_key: option.value }); setColorPickerOpen(false); }} style={[styles.eventOption, form.color_key === option.value && styles.eventOptionActive]}>
              <Text style={[styles.eventOptionText, form.color_key === option.value && styles.eventOptionTextActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={styles.label}>Prioridad</Text>
      <Pressable style={styles.dropdownButton} onPress={() => { setPriorityPickerOpen((current) => !current); setColorPickerOpen(false); setEventPickerOpen(false); }}>
        <Text style={styles.dropdownButtonText}>{selectedPriority}</Text>
        <MaterialIcons name={priorityPickerOpen ? 'expand-less' : 'expand-more'} size={22} color="#8F1324" />
      </Pressable>
      {priorityPickerOpen ? (
        <View style={styles.eventDropdown}>
          {priorityOptions.map((option) => (
            <Pressable key={option.value} onPress={() => { onChange({ ...form, priority: option.value }); setPriorityPickerOpen(false); }} style={[styles.eventOption, form.priority === option.value && styles.eventOptionActive]}>
              <Text style={[styles.eventOptionText, form.priority === option.value && styles.eventOptionTextActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Fecha del anuncio</Text>
          <Text style={styles.hint}>Opcional. Si la activas, aparecera en la tarjeta.</Text>
        </View>
        <Switch value={form.has_announcement_date} onValueChange={(has_announcement_date) => { onChange({ ...form, has_announcement_date }); if (has_announcement_date) setDatePickerOpen(true); }} />
      </View>

      {form.has_announcement_date ? (
        <Pressable style={styles.dateButton} onPress={() => setDatePickerOpen(true)}>
          <Text style={styles.dateButtonText}>{formatDateKeyLabel(form.announcement_date_day)}</Text>
          <MaterialIcons name="event" size={20} color="#8F1324" />
        </Pressable>
      ) : null}

      <DatePickerModal
        visible={datePickerOpen}
        value={form.announcement_date_day}
        onSelect={(announcement_date_day) => {
          onChange({ ...form, announcement_date_day, has_announcement_date: true });
          setDatePickerOpen(false);
        }}
        onClose={() => setDatePickerOpen(false)}
      />

      <Text style={styles.label}>Evento vinculado</Text>
      <Pressable style={styles.dropdownButton} onPress={() => setEventPickerOpen((current) => !current)}>
        <Text style={styles.dropdownButtonText}>{selectedEvent ? selectedEvent.title : 'Sin evento vinculado'}</Text>
        <MaterialIcons name={eventPickerOpen ? 'expand-less' : 'expand-more'} size={22} color="#8F1324" />
      </Pressable>

      {eventPickerOpen ? (
        <View style={styles.eventDropdown}>
          <TextInput value={eventSearch} onChangeText={setEventSearch} placeholder="Buscar evento..." style={styles.searchInput} />
          <Pressable onPress={() => { onChange({ ...form, event_id: null }); setEventPickerOpen(false); }} style={[styles.eventOption, !form.event_id && styles.eventOptionActive]}>
            <Text style={[styles.eventOptionText, !form.event_id && styles.eventOptionTextActive]}>Sin evento</Text>
          </Pressable>
          {filteredEvents.map((event) => (
            <Pressable key={event.id} onPress={() => { onChange({ ...form, event_id: event.id }); setEventPickerOpen(false); }} style={[styles.eventOption, form.event_id === event.id && styles.eventOptionActive]}>
              <Text numberOfLines={1} style={[styles.eventOptionText, form.event_id === event.id && styles.eventOptionTextActive]}>{event.title}</Text>
            </Pressable>
          ))}
          {events.length > 5 ? <Text style={styles.hint}>Se muestran maximo 5 resultados. Usa busqueda para encontrar otros.</Text> : null}
        </View>
      ) : null}

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


function DatePickerModal({ visible, value, onSelect, onClose }: { visible: boolean; value: string; onSelect: (value: string) => void; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.dateModalBackdrop}>
        <View style={styles.dateModalCard}>
          <Text style={styles.dateModalTitle}>Fecha del anuncio</Text>
          <Calendar
            current={value || todayKey()}
            markedDates={value ? { [value]: { selected: true, selectedColor: '#C91F37' } } : {}}
            onDayPress={(day) => onSelect(day.dateString)}
            theme={{ todayTextColor: '#C91F37', arrowColor: '#C91F37' }}
          />
          <Pressable onPress={onClose} style={styles.secondaryButtonFull}>
            <Text style={styles.secondaryButtonFullText}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
  container: { flex: 1, backgroundColor: '#FFF8F8' },
  content: { gap: 16, padding: 20, paddingBottom: 100 },
  hero: { gap: 8, padding: 22, borderRadius: 26, backgroundColor: '#25151A' },
  kicker: { color: '#FFE8EC', fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: '#ffffff', fontSize: 28, fontWeight: '900' },
  subtitle: { color: '#F0D4DA', fontSize: 14, lineHeight: 20 },
  formCard: { gap: 14, padding: 16, borderRadius: 22, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#F0D4DA' },
  formTitle: { color: '#25151A', fontSize: 18, fontWeight: '900' },
  formFields: { gap: 10 },
  input: { minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#FFF8F8', borderWidth: 1, borderColor: '#F0D4DA', color: '#25151A' },
  searchInput: { minHeight: 44, paddingHorizontal: 12, borderRadius: 13, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#F0D4DA', color: '#25151A' },
  textArea: { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' },
  label: { color: '#25151A', fontSize: 13, fontWeight: '900' },
  hint: { color: '#70545E', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: '#F6E6E9' },
  segmentActive: { backgroundColor: '#C91F37' },
  segmentText: { color: '#70545E', fontSize: 12, fontWeight: '900' },
  segmentTextActive: { color: '#ffffff' },
  dropdownButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#FFF8F8', borderWidth: 1, borderColor: '#F0D4DA' },
  dropdownButtonText: { flex: 1, color: '#25151A', fontSize: 13, fontWeight: '900' },
  eventDropdown: { gap: 8, padding: 10, borderRadius: 16, backgroundColor: '#FFF8F8', borderWidth: 1, borderColor: '#F0D4DA' },
  eventOption: { padding: 12, borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#F0D4DA' },
  eventOptionActive: { backgroundColor: '#FFE8EC', borderColor: '#C91F37' },
  eventOptionText: { color: '#70545E', fontSize: 13, fontWeight: '800' },
  eventOptionTextActive: { color: '#C91F37' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  primaryButton: { alignItems: 'center', padding: 15, borderRadius: 16, backgroundColor: '#C91F37' },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#25151A', fontSize: 20, fontWeight: '900' },
  sectionCount: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, color: '#C91F37', backgroundColor: '#FFE8EC', fontSize: 12, fontWeight: '900' },
  muted: { color: '#70545E', fontSize: 14 },
  adminItem: { gap: 10 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modalActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionButton: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#F0D4DA' },
  actionButtonText: { color: '#8F1324', fontSize: 12, fontWeight: '900' },
  dangerButton: { backgroundColor: '#FFF1F2', borderColor: '#F7CAD2' },
  dangerButtonText: { color: '#8F1324' },
  dangerFullButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 15, borderRadius: 16, backgroundColor: '#FFF1F2', borderWidth: 1, borderColor: '#F7CAD2' },
  dangerFullButtonText: { color: '#8F1324', fontSize: 15, fontWeight: '900' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.55)' },
  modalCard: { maxHeight: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#ffffff' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F0D4DA' },
  modalTitle: { color: '#25151A', fontSize: 20, fontWeight: '900' },
  modalContent: { gap: 14, padding: 20, paddingBottom: 40 },
  deniedContainer: { flex: 1, gap: 10, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#FFF8F8' },
  deniedTitle: { color: '#8F1324', fontSize: 22, fontWeight: '900' },
  deniedText: { color: '#70545E', textAlign: 'center' },

  dateButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#FFF8F8', borderWidth: 1, borderColor: '#F0D4DA' },
  dateButtonText: { color: '#25151A', fontSize: 13, fontWeight: '900' },
  dateModalBackdrop: { flex: 1, backgroundColor: 'rgba(37, 21, 26, 0.45)', justifyContent: 'center', padding: 18 },
  dateModalCard: { backgroundColor: '#fff', borderRadius: 24, padding: 16, borderWidth: 1, borderColor: '#F0D4DA' },
  dateModalTitle: { color: '#25151A', fontSize: 18, fontWeight: '900', marginBottom: 10 },
  secondaryButtonFull: { alignItems: 'center', borderRadius: 16, paddingVertical: 13, backgroundColor: '#25151A', marginTop: 12 },
  secondaryButtonFullText: { color: '#fff', fontSize: 14, fontWeight: '900' },
});



