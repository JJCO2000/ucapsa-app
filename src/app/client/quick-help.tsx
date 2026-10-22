import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { clientHelpGuides } from '../../constants/clientHelp';
import { useSession } from '../../hooks/useSession';
import { markQuickHelpSeen } from '../../services/quick-help.service';

/** Guía voluntaria de UCAPSA: un objetivo por paso, sin pantallas técnicas. */
export default function QuickHelpScreen() {
  const { loading, user, role, isAdmin, isTrainer } = useSession();
  const [step, setStep] = useState(0);
  if (loading) return <KeyboardAwareScreen><Text>Preparando guía…</Text></KeyboardAwareScreen>;
  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;
  if (isTrainer) return <Redirect href="/trainer-home" />;
  if (role !== 'client' && role !== 'member') return <Redirect href="/home" />;

  const guide = clientHelpGuides[step];
  const last = step === clientHelpGuides.length - 1;

  function finish(route?: string) {
    void markQuickHelpSeen(user!.id);
    if (route) router.replace(route as never);
    else if (router.canGoBack()) router.back();
    else router.replace('/home' as never);
  }

  return (
    <KeyboardAwareScreen
      backgroundColor={ucapsaBrand.colors.background}
      contentContainerStyle={{ padding: 22, paddingBottom: 32, flexGrow: 1 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: '900', color: ucapsaBrand.colors.redDark }}>
          DESCUBRE UCAPSA
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Omitir tutorial"
          onPress={() => finish()} hitSlop={10} style={{ padding: 10, minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: ucapsaBrand.colors.muted }}>Omitir</Text>
        </Pressable>
      </View>

      <Text style={{ color: ucapsaBrand.colors.muted, marginTop: 6, fontSize: 14 }}>
        {step + 1} de {clientHelpGuides.length} · {guide.title}
      </Text>

      <View style={{
        borderRadius: 24, borderWidth: 1, borderColor: ucapsaBrand.colors.border,
        backgroundColor: ucapsaBrand.colors.surface, marginTop: 22, padding: 22,
        gap: 13, alignItems: 'center', minHeight: 292, justifyContent: 'center',
      }}>
        <View style={{ width: 110, height: 110, borderRadius: 30,
          backgroundColor: ucapsaBrand.colors.redSoft,
          alignItems: 'center', justifyContent: 'center' }}>
          <MaterialIcons name={guide.icon} size={56} color={ucapsaBrand.colors.redDark} />
        </View>
        <Text style={{ fontSize: 23, fontWeight: '900', color: ucapsaBrand.colors.text,
          textAlign: 'center', marginTop: 4 }}>{guide.headline}</Text>
        <Text style={{ fontSize: 15, lineHeight: 23, color: ucapsaBrand.colors.muted,
          textAlign: 'center' }}>{guide.description}</Text>
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel={guide.action}
        onPress={() => finish(guide.route)}
        style={{ minHeight: 54, backgroundColor: ucapsaBrand.colors.red,
          borderRadius: 16, justifyContent: 'center', alignItems: 'center',
          marginTop: 18, paddingHorizontal: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: '900', color: ucapsaBrand.colors.surface }}>
          {guide.action} →
        </Text>
      </Pressable>

      <View style={{ flex: 1, minHeight: 32 }} />
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center',
        justifyContent: 'center', marginVertical: 19 }}
        accessibilityLabel={`Paso ${step + 1} de ${clientHelpGuides.length}`}>
        {clientHelpGuides.map((item, index) => (
          <View key={item.tab} style={{ height: 9, width: index === step ? 22 : 9,
            borderRadius: 8,
            backgroundColor: index === step ? ucapsaBrand.colors.red : ucapsaBrand.colors.border }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Paso anterior"
          disabled={step === 0} onPress={() => setStep((value) => Math.max(0, value - 1))}
          style={{ flex: 1, minHeight: 52, borderRadius: 17, borderWidth: 1,
            borderColor: ucapsaBrand.colors.border, alignItems: 'center',
            justifyContent: 'center', opacity: step === 0 ? 0.45 : 1 }}>
          <Text style={{ fontWeight: '800', color: ucapsaBrand.colors.redDark }}>Anterior</Text>
        </Pressable>
        <Pressable accessibilityRole="button"
          accessibilityLabel={last ? 'Terminar tutorial' : 'Paso siguiente'}
          onPress={() => last ? finish() : setStep((value) => Math.min(value + 1, clientHelpGuides.length - 1))}
          style={{ flex: 1, minHeight: 52, borderRadius: 17,
            backgroundColor: ucapsaBrand.colors.red,
            alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontWeight: '900', color: ucapsaBrand.colors.surface }}>
            {last ? 'Terminar' : 'Siguiente'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAwareScreen>
  );
}
