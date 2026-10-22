import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { clientHelpGuides, getClientHelpGuide } from '../../constants/clientHelp';
import { useSession } from '../../hooks/useSession';
import { markQuickHelpSeen } from '../../services/quick-help.service';

// Reutilizar las guías oficiales por pestaña en vez de duplicar rutas o reglas.
const TOUR_TABS = ['home', 'classes', 'dog'] as const;

export default function QuickHelpScreen() {
  const { loading, user, role, isAdmin, isTrainer } = useSession();
  const [tourOpen, setTourOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  if (loading) return <KeyboardAwareScreen><Text>Preparando guía…</Text></KeyboardAwareScreen>;
  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;
  if (isTrainer) return <Redirect href="/trainer-home" />;
  if (role !== 'client' && role !== 'member') return <Redirect href="/home" />;

  function go(route?: string) {
    void markQuickHelpSeen(user!.id);
    if (route) router.replace(route as never);
    else router.back();
  }

  function endTour() {
    void markQuickHelpSeen(user!.id);
    setTourOpen(false);
  }

  const step = getClientHelpGuide(TOUR_TABS[stepIndex]);

  return (
    <KeyboardAwareScreen>
      {tourOpen ? (
        <View style={{ flex: 1, gap: 16, paddingTop: 16 }}>
          <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '800', textAlign: 'center' }}>
            Conoce UCAPSA · Paso {stepIndex + 1} de {TOUR_TABS.length}
          </Text>
          <View style={{
            borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface,
            borderRadius: 24, paddingHorizontal: 22, paddingVertical: 28, alignItems: 'center', gap: 14,
            minHeight: 330, justifyContent: 'center',
          }}>
            <View style={{ width: 100, height: 100, borderRadius: 28,
              backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialIcons name={step.icon} size={52} color={ucapsaBrand.colors.redDark} />
            </View>
            <Text style={{ color: ucapsaBrand.colors.text, fontSize: 25, fontWeight: '900', textAlign: 'center' }}>
              {step.headline}
            </Text>
            <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 16, lineHeight: 24, textAlign: 'center' }}>
              {step.description}
            </Text>
          </View>
          <View accessibilityLabel={'Paso ' + (stepIndex + 1) + ' de ' + TOUR_TABS.length}
            style={{ flexDirection: 'row', justifyContent: 'center', gap: 9, marginTop: 4 }}>
            {TOUR_TABS.map((tab, index) => (
              <View key={tab} style={{ height: 9, width: index === stepIndex ? 25 : 9,
                borderRadius: 5, backgroundColor: index === stepIndex ? ucapsaBrand.colors.redDark : ucapsaBrand.colors.border }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, alignItems: 'center' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Omitir recorrido"
              onPress={endTour} style={{ minHeight: 50, justifyContent: 'center', paddingHorizontal: 9 }}>
              <Text style={{ color: ucapsaBrand.colors.muted, fontWeight: '800' }}>Omitir</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            {stepIndex > 0 ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Paso anterior"
                onPress={() => setStepIndex((index) => index - 1)}
                style={{ minHeight: 50, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border,
                  paddingHorizontal: 15, justifyContent: 'center' }}>
                <Text style={{ color: ucapsaBrand.colors.redDark, fontWeight: '900' }}>Anterior</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button"
              accessibilityLabel={stepIndex === TOUR_TABS.length - 1 ? 'Explorar UCAPSA' : 'Siguiente paso'}
              onPress={() => stepIndex === TOUR_TABS.length - 1 ? endTour() : setStepIndex((index) => index + 1)}
              style={{ minHeight: 50, borderRadius: 18, backgroundColor: ucapsaBrand.colors.redDark,
                paddingHorizontal: 19, justifyContent: 'center' }}>
              <Text style={{ color: ucapsaBrand.colors.surface, fontWeight: '900' }}>
                {stepIndex === TOUR_TABS.length - 1 ? 'Explorar UCAPSA' : 'Siguiente'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <Text style={{ color: ucapsaBrand.colors.text, fontSize: 26, fontWeight: '900', marginTop: 8 }}>
            Descubre UCAPSA
          </Text>
          <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 15, lineHeight: 22, marginTop: 5, marginBottom: 14 }}>
            Elige qué quieres hacer o conoce la app en tres pasos.
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Ver recorrido general de tres pasos"
            onPress={() => { setStepIndex(0); setTourOpen(true); }}
            style={{ backgroundColor: ucapsaBrand.colors.redSoft, borderColor: ucapsaBrand.colors.border,
              borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 16,
              flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72 }}>
            <MaterialIcons name="play-circle-outline" size={30} color={ucapsaBrand.colors.redDark} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' }}>Conoce UCAPSA en 3 pasos</Text>
              <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 13 }}>Recorrido opcional. Puedes omitirlo.</Text>
            </View>
            <MaterialIcons name="chevron-right" size={23} color={ucapsaBrand.colors.redDark} />
          </Pressable>
          {clientHelpGuides.map((guide) => (
            <Pressable key={guide.tab} accessibilityRole="button"
              accessibilityLabel={guide.action + ', ' + guide.title}
              onPress={() => go(guide.route)}
              style={{
                borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 18,
                backgroundColor: ucapsaBrand.colors.surface, padding: 15, marginBottom: 10,
                flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 88,
              }}>
              <View style={{
                height: 46, width: 46, borderRadius: 14,
                backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center',
              }}>
                <MaterialIcons name={guide.icon} size={24} color={ucapsaBrand.colors.redDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '900', color: ucapsaBrand.colors.text }}>{guide.title}</Text>
                <Text style={{ fontSize: 13, lineHeight: 19, marginTop: 3, color: ucapsaBrand.colors.muted }}>{guide.description}</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', marginTop: 6, color: ucapsaBrand.colors.redDark }}>{guide.action} →</Text>
              </View>
              <MaterialIcons name="chevron-right" size={21} color={ucapsaBrand.colors.redDark} />
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={() => go()}
            style={{ minHeight: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 15, color: ucapsaBrand.colors.redDark, fontWeight: '800' }}>Volver a UCAPSA</Text>
          </Pressable>
        </>
      )}
    </KeyboardAwareScreen>
  );
}