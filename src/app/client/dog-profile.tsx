import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DogAvatar } from '../../components/domain/DogAvatar';
import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { ExpandablePhoto } from '../../components/ui/ExpandablePhoto';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { DOG_AVATAR_OPTIONS, DOG_AVATAR_COLORS, DEFAULT_DOG_AVATAR_KEY, DEFAULT_DOG_AVATAR_COLOR, type DogAvatarKey, type DogAvatarColor } from '../../constants/dogAvatar';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getPrivateDogPhotoUrl, removeMyDogPhoto, uploadMyDogPhoto } from '../../services/dog-photos.service';
import { getMyDogProfile, updateMyDogAvatar, updateMyDogProfile, type DogProfile } from '../../services/dogs.service';
import { DEFAULT_READ_TIMEOUT_MS, DEFAULT_WRITE_TIMEOUT_MS, friendlyWriteError, withOperationTimeout } from '../../utils/async.utils';

type DogSex = DogProfile['sex'];

type ProfileDraft = {
  name: string;
  breed: string;
  birthDate: string;
  sex: DogSex;
  weight: string;
};

const EMPTY_DRAFT: ProfileDraft = {
  name: '',
  breed: '',
  birthDate: '',
  sex: null,
  weight: '',
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function draftFromProfile(profile: DogProfile): ProfileDraft {
  return {
    name: profile.name,
    breed: profile.breed ?? '',
    birthDate: profile.birth_date ?? '',
    sex: profile.sex,
    weight: profile.weight_kg == null ? '' : String(profile.weight_kg),
  };
}

function normalizeBirthDate(value: string) {
  const text = value.trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) return undefined;
  if (date.getTime() > Date.now()) return undefined;
  return text;
}

