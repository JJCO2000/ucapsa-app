import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';

type SocialLinksRowProps = {
  title?: string;
  subtitle?: string;
};

export function SocialLinksRow({ title = 'Canales oficiales', subtitle = 'Sitio web y redes de UCAPSA.' }: SocialLinksRowProps) {
  async function openLink(url: string) {
    await Linking.openURL(url);
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.row}>
        {ucapsaBrand.socialLinks.map((item) => (
          <Pressable key={item.key} style={styles.item} onPress={() => openLink(item.url)}>
            <MaterialCommunityIcons name={item.icon as any} size={20} color={ucapsaBrand.colors.red} />
            <Text style={styles.label}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
    padding: 16,
    borderRadius: 24,
    backgroundColor: ucapsaBrand.colors.surface,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
  },
  title: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: ucapsaBrand.colors.redSoft,
  },
  label: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
});
