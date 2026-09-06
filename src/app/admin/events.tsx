import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  archiveEvent,
  createEvent,
  deleteEvent,
  getAdminEvents,
  restoreEvent,
  setEventPublished,
  updateEvent,
} from '../../services/events.service';
import type { AudienceType, EventRepeatType, UcapsaColorKey, UcapsaEvent, UcapsaPriority } from '../../types/app.types';

type EventFilter = 'active' | 'drafts' | 'archived';
type DateTarget = 'start' | 'end' | null;
type FormState = {
  title: string;
  description: string;
  location: string;
  start_day: string;
  start_time: string;
  has_end_date: boolean;
  end_day: string;
  end_time: string;
  has_time: boolean;
  audience: AudienceType;
  is_published: boolean;
  repeat_type: EventRepeatType;
  repeat_interval_days: string;
  repeat_limit: string;
  color_key: UcapsaColorKey;
  priority: UcapsaPriority;
};

const audiences: Array<{ value: AudienceType; label: string }> = [
  { value: 'public', label: 'Todos' },
  { value: 'clients', label: 'Clientes' },
  { value: 'members', label: 'Socios' },
  { value: 'admins', label: 'Admins' },
];

const repeatOptions: Array<{ value: EventRepeatType; label: string }> = [
  { value: 'none', label: 'No repetir' },
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Cada 2 semanas' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'custom_days', label: 'Cada N dias' },
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
    description: '',
    location: '',
    start_day: todayKey(),
    start_time: '10:00',
    has_end_date: false,
    end_day: todayKey(),
    end_time: '11:00',
    has_time: true,
    audience: 'public',
    is_published: true,
    repeat_type: 'none',
    repeat_interval_days: '7',
    repeat_limit: '10',
    color_key: 'green',
    priority: 'normal',
  };
}

function dateKey(value: string | null | undefined) {
  if (!value) return todayKey();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return todayKey();
  return localDateKey(date);
}

function timeKey(value: string | null | undefined, fallback = '10:00') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function buildIso(day: string, time: string, hasTime: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Fecha invalida.');
  const safeTime = hasTime ? time : '12:00';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(safeTime)) throw new Error('Usa hora HH:mm.');
  const date = new Date(`${day}T${safeTime}:00`);
  if (Number.isNaN(date.getTime())) throw new Error('Fecha u hora invalida.');
  return date.toISOString();
}

function formatDate(value: string | null | undefined, hasTime = true) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleString('es-MX', hasTime ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', year: 'numeric' });
}

function repeatLabel(value: EventRepeatType | null | undefined) {
  return repeatOptions.find((option) => option.value === (value ?? 'none'))?.label ?? 'No repetir';
}

function statusLabel(item: UcapsaEvent) {
  if (item.archived_at) return 'Archivado';
  return item.is_published ? 'Publicado' : 'Borrador';
}