export default function DogProfileScreen() {
  const { user, role, isAdmin } = useSession();
  const params = useLocalSearchParams<{ dogId?: string | string[] }>();
  const dogId = getParam(params.dogId).trim();
  const profileKey = user?.id && dogId ? user.id + ':' + dogId : '';
  const activeProfileKeyRef = useRef(profileKey);
  activeProfileKeyRef.current = profileKey;
  const loadRunRef = useRef(0);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = Boolean(user) && format.key === 'member' && !isAdmin;

  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [storedProfile, setProfile] = useState<DogProfile | null>(null);
  const [loadedProfileKey, setLoadedProfileKey] = useState<string | null>(null);
  const profile = loadedProfileKey === profileKey ? storedProfile : null;
  const [avatarKey, setAvatarKey] = useState<DogAvatarKey>(DEFAULT_DOG_AVATAR_KEY);
  const [avatarColor, setAvatarColor] = useState<DogAvatarColor>(DEFAULT_DOG_AVATAR_COLOR);
  const [avatarExpanded, setAvatarExpanded] = useState(false);
  const [avatarColorsExpanded, setAvatarColorsExpanded] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const desiredAvatar = useRef({ key: DEFAULT_DOG_AVATAR_KEY as DogAvatarKey, color: DEFAULT_DOG_AVATAR_COLOR as DogAvatarColor });
  const persistedAvatar = useRef({ key: DEFAULT_DOG_AVATAR_KEY as DogAvatarKey, color: DEFAULT_DOG_AVATAR_COLOR as DogAvatarColor });
  const avatarWriteBusy = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const load = useCallback(async () => {
    const runId = ++loadRunRef.current;
    const requestedKey = profileKey;
    const isCurrentRun = () => runId === loadRunRef.current
      && activeProfileKeyRef.current === requestedKey;
    setLoading(true);
    setLoadError(false);
    setProfile(null);
    setLoadedProfileKey(null);
    setDraft(EMPTY_DRAFT);
    setPhotoUrl(null);
    setAvatarError(null);
    if (!user?.id || isAdmin || !dogId) return;
    try {
      const nextProfile = await withOperationTimeout(getMyDogProfile(dogId), DEFAULT_READ_TIMEOUT_MS, 'dog-profile');
      if (!isCurrentRun()) return;
      const signedPhoto = await getPrivateDogPhotoUrl(nextProfile.photo_path);
      if (!isCurrentRun()) return;
      setProfile(nextProfile);
      setLoadedProfileKey(requestedKey);
      setDraft(draftFromProfile(nextProfile));
      setAvatarKey(nextProfile.avatar_key);
      setAvatarColor(nextProfile.avatar_color);
      desiredAvatar.current = { key: nextProfile.avatar_key, color: nextProfile.avatar_color };
      persistedAvatar.current = { ...desiredAvatar.current };
      setPhotoUrl(signedPhoto);
    } catch {
      if (isCurrentRun()) setLoadError(true);
    } finally {
      if (isCurrentRun()) setLoading(false);
    }
  }, [dogId, isAdmin, profileKey, user?.id]);

  useEffect(() => {
    void load();
    return () => { loadRunRef.current += 1; };
  }, [load]);

  function setField<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function persistAvatar() {
    if (avatarWriteBusy.current || !profile || !dogId || !user || isAdmin) return;
    const requestedKey = profileKey;
    avatarWriteBusy.current = true;
    setAvatarSaving(true);
    try {
      // Las pulsaciones rápidas se serializan: sólo queda la última combinación elegida.
      while (desiredAvatar.current.key !== persistedAvatar.current.key
        || desiredAvatar.current.color !== persistedAvatar.current.color) {
        const requested = { ...desiredAvatar.current };
        const saved = await updateMyDogAvatar(dogId, requested.key, requested.color);
        if (activeProfileKeyRef.current !== requestedKey) return;
        persistedAvatar.current = { key: saved.avatar_key, color: saved.avatar_color };
        setProfile((current) => current
          ? { ...current, avatar_key: saved.avatar_key, avatar_color: saved.avatar_color }
          : current);
      }
    } catch (cause) {
      if (activeProfileKeyRef.current !== requestedKey) return;
      // No presentar como guardada una preferencia que la base rechazó.
      const previous = { ...persistedAvatar.current };
      desiredAvatar.current = previous;
      setAvatarKey(previous.key);
      setAvatarColor(previous.color);
      setAvatarError(friendlyWriteError(cause, 'Revisa tu conexión e inténtalo otra vez.'));
    } finally {
      avatarWriteBusy.current = false;
      setAvatarSaving(false);
    }
  }

  function selectAvatar(next: { key?: DogAvatarKey; color?: DogAvatarColor }) {
    if (saving || !profile) return;
    const updated = { ...desiredAvatar.current, ...next };
    desiredAvatar.current = updated;
    setAvatarKey(updated.key);
    setAvatarColor(updated.color);
    setAvatarError(null);
    void persistAvatar();
  }

  async function openCamera() {
    if (!cameraPermission?.granted) {
      const nextPermission = await requestCameraPermission();
      if (!nextPermission.granted) {
        Alert.alert('Cámara no disponible', 'Necesitamos permiso de cámara para tomar la foto de tu perro.');
        return;
      }
    }
    setCameraOpen(true);
  }

  async function takeDogPhoto() {
    if (!cameraRef.current || photoSaving || !profile) return;
    const requestedKey = profileKey;
    setPhotoSaving(true);
    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.45, skipProcessing: false });
      if (!picture?.uri) throw new Error('No se pudo guardar la foto.');
      const uploaded = await uploadMyDogPhoto(dogId, picture.uri);
      if (activeProfileKeyRef.current !== requestedKey) return;
      setPhotoUrl(uploaded.signedUrl);
      setProfile((current) => current ? { ...current, photo_path: uploaded.photoPath } : current);
      setCameraOpen(false);
    } catch (cause) {
      if (activeProfileKeyRef.current !== requestedKey) return;
      Alert.alert('No se pudo guardar la foto', friendlyWriteError(cause, 'Intenta nuevamente con buena conexión.'));
    } finally {
      setPhotoSaving(false);
    }
  }

  async function deleteDogPhoto() {
    if (!dogId || photoSaving || !profile) return;
    const requestedKey = profileKey;
    setPhotoSaving(true);
    try {
      await removeMyDogPhoto(dogId);
      if (activeProfileKeyRef.current !== requestedKey) return;
      setPhotoUrl(null);
      setProfile((current) => current ? { ...current, photo_path: null } : current);
    } catch (cause) {
      if (activeProfileKeyRef.current !== requestedKey) return;
      Alert.alert('No se pudo quitar la foto', friendlyWriteError(cause));
    } finally {
      setPhotoSaving(false);
    }
  }

  async function save() {
    if (!dogId || !user || !profile || isAdmin) return;
    const requestedKey = profileKey;
    const name = draft.name.trim();
    if (!name) {
      Alert.alert('Falta el nombre', 'Escribe el nombre de tu perro.');
      return;
    }

    const birthDate = normalizeBirthDate(draft.birthDate);
    if (birthDate === undefined) {
      Alert.alert('Fecha inválida', 'Usa el formato AAAA-MM-DD y una fecha que no sea futura.');
      return;
    }

    const normalizedWeight = draft.weight.trim().replace(',', '.');
    const weight = normalizedWeight ? Number(normalizedWeight) : null;
    if (weight != null && (!Number.isFinite(weight) || weight < 0)) {
      Alert.alert('Peso inválido', 'Escribe un peso igual o mayor a cero.');
      return;
    }

    if (avatarWriteBusy.current) return;
    setSaving(true);
    try {
      const saved = await withOperationTimeout(
        updateMyDogProfile(dogId, {
          name,
          breed: draft.breed,
          birth_date: birthDate,
          sex: draft.sex,
          weight_kg: weight,
          avatar_key: avatarKey,
          avatar_color: avatarColor,
        }),
        DEFAULT_WRITE_TIMEOUT_MS,
        'dog-profile-save',
      );
      if (activeProfileKeyRef.current !== requestedKey) return;
      setProfile(saved);
      setDraft(draftFromProfile(saved));
      persistedAvatar.current = { key: saved.avatar_key, color: saved.avatar_color };
      desiredAvatar.current = { ...persistedAvatar.current };
      Alert.alert('Datos guardados', `El perfil de ${saved.name} se actualizó correctamente.`);
    } catch (cause) {
      if (activeProfileKeyRef.current !== requestedKey) return;
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
      contentContainerStyle={styles.screenContent}
    >
      <UcapsaAmbientBackground format={format} variant="dog" />

      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver a Mi perro"
          style={[styles.backButton, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={22} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>MI PERRO</Text>
          <Text style={[styles.title, { color: format.cardText }]}>{profile?.name ? `Datos de ${profile.name}` : 'Datos del perro'}</Text>
          <Text style={[styles.subtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Edita únicamente la información del perro seleccionado.</Text>
        </View>
      </View>

      {!dogId ? (
        <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: format.cardText }]}>No encontramos el perro</Text>
          <Text style={[styles.helper, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Vuelve a Mi perro y selecciona cuál quieres editar.</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={() => router.back()}>
            <Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>Volver</Text>
          </Pressable>
        </View>
      ) : loading || (!profile && !loadError) ? (
        <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: format.cardText }]}>Cargando datos…</Text>
          <Text style={[styles.helper, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Estamos verificando el perfil actualizado de este perro.</Text>
        </View>
      ) : loadError ? (
        <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
          <MaterialIcons name="cloud-off" size={26} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
          <Text style={[styles.sectionTitle, { color: format.cardText }]}>No pudimos cargar los datos</Text>
          <Text style={[styles.helper, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Para editar el perfil completo necesitamos verificarlo en línea. Tus clases y logros no se modificaron.</Text>
          <View style={styles.buttonRow}>
            <Pressable style={[styles.secondaryButton, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]} onPress={() => router.back()}>
              <Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Volver</Text>
            </Pressable>
            <Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={() => void load()}>
              <Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>Reintentar</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <View style={[styles.photoCard, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
            <View style={styles.photoRow}>
              {photoUrl ? (
                <ExpandablePhoto uri={photoUrl} name={draft.name || 'tu perro'}>
                  <Image source={{ uri: photoUrl }} style={styles.dogPhoto} resizeMode="cover" accessibilityLabel={`Foto de ${draft.name || 'tu perro'}`} />
                </ExpandablePhoto>
              ) : (
                <DogAvatar
                  avatarKey={profile?.avatar_key}
                  avatarColor={profile?.avatar_color}
                  size={86}
                  accessibilityLabel={`Avatar de ${draft.name || 'tu perro'}`}
                />
              )}
              <View style={styles.photoCopy}>
                <Text style={[styles.sectionTitle, { color: format.cardText }]}>Foto de {draft.name || 'tu perro'}</Text>
                <Text style={{ color: format.muted, fontSize: 12, lineHeight: 17 }}>
                  Esta foto es privada. En Ranking y Competencia los demás ven su avatar.
                </Text>
              </View>
            </View>
            <View style={styles.photoActions}>
              <Pressable
                accessibilityRole="button"
                style={[styles.photoButton, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}
                onPress={() => void openCamera()}
                disabled={photoSaving}
              >
                <MaterialIcons name="photo-camera" size={18} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                <Text style={[styles.photoButtonText, { color: format.secondaryButtonText }]}>{photoUrl ? 'Cambiar foto' : 'Tomar foto'}</Text>
              </Pressable>
              {photoUrl ? (
                <Pressable
                  accessibilityRole="button"
                  style={[styles.photoButton, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}
                  onPress={() => void deleteDogPhoto()}
                  disabled={photoSaving}
                >
                  <MaterialIcons name="delete-outline" size={18} color={ucapsaBrand.colors.red} />
                  <Text style={[styles.photoButtonText, { color: ucapsaBrand.colors.redDark }]}>Quitar</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: format.cardText }]}>Avatar del perro</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cambiar avatar"
              accessibilityState={{ expanded: avatarExpanded }}
              onPress={() => setAvatarExpanded((open) => !open)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68,
                borderWidth: 1, borderColor: format.cardBorder, borderRadius: 14, padding: 10 }}>
              <DogAvatar avatarKey={avatarKey} avatarColor={avatarColor} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: format.cardText, fontSize: 16, fontWeight: '800' }}>
                  {DOG_AVATAR_OPTIONS.find((option) => option.key === avatarKey)?.label ?? 'Mi avatar'}
                </Text>
                <Text style={{ color: format.muted, fontSize: 13 }}>Cambiar avatar</Text>
              </View>
              <MaterialIcons name={avatarExpanded ? 'expand-less' : 'expand-more'} size={24} color={format.accentDark} />
            </Pressable>
            {avatarExpanded ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {DOG_AVATAR_OPTIONS.map((option) => (
                  <Pressable key={option.key} accessibilityRole="button"
                    accessibilityLabel={'Seleccionar avatar ' + option.label}
                    accessibilityState={{ selected: avatarKey === option.key }}
                    onPress={() => { selectAvatar({ key: option.key }); setAvatarExpanded(false); }}
                    style={{ width: 69, minHeight: 78, borderRadius: 13, borderWidth: avatarKey === option.key ? 2 : 1,
                      borderColor: avatarKey === option.key ? format.accent : format.cardBorder,
                      alignItems: 'center', justifyContent: 'center', padding: 5, gap: 4 }}>
                    <DogAvatar avatarKey={option.key} avatarColor={avatarColor} size={42} accessibilityLabel={option.label} />
                    <Text style={{ fontSize: 10, textAlign: 'center', color: format.cardText }} numberOfLines={1}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Elegir color del avatar"
              accessibilityState={{ expanded: avatarColorsExpanded }}
              onPress={() => setAvatarColorsExpanded((open) => !open)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56,
                marginTop: 12, borderWidth: 1, borderColor: format.cardBorder, borderRadius: 14, padding: 10 }}>
              <View style={{ width: 29, height: 29, borderRadius: 15, backgroundColor: avatarColor,
                borderWidth: 1, borderColor: format.cardBorder }} />
              <Text style={{ color: format.cardText, fontSize: 15, fontWeight: '800', flex: 1 }}>Color del avatar</Text>
              <MaterialIcons name={avatarColorsExpanded ? 'expand-less' : 'expand-more'} size={24} color={format.accentDark} />
            </Pressable>
            {avatarColorsExpanded ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
                {DOG_AVATAR_COLORS.map((color) => (
                  <Pressable key={color} accessibilityRole="button" accessibilityLabel={'Seleccionar color ' + color}
                    accessibilityState={{ selected: avatarColor === color }}
                    onPress={() => { selectAvatar({ color }); setAvatarColorsExpanded(false); }}
                    style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: color,
                      borderColor: avatarColor === color ? format.accent : format.cardBorder,
                      borderWidth: avatarColor === color ? 3 : 1, justifyContent: 'center', alignItems: 'center' }}>
                    {avatarColor === color ? <MaterialIcons name="check" size={18} color={color === DOG_AVATAR_COLORS[0] || color === DOG_AVATAR_COLORS[2] ? ucapsaBrand.colors.dogAvatarDark : ucapsaBrand.colors.surface} /> : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
            {avatarSaving ? <Text accessibilityLiveRegion="polite" style={{ color: format.muted, marginTop: 9 }}>Guardando avatar…</Text> : null}
            {avatarError ? <Text accessibilityRole="alert" style={{ color: ucapsaBrand.colors.danger, marginTop: 9 }}>{avatarError}</Text> : null}
          </View>

          <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: format.cardText }]}>Identificación</Text>
            <Field label="Nombre" value={draft.name} onChangeText={(value) => setField('name', value)} premium={premium} required />
            <Field label="Raza" value={draft.breed} onChangeText={(value) => setField('breed', value)} premium={premium} placeholder="Ej. Pastor alemán" />
            <Field label="Fecha de nacimiento" value={draft.birthDate} onChangeText={(value) => setField('birthDate', value)} premium={premium} placeholder="AAAA-MM-DD" autoCapitalize="none" />

            <Text style={[styles.label, premium && styles.textPremium]}>Sexo</Text>
            <View style={styles.sexRow}>
              <SexOption label="Hembra" value="female" selected={draft.sex === 'female'} onPress={() => setField('sex', 'female')} premium={premium} />
              <SexOption label="Macho" value="male" selected={draft.sex === 'male'} onPress={() => setField('sex', 'male')} premium={premium} />
              <SexOption label="No especificado" value="unknown" selected={draft.sex === 'unknown' || draft.sex == null} onPress={() => setField('sex', 'unknown')} premium={premium} />
            </View>

            <Field label="Peso (kg)" value={draft.weight} onChangeText={(value) => setField('weight', value)} premium={premium} placeholder="Ej. 24.5" keyboardType="decimal-pad" />
          </View>


          <Text style={[styles.safetyNote, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Tus clases y logros no cambian al editar estos datos.</Text>

          <View style={styles.buttonRow}>
            <Pressable
              accessibilityRole="button"
              style={[styles.secondaryButton, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}
              onPress={() => router.back()}
              disabled={saving || avatarSaving}
            >
              <Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.primaryButton, { backgroundColor: format.primaryButton }]}
              onPress={() => void save()}
              disabled={saving || avatarSaving}
            >
              <Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>{saving ? 'Guardando…' : 'Guardar datos'}</Text>
            </Pressable>
          </View>
        </>
      )}
      <KeyboardAwareModal
        visible={cameraOpen}
        onClose={() => !photoSaving && setCameraOpen(false)}
        contentContainerStyle={styles.cameraModalContent}
      >
        <View style={styles.cameraModalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, premium && styles.textPremium]}>Foto de {draft.name || 'tu perro'}</Text>
            <Text style={[styles.avatarHint, premium && styles.textPremium]}>Centra la cara de tu perro y toma una foto clara.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar cámara" onPress={() => setCameraOpen(false)} disabled={photoSaving}>
            <MaterialIcons name="close" size={25} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.text} />
          </Pressable>
        </View>
        <View style={styles.cameraFrame}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        </View>
        <Pressable accessibilityRole="button" style={[styles.captureButton, { backgroundColor: format.primaryButton }]} onPress={() => void takeDogPhoto()} disabled={photoSaving}>
          <MaterialIcons name="photo-camera" size={20} color={format.primaryButtonText} />
          <Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>{photoSaving ? 'Guardando…' : 'Tomar foto'}</Text>
        </Pressable>
      </KeyboardAwareModal>

    </KeyboardAwareScreen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  premium,
  placeholder,
  required = false,
  multiline = false,
  autoCapitalize = 'sentences',
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  premium: boolean;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'decimal-pad';
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, premium && styles.textPremium]}>{label}{required ? ' *' : ''}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={premium ? ucapsaBrand.colors.premiumMuted : ucapsaBrand.colors.gray}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.multilineInput, premium && styles.inputPremium]}
      />
    </View>
  );
}

function SexOption({ label, selected, onPress, premium }: { label: string; value: Exclude<DogSex, null>; selected: boolean; onPress: () => void; premium: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.sexOption,
        premium && styles.sexOptionPremium,
        selected && (premium ? styles.sexOptionSelectedPremium : styles.sexOptionSelected),
      ]}
      onPress={onPress}
    >
      <Text style={[styles.sexOptionText, premium && styles.textPremium, selected && styles.sexOptionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative', paddingBottom: 34 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  backButton: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 0.9 },
  title: { marginTop: 2, fontSize: 28, lineHeight: 34, fontWeight: '900' },
  subtitle: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  card: { gap: 12, borderRadius: 22, borderWidth: 1, padding: 16, marginBottom: 14 },
  photoCard: { gap: 12, borderRadius: 22, borderWidth: 1, padding: 14, marginBottom: 14 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  dogPhoto: { width: 86, height: 86, borderRadius: 28, backgroundColor: ucapsaBrand.colors.graySoft },
  photoCopy: { flex: 1, minWidth: 0, gap: 3 },
  avatarHint: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  photoActions: { flexDirection: 'row', gap: 8 },
  photoButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12 },
  photoButtonText: { fontSize: 11, lineHeight: 15, fontWeight: '900' },
  cameraModalContent: { gap: 12 },
  cameraModalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cameraFrame: { overflow: 'hidden', height: 360, borderRadius: 22, backgroundColor: ucapsaBrand.colors.cameraDark },
  camera: { flex: 1 },
  captureButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 16, paddingHorizontal: 14 },
  sectionTitle: { fontSize: 18, lineHeight: 23, fontWeight: '900' },
  helper: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  fieldGroup: { gap: 6 },
  label: { color: ucapsaBrand.colors.text, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  textPremium: { color: ucapsaBrand.colors.premiumText },
  input: { minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 13, paddingVertical: 11, color: ucapsaBrand.colors.text, fontSize: 16 },
  inputPremium: { borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface, color: ucapsaBrand.colors.premiumText },
  multilineInput: { minHeight: 92 },
  sexRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sexOption: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  sexOptionPremium: { borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface },
  sexOptionSelected: { borderColor: ucapsaBrand.colors.red, backgroundColor: withAlpha(ucapsaBrand.colors.red, 0.1) },
  sexOptionSelectedPremium: { borderColor: ucapsaBrand.colors.gold, backgroundColor: withAlpha(ucapsaBrand.colors.gold, 0.13) },
  sexOptionText: { color: ucapsaBrand.colors.text, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  sexOptionTextSelected: { fontWeight: '900' },
  safetyNote: { marginHorizontal: 4, marginBottom: 14, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  buttonRow: { flexDirection: 'row', gap: 9, marginBottom: 8 },
  primaryButton: { minHeight: 50, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 15, paddingHorizontal: 14, paddingVertical: 12 },
  primaryButtonText: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
  secondaryButton: { minHeight: 50, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  secondaryButtonText: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
});
