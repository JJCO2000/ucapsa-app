import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../constants/brand';

const serviceOptions = ['Puppy', 'Comandos', 'Membresía', 'Restaurante'];
const highlightOptions = ['Atención', 'Seguimiento', 'Instalaciones', 'Trato al perro'];

function sentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function buildDraft(service: string, highlight: string, result: string) {
  const parts: string[] = [];
  if (service.trim()) parts.push(`Tomé ${service.trim()} en UCAPSA.`);
  if (highlight.trim()) parts.push(`Lo que más me gustó fue ${highlight.trim().toLocaleLowerCase('es-MX')}.`);
  if (result.trim()) parts.push(sentence(result));
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
      Alert.alert('Cuéntanos un poco más', 'Elige o escribe al menos un dato para crear tu borrador.');
      return;
    }
    setFinalText(suggested);
  }

  async function copyReview() {
    if (!finalText.trim()) {
      Alert.alert('Falta el texto', 'Crea o escribe tu reseña antes de copiarla.');
      return;
    }
    await Clipboard.setStringAsync(finalText.trim());
    Alert.alert('Reseña copiada', 'Ya puedes pegarla en Google Maps.');
  }

  async function openGoogle() {
    if (!finalText.trim()) {
      Alert.alert('Primero crea tu reseña', 'Genera o escribe el texto final antes de abrir Google.');
      return;
    }
    try {
      await Clipboard.setStringAsync(finalText.trim());
      await Linking.openURL(ucapsaBrand.googleReviewUrl);
    } catch {
      Alert.alert('No se pudo abrir Google Maps', 'Tu texto quedó listo para copiar. Inténtalo de nuevo desde Google Maps.');
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
        <Text style={styles.noticeText}>Te ayudamos a ordenar tu experiencia real. Tú decides el texto final antes de publicarlo.</Text>
      </View>

      <QuestionBlock label="¿Qué servicio tomaste?">
        <ChoiceRow options={serviceOptions} value={service} onChange={setService} />
        <TextInput
          value={service}
          onChangeText={setService}
          placeholder="Otro servicio o programa"
          style={styles.input}
        />
      </QuestionBlock>

      <QuestionBlock label="¿Qué fue lo que más te gustó?">
        <ChoiceRow options={highlightOptions} value={highlight} onChange={setHighlight} />
        <TextInput
          value={highlight}
          onChangeText={setHighlight}
          placeholder="Escríbelo con tus palabras"
          style={styles.input}
        />
      </QuestionBlock>

      <QuestionBlock label="¿Qué cambió o qué resultado viste?">
        <TextInput
          value={result}
          onChangeText={setResult}
          placeholder="Ej. Mi perro mejoró al pasear y entendí mejor cómo comunicarme con él."
          multiline
          style={[styles.input, styles.inputMultiline]}
        />
      </QuestionBlock>

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
          <Text style={styles.primaryText}>Copiar y abrir Google</Text>
        </Pressable>
      </View>

      <Pressable style={styles.mapsLink} onPress={() => void Linking.openURL(ucapsaBrand.googleMapsUrl)}>
        <MaterialIcons name="place" size={18} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.mapsLinkText}>Ver UCAPSA en Google Maps</Text>
      </Pressable>
    </KeyboardAwareScreen>
  );
}

function QuestionBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.question}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function ChoiceRow({ options, value, onChange }: { options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.choiceRow}>
      {options.map((option) => {
        const selected = value.trim().toLocaleLowerCase('es-MX') === option.toLocaleLowerCase('es-MX');
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.choiceChip, selected && styles.choiceChipSelected]}
            onPress={() => onChange(option)}
          >
            <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option}</Text>
          </Pressable>
        );
      })}
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
  question: { gap: 9, marginBottom: 16 },
  label: { color: ucapsaBrand.colors.text, fontSize: 14, lineHeight: 19, fontWeight: '900' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: { minHeight: 40, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 13 },
  choiceChipSelected: { borderColor: ucapsaBrand.colors.redDark, backgroundColor: ucapsaBrand.colors.redDark },
  choiceText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  choiceTextSelected: { color: ucapsaBrand.colors.surface },
  input: { minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, color: ucapsaBrand.colors.text, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  inputMultiline: { minHeight: 92, textAlignVertical: 'top' },
  generateButton: { minHeight: 52, borderRadius: 16, backgroundColor: ucapsaBrand.colors.red, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 2, marginBottom: 18 },
  generateText: { color: ucapsaBrand.colors.surface, fontSize: 15, fontWeight: '900' },
  finalInput: { minHeight: 118, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.surface, color: ucapsaBrand.colors.text, padding: 14, fontSize: 15, lineHeight: 22, textAlignVertical: 'top' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  secondaryButton: { flex: 0.8, minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.surface, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontSize: 14, fontWeight: '900' },
  primaryButton: { flex: 1.4, minHeight: 50, borderRadius: 16, backgroundColor: ucapsaBrand.colors.red, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  mapsLink: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10 },
  mapsLinkText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '800' },
});
