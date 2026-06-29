import { Link } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScreen } from "../../components/ui/KeyboardAwareScreen";
import { useSession } from "../../hooks/useSession";
import {
  requestAccountDeletion,
  updateMyProfile,
} from "../../services/profiles.service";

const avatarColors = [
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#16a34a",
];

function hasCompleteProfile(value: {
  full_name?: string | null;
  phone?: string | null;
  dog_name?: string | null;
}) {
  return Boolean(
    value.full_name?.trim() && value.phone?.trim() && value.dog_name?.trim(),
  );
}

export default function ProfileScreen() {
  const { loading, user, profile, role, isAdmin, signOut, refreshProfile } =
    useSession();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [dogName, setDogName] = useState("");
  const [avatarColor, setAvatarColor] = useState("#0f766e");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const profileIsComplete = useMemo(
    () => hasCompleteProfile(profile ?? {}),
    [profile],
  );
  const showForm = !profileIsComplete || editing;

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
    setDogName(profile?.dog_name ?? "");
    setAvatarColor(profile?.avatar_color ?? "#0f766e");
    setEditing(!hasCompleteProfile(profile ?? {}));
  }, [profile]);

  async function handleSaveProfile() {
    if (!user) return;
    if (!fullName.trim()) {
      Alert.alert(
        "Falta nombre",
        "Tu perfil necesita un nombre para mostrarlo en la credencial.",
      );
      return;
    }
    if (!phone.trim()) {
      Alert.alert(
        "Falta teléfono",
        "Agrega un teléfono de contacto para completar tu perfil.",
      );
      return;
    }
    if (!dogName.trim()) {
      Alert.alert(
        "Falta nombre de perro",
        "Agrega el nombre de tu perro para completar tu perfil UCAPSA.",
      );
      return;
    }

    try {
      setSaving(true);
      await updateMyProfile({
        full_name: fullName,
        phone,
        dog_name: dogName,
        avatar_color: avatarColor,
      });
      await refreshProfile();
      setEditing(false);
      Alert.alert(
        "Perfil actualizado",
        "Tus datos se guardaron correctamente.",
      );
    } catch (error) {
      Alert.alert(
        "No se pudo guardar",
        error instanceof Error ? error.message : "Intenta de nuevo.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
    setDogName(profile?.dog_name ?? "");
    setAvatarColor(profile?.avatar_color ?? "#0f766e");
    setEditing(false);
  }

  function handleDeleteRequest() {
    Alert.alert(
      "Solicitar eliminación de cuenta",
      "Por seguridad, esta acción crea una solicitud para administración. No borra tu cuenta automáticamente.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Solicitar",
          style: "destructive",
          onPress: async () => {
            try {
              await requestAccountDeletion("Solicitud desde Perfil.");
              Alert.alert(
                "Solicitud enviada",
                "Administración revisará la eliminación de tu cuenta.",
              );
            } catch (error) {
              Alert.alert(
                "No se pudo solicitar",
                error instanceof Error ? error.message : "Intenta de nuevo.",
              );
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
        <Text style={styles.muted}>Cargando sesión...</Text>
      </KeyboardAwareScreen>
    );
  }

  if (!user) {
    return (
      <KeyboardAwareScreen>
        <Text style={styles.eyebrow}>UCAPSA</Text>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.muted}>
          Inicia sesión para ver tu perfil, membresía y credencial digital.
        </Text>

        <Link href="/auth/login" asChild>
          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Iniciar sesión</Text>
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

  if (isAdmin) {
    return (
      <KeyboardAwareScreen>
        <Text style={styles.eyebrow}>Cuenta administrativa</Text>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.muted}>
          Esta cuenta administra UCAPSA. No necesita registrar perro, teléfono
          ni datos de credencial de socio.
        </Text>

        <View style={styles.adminAccountCard}>
          <View style={styles.adminIcon}>
            <Text style={styles.adminIconText}>A</Text>
          </View>
          <View style={styles.adminInfo}>
            <Text style={styles.name}>
              {profile?.email ?? user.email ?? "Administrador"}
            </Text>
            <Text style={styles.role}>Rol: {role ?? "admin"}</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Qué se administra desde la app</Text>
          <Text style={styles.cardText}>
            Anuncios, calendario, socios, solicitudes de membresía y pagos
            manuales. La tabla de socios vive en Mi UCAPSA.
          </Text>
        </View>

        <Pressable onPress={signOut} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Cerrar sesión</Text>
        </Pressable>
      </KeyboardAwareScreen>
    );
  }

  const displayName = fullName || profile?.email || user.email || "Usuario";

  return (
    <KeyboardAwareScreen>
      <Text style={styles.eyebrow}>Cuenta</Text>
      <Text style={styles.title}>Perfil</Text>
      <Text style={styles.muted}>
        {showForm
          ? "Completa los datos que se reflejan en Mi UCAPSA y tu credencial."
          : "Tus datos ya están guardados. Para cambiarlos, toca editar información."}
      </Text>

      <View style={styles.avatarRow}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>
            {displayName.trim().slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.avatarInfo}>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.mutedSmall}>{profile?.email ?? user.email}</Text>
          <Text style={styles.role}>Rol: {role ?? "client"}</Text>
        </View>
      </View>

      {!showForm ? (
        <View style={styles.lockedCard}>
          <Text style={styles.lockedTitle}>Información guardada</Text>
          <Info
            label="Nombre completo"
            value={profile?.full_name || "Sin registrar"}
          />
          <Info label="Teléfono" value={profile?.phone || "Sin registrar"} />
          <Info label="Perro" value={profile?.dog_name || "Sin registrar"} />
          <Info
            label="Color de avatar"
            value={profile?.avatar_color || "#0f766e"}
          />
        </View>
      ) : null}

      {showForm ? (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>
            {profileIsComplete ? "Editar información" : "Completar perfil"}
          </Text>

          <Text style={styles.label}>Nombre completo</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Tu nombre"
            style={styles.input}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Teléfono</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Teléfono de contacto"
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

          <Pressable
            disabled={saving}
            onPress={handleSaveProfile}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {saving ? "Guardando..." : "Guardar información"}
            </Text>
          </Pressable>

          {profileIsComplete ? (
            <Pressable
              disabled={saving}
              onPress={handleCancelEdit}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Cancelar edición</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Pressable
          onPress={() => setEditing(true)}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Editar información</Text>
        </Pressable>
      )}

      <Pressable onPress={handleDeleteRequest} style={styles.dangerGhostButton}>
        <Text style={styles.dangerGhostText}>
          Solicitar eliminación de cuenta
        </Text>
      </Pressable>

      <Pressable onPress={signOut} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Cerrar sesión</Text>
      </Pressable>
    </KeyboardAwareScreen>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  title: { color: "#0f172a", fontSize: 30, fontWeight: "900", marginTop: 6 },
  muted: {
    color: "#64748b",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 20,
  },
  mutedSmall: { color: "#64748b", fontSize: 13, marginTop: 2 },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 18,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#ffffff", fontSize: 28, fontWeight: "900" },
  avatarInfo: { flex: 1, marginLeft: 14 },
  name: { color: "#0f172a", fontSize: 18, fontWeight: "900" },
  role: { color: "#0f766e", fontSize: 13, fontWeight: "800", marginTop: 4 },
  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    marginBottom: 4,
  },
  formTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 4,
  },
  lockedCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    marginBottom: 4,
  },
  lockedTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 10,
  },
  infoCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    marginTop: 10,
  },
  cardTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
  },
  cardText: { color: "#64748b", fontSize: 15, lineHeight: 22 },
  adminAccountCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
  },
  adminIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
  },
  adminIconText: { color: "#ffffff", fontSize: 24, fontWeight: "900" },
  adminInfo: { flex: 1, marginLeft: 14 },
  infoRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  infoLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  infoValue: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 3,
  },
  label: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    color: "#0f172a",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  colorRow: { flexDirection: "row", gap: 10, marginTop: 4, marginBottom: 10 },
  colorDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  colorDotActive: { borderColor: "#0f172a", transform: [{ scale: 1.08 }] },
  primaryButton: {
    backgroundColor: "#0f766e",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  secondaryButton: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  secondaryButtonText: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  dangerGhostButton: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 14,
  },
  dangerGhostText: { color: "#dc2626", fontSize: 14, fontWeight: "800" },
});
