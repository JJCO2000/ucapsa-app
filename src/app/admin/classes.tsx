import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { AdminDogPicker, type AdminDogMode } from '../../components/domain/AdminDogPicker';
import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { createDogForUserAdmin, getDogsForUser, type BasicDog } from '../../services/dogs.service';
import {
  createProgramEnrollment,
  formatNextProgramClassLabel,
  formatProgramScheduleDetailLabel,
  formatProgramScheduleDisplayLabel,
  formatProgramScheduleName,
  getAdminProgramRows,
  getDefaultProgramLevel,
  getProgramClientProfiles,
  getProgramEnrollmentDogName,
  getProgramLevelLabel,
  getProgramSchedules,
  getProgramStatusLabel,
  getPrograms,
  getRecommendedScheduleId,
  programLevelOptions,
  sortProgramSchedules,
} from '../../services/programs.service';
import type {
  Profile,
  ProgramCode,
  ProgramEnrollmentWithDetails,
  ProgramLevel,
  ProgramSchedule,
  UcapsaProgram,
} from '../../types/app.types';

type EnrollmentFormState = {
  userId: string;
  programId: string;
  scheduleId: string;
  dogId: string;
  dogMode: AdminDogMode;
  dogName: string;
  physicalCardNumber: string;
  programLevel: ProgramLevel;
  notes: string;
};

type ProgramFilter = 'all' | ProgramCode;
type StatusFilter = 'active' | 'completed' | 'cancelled' | 'all';

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'active', label: 'Activas' },
  { value: 'completed', label: 'Completadas' },
  { value: 'cancelled', label: 'Canceladas' },
  { value: 'all', label: 'Todas' },
];

function emptyForm(): EnrollmentFormState {
  return {
    userId: '',
    programId: '',
    scheduleId: 'auto',
    dogId: '',
    dogMode: 'new',
    dogName: '',
    physicalCardNumber: '',
    programLevel: 'base',
    notes: '',
  };
}

function normalizeTerm(value: string) {
  return value.trim().toLowerCase();
}

function profileLabel(profile: Profile | null | undefined) {
  return profile?.full_name?.trim() || profile?.email?.trim() || 'Cliente';
}

function getSchedulesForProgram(schedules: ProgramSchedule[], programId: string) {
  return sortProgramSchedules(schedules.filter((schedule) => schedule.program_id === programId && schedule.is_active));
}

