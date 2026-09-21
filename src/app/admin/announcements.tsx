import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  getAnnouncementReminders,
  saveAnnouncementReminders,
  type AnnouncementReminderSetting,
} from '../../services/announcement-reminders.service';
import {
  archiveAnnouncement,
  createAnnouncement,
  getAdminAnnouncements,
  restoreAnnouncement,
  setAnnouncementPublished,
  updateAnnouncement,
} from '../../services/announcements.service';
import { getAdminEvents } from '../../services/events.service';
import { getProgramClassCancellationByAnnouncementId } from '../../services/programs.service';
import type { Announcement, AudienceType, UcapsaColorKey, UcapsaEvent, UcapsaPriority } from '../../types/app.types';
import { parseDateKey, toDateKey, todayKey } from '../../utils/events.utils';

type AnnouncementFilter = 'active' | 'drafts' | 'archived';
type ReminderLoadState = 'idle' | 'loading' | 'ready' | 'failed';
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
  reminders_enabled: boolean;
  reminder_days: number[];
  reminder_time: string;
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

const reminderPresets = [0, 1, 3, 7];

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
    reminders_enabled: false,
    reminder_days: [1],
    reminder_time: '09:00',
  };
}

function dateKey(value: string | null | undefined) {
  return toDateKey(value) ?? todayKey();
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const key = toDateKey(value);
  const date = key ? parseDateKey(key) : null;
  return date
    ? date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    : String(value);
}

function statusLabel(item: Announcement) {
  if (item.archived_at) return 'Archivado';
  return item.is_published ? 'Publicado' : 'Borrador';
}

function parseTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function reminderSummary(form: FormState) {
  if (!form.reminders_enabled) return 'Sin recordatorio';
  const sorted = [...form.reminder_days].sort((a, b) => b - a);
  return `${sorted.map((days) => days === 0 ? 'mismo día' : `${days} día${days === 1 ? '' : 's'} antes`).join(' + ')} · ${form.reminder_time}`;
}

