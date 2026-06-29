import { Link, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScreen } from "../../components/ui/KeyboardAwareScreen";
import { useSession } from "../../hooks/useSession";
import { supabase } from "../../lib/supabase";
import { getAdminAnnouncements } from "../../services/announcements.service";
import { getAdminEvents } from "../../services/events.service";
import {
  getAdminMembershipRows,
  isMembershipDateExpired,
} from "../../services/memberships.service";
import {
  requestAccountDeletion,
  updateMyProfile,
} from "../../services/profiles.service";
import type { Profile } from "../../types/app.types";

const avatarColors = [
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#16a34a",
];

type AdminStats = {
  clients: number;
  members: number;
  activeMembers: number;
  pendingMemberships: number;
  pendingPayments: number;
  expiredByDate: number;
  publishedAnnouncements: number;
  upcomingEvents: number;
  admins: number;
  totalProfiles: number;
};

const emptyAdminStats: AdminStats = {
  clients: 0,
  members: 0,
  activeMembers: 0,
  pendingMemberships: 0,
  pendingPayments: 0,
  expiredByDate: 0,
  publishedAnnouncements: 0,
  upcomingEvents: 0,
  admins: 0,
  totalProfiles: 0,
};

function hasCompleteClientProfile(value: {
  full_name?: string | null;
  phone?: string | null;
  dog_name?: string | null;
}) {
  return Boolean(
    value.full_name?.trim() && value.phone?.trim() && value.dog_name?.trim(),
  );
}

