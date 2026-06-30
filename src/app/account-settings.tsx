import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { NotificationSettingsCard } from "../components/domain/NotificationSettingsCard";
import { KeyboardAwareScreen } from "../components/ui/KeyboardAwareScreen";
import { ucapsaBrand } from "../constants/brand";
import { resolveUcapsaFormat } from "../constants/ucapsaFormats";
import { useSession } from "../hooks/useSession";
import { supabase } from "../lib/supabase";
import { getVisibleAnnouncements } from "../services/announcements.service";
import { getVisibleEvents } from "../services/events.service";
import {
  getAdminMembershipRows,
  isMembershipDateExpired,
} from "../services/memberships.service";
import {
  requestAccountDeletion,
  updateMyProfile,
} from "../services/profiles.service";
import type { Profile } from "../types/app.types";

type SettingsSection = "admin" | "notifications" | "profile" | "delete";

type AdminStats = {
  clients: number;
  members: number;
  activeMemberships: number;
  pendingPayments: number;
  pendingRequests: number;
  expiredMemberships: number;
  announcements: number;
  events: number;
};

const avatarColors = [
  "#C91F37",
  "#8F1324",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#0f766e",
];

const emptyAdminStats: AdminStats = {
  clients: 0,
  members: 0,
  activeMemberships: 0,
  pendingPayments: 0,
  pendingRequests: 0,
  expiredMemberships: 0,
  announcements: 0,
  events: 0,
};

