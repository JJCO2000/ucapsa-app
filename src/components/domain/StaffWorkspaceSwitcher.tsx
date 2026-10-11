import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { useStaffWorkspace, type StaffWorkspaceMode } from '../../hooks/useStaffWorkspace';

export function StaffWorkspaceSwitcher() {
  const { isAdmin } = useSession();
  const { mode, canSwitch, setMode } = useStaffWorkspace();

  if (!isAdmin || !canSwitch) return null;

  async function choose(nextMode: StaffWorkspaceMode) {
    if (nextMode === mode) return;
    await setMode(nextMode);
    router.replace(nextMode === 'trainer' ? '/trainer-home' as never : '/admin-home' as never);
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: mode === 'admin' }}
        style={[styles.option, mode === 'admin' && styles.adminActive]}
        onPress={() => void choose('admin')}
      >
        <MaterialIcons name="admin-panel-settings" size={16} color={mode === 'admin' ? ucapsaBrand.colors.surface : ucapsaBrand.colors.muted} />
        <Text style={[styles.label, mode === 'admin' && styles.activeLabel]}>Administración</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: mode === 'trainer' }}
        style={[styles.option, mode === 'trainer' && styles.trainerActive]}
        onPress={() => void choose('trainer')}
      >
        <MaterialIcons name="school" size={16} color={mode === 'trainer' ? ucapsaBrand.colors.surface : ucapsaBrand.colors.muted} />
        <Text style={[styles.label, mode === 'trainer' && styles.activeLabel]}>Entrenamiento</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 5, borderRadius: 14, backgroundColor: ucapsaBrand.colors.background, padding: 4 },
  option: { minHeight: 36, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 11, paddingHorizontal: 8 },
  adminActive: { backgroundColor: ucapsaBrand.colors.redDark },
  trainerActive: { backgroundColor: ucapsaBrand.colors.greenDark },
  label: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '900' },
  activeLabel: { color: ucapsaBrand.colors.surface },
});