export default function AdminAnnouncementsScreen() {
  const params = useLocalSearchParams<{ announcementId?: string; intent?: string }>();
  const openedParam = useRef<string | null>(null);
  const handledIntent = useRef(false);
  const [items, setItems] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<UcapsaEvent[]>([]);
  const [filter, setFilter] = useState<AnnouncementFilter>('active');
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editorOpen, setEditorOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [customDays, setCustomDays] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reminderLoadState, setReminderLoadState] = useState<ReminderLoadState>('idle');

  const load = useCallback(async () => {
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
  }, []);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  useEffect(() => {
    if (params.intent !== 'new' || handledIntent.current) return;
    handledIntent.current = true;
    openNew();
  }, [params.intent]);

  useEffect(() => {
    if (!params.announcementId || openedParam.current === params.announcementId || items.length === 0) return;
    const target = items.find((item) => item.id === params.announcementId);
    if (!target) return;
    openedParam.current = params.announcementId;
    void openEdit(target);
  }, [items, params.announcementId]);

  const filtered = useMemo(() => items.filter((item) => {
    if (filter === 'archived') return Boolean(item.archived_at);
    if (item.archived_at) return false;
    if (filter === 'drafts') return !item.is_published;
    return item.is_published;
  }), [filter, items]);

  function openNew() {
    setSelected(null);
    setForm(emptyForm());
    setCalendarOpen(false);
    setOptionsOpen(false);
    setCustomDays('');
    setReminderLoadState('ready');
    setEditorOpen(true);
  }

  async function loadReminderSettings(item: Announcement) {
    setReminderLoadState('loading');
    try {
      const reminders = await getAnnouncementReminders(item.id);
      const first = reminders[0];
      setForm((current) => ({
        ...current,
        reminders_enabled: reminders.length > 0,
        reminder_days: reminders.length
          ? reminders.map((reminder) => reminder.days_before).filter((value, index, all) => all.indexOf(value) === index)
          : [1],
        reminder_time: first
          ? `${String(first.hour).padStart(2, '0')}:${String(first.minute).padStart(2, '0')}`
          : '09:00',
      }));
      setReminderLoadState('ready');
    } catch {
      setReminderLoadState('failed');
    }
  }

  async function openEdit(item: Announcement) {
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
      reminders_enabled: false,
      reminder_days: [1],
      reminder_time: '09:00',
    });
    setCalendarOpen(false);
    setOptionsOpen(false);
    setCustomDays('');
    setEditorOpen(true);
    await loadReminderSettings(item);
  }

  function toggleReminderDay(days: number) {
    setForm((current) => {
      const exists = current.reminder_days.includes(days);
      const next = exists ? current.reminder_days.filter((item) => item !== days) : [...current.reminder_days, days];
      return { ...current, reminder_days: next.length ? next : [days] };
    });
  }

  function addCustomDays() {
    const days = Math.trunc(Number(customDays));
    if (!Number.isFinite(days) || days < 0 || days > 60) {
      Alert.alert('Días inválidos', 'Usa un número entre 0 y 60.');
      return;
    }
    setForm((current) => ({ ...current, reminder_days: [...new Set([...current.reminder_days, days])] }));
    setCustomDays('');
  }

  async function save() {
    if (selected && reminderLoadState !== 'ready') {
      Alert.alert(
        'Recordatorios sin verificar',
        'No guardaremos este anuncio hasta conocer su configuración de recordatorios. Reintenta la carga para evitar perder o sobrescribir avisos existentes.',
      );
      return;
    }

    if (!form.title.trim() || !form.content.trim()) {
      Alert.alert('Faltan datos', 'Agrega título y contenido.');
      return;
    }
    if (form.reminders_enabled && !form.has_date) {
      Alert.alert('Falta la fecha', 'Activa una fecha antes de programar recordatorios.');
      return;
    }
    const time = form.reminders_enabled ? parseTime(form.reminder_time) : { hour: 9, minute: 0 };
    if (!time) {
      Alert.alert('Hora inválida', 'Usa el formato HH:MM, por ejemplo 09:00.');
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
      const saved = selected ? await updateAnnouncement(selected.id, payload) : await createAnnouncement(payload);

      try {
        const reminders: AnnouncementReminderSetting[] = form.reminders_enabled
          ? form.reminder_days.map((days_before) => ({ days_before, hour: time.hour, minute: time.minute }))
          : [];
        await saveAnnouncementReminders({
          announcement_id: saved.id,
          reminders,
        });
      } catch (cause) {
        Alert.alert(
          'Anuncio guardado',
          `El anuncio sí se guardó, pero no se pudieron programar los recordatorios. ${cause instanceof Error ? cause.message : ''}`.trim(),
        );
      }

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

  return (
    <KeyboardAwareScreen>
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Comunicación</Text>
          <Text style={styles.title}>Anuncios</Text>
          <Text style={styles.subtitle}>Publica rápido y programa avisos antes de una fecha.</Text>
        </View>
        <Pressable style={styles.addButton} onPress={openNew}><MaterialIcons name="add" size={21} color={ucapsaBrand.colors.surface} /><Text style={styles.addText}>Nuevo</Text></Pressable>
      </View>

      <View style={styles.tabs}>
        <FilterChip label="Publicados" active={filter === 'active'} onPress={() => setFilter('active')} />
        <FilterChip label="Borradores" active={filter === 'drafts'} onPress={() => setFilter('drafts')} />
        <FilterChip label="Archivados" active={filter === 'archived'} onPress={() => setFilter('archived')} />
      </View>

      {loading ? <Text style={styles.muted}>Cargando anuncios...</Text> : null}
      {!loading && filtered.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>Nada aquí</Text><Text style={styles.muted}>No hay anuncios en esta vista.</Text></View> : null}

      <View style={styles.list}>
        {filtered.map((item, index) => (
          <Pressable key={item.id} style={[styles.row, index === filtered.length - 1 && styles.rowLast]} onPress={() => void openEdit(item)}>
            <View style={styles.rowIcon}><MaterialIcons name="campaign" size={20} color={ucapsaBrand.colors.redDark} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.rowTitleLine}><Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text><Text style={styles.status}>{statusLabel(item)}</Text></View>
              <Text numberOfLines={2} style={styles.rowText}>{item.content}</Text>
              <Text style={styles.rowMeta}>{item.announcement_date ? formatDate(item.announcement_date) : 'Sin fecha'} · {audiences.find((option) => option.value === item.audience)?.label ?? item.audience}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.redDark} />
          </Pressable>
        ))}
      </View>

      <KeyboardAwareModal visible={editorOpen} onClose={() => setEditorOpen(false)}>
        <Text style={styles.modalKicker}>Anuncio</Text>
        <Text style={styles.modalTitle}>{selected ? 'Editar anuncio' : 'Nuevo anuncio'}</Text>

        <Text style={styles.label}>Título</Text>
        <TextInput value={form.title} onChangeText={(title) => setForm((current) => ({ ...current, title }))} placeholder="Título corto" style={styles.input} />
        <Text style={styles.label}>Mensaje</Text>
        <TextInput value={form.content} onChangeText={(content) => setForm((current) => ({ ...current, content }))} placeholder="Qué necesita saber el cliente" multiline style={[styles.input, styles.textArea]} />

        <Text style={styles.label}>Para quién</Text>
        <View style={styles.wrapRow}>{audiences.map((option) => <Choice key={option.value} label={option.label} active={form.audience === option.value} onPress={() => setForm((current) => ({ ...current, audience: option.value }))} />)}</View>

        <View style={styles.switchLine}>
          <View style={{ flex: 1 }}><Text style={styles.label}>Fecha</Text><Text style={styles.modalHint}>Opcional. Actívala si el anuncio corresponde a un día.</Text></View>
          <Switch value={form.has_date} onValueChange={(has_date) => setForm((current) => ({ ...current, has_date, reminders_enabled: has_date ? current.reminders_enabled : false }))} />
        </View>
        {form.has_date ? <Pressable style={styles.dateButton} onPress={() => setCalendarOpen((value) => !value)}><Text style={styles.dateText}>{formatDate(form.date)}</Text><MaterialIcons name="event" size={19} color={ucapsaBrand.colors.redDark} /></Pressable> : null}
        {form.has_date && calendarOpen ? <View style={styles.calendarBox}><Calendar current={form.date} markedDates={{ [form.date]: { selected: true, selectedColor: ucapsaBrand.colors.red } }} onDayPress={(day) => { setForm((current) => ({ ...current, date: day.dateString })); setCalendarOpen(false); }} theme={{ todayTextColor: ucapsaBrand.colors.red, arrowColor: ucapsaBrand.colors.red }} /></View> : null}

        <View style={styles.reminderCard}>
          <View style={styles.switchLine}>
            <View style={{ flex: 1 }}>
              <Text style={styles.reminderTitle}>Recordatorio</Text>
              <Text style={styles.modalHint}>
                {reminderLoadState === 'loading'
                  ? 'Cargando recordatorios...'
                  : reminderLoadState === 'failed'
                    ? 'No pudimos verificar la configuración existente.'
                    : 'Envía una notificación antes de la fecha.'}
              </Text>
            </View>
            <Switch
              disabled={!form.has_date || reminderLoadState === 'loading' || reminderLoadState === 'failed'}
              value={form.reminders_enabled}
              onValueChange={(reminders_enabled) => setForm((current) => ({ ...current, reminders_enabled }))}
            />
          </View>

          {reminderLoadState === 'failed' && selected ? (
            <Pressable
              style={styles.reminderRetry}
              onPress={() => void loadReminderSettings(selected)}
            >
              <MaterialIcons name="refresh" size={18} color={ucapsaBrand.colors.redDark} />
              <Text style={styles.reminderRetryText}>Reintentar recordatorios</Text>
            </Pressable>
          ) : null}

          {form.reminders_enabled && reminderLoadState === 'ready' ? (
            <>
              <Text style={styles.smallLabel}>Cuándo avisar</Text>
              <View style={styles.wrapRow}>
                {reminderPresets.map((days) => <ChoiceLight key={days} label={days === 0 ? 'Mismo día' : `${days} día${days === 1 ? '' : 's'} antes`} active={form.reminder_days.includes(days)} onPress={() => toggleReminderDay(days)} />)}
              </View>
              <View style={styles.customRow}>
                <TextInput value={customDays} onChangeText={setCustomDays} keyboardType="number-pad" placeholder="Días" style={[styles.input, styles.customInput]} />
                <Pressable style={styles.customButton} onPress={addCustomDays}><Text style={styles.customButtonText}>Añadir</Text></Pressable>
              </View>
              <Text style={styles.smallLabel}>Hora</Text>
              <TextInput value={form.reminder_time} onChangeText={(reminder_time) => setForm((current) => ({ ...current, reminder_time }))} placeholder="09:00" keyboardType="numbers-and-punctuation" style={styles.input} />
              <View style={styles.reminderSummary}><MaterialIcons name="notifications-active" size={18} color={ucapsaBrand.colors.redDark} /><Text style={styles.reminderSummaryText}>{reminderSummary(form)}</Text></View>
            </>
          ) : null}
        </View>

        <View style={styles.switchLine}>
          <View style={{ flex: 1 }}><Text style={styles.label}>Publicado</Text><Text style={styles.modalHint}>Apágalo para guardar como borrador.</Text></View>
          <Switch value={form.is_published} onValueChange={(is_published) => setForm((current) => ({ ...current, is_published }))} />
        </View>

        <Pressable style={styles.optionsToggle} onPress={() => setOptionsOpen((value) => !value)}><Text style={styles.optionsToggleText}>Más opciones</Text><MaterialIcons name={optionsOpen ? 'expand-less' : 'expand-more'} size={21} color={ucapsaBrand.colors.redDark} /></Pressable>
        {optionsOpen ? (
          <View style={styles.optionsBox}>
            <Text style={styles.smallLabel}>Prioridad</Text>
            <View style={styles.wrapRow}>{priorities.map((option) => <ChoiceLight key={option.value} label={option.label} active={form.priority === option.value} onPress={() => setForm((current) => ({ ...current, priority: option.value }))} />)}</View>
            <Text style={styles.smallLabel}>Color</Text>
            <View style={styles.wrapRow}>{colors.map((option) => <ChoiceLight key={option.value} label={option.label} active={form.color_key === option.value} onPress={() => setForm((current) => ({ ...current, color_key: option.value }))} />)}</View>

            <View style={styles.switchLine}>
              <View style={{ flex: 1 }}><Text style={styles.smallLabel}>Fijar arriba</Text><Text style={styles.modalHint}>Prioriza este anuncio en las listas.</Text></View>
              <Switch value={form.is_pinned} onValueChange={(is_pinned) => setForm((current) => ({ ...current, is_pinned }))} />
            </View>

            <Text style={styles.smallLabel}>Vincular evento</Text>
            <View style={styles.wrapRow}>
              <ChoiceLight label="Ninguno" active={!form.event_id} onPress={() => setForm((current) => ({ ...current, event_id: null }))} />
              {events.filter((event) => !event.archived_at).slice(0, 6).map((event) => <ChoiceLight key={event.id} label={event.title} active={form.event_id === event.id} onPress={() => setForm((current) => ({ ...current, event_id: event.id }))} />)}
            </View>
          </View>
        ) : null}

        <Pressable disabled={saving} style={[styles.primaryButton, saving && styles.disabled]} onPress={() => void save()}>
          <Text style={styles.primaryText}>{saving ? 'Guardando...' : 'Guardar anuncio'}</Text>
        </Pressable>

        {selected ? (
          <View style={styles.destructiveSection}>
            <Text style={styles.destructiveTitle}>Más acciones</Text>
            <View style={styles.actionRow}>
              {!selected.archived_at ? <Pressable disabled={saving} style={styles.secondaryAction} onPress={() => void run(() => setAnnouncementPublished(selected.id, !selected.is_published))}><Text style={styles.secondaryActionText}>{selected.is_published ? 'Pasar a borrador' : 'Publicar'}</Text></Pressable> : null}
              <Pressable disabled={saving} style={styles.secondaryAction} onPress={() => void run(() => selected.archived_at ? restoreAnnouncement(selected.id) : archiveAnnouncement(selected.id))}><Text style={styles.secondaryActionText}>{selected.archived_at ? 'Restaurar' : 'Archivar'}</Text></Pressable>
            </View>
          </View>
        ) : null}
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.filterChip, active && styles.filterChipActive]}><Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text></Pressable>;
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceActive]}><Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text></Pressable>;
}

