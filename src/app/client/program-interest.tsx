import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
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
  const [program, setProgram] = useState<ProgramInterestCode>(initial);
  useEffect(() => {
    setProgram(initial);
    setSaved(false);
  }, [initial]);
  const [dogs, setDogs] = useState<BasicDog[]>([]);
  const [dogId, setDogId] = useState<string | null>(null);
  const [openRequests, setOpenRequests] = useState<ProgramInterestRequest[]>([]);
  const [activeByProgram, setActiveByProgram] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    setError(null);
    try {
      const [dogResult, requestResult, enrollmentResult] = await Promise.allSettled([
        getMyDogs(), getMyProgramInterestRequests(user.id), getMyProgramEnrollments(),
      ]);
      if (dogResult.status === 'fulfilled') {
        setDogs(dogResult.value);
        setDogId((current) => dogResult.value.some((dog) => dog.id === current)
          ? current : dogResult.value[0]?.id ?? null);
      }
      if (requestResult.status === 'fulfilled') setOpenRequests(requestResult.value);
      if (enrollmentResult.status === 'fulfilled') {
        setActiveByProgram(enrollmentResult.value.filter((e) => e.enrollment.status === 'active')
          .map((e) => e.enrollment.dog_id + ':' + e.program.code));
      }
      if (dogResult.status === 'rejected' || requestResult.status === 'rejected' || enrollmentResult.status === 'rejected') {
        setError('No pudimos verificar el registro. La solicitud en la app está deshabilitada. Puedes contactar directamente a UCAPSA por WhatsApp.');
      }
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  const selectedDog = dogs.find((dog) => dog.id === dogId);
  const current = openRequests.find((row) => row.dog_id === dogId && row.program_code === program && row.status !== 'closed');
  const alreadyEnrolled = activeByProgram.includes(dogId + ':' + program);

  async function contactWhatsapp(confirmedRecord = false) {
    const message = (confirmedRecord || saved || current
      ? 'Hola UCAPSA, registré una solicitud de '
      : 'Hola UCAPSA, quiero información para inscribir a mi perro en ')
      + (program === 'puppy' ? 'Puppy School' : 'Comandos')
      + ' para ' + (selectedDog?.name || 'mi perro')
      + '. ¿Podemos coordinar el seguimiento?';
    const join = baseWhatsapp.includes('?') ? '&' : '?';
    try {
      await Linking.openURL(baseWhatsapp + join + 'text=' + encodeURIComponent(message));
    } catch {
      Alert.alert('No pudimos abrir WhatsApp', 'Revisa que WhatsApp esté disponible. Si enviaste una solicitud en la app, puedes consultar su estado aquí.');
    }
  }

  async function submit() {
    if (!user || !dogId || sending || current || alreadyEnrolled) return;
    setSending(true);
    try {
      const request = await requestProgramInterest(user.id, dogId, program);
      setOpenRequests((rows) => [request, ...rows.filter((row) => row.id !== request.id)]);
      setSaved(true);
      Alert.alert('Solicitud registrada', 'Administración recibió tu solicitud como urgente. Ahora puedes enviar también un mensaje a UCAPSA.', [
        { text: 'Después', style: 'cancel' },
        { text: 'Abrir WhatsApp', onPress: () => void contactWhatsapp(true) },
      ]);
    } catch {
      Alert.alert('No se confirmó tu solicitud', 'No hay constancia de registro. Reintenta más tarde o comunícate por WhatsApp sin perder el seguimiento.');
    } finally {
      setSending(false);
    }
  }

  const optionStyle = (active: boolean) => ({
    borderRadius: 16, borderWidth: 2, borderColor: active ? ucapsaBrand.colors.red : ucapsaBrand.colors.border,
    backgroundColor: active ? ucapsaBrand.colors.redSoft : ucapsaBrand.colors.surface,
    padding: 16, marginBottom: 10, minHeight: 54,
  });

  return (
    <KeyboardAwareScreen>
      <Text style={{ color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900', marginBottom: 8 }}>Solicitar entrenamiento</Text>
      <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 15, marginBottom: 16 }}>
        Elige un programa y el perro. Administración revisará tu solicitud; esto todavía no te inscribe en una clase.
      </Text>
      <Text style={{ color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '800', marginBottom: 10 }}>1. Programa</Text>
      {(['puppy', 'comandos'] as const).map((option) => (
        <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: program === option }}
          onPress={() => { setProgram(option); setSaved(false); }} style={optionStyle(program === option)}>
          <Text style={{ color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '800' }}>
            {option === 'puppy' ? '🐶 Puppy School' : '🐕 Comandos'}
          </Text>
        </Pressable>
      ))}
      <Text style={{ color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '800', marginBottom: 10, marginTop: 8 }}>2. Tu perro</Text>
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
          onPress={() => { setDogId(dog.id); setSaved(false); }} style={optionStyle(dog.id === dogId)}>
          <Text style={{ color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '800' }}>{dog.name}</Text>
        </Pressable>
      ))}
      {alreadyEnrolled ? <Text accessibilityLiveRegion="polite" style={{ fontSize: 15 }}>Este perro ya tiene el programa activo. Revisa la pestaña Clases.</Text> : null}
      {current ? <Text accessibilityLiveRegion="polite" style={{ fontSize: 15, marginBottom: 14 }}>Tu solicitud ya está registrada y está {current.status === 'pending' ? 'pendiente de atención' : 'en seguimiento'}.</Text> : null}
      <Pressable
        accessibilityRole="button" disabled={loading || Boolean(error) || !dogId || Boolean(current) || alreadyEnrolled || sending}
        onPress={() => void submit()}
        style={{ minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 16, marginTop: 18,
          backgroundColor: ucapsaBrand.colors.red, opacity: loading || Boolean(error) || !dogId || current || alreadyEnrolled || sending ? 0.5 : 1 }}
      >
        <Text style={{ color: ucapsaBrand.colors.surface, fontSize: 17, fontWeight: '900' }}>
          {sending ? 'Registrando…' : current ? 'Solicitud en seguimiento' : alreadyEnrolled ? 'Ya estás inscrito' : 'Enviar solicitud'}
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => void contactWhatsapp()}
          style={{ minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border,
            marginTop: 12, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 }}>
          <MaterialIcons name="chat" size={21} color={ucapsaBrand.colors.redDark} />
          <Text style={{ fontWeight: '800', color: ucapsaBrand.colors.redDark }}>Contactar a UCAPSA por WhatsApp</Text>
        </Pressable>
      {!saved && !current ? (
        <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 12, marginTop: 5 }}>
          Si usas WhatsApp antes de enviar la solicitud en la app, el mensaje no crea automáticamente un registro administrativo.
        </Text>
      ) : null}
      <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 12, marginTop: 12 }}>
        Solicitar no genera pago, asistencia, horario ni inscripción. Espera confirmación oficial.
      </Text>
    </KeyboardAwareScreen>
  );
}
