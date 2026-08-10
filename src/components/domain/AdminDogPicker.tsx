import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';
import type { BasicDog } from '../../services/dogs.service';

export type AdminDogMode = 'existing' | 'new';

type Props = {
  dogs: BasicDog[];
  mode: AdminDogMode;
  selectedDogId: string;
  newDogName: string;
  onModeChange: (mode: AdminDogMode) => void;
  onSelectDog: (dog: BasicDog) => void;
  onNewDogNameChange: (value: string) => void;
};

export function AdminDogPicker({
  dogs,
  mode,
  selectedDogId,
  newDogName,
  onModeChange,
  onSelectDog,
  onNewDogNameChange,
}: Props) {
  const hasDogs = dogs.length > 0;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Perro</Text>
      <Text style={styles.hint}>Elige un perro ya registrado. Solo usa Nuevo perro cuando realmente sea otro perro.</Text>

      {hasDogs ? (
        <View style={styles.modeRow}>
          <Pressable style={[styles.modeButton, mode === 'existing' && styles.modeButtonActive]} onPress={() => onModeChange('existing')}>
            <MaterialIcons name="pets" size={18} color={mode === 'existing' ? '#FFFFFF' : ucapsaBrand.colors.redDark} />
            <Text style={[styles.modeText, mode === 'existing' && styles.modeTextActive]}>Registrado</Text>
          </Pressable>
          <Pressable style={[styles.modeButton, mode === 'new' && styles.modeButtonActive]} onPress={() => onModeChange('new')}>
            <MaterialIcons name="add" size={18} color={mode === 'new' ? '#FFFFFF' : ucapsaBrand.colors.redDark} />
            <Text style={[styles.modeText, mode === 'new' && styles.modeTextActive]}>Nuevo perro</Text>
          </Pressable>
        </View>
      ) : null}

      {mode === 'existing' && hasDogs ? (
        <View style={styles.dogList}>
          {dogs.map((dog) => {
            const active = dog.id === selectedDogId;
            return (
              <Pressable key={dog.id} style={[styles.dogButton, active && styles.dogButtonActive]} onPress={() => onSelectDog(dog)}>
                <MaterialIcons name="pets" size={18} color={active ? '#FFFFFF' : ucapsaBrand.colors.redDark} />
                <Text style={[styles.dogText, active && styles.dogTextActive]} numberOfLines={1}>{dog.name}</Text>
                {active ? <MaterialIcons name="check-circle" size={18} color="#FFFFFF" /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.newDogBox}>
          {!hasDogs ? <Text style={styles.emptyText}>Este cliente aun no tiene perros registrados.</Text> : null}
          <TextInput
            value={newDogName}
            onChangeText={onNewDogNameChange}
            placeholder="Nombre del nuevo perro"
            autoCapitalize="words"
            style={styles.input}
          />
          <Text style={styles.warning}>Al guardar la inscripcion se registrara este perro en la cuenta del cliente.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeButton: { flex: 1, minHeight: 42, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#FFFFFF', paddingHorizontal: 12, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  modeButtonActive: { backgroundColor: ucapsaBrand.colors.redDark, borderColor: ucapsaBrand.colors.redDark },
  modeText: { color: ucapsaBrand.colors.redDark, fontWeight: '900', fontSize: 13 },
  modeTextActive: { color: '#FFFFFF' },
  dogList: { gap: 8 },
  dogButton: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#FFFFFF', paddingHorizontal: 13, flexDirection: 'row', gap: 9, alignItems: 'center' },
  dogButtonActive: { backgroundColor: ucapsaBrand.colors.redDark, borderColor: ucapsaBrand.colors.redDark },
  dogText: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '800', flex: 1 },
  dogTextActive: { color: '#FFFFFF' },
  newDogBox: { gap: 7 },
  emptyText: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '700' },
  input: { minHeight: 46, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 14, paddingHorizontal: 13, backgroundColor: '#FFFFFF', color: ucapsaBrand.colors.text, fontWeight: '700' },
  warning: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
});