function ChoiceLight({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.choiceLight, active && styles.choiceLightActive]}><Text numberOfLines={1} style={[styles.choiceLightText, active && styles.choiceLightTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: ucapsaBrand.colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
  addButton: { minHeight: 44, borderRadius: 14, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 5 },
  addText: { color: ucapsaBrand.colors.surface, fontSize: 12, fontWeight: '900' },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filterChip: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, alignItems: 'center', paddingVertical: 10 },
  filterChipActive: { borderColor: ucapsaBrand.colors.red, backgroundColor: ucapsaBrand.colors.redSoft },
  filterText: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '900' },
  filterTextActive: { color: ucapsaBrand.colors.redDark },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  empty: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 20 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  list: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, minHeight: 82, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.border },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  status: { color: ucapsaBrand.colors.redDark, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  rowText: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  rowMeta: { color: ucapsaBrand.colors.mutedNeutral, fontSize: 10, fontWeight: '800', marginTop: 5 },
  modalKicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900', marginBottom: 12 },
  label: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900', marginTop: 10, marginBottom: 6 },
  smallLabel: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 10, marginBottom: 6 },
  modalHint: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 1 },
  input: { borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, color: ucapsaBrand.colors.text, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14 },
  textArea: { minHeight: 98, textAlignVertical: 'top' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 13, paddingVertical: 9 },
  choiceActive: { borderColor: ucapsaBrand.colors.red, backgroundColor: ucapsaBrand.colors.redSoft },
  choiceText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  choiceTextActive: { color: ucapsaBrand.colors.redDeep },
  switchLine: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  dateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redPale, paddingHorizontal: 14, marginTop: 8 },
  dateText: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  calendarBox: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginTop: 8 },
  reminderCard: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redPale, padding: 13, marginTop: 14 },
  reminderTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  choiceLight: { maxWidth: '100%', borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 11, paddingVertical: 8 },
  choiceLightActive: { borderColor: ucapsaBrand.colors.red, backgroundColor: ucapsaBrand.colors.redSoft },
  choiceLightText: { maxWidth: 180, color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '900' },
  choiceLightTextActive: { color: ucapsaBrand.colors.redDark },
  customRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  customInput: { flex: 1 },
  customButton: { minWidth: 82, borderRadius: 14, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  customButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  reminderSummary: { flexDirection: 'row', gap: 7, alignItems: 'center', borderRadius: 13, backgroundColor: ucapsaBrand.colors.surface, padding: 10, marginTop: 10 },
  reminderSummaryText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  reminderRetry: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 10, marginTop: 8 },
  reminderRetryText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  optionsToggle: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surfaceAlt, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, marginTop: 14 },
  optionsToggleText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  optionsBox: { borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surfaceSubtle, padding: 12, marginTop: 8 },
  primaryButton: { minHeight: 54, borderRadius: 16, backgroundColor: ucapsaBrand.colors.red, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
  destructiveSection: { borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.border, marginTop: 18, paddingTop: 14 },
  destructiveTitle: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginBottom: 8 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryAction: { borderRadius: 12, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 11, paddingVertical: 9 },
  secondaryActionText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  dangerAction: { borderRadius: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  dangerActionText: { color: ucapsaBrand.colors.danger, fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.55 },
});
