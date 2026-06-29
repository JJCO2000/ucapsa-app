import { Link, router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { AdminMetricCard } from "../../components/domain/AdminMetricCard";
import { KeyboardAwareScreen } from "../../components/ui/KeyboardAwareScreen";
import { useSession } from "../../hooks/useSession";
import {
  formatDate,
  getAdminMembershipRows,
  getDisplayName,
  getMembershipStatusLabel,
  getMyMembership,
  getPaymentStatusLabel,
  isMembershipDateExpired,
  requestMembership,
  type MembershipAdminRow,
} from "../../services/memberships.service";
import type {
  Membership,
  MembershipStatus
} from "../../types/app.types";

type AdminPerspective = "stats" | "table";

type AdminMembershipFilter =
  | "all"
  | "active"
  | "inactive"
  | "pending_requests"
  | "paid_this_month"
  | "payment_pending_this_month"
  | "expired_by_date";

const adminFilterOptions: Array<{
  value: AdminMembershipFilter;
  label: string;
}> = [
  { value: "all", label: "Todos los registros" },
  { value: "active", label: "Socios activos" },
  { value: "inactive", label: "Socios inactivos" },
  { value: "pending_requests", label: "Solicitudes pendientes" },
  { value: "paid_this_month", label: "Pagados este mes" },
  { value: "payment_pending_this_month", label: "Pendientes de pago este mes" },
  { value: "expired_by_date", label: "Vigencia vencida" },
];

function isThisMonth(value: string | null | undefined) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  return (
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
}

function isInactiveStatus(status: MembershipStatus) {
  return (
    status === "cancelled" || status === "expired" || status === "rejected"
  );
}

function hasPaidThisMonth(row: MembershipAdminRow) {
  if (
    row.membership.current_payment_status === "paid" &&
    isThisMonth(row.membership.last_payment_at)
  ) {
    return true;
  }

  return row.payments.some(
    (payment) => payment.status === "paid" && isThisMonth(payment.paid_at),
  );
}

function shouldPayThisMonth(row: MembershipAdminRow) {
  if (row.membership.status !== "active") return false;
  if (row.membership.current_payment_status === "not_required") return false;
  return true;
}

function hasPaymentPendingThisMonth(row: MembershipAdminRow) {
  return shouldPayThisMonth(row) && !hasPaidThisMonth(row);
}

function getLastPaymentDate(row: MembershipAdminRow) {
  return (
    row.membership.last_payment_at ??
    row.payments.find((payment) => payment.status === "paid")?.paid_at ??
    null
  );
}

function getFilterLabel(value: AdminMembershipFilter) {
  return (
    adminFilterOptions.find((item) => item.value === value)?.label ??
    "Todos los registros"
  );
}

export default function MembershipScreen() {
  const { user, profile, isAdmin } = useSession();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [adminRows, setAdminRows] = useState<MembershipAdminRow[]>([]);
  const [perspective, setPerspective] = useState<AdminPerspective>("stats");
  const [filter, setFilter] = useState<AdminMembershipFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadClientMembership = useCallback(async () => {
    if (!user || isAdmin) return;

    setLoading(true);
    try {
      const data = await getMyMembership();
      setMembership(data);
    } catch (error) {
      Alert.alert(
        "No se pudo cargar",
        error instanceof Error ? error.message : "Intenta de nuevo.",
      );
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  const loadAdminMembershipPanel = useCallback(async () => {
    if (!user || !isAdmin) return;

    setLoading(true);
    try {
      const rows = await getAdminMembershipRows();
      setAdminRows(rows);
    } catch (error) {
      Alert.alert(
        "No se pudo cargar socios",
        error instanceof Error ? error.message : "Intenta de nuevo.",
      );
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) {
        void loadAdminMembershipPanel();
        return;
      }

      void loadClientMembership();
    }, [isAdmin, loadAdminMembershipPanel, loadClientMembership]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    if (isAdmin) {
      await loadAdminMembershipPanel();
    } else {
      await loadClientMembership();
    }
    setRefreshing(false);
  }

  async function handleRequestMembership() {
    try {
      const data = await requestMembership();
      setMembership(data);
      Alert.alert(
        "Solicitud enviada",
        "Administración revisará tu solicitud de membresía.",
      );
    } catch (error) {
      Alert.alert(
        "No se pudo solicitar",
        error instanceof Error ? error.message : "Intenta de nuevo.",
      );
    }
  }

  const currentMonthLabel = useMemo(
    () =>
      new Date().toLocaleDateString("es-MX", {
        month: "long",
        year: "numeric",
      }),
    [],
  );

  const adminMembershipStats = useMemo(() => {
    const active = adminRows.filter(
      (row) => row.membership.status === "active",
    ).length;
    const inactive = adminRows.filter((row) =>
      isInactiveStatus(row.membership.status),
    ).length;
    const pendingRequests = adminRows.filter(
      (row) => row.membership.status === "pending",
    ).length;
    const paidThisMonth = adminRows.filter(hasPaidThisMonth).length;
    const pendingPaymentThisMonth = adminRows.filter(
      hasPaymentPendingThisMonth,
    ).length;
    const expiredByDate = adminRows.filter(
      (row) =>
        row.membership.status === "active" &&
        isMembershipDateExpired(row.membership),
    ).length;

    return {
      active,
      inactive,
      pendingRequests,
      paidThisMonth,
      pendingPaymentThisMonth,
      expiredByDate,
      total: adminRows.length,
    };
  }, [adminRows]);

  const filteredAdminRows = useMemo(() => {
    if (filter === "all") return adminRows;

    return adminRows.filter((row) => {
      if (filter === "active") return row.membership.status === "active";
      if (filter === "inactive") return isInactiveStatus(row.membership.status);
      if (filter === "pending_requests")
        return row.membership.status === "pending";
      if (filter === "paid_this_month") return hasPaidThisMonth(row);
      if (filter === "payment_pending_this_month")
        return hasPaymentPendingThisMonth(row);
      if (filter === "expired_by_date") {
        return (
          row.membership.status === "active" &&
          isMembershipDateExpired(row.membership)
        );
      }

      return true;
    });
  }, [adminRows, filter]);

  if (!user) {
    return (
      <KeyboardAwareScreen>
        <Text style={styles.eyebrow}>Mi UCAPSA</Text>
        <Text style={styles.title}>Credencial y membresía</Text>
        <Text style={styles.muted}>
          Inicia sesión para solicitar membresía o ver tu credencial digital.
        </Text>
        <Link href="/auth/login" asChild>
          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Iniciar sesión</Text>
          </Pressable>
        </Link>
      </KeyboardAwareScreen>
    );
  }

  if (isAdmin) {
    return (
      <KeyboardAwareScreen
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.adminHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Mi UCAPSA Admin</Text>
            <Text style={styles.title}>Socios</Text>
          </View>

          <Pressable
            style={styles.topRightButton}
            onPress={() => {
              setPerspective((current) =>
                current === "stats" ? "table" : "stats",
              );
              setFilterOpen(false);
            }}
          >
            <Text style={styles.topRightButtonText}>
              {perspective === "stats" ? "Ver tabla" : "Ver estadísticas"}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.muted}>
          Estadísticas de socios, pagos del mes y tabla filtrable de membresías.
        </Text>

        {loading ? <Text style={styles.muted}>Cargando socios...</Text> : null}

        {perspective === "stats" ? (
          <>
            <View style={styles.monthCard}>
              <Text style={styles.monthTitle}>
                Resumen de {currentMonthLabel}
              </Text>
              <Text style={styles.monthText}>
                Pagos, pendientes y vigencias se revisan manualmente; la app no
                cancela membresías automáticamente.
              </Text>
            </View>

            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <AdminMetricCard
                  label="Socios activos"
                  value={adminMembershipStats.active}
                  helper="Membresía activa"
                />
              </View>
              <View style={styles.metricItem}>
                <AdminMetricCard
                  label="Inactivos"
                  value={adminMembershipStats.inactive}
                  helper="Cancelados, vencidos o rechazados"
                />
              </View>
              <View style={styles.metricItem}>
                <AdminMetricCard
                  label="Solicitudes"
                  value={adminMembershipStats.pendingRequests}
                  helper="Pendientes de revisar"
                />
              </View>
              <View style={styles.metricItem}>
                <AdminMetricCard
                  label="Pagados este mes"
                  value={adminMembershipStats.paidThisMonth}
                  helper={currentMonthLabel}
                />
              </View>
              <View style={styles.metricItem}>
                <AdminMetricCard
                  label="Falta pago"
                  value={adminMembershipStats.pendingPaymentThisMonth}
                  helper="Activos sin pago del mes"
                />
              </View>
              <View style={styles.metricItem}>
                <AdminMetricCard
                  label="Vigencia vencida"
                  value={adminMembershipStats.expiredByDate}
                  helper="Revisar manualmente"
                />
              </View>
            </View>

            <Pressable
              style={styles.primaryButton}
              onPress={() => setPerspective("table")}
            >
              <Text style={styles.primaryButtonText}>Ver tabla de socios</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.filterCard}>
              <View style={styles.filterHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Tabla de socios</Text>
                  <Text style={styles.sectionSubtitle}>
                    {filteredAdminRows.length} de {adminRows.length} registros
                  </Text>
                </View>

                <Pressable
                  style={styles.smallGhostButton}
                  onPress={() => router.push("/admin/members" as never)}
                >
                  <Text style={styles.smallGhostButtonText}>Gestionar</Text>
                </Pressable>
              </View>

              <Pressable
                style={styles.dropdownButton}
                onPress={() => setFilterOpen((current) => !current)}
              >
                <Text style={styles.dropdownLabel}>
                  Ver: {getFilterLabel(filter)}
                </Text>
                <Text style={styles.dropdownArrow}>
                  {filterOpen ? "▲" : "▼"}
                </Text>
              </Pressable>

              {filterOpen ? (
                <View style={styles.dropdownMenu}>
                  {adminFilterOptions.map((option) => (
                    <Pressable
                      key={option.value}
                      style={[
                        styles.dropdownItem,
                        filter === option.value && styles.dropdownItemActive,
                      ]}
                      onPress={() => {
                        setFilter(option.value);
                        setFilterOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          filter === option.value &&
                            styles.dropdownItemTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            {filteredAdminRows.length === 0 && !loading ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>Sin resultados</Text>
                <Text style={styles.mutedNoMargin}>
                  Cambia el filtro para ver otros registros.
                </Text>
              </View>
            ) : null}

            {filteredAdminRows.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tableScroll}
              >
                <View>
                  <View style={styles.tableHeader}>
                    <Cell text="Nombre" width={170} header />
                    <Cell text="Correo" width={210} header />
                    <Cell text="Socio" width={120} header />
                    <Cell text="Estado" width={120} header />
                    <Cell text="Pago" width={140} header />
                    <Cell text="Último pago" width={130} header />
                    <Cell text="Vigencia" width={130} header />
                  </View>

                  {filteredAdminRows.map((row) => (
                    <Pressable
                      key={row.membership.id}
                      style={styles.tableRow}
                      onPress={() => router.push("/admin/members" as never)}
                    >
                      <Cell text={getDisplayName(row.profile)} width={170} />
                      <Cell
                        text={row.profile?.email ?? "Sin correo"}
                        width={210}
                      />
                      <Cell
                        text={row.membership.member_number ?? "Pendiente"}
                        width={120}
                      />
                      <Cell
                        text={getMembershipStatusLabel(row.membership.status)}
                        width={120}
                      />
                      <Cell
                        text={getPaymentStatusLabel(
                          row.membership.current_payment_status,
                        )}
                        width={140}
                      />
                      <Cell
                        text={formatDate(getLastPaymentDate(row))}
                        width={130}
                      />
                      <Cell
                        text={formatDate(row.membership.end_date)}
                        width={130}
                      />
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            ) : null}
          </>
        )}
      </KeyboardAwareScreen>
    );
  }

  const expiredByDate = isMembershipDateExpired(membership);
  const displayName =
    profile?.full_name || profile?.email || user.email || "Usuario";

  return (
    <KeyboardAwareScreen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <Text style={styles.eyebrow}>Mi UCAPSA</Text>
      <Text style={styles.title}>Credencial digital</Text>
      <Text style={styles.muted}>
        Consulta tu estado de socio, pago y QR. Los cambios de membresía siempre
        los confirma administración.
      </Text>

      {loading ? <Text style={styles.muted}>Cargando membresía...</Text> : null}

      {!membership ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Aún no tienes membresía</Text>
          <Text style={styles.cardText}>
            Solicita tu membresía para que administración revise y active tu
            credencial.
          </Text>
          <Pressable
            onPress={handleRequestMembership}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Solicitar membresía</Text>
          </Pressable>
        </View>
      ) : null}

      {membership?.status === "pending" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Solicitud pendiente</Text>
          <Text style={styles.cardText}>
            Tu solicitud ya fue enviada. Administración la revisará y activará
            tu número de socio si corresponde.
          </Text>
        </View>
      ) : null}

      {membership ? (
        <View style={styles.credential}>
          <View style={styles.credentialHeader}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: profile?.avatar_color ?? "#0f766e" },
              ]}
            >
              <Text style={styles.avatarText}>
                {displayName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.credentialLabel}>Socio UCAPSA</Text>
              <Text style={styles.credentialName}>{displayName}</Text>
              <Text style={styles.credentialDog}>
                Perro: {profile?.dog_name || "Sin registrar"}
              </Text>
            </View>
          </View>

          <View style={styles.infoGrid}>
            <Info
              label="Número"
              value={membership.member_number || "Pendiente"}
            />
            <Info
              label="Estado"
              value={getMembershipStatusLabel(membership.status)}
            />
            <Info label="Inicio" value={formatDate(membership.start_date)} />
            <Info label="Vigencia" value={formatDate(membership.end_date)} />
            <Info
              label="Pago"
              value={getPaymentStatusLabel(membership.current_payment_status)}
            />
            <Info
              label="Último pago"
              value={formatDate(membership.last_payment_at)}
            />
          </View>

          {expiredByDate && membership.status === "active" ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                La fecha de vigencia ya pasó. Esto no cancela automáticamente tu
                membresía; administración debe confirmar el estado.
              </Text>
            </View>
          ) : null}

          {membership.current_payment_status !== "paid" ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                Pago marcado como{" "}
                {getPaymentStatusLabel(membership.current_payment_status)}. Si
                ya pagaste, espera a que administración lo registre.
              </Text>
            </View>
          ) : null}

          <View style={styles.qrBox}>
            <QRCode value={`ucapsa-member:${membership.qr_token}`} size={180} />
            <Text style={styles.qrText}>QR de verificación</Text>
            <Text style={styles.qrSubtext}>
              Este QR lo usa administración para verificar tu membresía. No
              contiene tus datos personales, solo un token interno.
            </Text>
          </View>
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Cell({
  text,
  width,
  header,
}: {
  text: string;
  width: number;
  header?: boolean;
}) {
  return (
    <View style={[styles.cell, { width }, header && styles.headerCell]}>
      <Text
        numberOfLines={2}
        style={header ? styles.headerCellText : styles.cellText}
      >
        {text}
      </Text>
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
    marginBottom: 18,
  },
  mutedNoMargin: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  adminHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  topRightButton: {
    marginTop: 4,
    backgroundColor: "#0f766e",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  topRightButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  monthCard: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#99f6e4",
    borderRadius: 20,
    padding: 15,
    marginBottom: 14,
  },
  monthTitle: { color: "#0f766e", fontSize: 16, fontWeight: "900" },
  monthText: {
    color: "#134e4a",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 4,
  },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricItem: { width: "48%" },
  filterCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    marginBottom: 14,
  },
  filterHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  sectionTitle: { color: "#0f172a", fontSize: 20, fontWeight: "900" },
  sectionSubtitle: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  smallGhostButton: {
    backgroundColor: "#ccfbf1",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  smallGhostButtonText: { color: "#0f766e", fontSize: 13, fontWeight: "900" },
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: "#f8fafc",
  },
  dropdownLabel: { color: "#0f172a", fontSize: 14, fontWeight: "900" },
  dropdownArrow: { color: "#0f766e", fontSize: 13, fontWeight: "900" },
  dropdownMenu: {
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginTop: 10,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  dropdownItemActive: { backgroundColor: "#ccfbf1" },
  dropdownItemText: { color: "#334155", fontSize: 14, fontWeight: "800" },
  dropdownItemTextActive: { color: "#0f766e", fontWeight: "900" },
  tableScroll: { marginBottom: 16 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  tableRow: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  cell: {
    minHeight: 58,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
  },
  headerCell: { minHeight: 46, borderRightColor: "#1e293b" },
  cellText: { color: "#0f172a", fontSize: 13, fontWeight: "700" },
  headerCellText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  emptyBox: {
    gap: 4,
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  emptyTitle: { color: "#0f172a", fontSize: 16, fontWeight: "900" },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 18,
    marginBottom: 16,
  },
  cardTitle: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 8,
  },
  cardText: { color: "#64748b", fontSize: 15, lineHeight: 22 },
  primaryButton: {
    backgroundColor: "#0f766e",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  primaryButtonText: { color: "#ffffff", fontWeight: "900", fontSize: 15 },
  credential: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  credentialHeader: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    marginBottom: 18,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#ffffff", fontSize: 30, fontWeight: "900" },
  credentialLabel: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  credentialName: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 2,
  },
  credentialDog: {
    color: "#64748b",
    fontSize: 14,
    marginTop: 4,
    fontWeight: "700",
  },
  infoGrid: { gap: 10 },
  infoItem: { backgroundColor: "#f8fafc", borderRadius: 16, padding: 12 },
  infoLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  infoValue: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 4,
  },
  warningBox: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginTop: 14,
  },
  warningText: {
    color: "#9a3412",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  qrBox: {
    alignItems: "center",
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  qrText: { color: "#0f172a", fontSize: 15, fontWeight: "900", marginTop: 12 },
  qrSubtext: {
    color: "#64748b",
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },
});
