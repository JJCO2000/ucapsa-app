import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState, type ReactNode } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ucapsaBrand } from '../../constants/brand';

/**
 * Visor de fotos existentes. No carga nuevas URLs ni modifica permisos:
 * el llamador sólo puede entregarle una foto a la que ya tenga acceso.
 * Si la URL caduca, se cerrará y podrá volver a consultarse desde la pantalla.
 */
export function ExpandablePhoto({
  uri, name, children, disabled = false,
}: {
  uri: string;
  name: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const title = `Foto de ${name}`;
  const close = () => setOpen(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ampliar ${title.toLowerCase()}`}
        accessibilityHint="Abre la imagen completa. Puedes volver con Cerrar."
        disabled={disabled}
        onPress={(event) => { event.stopPropagation(); setOpen(true); }}
        style={styles.thumbnail}
      >
        {children}
      </Pressable>
      <Modal
        visible={open && Boolean(uri)}
        animationType="fade"
        onRequestClose={close}
        statusBarTranslucent
        transparent={false}
      >
        <View style={styles.fullScreen}>
          <View style={[styles.toolbar, { paddingTop: Math.max(insets.top, 18) }]}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar foto"
              onPress={close}
              style={styles.close}
              hitSlop={10}
            >
              <MaterialIcons name="close" size={25} color={ucapsaBrand.colors.surface} />
            </Pressable>
          </View>
          <Image
            source={{ uri }}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel={`Imagen completa de ${name}`}
            style={styles.fullImage}
          />
          <Text style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 18) }]}>
            Imagen completa
          </Text>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumbnail: { alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center' },
  fullScreen: { flex: 1, backgroundColor: ucapsaBrand.colors.text },
  toolbar: {
    minHeight: 62, paddingHorizontal: 18, paddingBottom: 10, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', gap: 12,
  },
  title: { color: ucapsaBrand.colors.surface, fontSize: 16, fontWeight: '800', flex: 1 },
  close: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  fullImage: { flex: 1, width: '100%' },
  footer: { color: ucapsaBrand.colors.surface, fontSize: 12, textAlign: 'center', paddingTop: 8 },
});
