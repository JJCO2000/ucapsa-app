import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../constants/brand';

function buildDraft(service: string, highlight: string, result: string) {
  const parts: string[] = [];
  if (service.trim()) parts.push(`Mi experiencia con ${service.trim()} en UCAPSA fue muy buena.`);
  if (highlight.trim()) parts.push(`Lo que más destacaría es ${highlight.trim()}.`);
  if (result.trim()) parts.push(`En mi caso, ${result.trim()}.`);
  return parts.join(' ');
}

export default function ReviewsScreen() {
  const [service, setService] = useState('');
  const [highlight, setHighlight] = useState('');
  const [result, setResult] = useState('');
  const [finalText, setFinalText] = useState('');

  const suggested = useMemo(() => buildDraft(service, highlight, result), [highlight, result, service]);

  function generate() {
    if (!suggested) {
      Alert.alert('Cuéntanos un poco más', 'Completa al menos una respuesta para crear un borrador.');
      return;
    }
    setFinalText(suggested);
  }

  async function copyReview() {
    if (!finalText.trim()) {
      Alert.alert('Falta el texto', 'Genera o escribe tu reseña antes de copiarla.');
      return;
    }
    await Clipboard.setStringAsync(finalText.trim());
    Alert.alert('Reseña copiada', 'Ya puedes pegarla en Google Maps.');
  }

  async function openGoogle() {
    try {
      await Linking.openURL(ucapsaBrand.googleReviewUrl);
    } catch {
      Alert.alert('No se pudo abrir Google Maps', 'Copia tu reseña e inténtalo de nuevo desde Google Maps.');
    }
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.headerRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Regresar" onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={ucapsaBrand.colors.redDark} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Google Maps</Text>
          <Text style={styles.title}>Escribe tu reseña</Text>
        </View>
      </View>

      <View style={styles.notice}>
        <MaterialIcons name="verified" size={22} color={ucapsaBrand.colors.greenDark} />
        <Text style={styles.noticeText}>La app solo te ayuda a ordenar tus ideas. Usa únicamente tu experiencia real y cambia lo que quieras antes de publicarla.</Text>
      </View>

      <Question label="¿Qué servicio tomaste?" placeholder="Ej. Puppy, Comandos, membresía..." value={service} onChangeText={setService} />
      <Question label="¿Qué fue lo que más te gustó?" placeholder="Ej. la atención, el seguimiento, las instalaciones..." value={highlight} onChangeText={setHighlight} multiline />
      <Question label="¿Qué cambió o qué resultado viste?" placeholder="Ej. mi perro mejoró al pasear y entendí mejor cómo comunicarme con él" value={result} onChangeText={setResult} multiline />

      <Pressable style={styles.generateButton} onPress={generate}>
        <MaterialIcons name="auto-awesome" size={20} color={ucapsaBrand.colors.surface} />
        <Text style={styles.generateText}>Crear borrador</Text>
      </Pressable>

      <Text style={styles.label}>Texto final</Text>
      <TextInput
        value={finalText}
        onChangeText={setFinalText}
        placeholder="Aquí aparecerá tu borrador. Edítalo para que suene como tú."
        multiline
        style={styles.finalInput}
      />

      <View style={styles.actionRow}>
        <Pressable style={styles.secondaryButton} onPress={() => void copyReview()}>
          <MaterialIcons name="content-copy" size={19} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.secondaryText}>Copiar</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={() => void openGoogle()}>
          <MaterialIcons name="rate-review" size={19} color={ucapsaBrand.colors.surface} />
          <Text style={styles.primaryText}>Abrir Google</Text>
        </Pressable>
      </View>

      <Pressable style={styles.mapsLink} onPress={() => void Linking.openURL(ucapsaBrand.googleMapsUrl)}>
        <MaterialIcons name="place" size={18} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.mapsLinkText}>Ver UCAPSA en Google Maps</Text>
      </Pressable>
    </KeyboardAwareScreen>
  );
}

function Question({ label, placeholder, value, onChangeText, multiline = false }: { label: string; placeholder: string; value: string; onChangeText: (value: string) => void; multiline?: boolean }) {
  return (
    <View style={styles.question}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} multiline={multiline} style={[styles.input, multiline && styles.inputMultiline]} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  backButton: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, lineHeight: 34, fontWeight: '900' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.successBorder, backgroundColor: ucapsaBrand.colors.successSoft, padding: 14, marginBottom: 18 },
  noticeText: { flex: 1, color: ucapsaBrand.colors.successDark, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  question: { gap: 7, marginBottom: 14 },
  label: { color: ucapsaBrand.colors.text, fontSize: 14, lineHeight: 19, fontWeight: '900', marginBottom: 6 },
  input: { borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, color: ucapsaBrand.colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  inputMultiline: { minHeight: 92, textAlignVertical: 'top' },
  generateButton: { minHeight: 52, borderRadius: 16, backgroundColor: ucapsaBrand.colors.red, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 2, marginBottom: 18 },
  generateText: { color: ucapsaBrand.colors.surface, fontSize: 15, fontWeight: '900' },
  finalInput: { minHeight: 132, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.surface, color: ucapsaBrand.colors.text, padding: 14, fontSize: 15, lineHeight: 22, textAlignVertical: 'top' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  secondaryButton: { flex: 1, minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.surface, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontSize: 14, fontWeight: '900' },
  primaryButton: { flex: 1.25, minHeight: 50, borderRadius: 16, backgroundColor: ucapsaBrand.colors.red, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
  mapsLink: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10 },
  mapsLinkText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '800' },
});