export default function AdminClassesScreen() {
  const params = useLocalSearchParams<{ userId?: string; program?: string; status?: string }>();
  const routeUserId = typeof params.userId === 'string' ? params.userId.trim() : '';

  const [programs, setPrograms] = useState<UcapsaProgram[]>([]);
  const [schedules, setSchedules] = useState<ProgramSchedule[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rows, setRows] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [createDogs, setCreateDogs] = useState<BasicDog[]>([]);
  const [form, setForm] = useState<EnrollmentFormState>(() => emptyForm());
  const [clientSearch, setClientSearch] = useState('');
  const [rowSearch, setRowSearch] = useState('');
  const [programFilter, setProgramFilter] = useState<ProgramFilter>(
    params.program === 'puppy' || params.program === 'comandos' ? params.program : 'all',
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    params.status === 'completed' || params.status === 'cancelled' || params.status === 'all'
      ? params.status
      : 'active',
  );
  const [scheduleFilter, setScheduleFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(Boolean(params.program || params.status));
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [programResult, scheduleResult, profileResult, rowResult] = await Promise.all([
        getPrograms(),
        getProgramSchedules(),
        getProgramClientProfiles(),
        getAdminProgramRows(),
      ]);
      setPrograms(programResult);
      setSchedules(scheduleResult);
      setProfiles(profileResult);
      setRows(rowResult);
      setForm((current) => {
        const selected = programResult.find((program) => program.id === current.programId) ?? programResult[0] ?? null;
        return {
          ...current,
          programId: selected?.id ?? '',
          programLevel: current.programId ? current.programLevel : getDefaultProgramLevel(selected),
        };
      });
    } catch (cause) {
      Alert.alert('No se pudieron cargar inscripciones', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadData();
    return undefined;
  }, [loadData]));

  async function refresh() {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }

  const activeSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.is_active),
    [schedules],
  );

  const filteredRows = useMemo(() => {
    const term = normalizeTerm(rowSearch);
    const base = rows.filter((row) => {
      if (routeUserId && row.enrollment.user_id !== routeUserId) return false;
      if (programFilter !== 'all' && row.program.code !== programFilter) return false;
      if (statusFilter !== 'all' && row.enrollment.status !== statusFilter) return false;
      if (scheduleFilter !== 'all' && row.schedule.id !== scheduleFilter) return false;
      if (!term) return true;
      const haystack = [
        profileLabel(row.profile),
        row.profile?.email ?? '',
        getProgramEnrollmentDogName(row),
        row.enrollment.physical_card_number ?? '',
        row.program.name,
        formatProgramScheduleDisplayLabel(row.schedule, row.program),
        getProgramLevelLabel(row.enrollment.program_level),
      ].join(' ').toLowerCase();
      return haystack.includes(term);
    });

    return [...base].sort((a, b) => {
      const inactiveDiff = Number(a.enrollment.status !== 'active') - Number(b.enrollment.status !== 'active');
      if (inactiveDiff !== 0) return inactiveDiff;
      const programDiff = a.program.name.localeCompare(b.program.name, 'es-MX', { sensitivity: 'base', numeric: true });
      if (programDiff !== 0) return programDiff;
      const scheduleDiff = (a.schedule.sequence_order ?? 99) - (b.schedule.sequence_order ?? 99);
      if (scheduleDiff !== 0) return scheduleDiff;
      return profileLabel(a.profile).localeCompare(profileLabel(b.profile), 'es-MX', { sensitivity: 'base', numeric: true });
    });
  }, [programFilter, routeUserId, rowSearch, rows, scheduleFilter, statusFilter]);

  const selectedProgram = programs.find((program) => program.id === form.programId) ?? null;
  const selectedProfile = profiles.find((profile) => profile.user_id === form.userId) ?? null;
  const schedulesForSelectedProgram = selectedProgram ? getSchedulesForProgram(schedules, selectedProgram.id) : [];

  const filteredProfiles = useMemo(() => {
    const term = normalizeTerm(clientSearch);
    if (!term) return [];
    return profiles
      .filter((profile) => `${profile.full_name ?? ''} ${profile.email ?? ''} ${profile.phone ?? ''}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [clientSearch, profiles]);

  function chooseProgram(programId: string) {
    const nextProgram = programs.find((program) => program.id === programId) ?? null;
    setForm((current) => ({
      ...current,
      programId,
      scheduleId: 'auto',
      programLevel: getDefaultProgramLevel(nextProgram),
    }));
  }

  async function chooseProfile(profile: Profile) {
    setClientSearch(profileLabel(profile));
    setCreateDogs([]);
    setForm((current) => ({ ...current, userId: profile.user_id, dogId: '', dogMode: 'new', dogName: '' }));
    try {
      const dogRows = await getDogsForUser(profile.user_id);
      const firstDog = dogRows[0] ?? null;
      setForm((current) => current.userId !== profile.user_id ? current : {
        ...current,
        dogId: firstDog?.id ?? '',
        dogMode: firstDog ? 'existing' : 'new',
        dogName: firstDog?.name ?? '',
      });
      setCreateDogs(dogRows);
    } catch (cause) {
      setForm((current) => current.userId !== profile.user_id ? current : {
        ...current,
        dogId: '',
        dogMode: 'new',
        dogName: '',
      });
      Alert.alert('No se pudieron cargar los perros', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    }
  }

  function openCreate(userId = routeUserId) {
    const firstProgram = programs[0] ?? null;
    setForm({
      ...emptyForm(),
      userId,
      programId: firstProgram?.id ?? '',
      programLevel: getDefaultProgramLevel(firstProgram),
    });
    setCreateDogs([]);

    const profile = userId ? profiles.find((item) => item.user_id === userId) ?? null : null;
    setClientSearch(profile ? profileLabel(profile) : '');
    if (profile) void chooseProfile(profile);
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!form.userId) {
      Alert.alert('Selecciona cliente', 'Elige a la persona que se inscribe al programa.');
      return;
    }

    const effectiveScheduleId = form.scheduleId === 'auto'
      ? getRecommendedScheduleId(form.programId, schedules, 0)
      : form.scheduleId;

    if (!form.programId || !effectiveScheduleId) {
      Alert.alert('Falta programa u horario', 'Selecciona programa y horario.');
      return;
    }

    const selectedDog = form.dogMode === 'existing'
      ? createDogs.find((dog) => dog.id === form.dogId) ?? null
      : null;
    const resolvedDogName = selectedDog?.name ?? form.dogName.trim();

    if (form.dogMode === 'existing' && !selectedDog) {
      Alert.alert('Selecciona perro', 'Elige uno de los perros registrados para este cliente.');
      return;
    }
    if (!resolvedDogName) {
      Alert.alert('Falta perro', 'Escribe el nombre del nuevo perro.');
      return;
    }

    try {
      setSaving(true);
      const linkedDog = selectedDog ?? await createDogForUserAdmin(form.userId, resolvedDogName);
      await createProgramEnrollment({
        userId: form.userId,
        programId: form.programId,
        scheduleId: effectiveScheduleId,
        dogId: linkedDog.id,
        dogName: linkedDog.name,
        physicalCardNumber: form.physicalCardNumber,
        programLevel: selectedProgram?.code === 'comandos' ? form.programLevel : 'base',
        notes: form.notes,
      });
      setCreateOpen(false);
      setClientSearch('');
      await loadData();
      Alert.alert('Inscripción creada', 'La inscripción quedó lista. Las asistencias se registran desde la ficha del cliente.');
    } catch (cause) {
      Alert.alert('No se pudo crear', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Admin · Clases</Text>
          <Text style={styles.title}>Inscripciones</Text>
          <Text style={styles.subtitle}>Busca una inscripción, abre su ficha o crea una nueva. Horarios, cancelaciones y asistencias viven en sus pantallas propias.</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Nueva inscripción" style={styles.addButton} onPress={() => openCreate()}>
          <MaterialIcons name="add" size={22} color={ucapsaBrand.colors.surface} />
        </Pressable>
      </View>

      <View style={styles.searchCard}>
        <View style={styles.searchRow}>
          <MaterialIcons name="search" size={20} color={ucapsaBrand.colors.muted} />
          <TextInput
            value={rowSearch}
            onChangeText={setRowSearch}
            placeholder="Cliente, perro, programa o tarjeta"
            style={styles.searchInput}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Filtros" style={styles.filterButton} onPress={() => setFiltersOpen((value) => !value)}>
            <MaterialIcons name="tune" size={19} color={ucapsaBrand.colors.redDark} />
          </Pressable>
        </View>

        {filtersOpen ? (
          <View style={styles.filterPanel}>
            <Text style={styles.label}>Programa</Text>
            <SelectList
              selectedValue={programFilter}
              options={[
                { value: 'all', label: 'Todos' },
                ...programs.map((program) => ({ value: program.code, label: program.name })),
              ]}
              onSelect={(value) => {
                setProgramFilter(value as ProgramFilter);
                setScheduleFilter('all');
              }}
            />

            <Text style={styles.label}>Estado</Text>
            <SelectList selectedValue={statusFilter} options={statusOptions} onSelect={(value) => setStatusFilter(value as StatusFilter)} />

            <Text style={styles.label}>Horario</Text>
            <SelectList
              selectedValue={scheduleFilter}
              options={[
                { value: 'all', label: 'Todos los horarios' },
                ...activeSchedules
                  .filter((schedule) => programFilter === 'all' || programs.find((program) => program.id === schedule.program_id)?.code === programFilter)
                  .map((schedule) => ({
                    value: schedule.id,
                    label: formatProgramScheduleDisplayLabel(
                      schedule,
                      programs.find((program) => program.id === schedule.program_id) ?? null,
                    ),
                  })),
              ]}
              onSelect={setScheduleFilter}
            />
          </View>
        ) : null}
      </View>

      {routeUserId ? (
        <View style={styles.contextBanner}>
          <MaterialIcons name="person" size={18} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.contextText}>Mostrando sólo las inscripciones del cliente seleccionado.</Text>
        </View>
      ) : null}

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>Resultados</Text>
        <Text style={styles.countText}>{filteredRows.length} de {rows.length}</Text>
      </View>

      {loading ? <Text style={styles.muted}>Cargando inscripciones...</Text> : null}

      {!loading && filteredRows.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialIcons name="school" size={30} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.emptyTitle}>Sin inscripciones visibles</Text>
          <Text style={styles.muted}>Cambia los filtros o crea una nueva inscripción.</Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {filteredRows.map((row, index) => (
          <Pressable
            key={row.enrollment.id}
            accessibilityRole="button"
            accessibilityLabel={`Abrir inscripción de ${profileLabel(row.profile)} con ${getProgramEnrollmentDogName(row)}`}
            style={[styles.row, index === filteredRows.length - 1 && styles.rowLast]}
            onPress={() => router.push(`/admin/customer-class?userId=${encodeURIComponent(row.enrollment.user_id)}&enrollmentId=${encodeURIComponent(row.enrollment.id)}` as never)}
          >
            <View style={styles.rowIcon}>
              <MaterialIcons name={row.program.code === 'puppy' ? 'pets' : 'school'} size={20} color={ucapsaBrand.colors.redDark} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.rowTitleLine}>
                <Text numberOfLines={1} style={styles.rowTitle}>{profileLabel(row.profile)}</Text>
                <Text style={[styles.statusPill, row.enrollment.status !== 'active' && styles.statusPillMuted]}>{getProgramStatusLabel(row.enrollment.status)}</Text>
              </View>
              <Text style={styles.rowMeta}>{getProgramEnrollmentDogName(row)} · {row.program.name}{row.program.code === 'comandos' ? ` · ${getProgramLevelLabel(row.enrollment.program_level)}` : ''}</Text>
              <Text style={styles.rowMeta}>{formatProgramScheduleName(row.schedule, row.program)} · {formatProgramScheduleDetailLabel(row.schedule)}</Text>
              <Text style={styles.rowMeta}>{formatNextProgramClassLabel(row.schedule)}</Text>
              <Text style={styles.rowMeta}>Asistencias {row.enrollment.attendances_count}/{row.program.required_attendances} · Tarjeta {row.enrollment.physical_card_number || 'sin número'}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={23} color={ucapsaBrand.colors.redDark} />
          </Pressable>
        ))}
      </View>

      <CreateEnrollmentModal
        visible={createOpen}
        saving={saving}
        form={form}
        programs={programs}
        profiles={filteredProfiles}
        selectedProgram={selectedProgram}
        schedules={schedulesForSelectedProgram}
        dogs={createDogs}
        clientSearch={clientSearch}
        onClose={() => setCreateOpen(false)}
        onSave={handleCreate}
        onClientSearch={setClientSearch}
        onChooseProfile={chooseProfile}
        onChooseProgram={chooseProgram}
        onChange={setForm}
      />
    </KeyboardAwareScreen>
  );
}

function CreateEnrollmentModal({
  visible,
  saving,
  form,
  programs,
  profiles,
  selectedProgram,
  schedules,
  dogs,
  clientSearch,
  onClose,
  onSave,
  onClientSearch,
  onChooseProfile,
  onChooseProgram,
  onChange,
}: {
  visible: boolean;
  saving: boolean;
  form: EnrollmentFormState;
  programs: UcapsaProgram[];
  profiles: Profile[];
  selectedProgram: UcapsaProgram | null;
  schedules: ProgramSchedule[];
  dogs: BasicDog[];
  clientSearch: string;
  onClose: () => void;
  onSave: () => void;
  onClientSearch: (value: string) => void;
  onChooseProfile: (profile: Profile) => void;
  onChooseProgram: (programId: string) => void;
  onChange: (form: EnrollmentFormState) => void;
}) {
  return (
    <KeyboardAwareModal visible={visible} onClose={onClose}>
      <Text style={styles.modalKicker}>Inscripciones</Text>
      <Text style={styles.modalTitle}>Nueva inscripción</Text>

      <Text style={styles.label}>Cliente</Text>
      <TextInput value={clientSearch} onChangeText={onClientSearch} placeholder="Buscar por nombre, correo o teléfono" style={styles.input} />
      <View style={styles.optionsBox}>
        {clientSearch.trim().length === 0 ? (
          <Text style={styles.optionHint}>Escribe para buscar un cliente.</Text>
        ) : profiles.length === 0 ? (
          <Text style={styles.optionHint}>No hay coincidencias.</Text>
        ) : (
          profiles.map((profile) => (
            <Pressable
              key={profile.user_id}
              style={[styles.optionItem, form.userId === profile.user_id && styles.optionItemActive]}
              onPress={() => onChooseProfile(profile)}
            >
              <Text style={[styles.optionTitle, form.userId === profile.user_id && styles.optionTitleActive]}>{profileLabel(profile)}</Text>
              <Text style={styles.optionMeta}>{profile.email || 'Sin correo'}</Text>
            </Pressable>
          ))
        )}
      </View>

      <Text style={styles.label}>Programa</Text>
      <ChipRow options={programs.map((program) => ({ value: program.id, label: program.name }))} value={form.programId} onChange={onChooseProgram} />

      {selectedProgram?.code === 'comandos' ? (
        <>
          <Text style={styles.label}>Nivel Comandos</Text>
          <ChipRow options={programLevelOptions} value={form.programLevel} onChange={(programLevel) => onChange({ ...form, programLevel: programLevel as ProgramLevel })} />
        </>
      ) : null}

      <Text style={styles.label}>Horario</Text>
      <SelectList
        selectedValue={form.scheduleId}
        options={[
          { value: 'auto', label: 'Automático por avance' },
          ...schedules.map((schedule) => ({ value: schedule.id, label: formatProgramScheduleDisplayLabel(schedule, selectedProgram) })),
        ]}
        onSelect={(scheduleId) => onChange({ ...form, scheduleId })}
      />
      <Text style={styles.hint}>Una inscripción nueva inicia con 0 asistencias. El avance se deriva de asistencias reales.</Text>

      <AdminDogPicker
        dogs={dogs}
        mode={form.dogMode}
        selectedDogId={form.dogId}
        newDogName={form.dogName}
        onModeChange={(dogMode) => {
          const firstDog = dogs[0] ?? null;
          onChange({
            ...form,
            dogMode,
            dogId: dogMode === 'existing' ? firstDog?.id ?? '' : '',
            dogName: dogMode === 'existing' ? firstDog?.name ?? '' : '',
          });
        }}
        onSelectDog={(dog) => onChange({ ...form, dogMode: 'existing', dogId: dog.id, dogName: dog.name })}
        onNewDogNameChange={(dogName) => onChange({ ...form, dogMode: 'new', dogId: '', dogName })}
      />

      <Text style={styles.label}>Número de tarjeta física</Text>
      <TextInput value={form.physicalCardNumber} onChangeText={(physicalCardNumber) => onChange({ ...form, physicalCardNumber })} placeholder="Ej. P-0142" autoCapitalize="characters" style={styles.input} />

      <Text style={styles.label}>Notas</Text>
      <TextInput value={form.notes} onChangeText={(notes) => onChange({ ...form, notes })} multiline style={[styles.input, styles.textArea]} />

      <Pressable disabled={saving} style={[styles.primaryButton, saving && styles.disabled]} onPress={onSave}>
        <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar inscripción'}</Text>
      </Pressable>
      <Pressable disabled={saving} style={styles.secondaryButton} onPress={onClose}>
        <Text style={styles.secondaryButtonText}>Cancelar</Text>
      </Pressable>
    </KeyboardAwareModal>
  );
}

function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmentRow}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          style={[styles.segment, value === option.value && styles.segmentActive]}
          onPress={() => onChange(option.value)}
        >
          <Text style={[styles.segmentText, value === option.value && styles.segmentTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function SelectList({
  selectedValue,
  options,
  onSelect,
}: {
  selectedValue: string;
  options: Array<{ value: string; label: string }>;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((option) => option.value === selectedValue)?.label ?? 'Seleccionar';

  return (
    <View>
      <Pressable style={styles.selectButton} onPress={() => setOpen((value) => !value)}>
        <Text numberOfLines={2} style={styles.selectButtonText}>{selectedLabel}</Text>
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={22} color={ucapsaBrand.colors.redDark} />
      </Pressable>
      {open ? (
        <View style={styles.selectOptions}>
          {options.map((option) => (
            <Pressable
              key={option.value}
              style={[styles.selectOption, selectedValue === option.value && styles.selectOptionActive]}
              onPress={() => {
                onSelect(option.value);
                setOpen(false);
              }}
            >
              <Text style={[styles.selectOptionText, selectedValue === option.value && styles.selectOptionTextActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 29, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 3 },
  addButton: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.red },
  searchCard: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 10, marginBottom: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, minHeight: 44, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '700' },
  filterButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  filterPanel: { gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.border, marginTop: 8 },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 4 },
  contextBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.redSoft, padding: 11, marginBottom: 12 },
  contextText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  countText: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '800' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  emptyCard: { alignItems: 'center', gap: 7, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 24 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  list: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  rowMeta: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  statusPill: { borderRadius: 999, overflow: 'hidden', backgroundColor: ucapsaBrand.colors.redSoft, color: ucapsaBrand.colors.redDark, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: '900' },
  statusPillMuted: { backgroundColor: ucapsaBrand.colors.graySoft, color: ucapsaBrand.colors.grayDark },
  modalKicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 24, fontWeight: '900', marginTop: 3, marginBottom: 8 },
  input: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.background, color: ucapsaBrand.colors.text, paddingHorizontal: 12, fontSize: 13, fontWeight: '700' },
  textArea: { minHeight: 82, paddingTop: 11, textAlignVertical: 'top' },
  optionsBox: { gap: 7 },
  optionHint: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', borderRadius: 14, backgroundColor: ucapsaBrand.colors.background, padding: 11 },
  optionItem: { borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.background, padding: 11 },
  optionItemActive: { borderColor: ucapsaBrand.colors.red, backgroundColor: ucapsaBrand.colors.redSoft },
  optionTitle: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  optionTitleActive: { color: ucapsaBrand.colors.redDark },
  optionMeta: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  segment: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, paddingVertical: 9 },
  segmentActive: { borderColor: ucapsaBrand.colors.red, backgroundColor: ucapsaBrand.colors.red },
  segmentText: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '900' },
  segmentTextActive: { color: ucapsaBrand.colors.surface },
  selectButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.background, paddingHorizontal: 12 },
  selectButtonText: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  selectOptions: { gap: 6, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 7, marginTop: 6 },
  selectOption: { borderRadius: 12, backgroundColor: ucapsaBrand.colors.background, padding: 10 },
  selectOptionActive: { backgroundColor: ucapsaBrand.colors.redSoft },
  selectOptionText: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '800' },
  selectOptionTextActive: { color: ucapsaBrand.colors.redDark, fontWeight: '900' },
  primaryButton: { alignItems: 'center', borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingVertical: 13, marginTop: 10 },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingVertical: 12, marginTop: 8 },
  secondaryButtonText: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.5 },
});