function isUpcomingDate(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() >= Date.now();
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
  const [adminEditing, setAdminEditing] = useState(false);
  const [adminStats, setAdminStats] = useState<AdminStats>(emptyAdminStats);
  const [adminStatsLoading, setAdminStatsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const profileIsComplete = useMemo(
    () => hasCompleteClientProfile(profile ?? {}),
    [profile],
  );
  const showClientForm = !profileIsComplete || editing;

  const loadAdminStats = useCallback(async () => {
    if (!isAdmin) return;

    setAdminStatsLoading(true);
    try {
      const [membershipRows, announcements, events, profilesResult] =
        await Promise.all([
          getAdminMembershipRows(),
          getAdminAnnouncements(),
          getAdminEvents(),
          supabase.from("profiles").select("id, role, deletion_requested_at"),
        ]);

      if (profilesResult.error) throw profilesResult.error;

      const profiles = (profilesResult.data ?? []) as Array<
        Pick<Profile, "id" | "role" | "deletion_requested_at">
      >;

      const pendingPayments = membershipRows.filter((row) => {
        if (
          row.membership.status === "cancelled" ||
          row.membership.status === "rejected"
        )
          return false;
        return (
          row.membership.current_payment_status !== "paid" &&
          row.membership.current_payment_status !== "not_required"
        );
      }).length;

      setAdminStats({
        clients: profiles.filter((item) => item.role === "client").length,
        members: profiles.filter((item) => item.role === "member").length,
        admins: profiles.filter(
          (item) => item.role === "admin" || item.role === "super_admin",
        ).length,
        totalProfiles: profiles.length,
        activeMembers: membershipRows.filter(
          (row) => row.membership.status === "active",
        ).length,
        pendingMemberships: membershipRows.filter(
          (row) => row.membership.status === "pending",
        ).length,
        pendingPayments,
        expiredByDate: membershipRows.filter(
          (row) =>
            row.membership.status === "active" &&
            isMembershipDateExpired(row.membership),
        ).length,
        publishedAnnouncements: announcements.filter(
          (item) => item.is_published && !item.archived_at,
        ).length,
        upcomingEvents: events.filter(
          (item) =>
            item.is_published &&
            !item.archived_at &&
            isUpcomingDate(item.start_date),
        ).length,
      });
    } catch (error) {
      Alert.alert(
        "No se pudieron cargar estadísticas",
        error instanceof Error ? error.message : "Intenta de nuevo.",
      );
    } finally {
      setAdminStatsLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
    setDogName(profile?.dog_name ?? "");
    setAvatarColor(profile?.avatar_color ?? "#0f766e");
    setEditing(!hasCompleteClientProfile(profile ?? {}));
    setAdminEditing(false);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void loadAdminStats();
    }, [isAdmin, loadAdminStats]),
  );

  async function handleRefreshAdminStats() {
    setRefreshing(true);
    await loadAdminStats();
    setRefreshing(false);
  }

  async function handleSaveClientProfile() {
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

  async function handleSaveAdminProfile() {
    if (!user) return;

    try {
      setSaving(true);
      await updateMyProfile({
        full_name: fullName,
        phone,
        avatar_color: avatarColor,
      });
      await refreshProfile();
      setAdminEditing(false);
      Alert.alert(
        "Datos actualizados",
        "Tu información administrativa se guardó correctamente.",
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

  function handleCancelClientEdit() {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
    setDogName(profile?.dog_name ?? "");
    setAvatarColor(profile?.avatar_color ?? "#0f766e");
    setEditing(false);
  }

  function handleCancelAdminEdit() {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
    setAvatarColor(profile?.avatar_color ?? "#0f766e");
    setAdminEditing(false);
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
    const adminDisplayName =
      fullName || profile?.email || user.email || "Administrador";

    return (
      <KeyboardAwareScreen
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefreshAdminStats}
          />
        }
      >
        <Text style={styles.eyebrow}>Control general</Text>
        <Text style={styles.title}>Perfil admin</Text>
        <Text style={styles.muted}>
          Vista rápida de la app, accesos administrativos y datos opcionales del
          administrador.
        </Text>

        <View style={styles.avatarRow}>
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarText}>
              {adminDisplayName.trim().slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={styles.avatarInfo}>
            <Text style={styles.name}>{adminDisplayName}</Text>
            <Text style={styles.mutedSmall}>
              {profile?.email ?? user.email}
            </Text>
            <Text style={styles.role}>Rol: {role ?? "admin"}</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Estadísticas generales</Text>
            <Text style={styles.sectionSubtitle}>
              {adminStatsLoading
                ? "Actualizando..."
                : "Resumen operativo de UCAPSA"}
            </Text>
          </View>
        </View>

        <View style={styles.metricsGrid}>
          <Metric
            label="Clientes"
            value={adminStats.clients}
            helper="Rol client"
          />
          <Metric
            label="Socios"
            value={adminStats.members}
            helper="Rol member"
          />
          <Metric
            label="Socios activos"
            value={adminStats.activeMembers}
            helper="Membresía activa"
          />
          <Metric
            label="Solicitudes"
            value={adminStats.pendingMemberships}
            helper="Por aprobar"
          />
          <Metric
            label="Pagos pendientes"
            value={adminStats.pendingPayments}
            helper="Revisión manual"
          />
          <Metric
            label="Vigencias vencidas"
            value={adminStats.expiredByDate}
            helper="No cancela automático"
          />
          <Metric
            label="Anuncios publicados"
            value={adminStats.publishedAnnouncements}
            helper="Visibles"
          />
          <Metric
            label="Eventos próximos"
            value={adminStats.upcomingEvents}
            helper="Publicados"
          />
        </View>

        <View style={styles.quickActionsCard}>
          <Text style={styles.cardTitle}>Accesos rápidos</Text>

          <Link href="/membership" asChild>
            <Pressable style={styles.quickActionButton}>
              <Text style={styles.quickActionTitle}>Mi UCAPSA → Socios</Text>
              <Text style={styles.quickActionText}>
                Estadísticas, tabla y control de membresías.
              </Text>
            </Pressable>
          </Link>

          <Link href="/admin/announcements" asChild>
            <Pressable style={styles.quickActionButton}>
              <Text style={styles.quickActionTitle}>Administrar anuncios</Text>
              <Text style={styles.quickActionText}>
                Crear, editar, publicar o archivar comunicados.
              </Text>
            </Pressable>
          </Link>

          <Link href="/admin/events" asChild>
            <Pressable style={styles.quickActionButton}>
              <Text style={styles.quickActionTitle}>
                Administrar calendario
              </Text>
              <Text style={styles.quickActionText}>
                Eventos, agenda y recurrencias.
              </Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.formCard}>
          <View style={styles.editHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.formTitle}>Datos del administrador</Text>
              <Text style={styles.cardText}>
                Opcional. No se pide nombre de perro para administradores.
              </Text>
            </View>

            {!adminEditing ? (
              <Pressable
                style={styles.inlineButton}
                onPress={() => setAdminEditing(true)}
              >
                <Text style={styles.inlineButtonText}>Editar</Text>
              </Pressable>
            ) : null}
          </View>

          {!adminEditing ? (
            <>
              <Info
                label="Nombre"
                value={profile?.full_name || "Sin registrar"}
              />
              <Info
                label="Teléfono"
                value={profile?.phone || "Sin registrar"}
              />
              <Info
                label="Correo"
                value={profile?.email || user.email || "Sin correo"}
              />
            </>
          ) : (
            <>
              <Text style={styles.label}>Nombre</Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Nombre opcional"
                style={styles.input}
                autoCapitalize="words"
              />

              <Text style={styles.label}>Teléfono</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Teléfono opcional"
                style={styles.input}
                keyboardType="phone-pad"
              />

              <Text style={styles.label}>Color de avatar</Text>
              <AvatarColorPicker
                value={avatarColor}
                onChange={setAvatarColor}
              />

              <Pressable
                disabled={saving}
                onPress={handleSaveAdminProfile}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>
                  {saving ? "Guardando..." : "Guardar datos"}
                </Text>
              </Pressable>

              <Pressable
                disabled={saving}
                onPress={handleCancelAdminEdit}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Cancelar edición</Text>
              </Pressable>
            </>
          )}
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
        {showClientForm
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

      {!showClientForm ? (
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

      {showClientForm ? (
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
          <AvatarColorPicker value={avatarColor} onChange={setAvatarColor} />

          <Pressable
            disabled={saving}
            onPress={handleSaveClientProfile}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {saving ? "Guardando..." : "Guardar información"}
            </Text>
          </Pressable>

          {profileIsComplete ? (
            <Pressable
              disabled={saving}
              onPress={handleCancelClientEdit}
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

function Metric({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper?: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {helper ? <Text style={styles.metricHelper}>{helper}</Text> : null}
    </View>
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

function AvatarColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <View style={styles.colorRow}>
      {avatarColors.map((color) => (
        <Pressable
          key={color}
          onPress={() => onChange(color)}
          style={[
            styles.colorDot,
            { backgroundColor: color },
            value === color && styles.colorDotActive,
          ]}
        />
      ))}
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: { color: "#0f172a", fontSize: 20, fontWeight: "900" },
  sectionSubtitle: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 18,
  },
  metric: {
    width: "48%",
    minHeight: 104,
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
  },
  metricValue: { color: "#0f766e", fontSize: 28, fontWeight: "900" },
  metricLabel: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 4,
  },
  metricHelper: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  quickActionsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    marginBottom: 18,
  },
  quickActionButton: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  quickActionTitle: { color: "#0f172a", fontSize: 16, fontWeight: "900" },
  quickActionText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 3,
  },
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
  cardTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
  },
  cardText: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  editHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  inlineButton: {
    backgroundColor: "#ccfbf1",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  inlineButtonText: { color: "#0f766e", fontSize: 13, fontWeight: "900" },
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
