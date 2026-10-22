import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { getClientHelpGuide, type ClientHelpTab } from '../../constants/clientHelp';
import type { UcapsaFormat } from '../../constants/ucapsaFormats';
import { hasSeenTabHelp, markTabHelpSeen } from '../../services/quick-help.service';
import { useSession } from '../../hooks/useSession';

type Props = { tab: ClientHelpTab; userId: string | null; format: UcapsaFormat };

export function ContextualHelpTip({ tab, userId, format }: Props) {
  const { user, role, loading } = useSession();
  const canShow = !loading && user?.id === userId && (role === 'client' || role === 'member');
  const [visibleFor, setVisibleFor] = useState<string | null>(null);
  const key = userId ? userId + ':' + tab : null;
  const guide = getClientHelpGuide(tab);

  useEffect(() => {
    let active = true;
    setVisibleFor(null);
    if (canShow && userId) {
      void hasSeenTabHelp(userId, tab).then((seen) => {
        if (active && !seen) setVisibleFor(userId + ':' + tab);
      });
    }
    return () => { active = false; };
  }, [canShow, userId, tab]);

  if (!canShow || !userId || visibleFor !== key) return null;

  function dismiss() {
    setVisibleFor(null);
    void markTabHelpSeen(userId!, tab);
  }

  function openAction() {
    dismiss();
    router.push(guide.route as never);
  }

  return (
    <View style={{
      borderWidth: 1, borderColor: format.cardBorder, backgroundColor: format.cardBackground,
      borderRadius: 18, padding: 14, marginBottom: 12, gap: 7,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <MaterialIcons name="lightbulb-outline" size={20} color={format.accentDark} />
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '900', color: format.cardText }}>{guide.headline}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar consejo"
          hitSlop={10} onPress={dismiss} style={{ minHeight: 36, minWidth: 36, justifyContent: 'center', alignItems: 'center' }}>
          <MaterialIcons name="close" size={20} color={format.muted} />
        </Pressable>
      </View>
      <Text style={{ fontSize: 13, lineHeight: 20, color: format.muted }}>{guide.description}</Text>
      <Pressable accessibilityRole="button" onPress={openAction}
        style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingRight: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: format.accentDark }}>{guide.action} →</Text>
      </Pressable>
    </View>
  );
}
