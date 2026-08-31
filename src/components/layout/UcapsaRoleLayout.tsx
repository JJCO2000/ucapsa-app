import { ucapsaBrand } from '../../constants/brand';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { UcapsaFormat } from '../../constants/ucapsaFormats';

type IconFamily = 'material' | 'community';

type HeroProps = {
  format: UcapsaFormat;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  icon?: string;
};

function Icon({ family = 'material', name, size, color }: { family?: IconFamily; name: string; size: number; color: string }) {
  if (family === 'community') {
    return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
  }

  return <MaterialIcons name={name as any} size={size} color={color} />;
}

export function UcapsaRoleHero({ format, eyebrow, title, subtitle, right, icon }: HeroProps) {
  const iconName = icon ?? format.icon;

  return (
    <View style={[styles.hero, { backgroundColor: format.heroBackground, borderColor: format.cardBorder }]}>
      <View style={styles.heroTop}>
        <View style={[styles.iconBox, { backgroundColor: format.pillBackground }]}>
          <Icon family="community" name={iconName} size={26} color={format.pillText} />
        </View>
        {right}
      </View>
      {eyebrow ? <Text style={[styles.eyebrow, { color: format.heroMuted }]}>{eyebrow}</Text> : null}
      <Text style={[styles.title, { color: format.heroText }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: format.heroMuted }]}>{subtitle}</Text> : null}
    </View>
  );
}

type CardProps = {
  format: UcapsaFormat;
  title?: string;
  subtitle?: string;
  icon?: string;
  iconFamily?: IconFamily;
  children?: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function UcapsaRoleCard({ format, title, subtitle, icon, iconFamily = 'material', children, onPress, style }: CardProps) {
  const content = (
    <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }, style]}>
      {icon || title || subtitle ? (
        <View style={styles.cardHeader}>
          {icon ? (
            <View style={[styles.smallIconBox, { backgroundColor: format.pillBackground }]}>
              <Icon family={iconFamily} name={icon} size={20} color={format.pillText} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            {title ? <Text style={[styles.cardTitle, { color: format.cardText }]}>{title}</Text> : null}
            {subtitle ? <Text style={[styles.cardSubtitle, { color: format.key === 'member' ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{subtitle}</Text> : null}
          </View>
          {onPress ? <MaterialIcons name="chevron-right" size={24} color={format.key === 'member' ? ucapsaBrand.colors.surface : format.accent} /> : null}
        </View>
      ) : null}
      {children}
    </View>
  );

  if (!onPress) return content;
  return <Pressable onPress={onPress}>{content}</Pressable>;
}

export function UcapsaPill({ format, children }: { format: UcapsaFormat; children: ReactNode }) {
  return <Text style={[styles.pill, { color: format.pillText, backgroundColor: format.pillBackground }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  hero: { gap: 8, padding: 20, borderRadius: 30, borderWidth: 1 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  iconBox: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { fontSize: 29, lineHeight: 34, fontWeight: '900' },
  subtitle: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  card: { gap: 12, padding: 17, borderRadius: 26, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  smallIconBox: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 18, fontWeight: '900' },
  cardSubtitle: { fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 3 },
  pill: { overflow: 'hidden', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, fontSize: 12, fontWeight: '900' },
});
