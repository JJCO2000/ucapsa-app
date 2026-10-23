import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';
import { DogAvatar } from './DogAvatar';
import { devWarn } from '../../lib/client-diagnostics';
import {
  getMyRankingPhotoChoice, isRankingPhotoChoiceAvailable, setMyRankingPhotoChoice,
} from '../../services/ranking-photo-consent.service';

type Props = {
  dogId: string;
  dogName: string;
  photoUrl: string | null;
  photoPath: string | null;
  avatarKey: string;
  avatarColor: string;
};

/** A per-dog choice. Until the privacy and backend gate is live, avatar is the only available option. */
export function RankingPhotoChoice({ dogId, dogName, photoUrl, photoPath, avatarKey, avatarColor }: Props) {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let current = true;
    setLoading(true);
    setAvailable(false);
    setEnabled(false);
    setFeedback('');
    async function read() {
      try {
        const allowed = await isRankingPhotoChoiceAvailable();
        if (!current) return;
        setAvailable(allowed);
        if (!allowed) {
          setEnabled(false);
          return;
        }
        const preference = await getMyRankingPhotoChoice(dogId);
        if (current) setEnabled(preference && Boolean(photoPath));
      } catch (cause) {
        devWarn('ranking-photo: could not read owner consent status.', cause);
        if (current) {
          setAvailable(false);
          setEnabled(false);
          setFeedback('No pudimos consultar esta opción. Tu foto sigue siendo privada.');
        }
      } finally {
        if (current) setLoading(false);
      }
    }
    void read();
    return () => { current = false; };
  }, [dogId, photoPath]);

  async function choosePhoto(nextEnabled: boolean) {
    if (saving || (nextEnabled && (!available || !photoPath))) return;
    if (nextEnabled && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setSaving(true);
    setFeedback('');
    try {
      const saved = await setMyRankingPhotoChoice(dogId, nextEnabled);
      setEnabled(saved);
      setFeedback(saved
        ? 'Elegiste mostrar la foto en Ranking.'
        : 'Ahora los demás verán solamente el avatar.');
    } catch (cause) {
      devWarn('ranking-photo: could not update public choice.', cause);
      setFeedback('No se pudo guardar el cambio. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  const imageEnabled = !loading && available && Boolean(photoPath);
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Imagen en Ranking</Text>
      <Text style={styles.hint}>
        Elige qué pueden ver las demás personas. Tu foto privada no se publica por tomarla.
      </Text>
      <Pressable accessibilityRole="radio" accessibilityState={{ selected: !enabled, disabled: loading || saving }}
        accessibilityLabel="Avatar, visible para todos"
        disabled={loading || saving} style={[styles.option, !enabled && styles.selected]}
        onPress={() => { if (enabled) void choosePhoto(false); }}>
        <DogAvatar avatarKey={avatarKey} avatarColor={avatarColor} size={48} />
        <View style={styles.copy}>
          <Text style={styles.optionTitle}>Avatar</Text>
          <Text style={styles.hint}>Opción predeterminada</Text>
        </View>
        <MaterialIcons name={!enabled ? 'radio-button-checked' : 'radio-button-unchecked'}
          size={24} color={ucapsaBrand.colors.greenDark} />
      </Pressable>
      <Pressable accessibilityRole="radio"
        accessibilityState={{ selected: enabled, disabled: loading || saving || !imageEnabled }}
        accessibilityLabel="Foto real visible en Ranking"
        disabled={loading || saving || !imageEnabled}
        style={[styles.option, enabled && styles.selected, !imageEnabled && styles.disabled]}
        onPress={() => { if (!enabled) void choosePhoto(true); }}>
        {photoUrl && imageEnabled ?
          <Image source={{ uri: photoUrl }} style={styles.preview} resizeMode="cover"
            accessibilityLabel={'Vista previa privada de ' + dogName} /> :
          <MaterialIcons name="photo-camera" size={34} color={ucapsaBrand.colors.grayDark} style={styles.previewIcon} />}
        <View style={styles.copy}>
          <Text style={styles.optionTitle}>Foto real</Text>
          <Text style={styles.hint}>
            {!photoPath ? 'Primero toma una foto' :
              !available ? 'Disponible cuando se actualice la privacidad' :
              enabled ? 'Visible con tu autorización' : 'Compartir voluntariamente'}
          </Text>
        </View>
        <MaterialIcons name={enabled ? 'radio-button-checked' : 'radio-button-unchecked'}
          size={24} color={imageEnabled ? ucapsaBrand.colors.greenDark : ucapsaBrand.colors.muted} />
      </Pressable>
      {feedback ? <Text accessibilityRole="alert" style={styles.feedback}>{feedback}</Text> : null}
      <Modal visible={confirming} transparent animationType="fade"
        onRequestClose={() => setConfirming(false)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>¿Mostrar la foto de {dogName}?</Text>
            <Text style={styles.dialogText}>
              Otros usuarios de UCAPSA podrán verla en Ranking y Competencia.
              Puedes volver a mostrar el avatar cuando quieras, aunque alguien
              podría haber guardado una copia de la foto mientras estuvo visible.
            </Text>
            <Pressable accessibilityRole="button" style={styles.primary}
              disabled={saving} onPress={() => { void choosePhoto(true); }}>
              <Text style={styles.primaryText}>Sí, mostrar mi foto</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.secondary}
              onPress={() => setConfirming(false)}>
              <Text style={styles.secondaryText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  section: { gap: 10 },
  heading: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18 },
  option: { minHeight: 74, borderWidth: 1, borderRadius: 14,
    borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface,
    flexDirection: 'row', alignItems: 'center', padding: 11, gap: 12 },
  selected: { borderColor: ucapsaBrand.colors.greenDark, borderWidth: 2 },
  disabled: { opacity: 0.62 },
  copy: { flex: 1 },
  optionTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  preview: { width: 48, height: 48, borderRadius: 15 },
  previewIcon: { width: 48, textAlign: 'center' },
  feedback: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: ucapsaBrand.colors.surface, borderRadius: 22, padding: 22, gap: 14 },
  dialogTitle: { color: ucapsaBrand.colors.text, fontSize: 20, fontWeight: '900' },
  dialogText: { color: ucapsaBrand.colors.text, fontSize: 14, lineHeight: 21 },
  primary: { backgroundColor: ucapsaBrand.colors.greenDark, padding: 15, borderRadius: 12, alignItems: 'center' },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
  secondary: { borderColor: ucapsaBrand.colors.border, borderWidth: 1, borderRadius: 12, padding: 13, alignItems: 'center' },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontWeight: '900' },
});
