import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { devWarn } from '../../lib/client-diagnostics';
import { showPlatformDialog } from '../../utils/staff-dialog';
import { getMyDogs, type BasicDog } from '../../services/dogs.service';
import { getMyProgramEnrollments } from '../../services/programs.service';
import {
  getMyProgramInterestRequests,
  requestProgramInterest,
  type ProgramInterestCode,
  type ProgramInterestRequest,
} from '../../services/program-interest.service';

const baseWhatsapp = ucapsaBrand.socialLinks.find((item) => item.key === 'whatsapp')?.url
  ?? 'https://wa.me/525522410679';

export default function ProgramInterestScreen() {
  const params = useLocalSearchParams<{ program?: string }>();
  const initial = params.program === 'comandos' ? 'comandos' : 'puppy';
  const { user, isAdmin } = useSession();
  const userId = user?.id ?? null;
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;
  const loadRunRef = useRef(0);
  const [program, setProgram] = useState<ProgramInterestCode>(initial);
  useEffect(() => {
    setProgram(initial);
    setSavedForUserId(null);
  }, [initial]);
  const [storedDogs, setDogs] = useState<BasicDog[]>([]);
  const [dogId, setDogId] = useState<string | null>(null);
  const [storedRequests, setOpenRequests] = useState<ProgramInterestRequest[]>([]);
  const [storedActiveByProgram, setActiveByProgram] = useState<string[]>([]);
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);
  const [savedForUserId, setSavedForUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingForUserId, setSendingForUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const verifiedForUser = Boolean(userId && loadedForUserId === userId);
  const dogs = verifiedForUser ? storedDogs : [];
  const openRequests = verifiedForUser ? storedRequests : [];
  const activeByProgram = verifiedForUser ? storedActiveByProgram : [];
  const saved = Boolean(userId && savedForUserId === userId);
  const sending = Boolean(userId && sendingForUserId === userId);
  const activeSelectionRef = useRef('');
  activeSelectionRef.current = [userId, dogId, program].join(':');

  const load = useCallback(async () => {
    const runId = ++loadRunRef.current;
    const isCurrentRun = () => loadRunRef.current === runId && activeUserIdRef.current === userId;
    if (!userId || isAdmin) return;
    setLoading(true);
    setError(null);
    setLoadedForUserId(null);
    setDogs([]);
    setDogId(null);
    setOpenRequests([]);
    setActiveByProgram([]);
    try {
      const [dogResult, requestResult, enrollmentResult] = await Promise.allSettled([
        getMyDogs(), getMyProgramInterestRequests(userId), getMyProgramEnrollments(),
      ]);
      if (!isCurrentRun()) return;
      if (dogResult.status === 'fulfilled'
        && requestResult.status === 'fulfilled'
        && enrollmentResult.status === 'fulfilled') {
        setDogs(dogResult.value);
        setDogId((current) => dogResult.value.some((dog) => dog.id === current)
          ? current : dogResult.value[0]?.id ?? null);
        setOpenRequests(requestResult.value);
        setActiveByProgram(enrollmentResult.value.filter((e) => e.enrollment.status === 'active')
          .map((e) => e.enrollment.dog_id + ':' + e.program.code));
        setLoadedForUserId(userId);
      } else {
        setError('No pudimos verificar el registro. La solicitud en la app está deshabilitada. Puedes contactar directamente a UCAPSA por WhatsApp.');
      }
    } catch (cause) {
      if (!isCurrentRun()) return;
      devWarn('client-program-interest: could not verify request state.', cause);
      setError('No pudimos verificar el registro. Inténtalo otra vez.');
    } finally {
      if (isCurrentRun()) setLoading(false);
    }
  }, [isAdmin, userId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    setSavedForUserId(null);
    void load();
    return () => { loadRunRef.current += 1; };
  }, [load]));

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  const selectedDog = dogs.find((dog) => dog.id === dogId);
  const current = openRequests.find((row) => row.dog_id === dogId && row.program_code === program && row.status !== 'closed');
  const alreadyEnrolled = activeByProgram.includes(dogId + ':' + program);

  async function contactWhatsapp(confirmedRecord = false) {
    const message = (confirmedRecord || saved || current
      ? 'Hola UCAPSA, ya solicité que me contacten sobre '
      : 'Hola UCAPSA, me interesa entrenar con ustedes en ')
      + (program === 'puppy' ? 'Puppy School' : 'Comandos')
      + ' para ' + (selectedDog?.name || 'mi perro')
      + '. ¿Podemos coordinar el seguimiento?';
    const join = baseWhatsapp.includes('?') ? '&' : '?';
    try {
      await Linking.openURL(baseWhatsapp + join + 'text=' + encodeURIComponent(message));
    } catch {
      showPlatformDialog('No pudimos abrir WhatsApp', 'Revisa que WhatsApp esté disponible. Si enviaste una solicitud en la app, puedes consultar su estado aquí.');
    }
  }

  async function submit() {
    if (!userId || !verifiedForUser || loading || error || !dogId || !selectedDog
      || sending || current || alreadyEnrolled) return;
    const requestedUserId = userId;
    const requestedDogId = dogId;
    const requestedProgram = program;
    const requestedDogName = selectedDog.name;
    const isCurrentUser = () => activeUserIdRef.current === requestedUserId;
    const selectionKey = [requestedUserId, requestedDogId, requestedProgram].join(':');
    setSendingForUserId(requestedUserId);
    try {
      const request = await requestProgramInterest(requestedUserId, requestedDogId, requestedProgram);
      if (!isCurrentUser()) return;
      setOpenRequests((rows) => [request, ...rows.filter((row) => row.id !== request.id)]);
      if (activeSelectionRef.current !== selectionKey) return;
      setSavedForUserId(requestedUserId);
      showPlatformDialog('Interés registrado', `Recibimos tu interés en ${requestedProgram === 'puppy' ? 'Puppy School' : 'Comandos'} para ${requestedDogName}. UCAPSA podrá contactarte para continuar.`, [
        { text: 'Listo', style: 'cancel' },
        { text: 'Escribir ahora', onPress: () => void contactWhatsapp(true) },
      ]);
    } catch (cause) {
      if (!isCurrentUser()) return;
      devWarn('client-program-interest: request failed.', cause);
      showPlatformDialog('No pudimos registrar tu interés', 'No tenemos confirmación de que se haya enviado. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      // Clear only this request's sending marker, even if the user switched away.
      setSendingForUserId((current) => current === requestedUserId ? null : current);
    }
  }

  const optionStyle = (active: boolean) => ({
    borderRadius: 16, borderWidth: 2, borderColor: active ? ucapsaBrand.colors.red : ucapsaBrand.colors.border,
    backgroundColor: active ? ucapsaBrand.colors.redSoft : ucapsaBrand.colors.surface,
    padding: 16, marginBottom: 10, minHeight: 72,
  });

  return (
    <KeyboardAwareScreen>
      <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 16 }}>
        Da el primer paso. Elige el programa que te interesa y pide que UCAPSA te contacte.
      </Text>
      <Text style={{ color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '800', marginBottom: 10 }}>¿Qué entrenamiento te interesa?</Text>
      {(['puppy', 'comandos'] as const).map((option) => (
        <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: program === option }}
          onPress={() => { setProgram(option); setSavedForUserId(null); }} style={optionStyle(program === option)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <MaterialIcons name={option === 'puppy' ? 'pets' : 'school'} size={27} color={ucapsaBrand.colors.redDark} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '800' }}>
                {option === 'puppy' ? 'Puppy School' : 'Comandos'}
              </Text>
              <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 }}>
                {option === 'puppy' ? 'Primeros pasos de entrenamiento para tu cachorro.' : 'Entrenamiento por niveles: básico, intermedio y avanzado.'}
              </Text>
            </View>
            <MaterialIcons name={program === option ? 'radio-button-checked' : 'radio-button-unchecked'}
              size={24} color={program === option ? ucapsaBrand.colors.redDark : ucapsaBrand.colors.gray} />
          </View>
        </Pressable>
      ))}
      <Text style={{ color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '800', marginBottom: 10, marginTop: 8 }}>¿Con cuál de tus perros?</Text>
      {loading ? <Text accessibilityLiveRegion="polite">Cargando perros y solicitudes…</Text> : null}
      {error ? (
        <View style={{ gap: 6, marginBottom: 12 }}>
          <Text accessibilityRole="alert" style={{ color: ucapsaBrand.colors.red, fontSize: 14 }}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => { setLoading(true); void load(); }}
            style={{ alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 }}>
            <Text style={{ color: ucapsaBrand.colors.redDark, fontSize: 16, fontWeight: '800' }}>Reintentar verificación →</Text>
          </Pressable>
        </View>
      ) : null}
      {!loading && !error && dogs.length === 0 ? (
        <Pressable style={optionStyle(false)} onPress={() => router.push('/dog' as never)}>
          <Text style={{ color: ucapsaBrand.colors.redDark, fontSize: 16, fontWeight: '800' }}>Primero registra a tu perro →</Text>
        </Pressable>
      ) : dogs.map((dog) => (
        <Pressable key={dog.id} accessibilityRole="button" accessibilityState={{ selected: dog.id === dogId }}
          onPress={() => { setDogId(dog.id); setSavedForUserId(null); }} style={optionStyle(dog.id === dogId)}>
          <Text style={{ color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '800' }}>{dog.name}</Text>
        </Pressable>
      ))}
      {alreadyEnrolled ? <Text accessibilityLiveRegion="polite" style={{ fontSize: 15, marginBottom: 14 }}>Tu perro ya está inscrito en este programa. Revisa sus clases.</Text> : null}
      {current ? <Text accessibilityLiveRegion="polite" style={{ fontSize: 15, marginBottom: 14 }}>Ya pediste que te contacten. Estado: {current.status === 'pending' ? 'solicitud recibida' : 'en seguimiento'}.</Text> : null}
      {!loading && !error && !current && !alreadyEnrolled && dogId ? (
        <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 10 }}>
          Al enviar, UCAPSA recibirá tu interés y podrá contactarte con los datos de tu cuenta. No es una inscripción.
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button" disabled={loading || !verifiedForUser || Boolean(error) || !dogId || Boolean(current) || alreadyEnrolled || sending}
        onPress={() => void submit()}
        style={{ minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 16, marginTop: 18,
          backgroundColor: ucapsaBrand.colors.red, opacity: loading || !verifiedForUser || Boolean(error) || !dogId || current || alreadyEnrolled || sending ? 0.5 : 1 }}
      >
        <Text style={{ color: ucapsaBrand.colors.surface, fontSize: 17, fontWeight: '900' }}>
          {sending ? 'Enviando interés…' : current ? 'Solicitud recibida' : alreadyEnrolled ? 'Ya estás inscrito' : 'Me interesa, quiero que me contacten'}
        </Text>
      </Pressable>
      {(Boolean(current) || saved || Boolean(error)) ? (
        <Pressable accessibilityRole="button" onPress={() => void contactWhatsapp()}
          style={{ minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border,
            marginTop: 12, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 }}>
          <MaterialIcons name="chat" size={21} color={ucapsaBrand.colors.redDark} />
          <Text style={{ fontWeight: '800', color: ucapsaBrand.colors.redDark }}>Contactar a UCAPSA por WhatsApp</Text>
        </Pressable>
      ) : null}
      {error ? (
        <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 12, marginTop: 8 }}>
          Si nos escribes directamente, avísanos que quieres seguimiento: el mensaje por sí solo no registra la solicitud en la app.
        </Text>
      ) : null}
    </KeyboardAwareScreen>
  );
}
