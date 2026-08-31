import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand, withAlpha } from '../../constants/brand';

type UcapsaDetailModalProps = {
  visible: boolean;
  type: 'announcement' | 'event';
  title: string;
  body?: string | null;
  dateLabel?: string | null;
  location?: string | null;
  repeatLabel?: string | null;
  onClose: () => void;
};

export function UcapsaDetailModal({
  visible,
  type,
  title,
  body,
  dateLabel,
  location,
  repeatLabel,
  onClose,
}: UcapsaDetailModalProps) {
  const accent = type === 'event' ? ucapsaBrand.colors.red : ucapsaBrand.colors.blue;
  const soft = type === 'event' ? ucapsaBrand.colors.redSoft : ucapsaBrand.colors.blueSoft;
  const label = type === 'event' ? 'Evento' : 'Anuncio';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={[styles.typePill, { backgroundColor: soft }]}>
              <Text style={[styles.typeText, { color: accent }]}>{label}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color={ucapsaBrand.colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>{title}</Text>

            {dateLabel ? (
              <View style={styles.infoRow}>
                <MaterialIcons name="event" size={18} color={accent} />
                <Text style={styles.infoText}>{dateLabel}</Text>
              </View>
            ) : null}

            {location ? (
              <View style={styles.infoRow}>
                <MaterialIcons name="place" size={18} color={accent} />
                <Text style={styles.infoText}>{location}</Text>
              </View>
            ) : null}

            {repeatLabel ? (
              <View style={styles.infoRow}>
                <MaterialIcons name="repeat" size={18} color={accent} />
                <Text style={styles.infoText}>{repeatLabel}</Text>
              </View>
            ) : null}

            <Text style={styles.body}>{body?.trim() || 'Sin detalles adicionales.'}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: withAlpha(ucapsaBrand.colors.premiumBackground, 0.4) },
  card: {
    maxHeight: '82%',
    paddingTop: 16,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: ucapsaBrand.colors.surface,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  typePill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  typeText: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.surfaceAlt },
  content: { padding: 20, paddingBottom: 34, gap: 12 },
  title: { color: ucapsaBrand.colors.text, fontSize: 26, fontWeight: '900', lineHeight: 32 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 16, backgroundColor: ucapsaBrand.colors.background },
  infoText: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '800', lineHeight: 20 },
  body: { color: ucapsaBrand.colors.muted, fontSize: 16, lineHeight: 24, marginTop: 6 },
});
