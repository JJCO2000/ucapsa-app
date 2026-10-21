import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { clientHelpGuides } from '../../constants/clientHelp';
import { useSession } from '../../hooks/useSession';
import { markQuickHelpSeen } from '../../services/quick-help.service';

export default function QuickHelpScreen() {
  const { loading, user, role, isAdmin, isTrainer } = useSession();
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

  return (
    <KeyboardAwareScreen>
      <Text style={{ color: ucapsaBrand.colors.text, fontSize: 26, fontWeight: '900', marginTop: 8 }}>
        Descubre UCAPSA
      </Text>
      <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 15, lineHeight: 22, marginTop: 5, marginBottom: 16 }}>
        Elige lo que quieres hacer. También encontrarás consejos breves al entrar por primera vez a cada pestaña.
      </Text>
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
    </KeyboardAwareScreen>
  );
}
