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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.header}>
            <View style={[styles.typePill, { backgroundColor: soft }]}>
              <Text style={[styles.typeText, { color: accent }]}>{label}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Cerrar ${label.toLocaleLowerCase('es-MX')}`}
              hitSlop={4}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <MaterialIcons name="close" size={25} color={ucapsaBrand.colors.text} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>{title}</Text>

            {dateLabel ? (
              <View style={styles.infoRow}>
                <MaterialIcons name="event" size={20} color={accent} />
                <Text style={styles.infoText}>{dateLabel}</Text>
              </View>
            ) : null}

            {location ? (
              <View style={styles.infoRow}>
                <MaterialIcons name="place" size={20} color={accent} />
                <Text style={styles.infoText}>{location}</Text>
              </View>
            ) : null}

            {repeatLabel ? (
              <View style={styles.infoRow}>
                <MaterialIcons name="repeat" size={20} color={accent} />
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
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
    backgroundColor: withAlpha(ucapsaBrand.colors.black, 0.5),
  },
  card: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '78%',
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    backgroundColor: ucapsaBrand.colors.surface,
    shadowColor: ucapsaBrand.colors.black,
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  typePill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  typeText: { fontSize: 12, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase' },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ucapsaBrand.colors.surfaceAlt,
  },
  pressed: { opacity: 0.72 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 26, gap: 14 },
  title: { color: ucapsaBrand.colors.text, fontSize: 27, fontWeight: '900', lineHeight: 34 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13, borderRadius: 16, backgroundColor: ucapsaBrand.colors.background },
  infoText: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '800', lineHeight: 21 },
  body: { color: ucapsaBrand.colors.muted, fontSize: 16, lineHeight: 25, marginTop: 4 },
});
