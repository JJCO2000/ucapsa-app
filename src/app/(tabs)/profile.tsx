import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { requestAccountDeletion, updateMyProfile } from '../../services/profiles.service';
import { useSession } from '../../hooks/useSession';

const avatarColors = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a'];

export default function ProfileScreen() {
  const { loading, user, profile, role, isAdmin, signOut } = useSession();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dogName, setDogName] = useState('');
  const [avatarColor, setAvatarColor] = useState('#0f766e');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
    setDogName(profile?.dog_name ?? '');
    setAvatarColor(profile?.avatar_color ?? '#0f766e');
  }, [profile]);

  async function handleSaveProfile() {
    if (!user) return;
    if (!fullName.trim()) {
      Alert.alert('Falta nombre', 'Tu perfil necesita un nombre para mostrarlo en la credencial.');
      return;
    }

    try {
      setSaving(true);
      await updateMyProfile({ full_name: fullName, phone, dog_name: dogName, avatar_color: avatarColor });
      Alert.alert('Perfil actualizado', 'Tus datos se guardaron correctamente. Cierra y abre la pantalla si no ves el cambio al instante.');
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteRequest() {
    Alert.alert(
      'Solicitar eliminaciÃ³n de cuenta',
      'Por seguridad, esta acciÃ³n crea una solicitud para administraciÃ³n. No borra tu cuenta automÃ¡ticamente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Solicitar',
          style: 'destructive',
          onPress: async () => {
            try {
              await requestAccountDeletion('Solicitud desde Perfil.');
              Alert.alert('Solicitud enviada', 'AdministraciÃ³n revisarÃ¡ la eliminaciÃ³n de tu cuenta.');
            } catch (error) {
              Alert.alert('No se pudo solicitar', error instanceof Error ? error.message : 'Intenta de nuevo.');
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <KeyboardAwareScreen>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.muted}>Cargando sesiÃ³n...</Text>
      </KeyboardAwareScreen>
    );
  }

  if (!user) {
    return (
      <KeyboardAwareScreen>
        <Text style={styles.eyebrow}>UCAPSA</Text>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.muted}>Inicia sesiÃ³n para ver tu perfil, membresÃ­a y credencial digital.</Text>

        <Link href="/auth/login" asChild>
          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Iniciar sesiÃ³n</Text>
          </Pressable>
        </Link>

        <Link href="/auth/register" asChild>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Crear cuenta</Text>
          </Pressable>
        </Link>
      </KeyboardAwareScreen>
    );
  }

  return (
    <KeyboardAwareScreen>
      <Text style={styles.eyebrow}>Cuenta</Text>
      <Text style={styles.title}>Perfil</Text>
      <Text style={styles.muted}>Actualiza los datos que se reflejan en Mi UCAPSA y tu credencial.</Text>

      <View style={styles.avatarRow}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{(fullName || profile?.email || 'U').trim().slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.avatarInfo}>
          <Text style={styles.name}>{fullName || profile?.email || 'Usuario'}</Text>
          <Text style={styles.mutedSmall}>{profile?.email ?? user.email}</Text>
          <Text style={styles.role}>Rol: {role ?? 'client'}</Text>
        </View>
      </View>

      <Text style={styles.label}>Nombre completo</Text>
      <TextInput
        value={fullName}
        onChangeText={setFullName}
        placeholder="Tu nombre"
        style={styles.input}
        autoCapitalize="words"
      />

      <Text style={styles.label}>TelÃ©fono</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="TelÃ©fono opcional"
        style={styles.input}
        keyboardType="phone-pad"
      />

      <Text style={styles.label}>Nombre de tu perro</Text>
      <TextInput
        value={dogName}
        onChangeText={setDogName}
        placeholder="Ej. Max, Luna, Toby"
        style={styles.input}
        autoCapitalize="words"
      />

      <Text style={styles.label}>Color de avatar</Text>
      <View style={styles.colorRow}>
        {avatarColors.map((color) => (
          <Pressable
            key={color}
            onPress={() => setAvatarColor(color)}
            style={[
              styles.colorDot,
              { backgroundColor: color },
              avatarColor === color && styles.colorDotActive,
            ]}
          />
        ))}
      </View>

      <Pressable disabled={saving} onPress={handleSaveProfile} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar perfil'}</Text>
      </Pressable>

      {isAdmin ? (
        <Link href="/admin/members" asChild>
          <Pressable style={styles.adminButton}>
            <Text style={styles.adminButtonText}>Abrir panel de socios</Text>
          </Pressable>
        </Link>
      ) : null}

      <Pressable onPress={handleDeleteRequest} style={styles.dangerGhostButton}>
        <Text style={styles.dangerGhostText}>Solicitar eliminaciÃ³n de cuenta</Text>
      </Pressable>

      <Pressable onPress={signOut} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Cerrar sesiÃ³n</Text>
      </Pressable>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: '#0f766e', fontSize: 13, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  title: { color: '#0f172a', fontSize: 30, fontWeight: '900', marginTop: 6 },
  muted: { color: '#64748b', fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 20 },
  mutedSmall: { color: '#64748b', fontSize: 13, marginTop: 2 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 22, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 18 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#ffffff', fontSize: 28, fontWeight: '900' },
  avatarInfo: { flex: 1, marginLeft: 14 },
  name: { color: '#0f172a', fontSize: 18, fontWeight: '900' },
  role: { color: '#0f766e', fontSize: 13, fontWeight: '800', marginTop: 4 },
  label: { color: '#334155', fontSize: 13, fontWeight: '800', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 14, color: '#0f172a', fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  colorRow: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 10 },
  colorDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#ffffff' },
  colorDotActive: { borderColor: '#0f172a', transform: [{ scale: 1.08 }] },
  primaryButton: { backgroundColor: '#0f766e', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  secondaryButton: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  secondaryButtonText: { color: '#0f172a', fontSize: 15, fontWeight: '900' },
  adminButton: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#99f6e4', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  adminButtonText: { color: '#0f766e', fontSize: 15, fontWeight: '900' },
  dangerGhostButton: { paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  dangerGhostText: { color: '#dc2626', fontSize: 14, fontWeight: '800' },
});