export default function AdminEventsScreen() {
  const params = useLocalSearchParams<{ eventId?: string }>();
  const openedParam = useRef<string | null>(null);
  const [items, setItems] = useState<UcapsaEvent[]>([]);
  const [filter, setFilter] = useState<EventFilter>('active');
  const [selected, setSelected] = useState<UcapsaEvent | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editorOpen, setEditorOpen] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState<DateTarget>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getAdminEvents());
    } catch (cause) {
      Alert.alert('No se pudieron cargar eventos', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  useEffect(() => {
    if (!params.eventId || openedParam.current === params.eventId || items.length === 0) return;
    const target = items.find((item) => item.id === params.eventId);
    if (!target) return;
    openedParam.current = params.eventId;
    openEdit(target);
  }, [items, params.eventId]);

  const filtered = useMemo(() => items.filter((item) => {
    if (filter === 'archived') return Boolean(item.archived_at);
    if (item.archived_at) return false;
    if (filter === 'drafts') return !item.is_published;
    return item.is_published;
  }), [filter, items]);

  function openNew() {
    setSelected(null);
    setForm(emptyForm());
    setCalendarTarget(null);
    setOptionsOpen(false);
    setEditorOpen(true);
  }

  function openEdit(item: UcapsaEvent) {
    setSelected(item);
    setForm({
      title: item.title,
      description: item.description ?? '',
      location: item.location ?? '',
      start_day: dateKey(item.start_date),
      start_time: timeKey(item.start_date),
      has_end_date: Boolean(item.end_date),
      end_day: dateKey(item.end_date ?? item.start_date),
      end_time: timeKey(item.end_date, '11:00'),
      has_time: item.has_time ?? true,
      audience: item.audience,
      is_published: item.is_published,
      repeat_type: item.repeat_type ?? 'none',
      repeat_interval_days: String(item.repeat_interval_days ?? 7),
      repeat_limit: String(item.repeat_limit ?? (item.repeat_type === 'none' ? 1 : 10)),
      color_key: item.color_key ?? 'green',
      priority: item.priority ?? 'normal',
    });
    setCalendarTarget(null);
    setOptionsOpen(false);
    setEditorOpen(true);
  }

  async function save() {
    if (!form.title.trim()) {
      Alert.alert('Falta titulo', 'Agrega un titulo al evento.');
      return;
    }
    try {
      const startDate = buildIso(form.start_day, form.start_time, form.has_time);
      const endDate = form.has_end_date ? buildIso(form.end_day, form.end_time, form.has_time) : null;
      const repeatInterval = Math.max(1, Math.min(365, Number.parseInt(form.repeat_interval_days || '1', 10) || 1));
      const repeatLimit = form.repeat_type === 'none' ? 1 : Math.max(1, Math.min(10, Number.parseInt(form.repeat_limit || '10', 10) || 10));

      setSaving(true);
      const payload = {
        title: form.title,
        description: form.description,
        location: form.location,
        start_date: startDate,
        end_date: endDate,
        audience: form.audience,
        is_published: form.is_published,
        has_time: form.has_time,
        repeat_type: form.repeat_type,
        repeat_interval_days: form.repeat_type === 'custom_days' ? repeatInterval : null,
        repeat_limit: repeatLimit,
        color_key: form.color_key,
        priority: form.priority,
      };
      if (selected) await updateEvent(selected.id, payload);
      else await createEvent(payload);
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

  function askDelete(item: UcapsaEvent) {
    Alert.alert('Eliminar evento', 'Esta accion no se puede deshacer.', [
      { text: 'Volver', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => void run(() => deleteEvent(item.id)) },
    ]);
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.hero}>
        <View style={{ flex: 1 }}><Text style={styles.kicker}>Comunicacion</Text><Text style={styles.title}>Eventos</Text><Text style={styles.subtitle}>Gestiona la agenda sin duplicar el calendario completo en esta pantalla.</Text></View>
        <View style={styles.heroActions}>
          <Pressable style={styles.iconButton} onPress={() => router.push('/calendar' as never)}><MaterialIcons name="calendar-month" size={21} color={ucapsaBrand.colors.redDark} /></Pressable>
          <Pressable style={styles.addButton} onPress={openNew}><MaterialIcons name="add" size={21} color={ucapsaBrand.colors.surface} /></Pressable>
        </View>
      </View>

      <View style={styles.tabs}>
        <FilterChip label="Publicados" active={filter === 'active'} onPress={() => { setFilter('active'); setVisibleCount(8); }} />
        <FilterChip label="Borradores" active={filter === 'drafts'} onPress={() => { setFilter('drafts'); setVisibleCount(8); }} />
        <FilterChip label="Archivados" active={filter === 'archived'} onPress={() => { setFilter('archived'); setVisibleCount(8); }} />
      </View>

      {loading ? <Text style={styles.muted}>Cargando eventos...</Text> : null}
      {!loading && filtered.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>Nada aqui</Text><Text style={styles.muted}>No hay eventos en esta vista.</Text></View> : null}

      <View style={styles.list}>
        {filtered.slice(0, visibleCount).map((item, index) => (
          <Pressable key={item.id} style={[styles.row, index === Math.min(filtered.length, visibleCount) - 1 && styles.rowLast]} onPress={() => openEdit(item)}>
            <View style={styles.rowIcon}><MaterialIcons name="event" size={20} color={ucapsaBrand.colors.redDark} /></View>
            <View style={{ flex: 1 }}>
              <View style={styles.rowTitleLine}><Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text><Text style={styles.status}>{statusLabel(item)}</Text></View>
              <Text style={styles.rowMeta}>{formatDate(item.start_date, item.has_time ?? true)}</Text>
              <Text style={styles.rowMeta}>{repeatLabel(item.repeat_type)}{item.location ? ` - ${item.location}` : ''}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.redDark} />
          </Pressable>
        ))}
      </View>
      {filtered.length > visibleCount ? <Pressable style={styles.moreButton} onPress={() => setVisibleCount((count) => count + 8)}><Text style={styles.moreText}>Ver 8 mas</Text></Pressable> : null}

      <KeyboardAwareModal visible={editorOpen} onClose={() => setEditorOpen(false)}>
        <Text style={styles.modalKicker}>Evento</Text>
        <Text style={styles.modalTitle}>{selected ? 'Editar evento' : 'Nuevo evento'}</Text>

        <Text style={styles.label}>Titulo</Text>
        <TextInput value={form.title} onChangeText={(title) => setForm((current) => ({ ...current, title }))} placeholder="Nombre del evento" style={styles.input} />
        <Text style={styles.label}>Descripcion</Text>
        <TextInput value={form.description} onChangeText={(description) => setForm((current) => ({ ...current, description }))} placeholder="Opcional" multiline style={[styles.input, styles.textArea]} />

        <Text style={styles.label}>Inicio</Text>
        <View style={styles.dateTimeRow}>
          <Pressable style={styles.dateButton} onPress={() => setCalendarTarget('start')}><Text style={styles.dateText}>{form.start_day}</Text><MaterialIcons name="event" size={18} color={ucapsaBrand.colors.redDark} /></Pressable>
          {form.has_time ? <TextInput value={form.start_time} onChangeText={(start_time) => setForm((current) => ({ ...current, start_time }))} placeholder="10:00" keyboardType="numbers-and-punctuation" style={styles.timeInput} /> : null}
        </View>

        <View style={styles.switchLine}>
          <View style={{ flex: 1 }}><Text style={styles.label}>Tiene hora</Text><Text style={styles.modalHint}>Apagalo para eventos de todo el dia.</Text></View>
          <Switch value={form.has_time} onValueChange={(has_time) => setForm((current) => ({ ...current, has_time }))} />
        </View>

        <View style={styles.switchLine}>
          <View style={{ flex: 1 }}><Text style={styles.label}>Fecha de fin</Text><Text style={styles.modalHint}>Opcional.</Text></View>
          <Switch value={form.has_end_date} onValueChange={(has_end_date) => setForm((current) => ({ ...current, has_end_date }))} />
        </View>
        {form.has_end_date ? (
          <View style={styles.dateTimeRow}>
            <Pressable style={styles.dateButton} onPress={() => setCalendarTarget('end')}><Text style={styles.dateText}>{form.end_day}</Text><MaterialIcons name="event" size={18} color={ucapsaBrand.colors.redDark} /></Pressable>
            {form.has_time ? <TextInput value={form.end_time} onChangeText={(end_time) => setForm((current) => ({ ...current, end_time }))} placeholder="11:00" keyboardType="numbers-and-punctuation" style={styles.timeInput} /> : null}
          </View>
        ) : null}

        {calendarTarget ? (
          <View style={styles.calendarBox}>
            <Calendar
              current={calendarTarget === 'start' ? form.start_day : form.end_day}
              markedDates={{ [calendarTarget === 'start' ? form.start_day : form.end_day]: { selected: true, selectedColor: ucapsaBrand.colors.red } }}
              onDayPress={(day) => {
                if (calendarTarget === 'start') setForm((current) => ({ ...current, start_day: day.dateString, ...(!current.has_end_date ? { end_day: day.dateString } : {}) }));
                else setForm((current) => ({ ...current, end_day: day.dateString }));
                setCalendarTarget(null);
              }}
              theme={{ todayTextColor: ucapsaBrand.colors.red, arrowColor: ucapsaBrand.colors.red }}
            />
          </View>
        ) : null}

        <Text style={styles.label}>Repeticion</Text>
        <View style={styles.wrapRow}>{repeatOptions.map((option) => <Choice key={option.value} label={option.label} active={form.repeat_type === option.value} onPress={() => setForm((current) => ({ ...current, repeat_type: option.value }))} />)}</View>
        {form.repeat_type === 'custom_days' ? <TextInput value={form.repeat_interval_days} onChangeText={(repeat_interval_days) => setForm((current) => ({ ...current, repeat_interval_days }))} placeholder="Cada cuantos dias" keyboardType="number-pad" style={styles.input} /> : null}
        {form.repeat_type !== 'none' ? <TextInput value={form.repeat_limit} onChangeText={(repeat_limit) => setForm((current) => ({ ...current, repeat_limit }))} placeholder="Numero de repeticiones, maximo 10" keyboardType="number-pad" style={styles.input} /> : null}

        <Pressable style={styles.sectionToggle} onPress={() => setOptionsOpen((value) => !value)}><Text style={styles.sectionToggleText}>Opciones</Text><MaterialIcons name={optionsOpen ? 'expand-less' : 'expand-more'} size={21} color={ucapsaBrand.colors.surface} /></Pressable>
        {optionsOpen ? (
          <View style={styles.optionsBox}>
            <Text style={styles.labelDark}>Ubicacion</Text>
            <TextInput value={form.location} onChangeText={(location) => setForm((current) => ({ ...current, location }))} placeholder="Opcional" style={styles.inputLight} />
            <Text style={styles.labelDark}>Audiencia</Text>
            <View style={styles.wrapRow}>{audiences.map((option) => <ChoiceLight key={option.value} label={option.label} active={form.audience === option.value} onPress={() => setForm((current) => ({ ...current, audience: option.value }))} />)}</View>
            <Text style={styles.labelDark}>Prioridad</Text>
            <View style={styles.wrapRow}>{priorities.map((option) => <ChoiceLight key={option.value} label={option.label} active={form.priority === option.value} onPress={() => setForm((current) => ({ ...current, priority: option.value }))} />)}</View>
            <Text style={styles.labelDark}>Color</Text>
            <View style={styles.wrapRow}>{colors.map((option) => <ChoiceLight key={option.value} label={option.label} active={form.color_key === option.value} onPress={() => setForm((current) => ({ ...current, color_key: option.value }))} />)}</View>
            <View style={styles.switchLineLight}><Text style={styles.labelDark}>Publicado</Text><Switch value={form.is_published} onValueChange={(is_published) => setForm((current) => ({ ...current, is_published }))} /></View>
          </View>
        ) : null}

        <Pressable disabled={saving} style={[styles.primary, saving && styles.disabled]} onPress={() => void save()}><Text style={styles.primaryText}>{saving ? 'Guardando...' : 'Guardar evento'}</Text></Pressable>

        {selected ? (
          <View style={styles.actionRow}>
            {!selected.archived_at ? <Pressable disabled={saving} style={styles.secondaryAction} onPress={() => void run(() => setEventPublished(selected.id, !selected.is_published))}><Text style={styles.secondaryActionText}>{selected.is_published ? 'Pasar a borrador' : 'Publicar'}</Text></Pressable> : null}
            <Pressable disabled={saving} style={styles.secondaryAction} onPress={() => void run(() => selected.archived_at ? restoreEvent(selected.id) : archiveEvent(selected.id))}><Text style={styles.secondaryActionText}>{selected.archived_at ? 'Restaurar' : 'Archivar'}</Text></Pressable>
            <Pressable disabled={saving} style={styles.dangerAction} onPress={() => askDelete(selected)}><Text style={styles.dangerActionText}>Eliminar</Text></Pressable>
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
  heroActions: { flexDirection: 'row', gap: 6 },
  iconButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  addButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: ucapsaBrand.colors.red, alignItems: 'center', justifyContent: 'center' },
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
  rowMeta: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, marginTop: 2, fontWeight: '700' },
  moreButton: { alignItems: 'center', paddingVertical: 11 },
  moreText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  modalKicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 23, fontWeight: '900', marginBottom: 5 },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 9, marginBottom: 5 },
  modalHint: { color: ucapsaBrand.colors.dangerBorder, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  input: { borderRadius: 14, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, paddingVertical: 11, color: ucapsaBrand.colors.text, marginBottom: 3 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  dateTimeRow: { flexDirection: 'row', gap: 7 },
  dateButton: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 14, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 11, paddingVertical: 11 },
  dateText: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900' },
  timeInput: { width: 82, borderRadius: 14, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 10, color: ucapsaBrand.colors.text, fontWeight: '900' },
  switchLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  calendarBox: { overflow: 'hidden', borderRadius: 16, marginTop: 7 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 9, paddingVertical: 7 },
  choiceActive: { backgroundColor: ucapsaBrand.colors.redSoft, borderColor: ucapsaBrand.colors.red },
  choiceText: { color: ucapsaBrand.colors.text, fontSize: 9, fontWeight: '900' },
  choiceTextActive: { color: ucapsaBrand.colors.redDark },
  sectionToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, marginTop: 3 },
  sectionToggleText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  optionsBox: { gap: 6, borderRadius: 16, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  labelDark: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900', marginTop: 4 },
  inputLight: { borderRadius: 11, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.background, paddingHorizontal: 10, paddingVertical: 9, color: ucapsaBrand.colors.text },
  choiceLight: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.background, paddingHorizontal: 9, paddingVertical: 7 },
  choiceLightActive: { backgroundColor: ucapsaBrand.colors.redSoft, borderColor: ucapsaBrand.colors.red },
  choiceLightText: { color: ucapsaBrand.colors.text, fontSize: 9, fontWeight: '900' },
  choiceLightTextActive: { color: ucapsaBrand.colors.redDark },
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