export default function AccountSettingsScreen() {
  const { loading, user, profile, role, isAdmin, signOut, refreshProfile } =
    useSession();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dogName, setDogName] = useState("");
  const [avatarColor, setAvatarColor] = useState(ucapsaBrand.colors.red);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adminStats, setAdminStats] = useState<AdminStats>(emptyAdminStats);
  const [openSection, setOpenSection] = useState<SettingsSection | null>(null);
  const params = useLocalSearchParams<{ section?: string }>();

  const format = useMemo(
    () => resolveUcapsaFormat({ user, role, isAdmin }),
    [user, role, isAdmin],
  );
  const isPremium = Boolean(user) && format.key === "member" && !isAdmin;
  const deletionRequested = Boolean(profile?.deletion_requested_at);
  const profileComplete = Boolean(
    (profile?.full_name ?? "").trim() &&
    (profile?.phone ?? "").trim() &&
    (isAdmin || (profile?.dog_name ?? "").trim()),
  );

  useEffect(() => {
    const section =
      typeof params.section === "string" ? params.section : undefined;
    if (!section) return;

    if (section === "admin" && isAdmin) setOpenSection("admin");
    if (section === "notifications") setOpenSection("notifications");
    if (section === "profile") setOpenSection("profile");
    if (section === "delete" && !isAdmin) setOpenSection("delete");
  }, [isAdmin, params.section]);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setEmail(profile?.email ?? user?.email ?? "");
    setPhone(profile?.phone ?? "");
    setDogName(profile?.dog_name ?? "");
    setAvatarColor(profile?.avatar_color ?? ucapsaBrand.colors.red);
  }, [profile, user?.email]);

  const loadAdminData = useCallback(async () => {
    if (!isAdmin) return;

    const [rows, announcements, events, profilesResult] = await Promise.all([
      getAdminMembershipRows(),
      getVisibleAnnouncements(),
      getVisibleEvents(),
      supabase.from("profiles").select("role"),
    ]);

    const profiles = (profilesResult.data ?? []) as Pick<Profile, "role">[];

    setAdminStats({
      clients: profiles.filter(
        (item) => item.role === "client" || item.role === "member",
      ).length,
      members: profiles.filter((item) => item.role === "member").length,
      activeMemberships: rows.filter(
        (row) => row.membership.status === "active",
      ).length,
      pendingPayments: rows.filter(
        (row) => row.membership.current_payment_status === "pending",
      ).length,
      pendingRequests: rows.filter((row) => row.membership.status === "pending")
        .length,
      expiredMemberships: rows.filter((row) =>
        isMembershipDateExpired(row.membership),
      ).length,
      announcements: announcements.length,
      events: events.length,
    });
  }, [isAdmin]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshProfile(), loadAdminData()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadAdminData, refreshProfile]);

  useFocusEffect(
    useCallback(() => {
      void loadAdminData();
    }, [loadAdminData]),
  );

  async function handleSaveProfile() {
    setSaving(true);
    try {
      await updateMyProfile({
        full_name: fullName,
        email: isAdmin ? email : undefined,
        phone,
        dog_name: isAdmin ? undefined : dogName,
        avatar_color: avatarColor,
      });
      await refreshProfile();
      setEditing(false);
      Alert.alert(
        "Datos guardados",
        "Tu informacion se actualizo correctamente.",
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

  function handleDeleteRequest() {
    if (deletionRequested) return;

    Alert.alert(
      "Solicitar eliminacion de cuenta",
      "Esto no borra la cuenta automaticamente. Administracion recibira la solicitud y debera revisar membresia, pagos y datos relacionados.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Solicitar",
          style: "destructive",
          onPress: async () => {
            try {
              await requestAccountDeletion(
                "Solicitud desde Ajustes de cuenta.",
              );
              await refreshProfile();
              Alert.alert(
                "Solicitud enviada",
                "Administracion revisara la eliminacion de tu cuenta.",
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

  function toggleSection(section: SettingsSection) {
    setOpenSection((current) => (current === section ? null : section));
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/auth/login" as never);
  }

  if (loading) {
    return (
      <KeyboardAwareScreen
        style={{ backgroundColor: ucapsaBrand.colors.background }}
      >
        <Text style={styles.title}>Ajustes</Text>
        <Text style={styles.muted}>Cargando cuenta...</Text>
      </KeyboardAwareScreen>
    );
  }

  if (!user) {
    return (
      <KeyboardAwareScreen
        style={{ backgroundColor: ucapsaBrand.colors.background }}
      >
        <Header
          title="Ajustes"
          subtitle="Inicia sesion para gestionar tus datos y notificaciones."
          onBack={() => router.back()}
          premium={false}
        />
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.replace("/auth/login" as never)}
        >
          <Text style={styles.primaryButtonText}>Iniciar sesion</Text>
        </Pressable>
      </KeyboardAwareScreen>
    );
  }

  return (
    <KeyboardAwareScreen
      style={{ backgroundColor: isPremium ? "#270711" : format.background }}
      contentContainerStyle={isPremium ? styles.premiumContent : undefined}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={format.accent}
        />
      }
    >
      <Header
        title={isAdmin ? "Panel y ajustes" : "Ajustes de cuenta"}
        subtitle={
          isAdmin
            ? "Estadisticas, datos y notificaciones sin saturar Perfil."
            : "Tus datos, notificaciones y solicitud de cuenta."
        }
        onBack={() => router.back()}
        premium={isPremium}
      />

      <View style={[styles.identityCard, isPremium && styles.premiumCard]}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>
            {(fullName || profile?.email || "U")
              .trim()
              .slice(0, 1)
              .toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.identityName, isPremium && styles.premiumTitle]}>
            {fullName || profile?.email || "Usuario UCAPSA"}
          </Text>
          <Text style={[styles.identityEmail, isPremium && styles.premiumText]}>
            {profile?.email ?? user.email}
          </Text>
          <Text style={[styles.identityRole, isPremium && styles.premiumPill]}>
            Rol: {role ?? "client"}
          </Text>
        </View>
      </View>

      {isAdmin ? (
        <AccordionSection
          title="Estadisticas"
          subtitle="Resumen operativo y accesos rapidos."
          icon="bar-chart"
          open={openSection === "admin"}
          premium={isPremium}
          onPress={() => toggleSection("admin")}
        >
          <View style={styles.statsGrid}>
            <AdminStat
              label="Clientes"
              value={adminStats.clients}
              icon="account"
              onPress={() =>
                router.push("/admin/users?filter=clients_and_members" as never)
              }
            />
            <AdminStat
              label="Socios"
              value={adminStats.members}
              icon="badge-account"
              onPress={() =>
                router.push("/admin/users?filter=members" as never)
              }
            />
            <AdminStat
              label="Membresias activas"
              value={adminStats.activeMemberships}
              icon="check-decagram"
              onPress={() =>
                router.push("/admin/members?filter=active" as never)
              }
            />
            <AdminStat
              label="Falta pago"
              value={adminStats.pendingPayments}
              icon="cash-remove"
              onPress={() =>
                router.push(
                  "/admin/members?filter=payment_pending_this_month" as never,
                )
              }
            />
            <AdminStat
              label="Solicitudes"
              value={adminStats.pendingRequests}
              icon="email-outline"
              onPress={() =>
                router.push("/admin/members?filter=pending_requests" as never)
              }
            />
            <AdminStat
              label="Vigencia vencida"
              value={adminStats.expiredMemberships}
              icon="calendar-alert"
              onPress={() =>
                router.push("/admin/members?filter=expired_by_date" as never)
              }
            />
            <AdminStat
              label="Anuncios"
              value={adminStats.announcements}
              icon="bullhorn"
              onPress={() => router.push("/admin/announcements" as never)}
            />
            <AdminStat
              label="Eventos"
              value={adminStats.events}
              icon="calendar-month"
              onPress={() => router.push("/admin/events" as never)}
            />
          </View>
        </AccordionSection>
      ) : null}

      <AccordionSection
        title="Notificaciones"
        subtitle="Avisos, clases, membresia y logros."
        icon="notifications-none"
        open={openSection === "notifications"}
        premium={isPremium}
        onPress={() => toggleSection("notifications")}
      >
        <NotificationSettingsCard premium={isPremium} />

        {isAdmin ? (
          <Pressable
            onPress={() => router.push("/admin/notifications" as never)}
            style={{
              marginTop: 14,
              padding: 18,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: isPremium
                ? "rgba(180, 139, 44, 0.45)"
                : "rgba(190, 24, 93, 0.16)",
              backgroundColor: isPremium
                ? "rgba(180, 139, 44, 0.12)"
                : "#fff7fb",
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
            }}
          >
            <MaterialIcons
              name="send"
              size={24}
              color={isPremium ? "#f5d58b" : "#be185d"}
            />

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "900",
                  color: isPremium ? "#fff7dc" : "#241018",
                }}
              >
                Enviar notificación manual
              </Text>

              <Text
                style={{
                  marginTop: 4,
                  fontSize: 13,
                  fontWeight: "700",
                  color: isPremium ? "#e8cfa2" : "#7b5262",
                }}
              >
                Crear aviso para socios, clientes o admins.
              </Text>
            </View>

            <MaterialIcons
              name="chevron-right"
              size={24}
              color={isPremium ? "#f5d58b" : "#be185d"}
            />
          </Pressable>
        ) : null}
      </AccordionSection>

      <AccordionSection
        title={isAdmin ? "Mis datos administrativos" : "Mis datos"}
        subtitle={
          profileComplete
            ? "Nombre, contacto y avatar."
            : "Completa tu informacion de contacto."
        }
        icon="person"
        open={openSection === "profile"}
        premium={isPremium}
        onPress={() => toggleSection("profile")}
        badge={!profileComplete ? "Pendiente" : undefined}
      >
        <View style={styles.sectionHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, isPremium && styles.premiumEyebrow]}>
              Cuenta
            </Text>
            <Text
              style={[styles.sectionTitle, isPremium && styles.premiumTitle]}
            >
              {isAdmin ? "Mis datos administrativos" : "Mis datos"}
            </Text>
          </View>
          <Pressable
            style={[styles.smallButton, isPremium && styles.premiumSmallButton]}
            onPress={() => setEditing(true)}
          >
            <Text
              style={[
                styles.smallButtonText,
                isPremium && styles.premiumSmallButtonText,
              ]}
            >
              {profileComplete ? "Editar" : "Completar"}
            </Text>
          </Pressable>
        </View>

        {!profileComplete ? (
          <Text style={[styles.warningText, isPremium && styles.premiumText]}>
            Completa estos datos para que UCAPSA tenga informacion correcta de
            contacto.
          </Text>
        ) : null}

        <ReadonlyRow
          label="Nombre"
          value={profile?.full_name || "Pendiente"}
          premium={isPremium}
        />
        <ReadonlyRow
          label="Correo"
          value={profile?.email || user.email || "Pendiente"}
          premium={isPremium}
        />
        <ReadonlyRow
          label="Telefono"
          value={profile?.phone || "Pendiente"}
          premium={isPremium}
        />
        {!isAdmin ? (
          <ReadonlyRow
            label="Perro"
            value={profile?.dog_name || "Pendiente"}
            premium={isPremium}
          />
        ) : null}
      </AccordionSection>

      {!isAdmin ? (
        <AccordionSection
          title="Eliminar cuenta"
          subtitle={
            deletionRequested
              ? "Solicitud registrada."
              : "Crear solicitud para administracion."
          }
          icon="delete-outline"
          open={openSection === "delete"}
          premium={isPremium}
          onPress={() => toggleSection("delete")}
          danger
        >
          <Text style={[styles.muted, isPremium && styles.premiumText]}>
            {deletionRequested
              ? "Tu solicitud ya fue registrada. Administracion debe revisarla antes de cualquier baja definitiva."
              : "Puedes solicitar la eliminacion de tu cuenta. No se borra automaticamente para evitar errores con membresia, pagos o registros."}
          </Text>
          <Pressable
            disabled={deletionRequested}
            style={[
              styles.dangerButton,
              isPremium && styles.premiumDangerButton,
              deletionRequested && styles.disabled,
            ]}
            onPress={handleDeleteRequest}
          >
            <Text
              style={[
                styles.dangerButtonText,
                isPremium && styles.premiumDangerButtonText,
              ]}
            >
              {deletionRequested
                ? "Eliminacion solicitada"
                : "Solicitar eliminacion de cuenta"}
            </Text>
          </Pressable>
        </AccordionSection>
      ) : null}

      <Pressable
        style={[
          styles.secondaryButton,
          isPremium && styles.premiumSecondaryButton,
        ]}
        onPress={handleSignOut}
      >
        <Text
          style={[
            styles.secondaryButtonText,
            isPremium && styles.premiumSecondaryButtonText,
          ]}
        >
          Cerrar sesion
        </Text>
      </Pressable>

      <Modal
        visible={editing}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isPremium && styles.premiumCard]}>
            <View style={styles.modalHeader}>
              <Text
                style={[styles.modalTitle, isPremium && styles.premiumTitle]}
              >
                {isAdmin ? "Editar datos administrativos" : "Editar mis datos"}
              </Text>
              <Pressable onPress={() => setEditing(false)}>
                <MaterialIcons
                  name="close"
                  size={24}
                  color={isPremium ? "#FFE8B5" : ucapsaBrand.colors.text}
                />
              </Pressable>
            </View>

            <Text style={[styles.label, isPremium && styles.premiumLabel]}>
              Nombre completo
            </Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Nombre"
              style={[styles.input, isPremium && styles.premiumInput]}
            />

            {isAdmin ? (
              <>
                <Text style={[styles.label, isPremium && styles.premiumLabel]}>
                  Correo de contacto
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Correo"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[styles.input, isPremium && styles.premiumInput]}
                />
              </>
            ) : (
              <ReadonlyRow
                label="Correo"
                value={email || "Sin correo"}
                premium={isPremium}
              />
            )}

            <Text style={[styles.label, isPremium && styles.premiumLabel]}>
              Telefono
            </Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Telefono"
              keyboardType="phone-pad"
              style={[styles.input, isPremium && styles.premiumInput]}
            />

            {!isAdmin ? (
              <>
                <Text style={[styles.label, isPremium && styles.premiumLabel]}>
                  Nombre de tu perro
                </Text>
                <TextInput
                  value={dogName}
                  onChangeText={setDogName}
                  placeholder="Ej. Max, Luna, Toby"
                  style={[styles.input, isPremium && styles.premiumInput]}
                  autoCapitalize="words"
                />
              </>
            ) : null}

            <Text style={[styles.label, isPremium && styles.premiumLabel]}>
              Color de avatar
            </Text>
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
              style={[
                styles.primaryButton,
                isPremium && styles.premiumPrimaryButton,
                saving && styles.disabled,
              ]}
              onPress={handleSaveProfile}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  isPremium && styles.premiumPrimaryButtonText,
                ]}
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAwareScreen>
  );
}

