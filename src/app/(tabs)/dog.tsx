import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { DogAvatar } from '../../components/domain/DogAvatar';
import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { useReturnToProfile } from '../../hooks/useReturnToProfile';
import { useSession } from '../../hooks/useSession';
import { devWarn } from '../../lib/client-diagnostics';
import { getPrivateDogPhotoUrls } from '../../services/dog-photos.service';
import { createMyDog, getMyDogs, type BasicDog } from '../../services/dogs.service';
import { clientReadKeys, readClientResource, sanitizeProgramRowsForCache, writeClientResource } from '../../services/client-read-cache.service';
import { getMyProgramEnrollments, getProgramCodeLabel, getProgramLevelDisplayLabel } from '../../services/programs.service';
import type { ProgramEnrollmentWithDetails } from '../../types/app.types';
import { DEFAULT_READ_TIMEOUT_MS, friendlyWriteError, withOperationTimeout } from '../../utils/async.utils';

type EditorMode = 'create' | null;

function sameDogName(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? '').trim().toLocaleLowerCase('es-MX') === (right ?? '').trim().toLocaleLowerCase('es-MX');
}

export default function DogTab() {
  const { dogId: dogIdParam, from } = useLocalSearchParams<{ dogId?: string | string[]; from?: string | string[] }>();
  const requestedDogId = Array.isArray(dogIdParam) ? dogIdParam[0] ?? null : dogIdParam ?? null;
  const fromProfile = (Array.isArray(from) ? from[0] : from) === 'profile';
  const backToProfile = useReturnToProfile(fromProfile);
  const { user, role, isAdmin } = useSession();
  const [dogs, setDogs] = useState<BasicDog[]>([]);
  const [rows, setRows] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string | null>>({});
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [programWarning, setProgramWarning] = useState(false);
  const [offlineEmpty, setOfflineEmpty] = useState(false);
  const cacheScopeRef = useRef<string | null>(null);
  const loadRunRef = useRef(0);
  const lastRequestedDogIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const runId = loadRunRef.current + 1;
    loadRunRef.current = runId;
    const isCurrentRun = () => loadRunRef.current === runId;
    const scope = user?.id ?? (isAdmin ? 'admin' : 'public');

    if (cacheScopeRef.current !== scope) {
      cacheScopeRef.current = scope;
      setDogs([]);
      setRows([]);
      setPhotoUrls({});
      setSelectedDogId(null);
      setLocalReady(false);
      setUsingSavedData(false);
      setSavedAt(null);
      setProgramWarning(false);
      setOfflineEmpty(false);
      lastRequestedDogIdRef.current = null;
    }

    if (!user || isAdmin) return;
    if (!isCurrentRun()) return;
    setUsingSavedData(false);
    setProgramWarning(false);
    setOfflineEmpty(false);

    const [dogCache, programCache] = await Promise.all([
      readClientResource<BasicDog[]>(user.id, clientReadKeys.dogs),
      readClientResource<ProgramEnrollmentWithDetails[]>(user.id, clientReadKeys.programs),
    ]);
    if (!isCurrentRun()) return;

    let nextDogs = dogCache?.data ?? [];
    let nextPrograms = programCache?.data ?? [];

    if (dogCache || programCache) {
      setDogs(nextDogs);
      setRows(nextPrograms);
      setSavedAt(dogCache?.saved_at ?? programCache?.saved_at ?? null);
    }
    setSelectedDogId((current) => {
      if (current && nextDogs.some((dog) => dog.id === current)) return current;
      return nextDogs[0]?.id ?? null;
    });
    setLocalReady(true);

    const [dogResult, programResult] = await Promise.allSettled([
      withOperationTimeout(getMyDogs(), DEFAULT_READ_TIMEOUT_MS, 'dogs'),
      withOperationTimeout(getMyProgramEnrollments(), DEFAULT_READ_TIMEOUT_MS, 'dog-programs'),
    ]);
    if (!isCurrentRun()) return;

    if (dogResult.status === 'fulfilled') {
      nextDogs = dogResult.value;
      const stored = await writeClientResource(user.id, clientReadKeys.dogs, nextDogs);
      if (!isCurrentRun()) return;
      setSavedAt(stored.saved_at);
    }
    if (programResult.status === 'fulfilled') {
      nextPrograms = programResult.value;
      await writeClientResource(user.id, clientReadKeys.programs, sanitizeProgramRowsForCache(nextPrograms));
      if (!isCurrentRun()) return;
    }

    setDogs(nextDogs);
    setRows(nextPrograms);
    setSelectedDogId((current) => {
      if (current && nextDogs.some((dog) => dog.id === current)) return current;
      return nextDogs[0]?.id ?? null;
    });

    const dogFailed = dogResult.status === 'rejected';
    const programFailed = programResult.status === 'rejected';
    if (dogFailed && !dogCache) setOfflineEmpty(true);
    if (dogFailed || programFailed) {
      setUsingSavedData(Boolean((dogFailed && dogCache) || (programFailed && programCache)));
      setSavedAt(
        dogFailed && dogCache
          ? dogCache.saved_at
          : programFailed && programCache
            ? programCache.saved_at
            : null,
      );
    }
    if (programFailed && !programCache) setProgramWarning(true);
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => {
      loadRunRef.current += 1;
    };
  }, [load]));

  useEffect(() => {
    if (!requestedDogId) {
      lastRequestedDogIdRef.current = null;
      return;
    }
    if (lastRequestedDogIdRef.current === requestedDogId) return;
    if (!dogs.some((dog) => dog.id === requestedDogId)) return;
    lastRequestedDogIdRef.current = requestedDogId;
    setSelectedDogId(requestedDogId);
  }, [dogs, requestedDogId]);

  useEffect(() => {
    let active = true;
    const paths = Object.fromEntries(dogs.map((dog) => [dog.id, dog.photo_path]));
    void getPrivateDogPhotoUrls(paths)
      .then((urls) => {
        if (active) setPhotoUrls(urls);
      })
      .catch((cause) => {
        devWarn('dog-tab: could not resolve private dog photo URLs; falling back to dog avatars.', cause);
        if (active) setPhotoUrls({});
      });
    return () => { active = false; };
  }, [dogs]);

    const activeEnrollments = useMemo(() => rows.filter((item) => item.enrollment.status === 'active'), [rows]);
  const memberDogIds = useMemo(
    () => new Set(
      activeEnrollments
        .filter((item) => item.enrollment.access_mode === 'membership' && item.enrollment.dog_id)
        .map((item) => item.enrollment.dog_id as string),
    ),
    [activeEnrollments],
  );
  const format = useMemo(
    () => resolveUcapsaFormat({ user, role, isAdmin, hasActivePrograms: activeEnrollments.length > 0 }),
    [activeEnrollments.length, isAdmin, role, user],
  );
  const premium = format.key === 'member';
  const selectedDog = useMemo(() => dogs.find((dog) => dog.id === selectedDogId) ?? dogs[0] ?? null, [dogs, selectedDogId]);
  const selectedEnrollments = useMemo(() => {
    if (!selectedDog) return [];
    return rows.filter((item) => {
      if (item.enrollment.dog_id) return item.enrollment.dog_id === selectedDog.id;
      return sameDogName(item.enrollment.dog_name, selectedDog.name);
    });
  }, [rows, selectedDog]);
  const selectedActive = useMemo(() => selectedEnrollments.filter((item) => item.enrollment.status === 'active'), [selectedEnrollments]);

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }


  function openCreate() {
    setDraftName('');
    setEditorMode('create');
  }

  function openEditProfile() {
    if (!selectedDog) {
      openCreate();
      return;
    }
    router.push(`/client/dog-profile?dogId=${encodeURIComponent(selectedDog.id)}` as never);
  }

  async function saveDog() {
    const userId = user?.id;
    if (!userId) {
      Alert.alert('Sesión requerida', 'Vuelve a iniciar sesión para guardar cambios.');
      return;
    }

    const name = draftName.trim();
    if (!name) {
      Alert.alert('Falta el nombre', 'Escribe el nombre de tu perro.');
      return;
    }

    setSaving(true);
    try {
      // Crear un perro no usa timeout artificial: una petición tardía podría completar después y duplicarse al reintentar.
      const created = await createMyDog(name);
      const nextDogs = [...dogs.filter((dog) => dog.id !== created.id), created];

      // La escritura ya fue confirmada. Actualiza primero la vista y la caché local;
      // si la lectura posterior falla, el usuario no debe ver desaparecer el cambio.
      setDogs(nextDogs);
      await writeClientResource(userId, clientReadKeys.dogs, nextDogs);
      setEditorMode(null);
      setDraftName('');
      setSelectedDogId(created.id);
      void load();
    } catch (cause) {
      Alert.alert('No se pudo guardar', friendlyWriteError(cause, 'Conéctate a internet y vuelve a intentar.'));
    } finally {
      setSaving(false);
    }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      contentContainerStyle={[styles.screenContent, premium && styles.premiumContent]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="dog" />
      <CompactDogHeader
        dogsCount={dogs.length}
        offlineEmpty={offlineEmpty}
        premium={premium}
        format={format}
        onBack={fromProfile ? backToProfile : undefined}
        onAdd={openCreate}
      />

      {usingSavedData ? <OfflineDataNotice savedAt={savedAt} onRetry={() => void refresh()} premium={premium} label="Mostrando información guardada" /> : null}

      {programWarning && dogs.length > 0 ? (
        <View style={[styles.offlineCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <MaterialIcons name="cloud-off" size={22} color={premium ? ucapsaBrand.colors.premiumActionText : format.accentDark} />
          <View style={styles.offlineCopy}>
            <Text style={[styles.offlineTitle, { color: format.cardText }]}>Clases aún no guardadas</Text>
            <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Tus perros están disponibles. Conéctate una vez para guardar también sus clases y asistencias.</Text>
          </View>
        </View>
      ) : null}



      {localReady ? (
        <>
          {dogs.length !== 1 ? (
            <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
              <View style={styles.sectionHeader}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.sectionTitle, { color: format.cardText }]}>Tus perros</Text>
                  <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                    {offlineEmpty ? 'No hay una copia local todavía.' : dogs.length > 1 ? 'Selecciona un perro.' : 'Agrega tu primer perro.'}
                  </Text>
                </View>
                {!offlineEmpty && dogs.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Agregar perro"
                    style={[styles.addButton, { backgroundColor: format.primaryButton }]}
                    onPress={openCreate}
                  >
                    <MaterialIcons name="add" size={19} color={format.primaryButtonText} />
                    <Text style={[styles.addButtonText, { color: format.primaryButtonText }]}>Agregar</Text>
                  </Pressable>
                ) : null}
              </View>

              {offlineEmpty ? (
                <View style={[styles.emptyDog, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]}>
                  <MaterialIcons name="cloud-off" size={28} color={premium ? ucapsaBrand.colors.premiumActionText : format.accentDark} />
                  <Text style={[styles.emptyDogTitle, { color: format.cardText }]}>Perros aún no guardados</Text>
                  <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>La app funciona sin conexión después de la primera sincronización. Conéctate una vez para guardar tus perros en este dispositivo.</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Reintentar sincronización de perros"
                    style={[styles.retryButton, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}
                    onPress={() => void refresh()}
                  >
                    <MaterialIcons name="refresh" size={20} color={format.secondaryButtonText} />
                    <Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Reintentar</Text>
                  </Pressable>
                </View>
              ) : dogs.length === 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Agregar tu primer perro"
                  style={[styles.emptyDog, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]}
                  onPress={openCreate}
                >
                  <MaterialIcons name="pets" size={28} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                  <Text style={[styles.emptyDogTitle, { color: format.cardText }]}>Agrega tu primer perro</Text>
                  <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Después podrás agregar los demás desde esta misma pantalla.</Text>
                </Pressable>
              ) : (
                <View style={styles.dogGrid}>
                  {dogs.map((dog) => {
                    const selected = selectedDog?.id === dog.id;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Seleccionar a ${dog.name}`}
                        accessibilityState={{ selected }}
                        key={dog.id}
                        style={[
                          styles.dogChip,
                          { borderColor: selected ? format.accent : format.cardBorder, backgroundColor: selected ? format.pillBackground : format.secondaryButton },
                        ]}
                        onPress={() => setSelectedDogId(dog.id)}
                      >
                        <DogTabPortrait dog={dog} photoUrl={photoUrls[dog.id] ?? null} size={30} />
                        <Text style={[styles.dogChipText, { color: selected ? format.pillText : format.cardText }]} numberOfLines={1}>{dog.name}</Text>
                        {memberDogIds.has(dog.id) ? (
                          <View style={[styles.memberCrownMini, { backgroundColor: selected ? format.cardBackground : ucapsaBrand.colors.goldPale }]}>
                            <MaterialIcons name="workspace-premium" size={15} color={ucapsaBrand.colors.goldDark} />
                          </View>
                        ) : null}
                        {selected ? <MaterialIcons name="check-circle" size={18} color={format.pillText} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ) : null}

          {selectedDog ? (
            <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
              <View style={styles.sectionHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Editar perfil de ${selectedDog.name}`}
                  style={styles.dogPortraitButton}
                  onPress={openEditProfile}
                >
                  <DogTabPortrait dog={selectedDog} photoUrl={photoUrls[selectedDog.id] ?? null} size={52} />
                  <View style={[styles.dogPortraitEditBadge, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
                    <MaterialIcons name="edit" size={12} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                  </View>
                </Pressable>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.dogNameRow}>
                    <Text style={[styles.sectionTitle, { color: format.cardText }]}>{selectedDog.name}</Text>
                    {memberDogIds.has(selectedDog.id) ? (
                      <View style={styles.memberCrown}>
                        <MaterialIcons name="workspace-premium" size={16} color={ucapsaBrand.colors.goldDark} />
                        <Text style={styles.memberCrownText}>Socio</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                    {programWarning ? 'Entrenamiento sin verificar' : 'Entrenamiento, avances y logros'}
                  </Text>
                </View>
                <View style={styles.dogHeaderActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Abrir ranking"
                    style={[styles.pencilButton, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}
                    onPress={() => router.push('/client/competition' as never)}
                  >
                    <MaterialIcons name="leaderboard" size={20} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                  </Pressable>
                </View>
              </View>

              {!programWarning && selectedEnrollments.length === 0 ? (
                <View style={styles.dogEmptyProgram}>
                  <MaterialIcons name="school" size={24} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                  <Text style={[styles.classTitle, { color: format.cardText }]}>Sin programa vinculado</Text>
                  <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Cuando {selectedDog.name} tenga clases o historial, aparecerá aquí.</Text>
                </View>
              ) : null}

              {!programWarning && selectedActive[0] ? (() => {
                const item = selectedActive[0];
                const levelLabel = getProgramLevelDisplayLabel(item.program.code, item.enrollment.program_level);
                const unlimited = item.enrollment.access_mode === 'membership';
                const remaining = !unlimited && item.program.required_attendances > 0 ? Math.max(0, item.program.required_attendances - item.attendances.length) : null;
                const programLabel = `${getProgramCodeLabel(item.program.code)}${levelLabel ? ` ${levelLabel}` : ''}`;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Abrir ${programLabel} de ${selectedDog.name}`}
                    style={[styles.dogProgramHero, { borderColor: format.border, backgroundColor: format.surfaceAlt }]}
                    onPress={() => router.push(`/client/class-detail?enrollmentId=${encodeURIComponent(item.enrollment.id)}` as never)}
                  >
                    <View style={[styles.dogProgramIcon, { backgroundColor: format.pillBackground }]}><MaterialIcons name="school" size={22} color={format.pillText} /></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.dogProgramEyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>ENTRENAMIENTO ACTUAL</Text>
                      <Text style={[styles.dogProgramTitle, { color: format.cardText }]}>{programLabel}</Text>
                      <Text style={[styles.dogProgramMeta, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                        {unlimited ? `${item.attendances.length} clases registradas · acceso ilimitado` : `${item.attendances.length} clases tomadas`}
                      </Text>
                    </View>
                    {!unlimited && remaining != null ? <View style={[styles.dogRemainingBox, { backgroundColor: format.accent }]}><Text style={[styles.dogRemainingValue, { color: format.primaryButtonText }]}>{remaining}</Text><Text style={[styles.dogRemainingLabel, { color: format.primaryButtonText }]}>restantes</Text></View> : <MaterialIcons name="chevron-right" size={22} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />}
                  </Pressable>
                );
              })() : null}

              <View style={styles.dogSecondaryActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ver logros de ${selectedDog.name}`}
                  style={[styles.dogSecondaryAction, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]}
                  onPress={() => router.push(`/client/dog-achievements?dogId=${encodeURIComponent(selectedDog.id)}` as never)}
                >
                  <MaterialIcons name="emoji-events" size={20} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.dogSecondaryTitle, { color: format.cardText }]}>Logros</Text>
                    <Text style={[styles.dogSecondaryMeta, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Medallas de {selectedDog.name}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ver historial de ${selectedDog.name}`}
                  style={[styles.dogSecondaryAction, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]}
                  onPress={() => router.push(`/client/dog-history?dogId=${encodeURIComponent(selectedDog.id)}` as never)}
                >
                  <MaterialIcons name="history" size={20} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.dogSecondaryTitle, { color: format.cardText }]}>Historial</Text>
                    <Text style={[styles.dogSecondaryMeta, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Programas y clases anteriores</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      ) : null}

      <KeyboardAwareModal
        visible={editorMode !== null}
        onClose={() => setEditorMode(null)}
        sheetStyle={premium ? styles.modalCardPremium : undefined}
        contentContainerStyle={styles.modalContent}
      >
        <View style={styles.modalHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.modalTitle, premium && styles.textPremium]}>Agregar perro</Text>
            <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Registra otro perro en tu cuenta.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar edición" style={styles.modalCloseButton} onPress={() => setEditorMode(null)}>
            <MaterialIcons name="close" size={25} color={premium ? ucapsaBrand.colors.premiumActionText : ucapsaBrand.colors.text} />
          </Pressable>
        </View>
        <Text style={[styles.label, premium && styles.textPremium]}>Nombre</Text>
        <TextInput
          accessibilityLabel="Nombre del perro"
          value={draftName}
          onChangeText={setDraftName}
          placeholder="Ej. Max, Luna, Toby"
          placeholderTextColor={premium ? ucapsaBrand.colors.premiumMuted : ucapsaBrand.colors.gray}
          autoCapitalize="words"
          autoFocus
          style={[styles.input, premium && styles.inputPremium]}
        />
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => setEditorMode(null)} disabled={saving}>
            <Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Cancelar</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={() => void saveDog()} disabled={saving}>
            <Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>{saving ? 'Guardando...' : 'Agregar perro'}</Text>
          </Pressable>
        </View>
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

function DogTabPortrait({ dog, photoUrl, size }: { dog: BasicDog; photoUrl: string | null; size: number }) {
  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.34) }}
        resizeMode="cover"
        accessibilityLabel={`Foto de ${dog.name}`}
      />
    );
  }
  return <DogAvatar avatarKey={dog.avatar_key} avatarColor={dog.avatar_color} size={size} accessibilityLabel={`Avatar de ${dog.name}`} />;
}

function CompactDogHeader({
  dogsCount,
  offlineEmpty,
  premium,
  format,
  onBack,
  onAdd,
}: {
  dogsCount: number;
  offlineEmpty: boolean;
  premium: boolean;
  format: ReturnType<typeof resolveUcapsaFormat>;
  onBack?: () => void;
  onAdd: () => void;
}) {
  const subtitle = offlineEmpty
    ? 'Sincroniza una vez para ver tus perros'
    : dogsCount > 1
      ? 'Elige un perro y revisa su perfil'
      : dogsCount === 1
        ? 'Perfil y entrenamiento'
        : 'Agrega tu primer perro';

  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Volver a Perfil" style={[styles.headerBack, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]} onPress={onBack}>
          <MaterialIcons name="arrow-back" size={22} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
        </Pressable>
      ) : null}
      <View style={[styles.headerIcon, { backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : format.accentSoft, borderColor: premium ? ucapsaBrand.colors.premiumBorder : format.border }]}>
        <MaterialIcons name="pets" size={25} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
      </View>
      <View style={styles.headerCopy}>
        <Text style={[styles.headerTitle, { color: format.text }]}>{dogsCount > 1 ? 'Mis perros' : 'Mi perro'}</Text>
        <Text style={[styles.headerSubtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{subtitle}</Text>
      </View>
      {!offlineEmpty ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agregar otro perro"
          style={[styles.headerAddButton, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}
          onPress={onAdd}
        >
          <MaterialIcons name="add" size={23} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative' },
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, paddingHorizontal: 2 },
  headerBack: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerIcon: { width: 48, height: 48, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  headerAddButton: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: -0.45 },
  headerSubtitle: { marginTop: 1, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  muted: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  textPremium: { color: ucapsaBrand.colors.premiumText },
  offlineCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 14 },
  offlineCopy: { flex: 1, minWidth: 0, gap: 3 },
  offlineTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900' },
  card: { gap: 12, borderRadius: 22, borderWidth: 1, padding: 16, marginBottom: 14 },
  achievementAllButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  achievementAllText: { fontSize: 12, lineHeight: 16, fontWeight: '900' },
    dogSecondaryActions: { flexDirection: 'row', gap: 8 },
  dogSecondaryAction: { flex: 1, minWidth: 0, minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 17, padding: 10 },
  dogSecondaryTitle: { fontSize: 13, lineHeight: 17, fontWeight: '900' },
  dogSecondaryMeta: { marginTop: 2, fontSize: 9, lineHeight: 13, fontWeight: '700' },
    dogProfileShortcut: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, padding: 11 },
  dogProfileIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dogProfileTitle: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
  dogProfileMeta: { marginTop: 1, fontSize: 11, lineHeight: 15, fontWeight: '700' },
    competitionAccountCard: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 22, borderWidth: 1, padding: 13, marginBottom: 14 },
  competitionAccountIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  competitionAccountEyebrow: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8 },
  competitionAccountTitle: { marginTop: 1, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  competitionAccountText: { marginTop: 2, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'space-between' },
  sectionTitle: { fontSize: 18, lineHeight: 23, fontWeight: '900' },
  addButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9 },
  addButtonText: { fontSize: 13, lineHeight: 18, fontWeight: '900' },
  emptyDog: { alignItems: 'center', gap: 7, borderRadius: 18, borderWidth: 1, padding: 18 },
  emptyDogTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900' },
  retryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, alignSelf: 'stretch', borderRadius: 15, borderWidth: 1, paddingHorizontal: 14 },
  dogGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  dogChip: { minHeight: 44, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 16, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 10 },
  dogChipText: { maxWidth: 165, fontSize: 14, lineHeight: 19, fontWeight: '900' },
  memberCrownMini: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.goldPale },
  dogNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  memberCrown: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, backgroundColor: ucapsaBrand.colors.goldPale, paddingHorizontal: 8, paddingVertical: 4 },
  memberCrownText: { color: ucapsaBrand.colors.goldDark, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  dogHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dogPortraitButton: { position: 'relative' },
  dogPortraitEditBadge: { position: 'absolute', right: -4, bottom: -3, width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pencilButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.border, paddingTop: 11, paddingBottom: 2 },
  historyChild: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  rowPremium: { borderTopColor: withAlpha(ucapsaBrand.colors.gold, 0.16) },
  classIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  classTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900' },
  dogEmptyProgram: { gap: 6, alignItems: 'flex-start', paddingVertical: 4 },
  dogProgramHero: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 22, borderWidth: 1, padding: 13 },
  dogProgramIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dogProgramEyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 0.8 },
  dogProgramTitle: { marginTop: 2, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  dogProgramMeta: { marginTop: 2, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  dogRemainingBox: { width: 70, minHeight: 62, borderRadius: 17, alignItems: 'center', justifyContent: 'center', padding: 6 },
  dogRemainingValue: { fontSize: 22, lineHeight: 25, fontWeight: '900' },
  dogRemainingLabel: { fontSize: 10, lineHeight: 13, fontWeight: '900' },
  dogHistoryLabel: { marginTop: 3, fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 0.8 },
  modalContent: { gap: 11 },
  modalCardPremium: { backgroundColor: ucapsaBrand.colors.premiumSurface, borderTopWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'space-between' },
  modalCloseButton: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 21, lineHeight: 27, fontWeight: '900' },
  label: { color: ucapsaBrand.colors.text, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  input: { minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 13, paddingVertical: 11, color: ucapsaBrand.colors.text, fontSize: 16 },
  inputPremium: { borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface, color: ucapsaBrand.colors.premiumText },
  actions: { flexDirection: 'row', gap: 9 },
  primaryButton: { minHeight: 48, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 15, paddingVertical: 12 },
  primaryButtonText: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
  secondaryButton: { minHeight: 48, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: 1, paddingVertical: 12 },
  secondaryButtonText: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
});