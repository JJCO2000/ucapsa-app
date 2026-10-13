import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';

export const quickHelpSeenKey = (userId: string) => 'ucapsa-quick-help-v1:' + userId;
const guides = [
  { icon: 'pets' as const, title: 'Registra a tu perro',
    description: 'En Mis perros puedes agregarlo por nombre. Después podrás solicitar entrenamiento.',
    label: 'Ir a Mis perros', route: '/dog' },
  { icon: 'school' as const, title: 'Solicita una clase',
    description: 'En Clases encontrarás Puppy School o Comandos. Solicitar no significa estar inscrito: UCAPSA te confirmará.',
    label: 'Ver clases', route: '/classes' },
  { icon: 'calendar-month' as const, title: 'Consulta la agenda',
    description: 'Toca una fecha: el círculo muestra qué hay ese día y la página baja hasta la agenda.',
    label: 'Abrir agenda', route: '/calendar' },
  { icon: 'restaurant-menu' as const, title: 'Encuentra el restaurante',
    description: 'En Inicio encontrarás el acceso directo a Restaurante UCAPSA para consultar el menú y precios.',
    label: 'Ver restaurante', route: '/restaurant' },
];

export default function QuickHelpScreen() {
  const { user, isAdmin } = useSession();
  const [step, setStep] = useState(0);
  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;
  const item = guides[step];
  async function done(route?: string) {
    await AsyncStorage.setItem(quickHelpSeenKey(user!.id), '1').catch(() => {});
    if (route) router.replace(route as never);
    else router.back();
  }
  return (
    <KeyboardAwareScreen>
      <Text style={{ fontSize: 13, fontWeight: '900', color: ucapsaBrand.colors.redDark, marginTop: 12 }}>
        GUÍA DE UCAPSA · {step + 1} DE {guides.length}
      </Text>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 12, marginBottom: 28 }}>
        {guides.map((guide, index) => (
          <View key={guide.title} style={{ flex: 1, height: 6, borderRadius: 5,
            backgroundColor: index <= step ? ucapsaBrand.colors.red : ucapsaBrand.colors.graySoft }} />
        ))}
      </View>
      <View style={{ borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface,
        padding: 24, borderRadius: 24, minHeight: 270, gap: 16, justifyContent: 'center', alignItems: 'center' }}>
        <MaterialIcons name={item.icon} size={55} color={ucapsaBrand.colors.redDark} />
        <Text style={{ color: ucapsaBrand.colors.text, fontSize: 24, fontWeight: '900', textAlign: 'center' }}>{item.title}</Text>
        <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 17, lineHeight: 25, textAlign: 'center' }}>{item.description}</Text>
        <Pressable accessibilityRole="button" onPress={() => void done(item.route)}
          style={{ minHeight: 48, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: ucapsaBrand.colors.redDark, fontSize: 16, fontWeight: '800' }}>{item.label} →</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
        {step > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => setStep(step - 1)}
            style={{ flex: 1, minHeight: 54, justifyContent: 'center', alignItems: 'center',
              borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 16 }}>
            <Text style={{ color: ucapsaBrand.colors.text, fontWeight: '900' }}>Anterior</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={() => step === guides.length - 1 ? void done() : setStep(step + 1)}
          style={{ flex: 1, minHeight: 54, justifyContent: 'center', alignItems: 'center',
            backgroundColor: ucapsaBrand.colors.red, borderRadius: 16 }}>
          <Text style={{ color: ucapsaBrand.colors.surface, fontWeight: '900' }}>{step === guides.length - 1 ? 'Terminar' : 'Siguiente'}</Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" onPress={() => void done()}
        style={{ minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
        <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 15 }}>Omitir guía</Text>
      </Pressable>
      <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 12, textAlign: 'center', marginBottom: 20 }}>
        Puedes volver a abrirla desde Perfil. No es obligatorio completar estos pasos.
      </Text>
    </KeyboardAwareScreen>
  );
}
