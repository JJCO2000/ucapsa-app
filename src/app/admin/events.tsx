import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EventCard } from '../../components/domain/EventCard';
import { useSession } from '../../hooks/useSession';
import {
  archiveEvent,
  createEvent,
  deleteEvent,
  getAdminEvents,
  restoreEvent,
  setEventPublished,
  updateEvent,
} from '../../services/events.service';
import type { AudienceType, EventOccurrence, EventRepeatType, UcapsaEvent } from '../../types/app.types';
import {
  buildLocalIso,
  expandEventOccurrences,
  getEventRepeatLabel,
  toDateKey,
  todayKey,
  toTimeValue,
} from '../../utils/events.utils';

type EventFormState = {
  title: string;
  description: string;
  location: string;
  start_day: string;
  has_time: boolean;
  start_time: string;
  has_end_date: boolean;
  end_day: string;
  end_time: string;
  audience: AudienceType;
  is_published: boolean;
  repeat_type: EventRepeatType;
  repeat_interval_days: string;
};

const audienceOptions: Array<{ value: AudienceType; label: string }> = [
  { value: 'public', label: 'Publico' },
  { value: 'clients', label: 'Clientes' },
  { value: 'members', label: 'Socios' },
  { value: 'admins', label: 'Admins' },
];

const repeatOptions: Array<{ value: EventRepeatType; label: string }> = [
  { value: 'none', label: 'No se repite' },
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Cada 2 semanas' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'custom_days', label: 'Cada X dias' },
];

function buildEmptyForm(): EventFormState {
  const today = todayKey();

  return {
    title: '',
    description: '',
    location: '',
    start_day: today,
    has_time: false,
    start_time: '',
    has_end_date: false,
    end_day: today,
    end_time: '',
    audience: 'public',
    is_published: true,
    repeat_type: 'none',
    repeat_interval_days: '14',
  };
}

function eventToForm(event: UcapsaEvent): EventFormState {
  const startDay = toDateKey(event.start_date) ?? todayKey();

  return {
    title: event.title,
    description: event.description ?? '',
    location: event.location ?? '',
    start_day: startDay,
    has_time: event.has_time ?? true,
    start_time: event.has_time === false ? '' : toTimeValue(event.start_date),
    has_end_date: Boolean(event.end_date),
    end_day: toDateKey(event.end_date ?? event.start_date) ?? startDay,
    end_time: event.end_date && event.has_time !== false ? toTimeValue(event.end_date) : '',
    audience: event.audience,
    is_published: event.is_published,
    repeat_type: event.repeat_type ?? 'none',
    repeat_interval_days: String(event.repeat_interval_days ?? 15),
  };
}

function validateForm(value: EventFormState) {
  if (!value.title.trim()) throw new Error('El titulo es obligatorio.');

  const repeatInterval = Math.max(1, Math.min(365, Number.parseInt(value.repeat_interval_days || '1', 10)));
  if (value.repeat_type === 'custom_days' && Number.isNaN(repeatInterval)) {
    throw new Error('Define cada cuantos dias se repetira.');
  }

  const startDate = buildLocalIso(value.start_day, value.start_time, value.has_time);
  if (!startDate) {
    throw new Error(value.has_time ? 'Selecciona dia y hora de inicio validos. Usa hora HH:mm.' : 'Selecciona un dia de inicio valido.');
  }

  const endDate = value.has_end_date ? buildLocalIso(value.end_day, value.end_time, value.has_time) : null;
  if (value.has_end_date && !endDate) throw new Error('Selecciona dia y hora de fin validos.');

  return { startDate, endDate, repeatInterval };
}