function Header({
  title,
  subtitle,
  onBack,
  premium,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  premium: boolean;
}) {
  return (
    <View style={styles.headerRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver"
        style={[styles.backButton, premium && styles.premiumSmallButton]}
        onPress={onBack}
      >
        <MaterialIcons
          name="arrow-back"
          size={22}
          color={premium ? "#FFE8B5" : ucapsaBrand.colors.redDark}
        />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, premium && styles.premiumTitle]}>
          {title}
        </Text>
        <Text style={[styles.muted, premium && styles.premiumText]}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function AccordionSection({
  title,
  subtitle,
  icon,
  open,
  premium,
  onPress,
  children,
  badge,
  danger = false,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  open: boolean;
  premium: boolean;
  onPress: () => void;
  children: ReactNode;
  badge?: string;
  danger?: boolean;
}) {
  return (
    <View
      style={[
        styles.accordionCard,
        premium && styles.premiumCard,
        danger && styles.dangerAccordionCard,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${open ? "Cerrar" : "Abrir"} ${title}`}
        style={styles.accordionHeader}
        onPress={onPress}
      >
        <View
          style={[
            styles.accordionIcon,
            premium && styles.premiumSmallButton,
            danger && styles.dangerIcon,
          ]}
        >
          <MaterialIcons
            name={icon}
            size={21}
            color={
              premium
                ? "#FFE8B5"
                : danger
                  ? "#C43B4E"
                  : ucapsaBrand.colors.redDark
            }
          />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.accordionTitleRow}>
            <Text
              style={[
                styles.accordionTitle,
                premium && styles.premiumTitle,
                danger && styles.dangerAccordionTitle,
              ]}
            >
              {title}
            </Text>
            {badge ? (
              <Text
                style={[styles.pendingBadge, premium && styles.premiumPill]}
              >
                {badge}
              </Text>
            ) : null}
          </View>
          <Text
            style={[styles.accordionSubtitle, premium && styles.premiumText]}
          >
            {subtitle}
          </Text>
        </View>
        <MaterialIcons
          name={open ? "expand-less" : "expand-more"}
          size={24}
          color={premium ? "#FFE8B5" : ucapsaBrand.colors.muted}
        />
      </Pressable>
      {open ? <View style={styles.accordionBody}>{children}</View> : null}
    </View>
  );
}

function AdminStat({
  label,
  value,
  icon,
  onPress,
}: {
  label: string;
  value: number;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.statCard} onPress={onPress}>
      <View style={styles.statIconWrap}>
        <MaterialCommunityIcons
          name={icon}
          size={18}
          color={ucapsaBrand.colors.red}
        />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

function ReadonlyRow({
  label,
  value,
  premium = false,
}: {
  label: string;
  value: string;
  premium?: boolean;
}) {
  return (
    <View style={styles.readonlyRow}>
      <Text
        style={[styles.readonlyLabel, premium && styles.premiumReadonlyLabel]}
      >
        {label}
      </Text>
      <Text
        style={[styles.readonlyValue, premium && styles.premiumReadonlyValue]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: "#270711" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: ucapsaBrand.colors.redSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: "900" },
  muted: {
    color: ucapsaBrand.colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  identityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#fff",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    padding: 16,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 28, fontWeight: "900" },
  identityName: {
    color: ucapsaBrand.colors.text,
    fontSize: 19,
    fontWeight: "900",
  },
  identityEmail: {
    color: ucapsaBrand.colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  identityRole: {
    alignSelf: "flex-start",
    overflow: "hidden",
    backgroundColor: ucapsaBrand.colors.redSoft,
    color: ucapsaBrand.colors.redDark,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 8,
  },
  accordionCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    overflow: "hidden",
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  accordionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: ucapsaBrand.colors.redSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  accordionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  accordionTitle: {
    color: ucapsaBrand.colors.text,
    fontSize: 17,
    fontWeight: "900",
  },
  accordionSubtitle: {
    color: ucapsaBrand.colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 2,
  },
  accordionBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  pendingBadge: {
    overflow: "hidden",
    backgroundColor: "#FFF7ED",
    color: "#9A3412",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "900",
  },
  dangerAccordionCard: { borderColor: "#F4B8C1" },
  dangerAccordionTitle: { color: "#C43B4E" },
  dangerIcon: { backgroundColor: "#FFF1F3" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    padding: 16,
    gap: 10,
  },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  eyebrow: {
    color: ucapsaBrand.colors.red,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  sectionTitle: {
    color: ucapsaBrand.colors.text,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 2,
  },
  warningText: {
    color: ucapsaBrand.colors.warning,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 4,
  },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  statCard: {
    width: "48%",
    backgroundColor: ucapsaBrand.colors.surfaceAlt,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    padding: 12,
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    color: ucapsaBrand.colors.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 10,
  },
  statLabel: {
    color: ucapsaBrand.colors.muted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  smallButton: {
    borderRadius: 999,
    backgroundColor: ucapsaBrand.colors.redSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  smallButtonText: {
    color: ucapsaBrand.colors.redDark,
    fontSize: 13,
    fontWeight: "900",
  },
  readonlyRow: {
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F5E5E8",
  },
  readonlyLabel: {
    color: ucapsaBrand.colors.muted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  readonlyValue: {
    color: ucapsaBrand.colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: ucapsaBrand.colors.red,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  secondaryButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  secondaryButtonText: {
    color: ucapsaBrand.colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  dangerButton: {
    backgroundColor: "#FFF1F3",
    borderWidth: 1,
    borderColor: "#F4B8C1",
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  dangerButtonText: { color: "#C43B4E", fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(37, 21, 26, 0.35)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: ucapsaBrand.colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  modalTitle: {
    color: ucapsaBrand.colors.text,
    fontSize: 21,
    fontWeight: "900",
  },
  label: {
    color: ucapsaBrand.colors.text,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    borderRadius: 16,
    color: ucapsaBrand.colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  colorRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  colorDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: "#fff",
  },
  colorDotActive: {
    borderColor: ucapsaBrand.colors.text,
    transform: [{ scale: 1.08 }],
  },
  premiumCard: {
    backgroundColor: "#38111B",
    borderColor: "rgba(250,204,21,0.34)",
  },
  premiumTitle: { color: "#FFE8B5" },
  premiumText: { color: "#FFE3E8" },
  premiumEyebrow: { color: "#FFE8B5" },
  premiumPill: { backgroundColor: "#FFE8B5", color: "#7A1020" },
  premiumSmallButton: {
    backgroundColor: "rgba(250,204,21,0.16)",
    borderWidth: 1,
    borderColor: "rgba(250,204,21,0.34)",
  },
  premiumSmallButtonText: { color: "#FFE8B5" },
  premiumReadonlyLabel: { color: "#FFE8B5" },
  premiumReadonlyValue: { color: "#FFFFFF" },
  premiumLabel: { color: "#FFE8B5" },
  premiumInput: {
    backgroundColor: "#270711",
    borderColor: "rgba(250,204,21,0.30)",
    color: "#FFFFFF",
  },
  premiumPrimaryButton: { backgroundColor: "#FACC15" },
  premiumPrimaryButtonText: { color: "#4A0710" },
  premiumSecondaryButton: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(250,204,21,0.34)",
  },
  premiumSecondaryButtonText: { color: "#FFE8B5" },
  premiumDangerButton: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(250,204,21,0.34)",
  },
  premiumDangerButtonText: { color: "#FFE8B5" },
});
