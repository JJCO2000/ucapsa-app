import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';

type SocialLinksRowProps = {
  title?: string;
  subtitle?: string;
  premium?: boolean;
};

export function SocialLinksRow({ title = 'Canales oficiales', subtitle = 'Sitio web y redes de UCAPSA.', premium = false }: SocialLinksRowProps) {
  async function openLink(url: string) {
    await Linking.openURL(url);
  }

  return (
    <View style={[styles.wrapper, premium && styles.wrapperPremium]}>
      <Text style={[styles.title, premium && styles.titlePremium]}>{title}</Text>
      <Text style={[styles.subtitle, premium && styles.subtitlePremium]}>{subtitle}</Text>
      <View style={styles.row}>
        {ucapsaBrand.socialLinks.map((item) => (
          <Pressable key={item.key} style={[styles.item, premium && styles.itemPremium]} onPress={() => openLink(item.url)}>
            <MaterialCommunityIcons name={item.icon as any} size={20} color={premium ? '#FACC15' : ucapsaBrand.colors.red} />
            <Text style={[styles.label, premium && styles.labelPremium]}>{item.label}</Text>
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
  wrapperPremium: { backgroundColor: '#38111B', borderColor: 'rgba(250,204,21,0.34)' },
  titlePremium: { color: '#FFE8B5' },
  subtitlePremium: { color: '#FFE3E8' },
  itemPremium: { backgroundColor: 'rgba(250,204,21,0.12)', borderWidth: 1, borderColor: 'rgba(250,204,21,0.22)' },
  labelPremium: { color: '#FFE8B5' },
});