export default function AdminEventsScreen() {
  const { isAdmin } = useSession();
  const params = useLocalSearchParams<{ eventId?: string }>();
  const openedEventParamRef = useRef<string | null>(null);
  const [events, setEvents] = useState<UcapsaEvent[]>([]);
  const [form, setForm] = useState<EventFormState>(() => buildEmptyForm());
  const [editForm, setEditForm] = useState<EventFormState>(() => buildEmptyForm());
  const [selectedEvent, setSelectedEvent] = useState<UcapsaEvent | null>(null);
  const [selectedAdminDay, setSelectedAdminDay] = useState(todayKey());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadEvents() {
    setLoading(true);
    try {
      setEvents(await getAdminEvents());
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudieron cargar los eventos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) void loadEvents();
  }, [isAdmin]);

  useEffect(() => {
    if (!params.eventId || openedEventParamRef.current === params.eventId || events.length === 0) return;

    const eventToOpen = events.find((event) => event.id === params.eventId);
    if (!eventToOpen) return;

    openedEventParamRef.current = params.eventId;
    openEditor(eventToOpen);
  }, [events, params.eventId]);

  function openEditor(event: UcapsaEvent) {
    setSelectedEvent(event);
    setEditForm(eventToForm(event));
  }

  async function saveNewEvent() {
    try {
      const { startDate, endDate, repeatInterval } = validateForm(form);
      setSaving(true);
      await createEvent({
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
        repeat_limit: form.repeat_type === 'none' ? 1 : 10,
      });
      setForm(buildEmptyForm());
      await loadEvents();
      Alert.alert('Evento guardado', form.repeat_type === 'none' ? 'Se creo 1 evento.' : 'Se guardo como una serie. No se crearon eventos separados.');
    } catch (err) {
      Alert.alert('No se pudo crear', err instanceof Error ? err.message : 'Error desconocido.');
    } finally {
      setSaving(false);
    }
  }

  function handleCreate() {
    if (form.repeat_type === 'none') {
      void saveNewEvent();
      return;
    }

    const fakeEvent = {
      repeat_type: form.repeat_type,
      repeat_interval_days: form.repeat_type === 'custom_days' ? Number.parseInt(form.repeat_interval_days || '1', 10) : null,
    } as Pick<UcapsaEvent, 'repeat_type' | 'repeat_interval_days'>;

    Alert.alert(
      'Confirmar repeticion',
      `Se guardará como una sola serie: ${getEventRepeatLabel(fakeEvent)}. No se crearán eventos separados. El calendario mostrará máximo 10 ocurrencias. ¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', onPress: () => void saveNewEvent() },
      ],
    );
  }

  async function handleUpdate() {
    if (!selectedEvent) return;

    try {
      const { startDate, endDate, repeatInterval } = validateForm(editForm);
      setSaving(true);
      await updateEvent(selectedEvent.id, {
        title: editForm.title,
        description: editForm.description,
        location: editForm.location,
        start_date: startDate,
        end_date: endDate,
        audience: editForm.audience,
        is_published: editForm.is_published,
        has_time: editForm.has_time,
        repeat_type: editForm.repeat_type,
        repeat_interval_days: editForm.repeat_type === 'custom_days' ? repeatInterval : null,
        repeat_limit: editForm.repeat_type === 'none' ? 1 : 10,
      });
      setSelectedEvent(null);
      await loadEvents();
    } catch (err) {
      Alert.alert('No se pudo actualizar', err instanceof Error ? err.message : 'Error desconocido.');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: () => Promise<void>, closeModal = false) {
    try {
      setSaving(true);
      await action();
      if (closeModal) setSelectedEvent(null);
      await loadEvents();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo completar la accion.');
    } finally {
      setSaving(false);
    }
  }

  const occurrences = useMemo(() => expandEventOccurrences(events), [events]);

  const markedAdminDates = useMemo(() => {
    const marks: Record<string, any> = {};

    for (const occurrence of occurrences) {
      const key = toDateKey(occurrence.start_date);
      if (!key) continue;

      marks[key] = {
        ...(marks[key] ?? {}),
        marked: true,
        dotColor: occurrence.event.archived_at ? '#991b1b' : '#0f766e',
      };
    }

    marks[selectedAdminDay] = {
      ...(marks[selectedAdminDay] ?? {}),
      selected: true,
      selectedColor: '#0f766e',
      selectedTextColor: '#ffffff',
    };

    return marks;
  }, [occurrences, selectedAdminDay]);

  const selectedAdminEvents = useMemo<EventOccurrence[]>(
    () => occurrences.filter((occurrence) => toDateKey(occurrence.start_date) === selectedAdminDay),
    [occurrences, selectedAdminDay],
  );

  if (!isAdmin) {
    return (
      <View style={styles.deniedContainer}>
        <MaterialIcons name="lock" size={42} color="#991b1b" />
        <Text style={styles.deniedTitle}>Acceso restringido</Text>
        <Text style={styles.deniedText}>Solo administradores pueden gestionar eventos.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Admin</Text>
          <Text style={styles.title}>Eventos</Text>
          <Text style={styles.subtitle}>Crea eventos oficiales. Si se repiten, se guardan como una sola serie.</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Nuevo evento</Text>
          <EventForm form={form} onChange={setForm} allowRepeat />
          <Pressable disabled={saving} style={styles.primaryButton} onPress={handleCreate}>
            <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Crear evento'}</Text>
          </Pressable>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Calendario administrativo</Text>
          <Calendar
            current={selectedAdminDay}
            onDayPress={(day: DateData) => setSelectedAdminDay(day.dateString)}
            markedDates={markedAdminDates}
            firstDay={1}
            enableSwipeMonths
            theme={{
              calendarBackground: '#ffffff',
              selectedDayBackgroundColor: '#0f766e',
              todayTextColor: '#0f766e',
              arrowColor: '#0f766e',
              monthTextColor: '#0f172a',
              textMonthFontWeight: '900',
              textDayFontWeight: '700',
              textDayHeaderFontWeight: '800',
            }}
          />
          <Text style={styles.muted}>Toca un dia para revisar sus eventos u ocurrencias.</Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Eventos del dia</Text>
          <Text style={styles.sectionCount}>{selectedAdminEvents.length}</Text>
        </View>

        {loading ? <Text style={styles.muted}>Cargando eventos...</Text> : null}

        {selectedAdminEvents.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Sin eventos en este dia</Text>
            <Text style={styles.muted}>Puedes crear uno usando el formulario superior.</Text>
          </View>
        ) : null}

        {selectedAdminEvents.map((occurrence) => (
          <View key={occurrence.id} style={styles.adminItem}>
            <EventCard
              event={occurrence.event}
              startDateOverride={occurrence.start_date}
              occurrenceIndex={occurrence.is_recurring ? occurrence.occurrence_index : undefined}
              onPress={() => openEditor(occurrence.event)}
              showAdminStatus
            />
            <View style={styles.actionsRow}>
              <ActionButton label="Editar serie" onPress={() => openEditor(occurrence.event)} />
              <ActionButton label={occurrence.event.is_published ? 'Despublicar' : 'Publicar'} onPress={() => runAction(() => setEventPublished(occurrence.event.id, !occurrence.event.is_published))} />
              <ActionButton label={occurrence.event.archived_at ? 'Restaurar' : 'Archivar'} onPress={() => runAction(() => (occurrence.event.archived_at ? restoreEvent(occurrence.event.id) : archiveEvent(occurrence.event.id)))} />
              <ActionButton
                label="Eliminar"
                danger
                onPress={() =>
                  Alert.alert('Eliminar evento', 'Se eliminara el evento base y todas sus ocurrencias visibles. Esta accion no se puede deshacer.', [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Eliminar', style: 'destructive', onPress: () => runAction(() => deleteEvent(occurrence.event.id)) },
                  ])
                }
              />
            </View>
          </View>
        ))}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Eventos base</Text>
          <Text style={styles.sectionCount}>{events.length}</Text>
        </View>

        {events.slice(0, 10).map((event) => (
          <EventCard key={`base-${event.id}`} event={event} onPress={() => openEditor(event)} showAdminStatus />
        ))}

        <Modal visible={Boolean(selectedEvent)} transparent animationType="slide" onRequestClose={() => setSelectedEvent(null)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Editar evento</Text>
                <Pressable onPress={() => setSelectedEvent(null)}>
                  <MaterialIcons name="close" size={26} color="#0f172a" />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.modalContent}>
                <EventForm form={editForm} onChange={setEditForm} allowRepeat />
                <Pressable disabled={saving} style={styles.primaryButton} onPress={handleUpdate}>
                  <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar cambios'}</Text>
                </Pressable>

                {selectedEvent ? (
                  <View style={styles.modalActionsGrid}>
                    <ActionButton label={selectedEvent.is_published ? 'Despublicar' : 'Publicar'} onPress={() => runAction(() => setEventPublished(selectedEvent.id, !selectedEvent.is_published), true)} />
                    <ActionButton label={selectedEvent.archived_at ? 'Restaurar' : 'Archivar'} onPress={() => runAction(() => (selectedEvent.archived_at ? restoreEvent(selectedEvent.id) : archiveEvent(selectedEvent.id)), true)} />
                    <ActionButton
                      label="Eliminar"
                      danger
                      onPress={() =>
                        Alert.alert('Eliminar evento', 'Esta accion eliminara la serie completa si el evento se repite.', [
                          { text: 'Cancelar', style: 'cancel' },
                          { text: 'Eliminar', style: 'destructive', onPress: () => runAction(() => deleteEvent(selectedEvent.id), true) },
                        ])
                      }
                    />
                  </View>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

function EventForm({ form, onChange, allowRepeat = false }: { form: EventFormState; onChange: (form: EventFormState) => void; allowRepeat?: boolean }) {
  const [showStartCalendar, setShowStartCalendar] = useState(false);
  const [showEndCalendar, setShowEndCalendar] = useState(false);
  const [showRepeatOptions, setShowRepeatOptions] = useState(false);

  const startMark = {
    [form.start_day]: { selected: true, selectedColor: '#0f766e', selectedTextColor: '#ffffff' },
  };

  const endMark = {
    [form.end_day]: { selected: true, selectedColor: '#0f766e', selectedTextColor: '#ffffff' },
  };

  const selectedRepeat = repeatOptions.find((option) => option.value === form.repeat_type)?.label ?? 'No se repite';

  return (
    <View style={styles.formFields}>
      <TextInput value={form.title} onChangeText={(title) => onChange({ ...form, title })} placeholder="Titulo" style={styles.input} />
      <TextInput value={form.description} onChangeText={(description) => onChange({ ...form, description })} placeholder="Descripcion" multiline style={[styles.input, styles.textArea]} />
      <TextInput value={form.location} onChangeText={(location) => onChange({ ...form, location })} placeholder="Lugar" style={styles.input} />

      <Text style={styles.label}>Dia de inicio</Text>
      <Pressable style={styles.dropdownButton} onPress={() => setShowStartCalendar((value) => !value)}>
        <Text style={styles.dropdownText}>{form.start_day}</Text>
        <MaterialIcons name={showStartCalendar ? 'expand-less' : 'expand-more'} size={24} color="#0f766e" />
      </Pressable>
      {showStartCalendar ? (
        <View style={styles.calendarMiniCard}>
          <Calendar
            current={form.start_day}
            markedDates={startMark}
            onDayPress={(day: DateData) => {
              onChange({ ...form, start_day: day.dateString, end_day: form.has_end_date ? form.end_day : day.dateString });
              setShowStartCalendar(false);
            }}
            firstDay={1}
            enableSwipeMonths
            theme={{ calendarBackground: '#ffffff', selectedDayBackgroundColor: '#0f766e', todayTextColor: '#0f766e', arrowColor: '#0f766e', monthTextColor: '#0f172a', textMonthFontWeight: '900', textDayFontWeight: '700' }}
          />
        </View>
      ) : null}

      <View style={styles.switchRow}>
        <Text style={styles.label}>Agregar hora</Text>
        <Switch value={form.has_time} onValueChange={(has_time) => onChange({ ...form, has_time, start_time: has_time ? form.start_time || '10:00' : '', end_time: has_time ? form.end_time || '11:00' : '' })} />
      </View>

      {form.has_time ? (
        <TextInput value={form.start_time} onChangeText={(start_time) => onChange({ ...form, start_time })} placeholder="Hora, ejemplo 10:00" keyboardType="numbers-and-punctuation" style={styles.input} />
      ) : null}

      <View style={styles.switchRow}>
        <Text style={styles.label}>Agregar fecha de fin</Text>
        <Switch value={form.has_end_date} onValueChange={(has_end_date) => onChange({ ...form, has_end_date, end_day: has_end_date ? form.end_day : form.start_day })} />
      </View>

      {form.has_end_date ? (
        <>
          <Text style={styles.label}>Dia de fin</Text>
          <Pressable style={styles.dropdownButton} onPress={() => setShowEndCalendar((value) => !value)}>
            <Text style={styles.dropdownText}>{form.end_day}</Text>
            <MaterialIcons name={showEndCalendar ? 'expand-less' : 'expand-more'} size={24} color="#0f766e" />
          </Pressable>
          {showEndCalendar ? (
            <View style={styles.calendarMiniCard}>
              <Calendar
                current={form.end_day}
                markedDates={endMark}
                onDayPress={(day: DateData) => {
                  onChange({ ...form, end_day: day.dateString });
                  setShowEndCalendar(false);
                }}
                firstDay={1}
                enableSwipeMonths
                theme={{ calendarBackground: '#ffffff', selectedDayBackgroundColor: '#0f766e', todayTextColor: '#0f766e', arrowColor: '#0f766e', monthTextColor: '#0f172a', textMonthFontWeight: '900', textDayFontWeight: '700' }}
              />
            </View>
          ) : null}

          {form.has_time ? (
            <TextInput value={form.end_time} onChangeText={(end_time) => onChange({ ...form, end_time })} placeholder="Hora de fin, ejemplo 12:00" keyboardType="numbers-and-punctuation" style={styles.input} />
          ) : null}
        </>
      ) : null}

      <Text style={styles.label}>Audiencia</Text>
      <View style={styles.segmentRow}>
        {audienceOptions.map((option) => (
          <Pressable key={option.value} onPress={() => onChange({ ...form, audience: option.value })} style={[styles.segment, form.audience === option.value && styles.segmentActive]}>
            <Text style={[styles.segmentText, form.audience === option.value && styles.segmentTextActive]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.label}>Publicado</Text>
        <Switch value={form.is_published} onValueChange={(is_published) => onChange({ ...form, is_published })} />
      </View>

      {allowRepeat ? (
        <View style={styles.repeatBox}>
          <Text style={styles.formTitle}>Repetir</Text>
          <Pressable style={styles.dropdownButton} onPress={() => setShowRepeatOptions((value) => !value)}>
            <Text style={styles.dropdownText}>{selectedRepeat}</Text>
            <MaterialIcons name={showRepeatOptions ? 'expand-less' : 'expand-more'} size={24} color="#0f766e" />
          </Pressable>

          {showRepeatOptions ? (
            <View style={styles.optionList}>
              {repeatOptions.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.optionItem, form.repeat_type === option.value && styles.optionItemActive]}
                  onPress={() => {
                    onChange({ ...form, repeat_type: option.value });
                    setShowRepeatOptions(false);
                  }}
                >
                  <Text style={[styles.optionText, form.repeat_type === option.value && styles.optionTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {form.repeat_type === 'custom_days' ? (
            <TextInput value={form.repeat_interval_days} onChangeText={(repeat_interval_days) => onChange({ ...form, repeat_interval_days })} placeholder="Cada cuantos dias, ejemplo 20" keyboardType="number-pad" style={styles.input} />
          ) : null}

          {form.repeat_type !== 'none' ? (
            <Text style={styles.muted}>Se guardará como una sola serie. No se crean eventos separados. Maximo 10 ocurrencias visibles.</Text>
          ) : null}
        </View>
      ) : null}
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
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { gap: 16, padding: 20, paddingBottom: 100 },
  hero: { gap: 8, padding: 22, borderRadius: 26, backgroundColor: '#0f172a' },
  kicker: { color: '#5eead4', fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: '#ffffff', fontSize: 28, fontWeight: '900' },
  subtitle: { color: '#cbd5e1', fontSize: 14, lineHeight: 20 },
  formCard: { gap: 14, padding: 16, borderRadius: 22, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  formTitle: { color: '#0f172a', fontSize: 18, fontWeight: '900' },
  formFields: { gap: 10 },
  calendarMiniCard: { overflow: 'hidden', borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  dropdownButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1' },
  dropdownText: { color: '#0f172a', fontSize: 14, fontWeight: '800' },
  input: { minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', color: '#0f172a' },
  textArea: { minHeight: 100, paddingTop: 12, textAlignVertical: 'top' },
  label: { color: '#0f172a', fontSize: 13, fontWeight: '900' },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: '#f1f5f9' },
  segmentActive: { backgroundColor: '#0f766e' },
  segmentText: { color: '#64748b', fontSize: 12, fontWeight: '900' },
  segmentTextActive: { color: '#ffffff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  repeatBox: { gap: 10, padding: 12, borderRadius: 16, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  optionList: { overflow: 'hidden', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  optionItem: { padding: 12, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  optionItemActive: { backgroundColor: '#ccfbf1' },
  optionText: { color: '#334155', fontSize: 14, fontWeight: '800' },
  optionTextActive: { color: '#0f766e' },
  primaryButton: { alignItems: 'center', padding: 15, borderRadius: 16, backgroundColor: '#0f766e' },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#0f172a', fontSize: 20, fontWeight: '900' },
  sectionCount: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, color: '#0f766e', backgroundColor: '#ccfbf1', fontSize: 12, fontWeight: '900' },
  muted: { color: '#64748b', fontSize: 14, lineHeight: 20 },
  emptyBox: { gap: 6, padding: 18, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  emptyTitle: { color: '#0f172a', fontSize: 16, fontWeight: '900' },
  adminItem: { gap: 10 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modalActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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

