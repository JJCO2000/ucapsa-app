import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text, View } from 'react-native';
import { ucapsaBrand } from '../../constants/brand';

/** Representación de la tarjeta impresa; la asistencia real sigue en program_attendances. */
export function TrainingAttendanceStamps({
  attended, required, code,
}: { attended: number; required: number; code: 'puppy' | 'comandos' }) {
  if (required <= 0 || required > 12) return null;
  const puppy = code === 'puppy';
  const tone = puppy ? ucapsaBrand.colors.goldDark : ucapsaBrand.colors.blueDark;
  const soft = puppy ? ucapsaBrand.colors.goldPale : ucapsaBrand.colors.blueSoft;
  return (
    <View style={{ gap: 8 }} accessible accessibilityLabel={attended + ' de ' + required + ' asistencias confirmadas'}>
      <Text style={{ color: ucapsaBrand.colors.text, fontWeight: '900', fontSize: 14 }}>
        Tu tarjeta digital · {Math.min(attended, required)} de {required} sesiones
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {Array.from({ length: required }, (_, index) => {
          const done = index < attended;
          return (
            <View key={index} style={{ minWidth: 68, minHeight: 67, borderRadius: 13, borderWidth: 1,
              borderColor: done ? tone : ucapsaBrand.colors.border,
              backgroundColor: done ? soft : ucapsaBrand.colors.surface,
              alignItems: 'center', justifyContent: 'center', padding: 7, gap: 4 }}>
              <MaterialIcons name={done ? 'check-circle' : 'radio-button-unchecked'} color={done ? tone : ucapsaBrand.colors.muted} size={23} />
              <Text style={{ color: done ? tone : ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '800' }}>
                Sesión {index + 1}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 11 }}>
        Solo se marcan sesiones con asistencia registrada oficialmente.
      </Text>
    </View>
  );
}
