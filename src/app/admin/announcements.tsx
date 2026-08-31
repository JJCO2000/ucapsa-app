import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
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

type AnnouncementFilter = 'active' | 'drafts' | 'archived';
type FormState = {
  title: string;
  content: string;
  audience: AudienceType;
  is_pinned: boolean;
  is_published: boolean;
  event_id: string | null;
  has_date: boolean;
  date: string;
  color_key: UcapsaColorKey;
  priority: UcapsaPriority;
};

const audiences: Array<{ value: AudienceType; label: string }> = [
  { value: 'public', label: 'Todos' },
  { value: 'clients', label: 'Clientes' },
  { value: 'members', label: 'Socios' },
  { value: 'admins', label: 'Admins' },
];

const priorities: Array<{ value: UcapsaPriority; label: string }> = [
  { value: 'low', label: 'Baja' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

const colors: Array<{ value: UcapsaColorKey; label: string }> = [
  { value: 'red', label: 'Rojo' },
  { value: 'blue', label: 'Azul' },
  { value: 'yellow', label: 'Amarillo' },
  { value: 'green', label: 'Verde' },
  { value: 'purple', label: 'Morado' },
  { value: 'gray', label: 'Gris' },
];

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayKey() {
  return localDateKey();
}

function emptyForm(): FormState {
  return {
    title: '',
    content: '',
    audience: 'public',
    is_pinned: false,
    is_published: true,
    event_id: null,
    has_date: false,
    date: todayKey(),
    color_key: 'red',
    priority: 'normal',
  };
}

function dateKey(value: string | null | undefined) {
  if (!value) return todayKey();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? todayKey() : localDateKey(date);
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${dateKey(value)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusLabel(item: Announcement) {
  if (item.archived_at) return 'Archivado';
  return item.is_published ? 'Publicado' : 'Borrador';
}

export default function AdminAnnouncementsScreen() {
  const { isAdmin } = useSession();
  const params = useLocalSearchParams<{ announcementId?: string }>();
  const openedParam = useRef<string | null>(null);
  const [items, setItems] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<UcapsaEvent[]>([]);
  const [filter, setFilter] = useState<AnnouncementFilter>('active');
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editorOpen, setEditorOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [eventSearch, setEventSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(8);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [announcementResult, eventResult] = await Promise.all([getAdminAnnouncements(), getAdminEvents()]);
      setItems(announcementResult);
      setEvents(eventResult);
    } catch (cause) {
      Alert.alert('No se pudieron cargar anuncios', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  useEffect(() => {
    if (!params.announcementId || openedParam.current === params.announcementId || items.length === 0) return;
    const target = items.find((item) => item.id === params.announcementId);
    if (!target) return;
    openedParam.current = params.announcementId;
    openEdit(target);
  }, [items, params.announcementId]);

  const filtered = useMemo(() => items.filter((item) => {
    if (filter === 'archived') return Boolean(item.archived_at);
    if (item.archived_at) return false;
    if (filter === 'drafts') return !item.is_published;
    return item.is_published;
  }), [filter, items]);

  const filteredEvents = useMemo(() => {
    const term = eventSearch.trim().toLowerCase();
    return events
      .filter((event) => !event.archived_at)
      .filter((event) => !term || `${event.title} ${event.location ?? ''}`.toLowerCase().includes(term))
      .slice(0, 6);
  }, [eventSearch, events]);

  const selectedEvent = events.find((event) => event.id === form.event_id) ?? null;

  function openNew() {
    setSelected(null);
    setForm(emptyForm());
    setCalendarOpen(false);
    setOptionsOpen(false);
    setEventsOpen(false);
    setEventSearch('');
    setEditorOpen(true);
  }

  function openEdit(item: Announcement) {
    setSelected(item);
    setForm({
      title: item.title,
      content: item.content,
      audience: item.audience,
      is_pinned: item.is_pinned,
      is_published: item.is_published,
      event_id: item.event_id,
      has_date: Boolean(item.announcement_date),
      date: dateKey(item.announcement_date),
      color_key: item.color_key ?? 'red',
      priority: item.priority ?? 'normal',
    });
    setCalendarOpen(false);
    setOptionsOpen(false);
    setEventsOpen(false);
    setEventSearch('');
    setEditorOpen(true);
  }

  async function save() {
    if (!form.title.trim() || !form.content.trim()) {
      Alert.alert('Faltan datos', 'Agrega titulo y contenido.');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        title: form.title,
        content: form.content,
        audience: form.audience,
        is_pinned: form.is_pinned,
        is_published: form.is_published,
        event_id: form.event_id,
        announcement_date: form.has_date ? `${form.date}T12:00:00.000Z` : null,
        color_key: form.color_key,
        priority: form.priority,
      };
      if (selected) await updateAnnouncement(selected.id, payload);
      else await createAnnouncement(payload);
      setEditorOpen(false);
      await load();
    } catch (cause) {
      Alert.alert('No se pudo guardar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function run(action: () => Promise<void>) {
    try {
      setSaving(true);
      await action();
      setEditorOpen(false);
      await load();
    } catch (cause) {
      Alert.alert('No se pudo completar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function askDelete(item: Announcement) {
    try {
      setSaving(true);
      const cancellation = await getProgramClassCancellationByAnnouncementId(item.id);
      setSaving(false);
      if (cancellation && !cancellation.restored_at) {
        Alert.alert('Anuncio ligado a una cancelacion', 'Primero administra la cancelacion de la clase.', [
          { text: 'Cerrar', style: 'cancel' },
          { text: 'Ir a cancelaciones', onPress: () => router.push(`/admin/class-cancellations?date=${cancellation.cancellation_date}` as never) },
        ]);
        return;
      }
      Alert.alert('Eliminar anuncio', 'Esta accion no se puede deshacer.', [
        { text: 'Volver', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => void run(() => deleteAnnouncement(item.id)) },
      ]);
    } catch (cause) {
      setSaving(false);
      Alert.alert('No se pudo revisar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    }
  }

  if (!isAdmin) return <KeyboardAwareScreen><Text style={styles.title}>Acceso restringido</Text></KeyboardAwareScreen>;

  return (
    <KeyboardAwareScreen>
      <View style={styles.hero}>
        <View style={{ flex: 1 }}><Text style={styles.kicker}>Comunicacion</Text><Text style={styles.title}>Anuncios</Text><Text style={styles.subtitle}>Lista primero. El formulario solo aparece cuando lo necesitas.</Text></View>
        <Pressable style={styles.addButton} onPress={openNew}><MaterialIcons name="add" size={21} color={ucapsaBrand.colors.surface} /><Text style={styles.addText}>Nuevo</Text></Pressable>
      </View>

      <View style={styles.tabs}>
        <FilterChip label="Publicados" active={filter === 'active'} onPress={() => { setFilter('active'); setVisibleCount(8); }} />
        <FilterChip label="Borradores" active={filter === 'drafts'} onPress={() => { setFilter('drafts'); setVisibleCount(8); }} />
        <FilterChip label="Archivados" active={filter === 'archived'} onPress={() => { setFilter('archived'); setVisibleCount(8); }} />
      </View>

      {loading ? <Text style={styles.muted}>Cargando anuncios...</Text> : null}
      {!loading && filtered.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>Nada aqui</Text><Text style={styles.muted}>No hay anuncios en esta vista.</Text></View> : null}

      <View style={styles.list}>
        {filtered.slice(0, visibleCount).map((item, index) => (
          <Pressable key={item.id} style={[styles.row, index === Math.min(filtered.length, visibleCount) - 1 && styles.rowLast]} onPress={() => openEdit(item)}>
            <View style={styles.rowIcon}><MaterialIcons name="campaign" size={20} color={ucapsaBrand.colors.redDark} /></View>
            <View style={{ flex: 1 }}>
              <View style={styles.rowTitleLine}><Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text><Text style={styles.status}>{statusLabel(item)}</Text></View>
              <Text numberOfLines={2} style={styles.rowText}>{item.content}</Text>
              <Text style={styles.rowMeta}>{item.announcement_date ? formatDate(item.announcement_date) : 'Sin fecha'} - {audiences.find((option) => option.value === item.audience)?.label ?? item.audience}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.redDark} />
          </Pressable>
        ))}
      </View>
      {filtered.length > visibleCount ? <Pressable style={styles.moreButton} onPress={() => setVisibleCount((count) => count + 8)}><Text style={styles.moreText}>Ver 8 mas</Text></Pressable> : null}

      <KeyboardAwareModal visible={editorOpen} onClose={() => setEditorOpen(false)}>
        <Text style={styles.modalKicker}>Anuncio</Text>
        <Text style={styles.modalTitle}>{selected ? 'Editar anuncio' : 'Nuevo anuncio'}</Text>

        <Text style={styles.label}>Titulo</Text>
        <TextInput value={form.title} onChangeText={(title) => setForm((current) => ({ ...current, title }))} placeholder="Titulo corto" style={styles.input} />
        <Text style={styles.label}>Mensaje</Text>
        <TextInput value={form.content} onChangeText={(content) => setForm((current) => ({ ...current, content }))} placeholder="Que necesita saber el cliente" multiline style={[styles.input, styles.textArea]} />

        <Text style={styles.label}>Para quien</Text>
        <View style={styles.wrapRow}>{audiences.map((option) => <Choice key={option.value} label={option.label} active={form.audience === option.value} onPress={() => setForm((current) => ({ ...current, audience: option.value }))} />)}</View>

        <View style={styles.switchLine}>
          <View style={{ flex: 1 }}><Text style={styles.label}>Fecha</Text><Text style={styles.modalHint}>Opcional. Sirve para agenda y contexto.</Text></View>
          <Switch value={form.has_date} onValueChange={(has_date) => setForm((current) => ({ ...current, has_date }))} />
        </View>
        {form.has_date ? <Pressable style={styles.dateButton} onPress={() => setCalendarOpen((value) => !value)}><Text style={styles.dateText}>{formatDate(form.date)}</Text><MaterialIcons name="event" size={19} color={ucapsaBrand.colors.redDark} /></Pressable> : null}
        {form.has_date && calendarOpen ? <View style={styles.calendarBox}><Calendar current={form.date} markedDates={{ [form.date]: { selected: true, selectedColor: ucapsaBrand.colors.red } }} onDayPress={(day) => { setForm((current) => ({ ...current, date: day.dateString })); setCalendarOpen(false); }} theme={{ todayTextColor: ucapsaBrand.colors.red, arrowColor: ucapsaBrand.colors.red }} /></View> : null}

        <Pressable style={styles.sectionToggle} onPress={() => setOptionsOpen((value) => !value)}><Text style={styles.sectionToggleText}>Opciones</Text><MaterialIcons name={optionsOpen ? 'expand-less' : 'expand-more'} size={21} color={ucapsaBrand.colors.surface} /></Pressable>
        {optionsOpen ? (
          <View style={styles.optionsBox}>
            <Text style={styles.labelDark}>Prioridad</Text>
            <View style={styles.wrapRow}>{priorities.map((option) => <ChoiceLight key={option.value} label={option.label} active={form.priority === option.value} onPress={() => setForm((current) => ({ ...current, priority: option.value }))} />)}</View>
            <Text style={styles.labelDark}>Color</Text>
            <View style={styles.wrapRow}>{colors.map((option) => <ChoiceLight key={option.value} label={option.label} active={form.color_key === option.value} onPress={() => setForm((current) => ({ ...current, color_key: option.value }))} />)}</View>

            <Pressable style={styles.eventPicker} onPress={() => setEventsOpen((value) => !value)}><View style={{ flex: 1 }}><Text style={styles.labelDark}>Evento vinculado</Text><Text style={styles.optionText}>{selectedEvent?.title ?? 'Sin evento'}</Text></View><MaterialIcons name={eventsOpen ? 'expand-less' : 'expand-more'} size={21} color={ucapsaBrand.colors.redDark} /></Pressable>
            {eventsOpen ? (
              <View style={styles.eventList}>
                <TextInput value={eventSearch} onChangeText={setEventSearch} placeholder="Buscar evento" style={styles.inputLight} />
                <Pressable style={styles.eventRow} onPress={() => { setForm((current) => ({ ...current, event_id: null })); setEventsOpen(false); }}><Text style={styles.optionText}>Sin evento</Text></Pressable>
                {filteredEvents.map((event) => <Pressable key={event.id} style={styles.eventRow} onPress={() => { setForm((current) => ({ ...current, event_id: event.id })); setEventsOpen(false); }}><Text style={styles.optionText}>{event.title}</Text></Pressable>)}
              </View>
            ) : null}

            <View style={styles.switchLineLight}><Text style={styles.labelDark}>Fijado</Text><Switch value={form.is_pinned} onValueChange={(is_pinned) => setForm((current) => ({ ...current, is_pinned }))} /></View>
            <View style={styles.switchLineLight}><Text style={styles.labelDark}>Publicado</Text><Switch value={form.is_published} onValueChange={(is_published) => setForm((current) => ({ ...current, is_published }))} /></View>
          </View>
        ) : null}

        <Pressable disabled={saving} style={[styles.primary, saving && styles.disabled]} onPress={() => void save()}><Text style={styles.primaryText}>{saving ? 'Guardando...' : 'Guardar anuncio'}</Text></Pressable>

        {selected ? (
          <View style={styles.actionRow}>
            {!selected.archived_at ? <Pressable disabled={saving} style={styles.secondaryAction} onPress={() => void run(() => setAnnouncementPublished(selected.id, !selected.is_published))}><Text style={styles.secondaryActionText}>{selected.is_published ? 'Pasar a borrador' : 'Publicar'}</Text></Pressable> : null}
            <Pressable disabled={saving} style={styles.secondaryAction} onPress={() => void run(() => selected.archived_at ? restoreAnnouncement(selected.id) : archiveAnnouncement(selected.id))}><Text style={styles.secondaryActionText}>{selected.archived_at ? 'Restaurar' : 'Archivar'}</Text></Pressable>
            <Pressable disabled={saving} style={styles.dangerAction} onPress={() => void askDelete(selected)}><Text style={styles.dangerActionText}>Eliminar</Text></Pressable>
          </View>
        ) : null}
        <Pressable disabled={saving} style={styles.closeButton} onPress={() => setEditorOpen(false)}><Text style={styles.closeText}>Cerrar</Text></Pressable>
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable style={[styles.filterChip, active && styles.filterChipActive]} onPress={onPress}><Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text></Pressable>;
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable style={[styles.choice, active && styles.choiceActive]} onPress={onPress}><Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text></Pressable>;
}

function ChoiceLight({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable style={[styles.choiceLight, active && styles.choiceLightActive]} onPress={onPress}><Text style={[styles.choiceLightText, active && styles.choiceLightTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 3 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 12, paddingVertical: 10 },
  addText: { color: ucapsaBrand.colors.surface, fontSize: 12, fontWeight: '900' },
  tabs: { flexDirection: 'row', gap: 7, marginBottom: 12 },
  filterChip: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 11, paddingVertical: 8 },
  filterChipActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  filterChipText: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900' },
  filterChipTextActive: { color: ucapsaBrand.colors.surface },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 5, padding: 28 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  list: { borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rowTitle: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  status: { color: ucapsaBrand.colors.redDark, fontSize: 9, fontWeight: '900', backgroundColor: ucapsaBrand.colors.redSoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  rowText: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  rowMeta: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3, fontWeight: '700' },
  moreButton: { alignItems: 'center', paddingVertical: 11 },
  moreText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  modalKicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 23, fontWeight: '900', marginBottom: 5 },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 9, marginBottom: 5 },
  modalHint: { color: ucapsaBrand.colors.dangerBorder, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  input: { borderRadius: 14, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, paddingVertical: 11, color: ucapsaBrand.colors.text },
  textArea: { minHeight: 92, textAlignVertical: 'top' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 10, paddingVertical: 8 },
  choiceActive: { backgroundColor: ucapsaBrand.colors.redSoft, borderColor: ucapsaBrand.colors.red },
  choiceText: { color: ucapsaBrand.colors.text, fontSize: 10, fontWeight: '900' },
  choiceTextActive: { color: ucapsaBrand.colors.redDark },
  switchLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  dateButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 14, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  dateText: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  calendarBox: { overflow: 'hidden', borderRadius: 16, marginTop: 7 },
  sectionToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, marginTop: 3 },
  sectionToggleText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  optionsBox: { gap: 6, borderRadius: 16, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  labelDark: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900', marginTop: 4 },
  choiceLight: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.background, paddingHorizontal: 9, paddingVertical: 7 },
  choiceLightActive: { backgroundColor: ucapsaBrand.colors.redSoft, borderColor: ucapsaBrand.colors.red },
  choiceLightText: { color: ucapsaBrand.colors.text, fontSize: 9, fontWeight: '900' },
  choiceLightTextActive: { color: ucapsaBrand.colors.redDark },
  eventPicker: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, backgroundColor: ucapsaBrand.colors.background, padding: 10, marginTop: 5 },
  optionText: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '800', marginTop: 2 },
  eventList: { gap: 5, borderRadius: 12, backgroundColor: ucapsaBrand.colors.background, padding: 8 },
  inputLight: { borderRadius: 11, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 10, paddingVertical: 9, color: ucapsaBrand.colors.text },
  eventRow: { borderRadius: 10, backgroundColor: ucapsaBrand.colors.surface, padding: 9 },
  switchLineLight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  primary: { alignItems: 'center', borderRadius: 14, backgroundColor: ucapsaBrand.colors.red, paddingVertical: 13, marginTop: 9 },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  secondaryAction: { borderRadius: 11, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 10, paddingVertical: 8 },
  secondaryActionText: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900' },
  dangerAction: { borderRadius: 11, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, paddingHorizontal: 10, paddingVertical: 8 },
  dangerActionText: { color: ucapsaBrand.colors.surface, fontSize: 10, fontWeight: '900' },
  closeButton: { alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, paddingVertical: 11, marginTop: 7 },
  closeText: { color: ucapsaBrand.colors.surface, fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.5 },
});
