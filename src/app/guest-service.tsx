import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../constants/brand';
import { useSession } from '../hooks/useSession';

type GuestServiceKey = 'orientation' | 'school' | 'training';

type GuestServiceMedia = {
  hero: string | null;
  classes: string[];
  place: string[];
};

type GuestServiceInfo = {
  eyebrow: string;
  title: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  points: string[];
  whatsappMessage: string;
  media: GuestServiceMedia;
};

const guestServices: Record<GuestServiceKey, GuestServiceInfo> = {
  orientation: {
    eyebrow: 'ORIENTACIÓN',
    title: 'Cuéntanos qué quieres mejorar',
    description:
      'Antes de abrir WhatsApp, revisa qué tipo de ayuda puedes buscar en UCAPSA para tu perro.',
    icon: 'chat',
    points: [
      'Identificar qué quieres trabajar: paseo, obediencia, hábitos o convivencia.',
      'Tomar en cuenta la edad y la situación actual de tu perro.',
      'Recibir orientación para saber cuál puede ser el siguiente paso.',
    ],
    whatsappMessage:
      'Hola UCAPSA, vi la información de orientación en la app y quiero saber qué programa recomiendan para mi perro.',
    media: {
      hero: null,
      classes: [],
      place: [],
    },
  },
  school: {
    eyebrow: 'UCAPSA SCHOOL',
    title: 'Construir las bases',
    description:
      'Una etapa enfocada en comunicación, convivencia, hábitos y manejo para construir una base de trabajo con tu perro.',
    icon: 'pets',
    points: [
      'Mejorar la comunicación entre persona y perro.',
      'Trabajar hábitos y convivencia cotidiana.',
      'Preparar una base clara antes de avanzar a objetivos de entrenamiento.',
    ],
    whatsappMessage:
      'Hola UCAPSA, vi la información de UCAPSA School en la app y quiero saber más para mi perro.',
    media: {
      hero: null,
      classes: [],
      place: [],
    },
  },
  training: {
    eyebrow: 'ENTRENAMIENTO',
    title: 'Entrenar y avanzar',
    description:
      'Entrenamiento guiado para seguir desarrollando habilidades y avanzar dentro de la ruta de trabajo de UCAPSA.',
    icon: 'school',
    points: [
      'Trabajo guiado durante las clases.',
      'Progresión por niveles y objetivos de entrenamiento.',
      'Seguimiento del trabajo en equipo entre humano y perro.',
    ],
    whatsappMessage:
      'Hola UCAPSA, vi la información de entrenamiento en la app y quiero saber más sobre las clases y niveles.',
    media: {
      hero: null,
      classes: [],
      place: [],
    },
  },
};

const whatsappUrl =
  ucapsaBrand.socialLinks.find((item) => item.key === 'whatsapp')?.url ??
  'https://wa.me/525522410679';

function getServiceKey(value: string | string[] | undefined): GuestServiceKey | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key === 'orientation' || key === 'school' || key === 'training' ? key : null;
}

async function openWhatsApp(message: string) {
  const separator = whatsappUrl.includes('?') ? '&' : '?';
  const url = `${whatsappUrl}${separator}text=${encodeURIComponent(message)}`;

  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('No se pudo abrir WhatsApp', 'Revisa tu conexión e intenta de nuevo.');
  }
}

export default function GuestServiceScreen() {
  const { user } = useSession();
  const params = useLocalSearchParams<{ service?: string | string[] }>();
  const key = getServiceKey(params.service);

  if (user) return <Redirect href="/services" />;
  if (!key) return <Redirect href="/services" />;

  const service = guestServices[key];

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Regresar a Servicios"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialIcons name="arrow-back" size={24} color={ucapsaBrand.colors.redDark} />
        </Pressable>

        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{service.eyebrow}</Text>
          <Text style={styles.title}>{service.title}</Text>
        </View>
      </View>

      <View style={styles.introCard}>
        <View style={styles.iconBox}>
          <MaterialIcons name={service.icon} size={28} color={ucapsaBrand.colors.redDark} />
        </View>
        <Text style={styles.description}>{service.description}</Text>
      </View>

      <View style={styles.detailCard}>
        <Text style={styles.sectionTitle}>Qué puedes encontrar aquí</Text>
        {service.points.map((point) => (
          <View key={point} style={styles.pointRow}>
            <MaterialIcons name="check-circle" size={20} color={ucapsaBrand.colors.redDark} />
            <Text style={styles.pointText}>{point}</Text>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Más información por WhatsApp"
        onPress={() => void openWhatsApp(service.whatsappMessage)}
        style={({ pressed }) => [styles.whatsappButton, pressed && styles.pressed]}
      >
        <MaterialIcons name="chat" size={21} color={ucapsaBrand.colors.surface} />
        <Text style={styles.whatsappButtonText}>Más información por WhatsApp</Text>
      </Pressable>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 18,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    backgroundColor: ucapsaBrand.colors.surface,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: ucapsaBrand.colors.redDark,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
  title: {
    marginTop: 4,
    color: ucapsaBrand.colors.text,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '900',
  },
  introCard: {
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.redBorder,
    backgroundColor: ucapsaBrand.colors.redSoft,
    padding: 16,
    marginBottom: 12,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ucapsaBrand.colors.surface,
  },
  description: {
    color: ucapsaBrand.colors.text,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
  },
  detailCard: {
    gap: 11,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    backgroundColor: ucapsaBrand.colors.surface,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: ucapsaBrand.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  pointText: {
    flex: 1,
    color: ucapsaBrand.colors.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  whatsappButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 18,
    backgroundColor: ucapsaBrand.colors.red,
    paddingHorizontal: 16,
  },
  whatsappButtonText: {
    color: ucapsaBrand.colors.surface,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
});
