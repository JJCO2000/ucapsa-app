import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { AnnouncementCard } from '../../components/domain/AnnouncementCard';
import { EventCard } from '../../components/domain/EventCard';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { UcapsaDetailModal } from '../../components/ui/UcapsaDetailModal';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getVisibleAnnouncements } from '../../services/announcements.service';
import { getVisibleEvents } from '../../services/events.service';
import { getMyMembership } from '../../services/memberships.service';
import { getMyPaymentOverview } from '../../services/payments.service';
import { getMyProgramEnrollments, getNextProgramScheduleDate, getProgramCodeLabel } from '../../services/programs.service';
import type { Announcement, EventOccurrence, Membership, MyPaymentOverview, ProgramEnrollmentWithDetails } from '../../types/app.types';
import { getUpcomingOccurrences } from '../../utils/events.utils';

const mark = require('../../../assets/images/brand/ucapsa-mark.png');
const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const emptyPayments: MyPaymentOverview = { obligations: [], payments: [], outstanding_total: 0, attention_total: 0, future_total: 0, overdue_count: 0, legacy_membership_pending: false };

function money(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value);
}

function nextClassText(item: ProgramEnrollmentWithDetails | null) {
  if (!item) return 'Sin clase proxima';
  const date = getNextProgramScheduleDate(item.schedule);
  if (!date) return 'Fecha por confirmar';
  const time = String(item.schedule.start_time ?? '').slice(0, 5);
  return `${dayNames[date.getDay()]} ${String(date.getDate()).padStart(2, '0')} ${monthNames[date.getMonth()]}${time ? `, ${time}` : ''}`;
}

export default function HomeScreen() {
  const { user, profile, role, isAdmin } = useSession();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<EventOccurrence[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [programs, setPrograms] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [payments, setPayments] = useState<MyPaymentOverview>(emptyPayments);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventOccurrence | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (isAdmin) return;
    const [announcementRows, eventRows] = await Promise.all([getVisibleAnnouncements(3), getVisibleEvents()]);
    setAnnouncements(announcementRows.slice(0, 2));
    setEvents(getUpcomingOccurrences(eventRows, 2));

    if (!user) {
      setMembership(null);
      setPrograms([]);
      setPayments(emptyPayments);
      setLoading(false);
      return;
    }

    const [membershipResult, programsResult, paymentsResult] = await Promise.allSettled([
      getMyMembership(),
      getMyProgramEnrollments(),
      getMyPaymentOverview(),
    ]);
    setMembership(membershipResult.status === 'fulfilled' ? membershipResult.value : null);
    setPrograms(programsResult.status === 'fulfilled' ? programsResult.value : []);
    setPayments(paymentsResult.status === 'fulfilled' ? paymentsResult.value : emptyPayments);
    setLoading(false);
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load().catch(() => setLoading(false)); return undefined; }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  const activePrograms = useMemo(() => programs.filter((item) => item.enrollment.status === 'active'), [programs]);
  const nextProgram = activePrograms[0] ?? null;
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin, membershipStatus: membership?.status ?? null, hasActivePrograms: activePrograms.length > 0 }), [activePrograms.length, isAdmin, membership?.status, role, user]);
  const displayName = profile?.full_name || profile?.email || user?.email || 'Visitante';
  const profileComplete = Boolean((profile?.full_name ?? '').trim() && (profile?.phone ?? '').trim() && (profile?.dog_name ?? '').trim());
  const hasPaymentAttention = payments.attention_total > 0.005 || payments.legacy_membership_pending;

  if (isAdmin) return <Redirect href="/admin-home" />;

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <View style={[styles.hero, { backgroundColor: format.surface, borderColor: format.border }]}>
        <View style={styles.heroTop}>
          <Image source={mark} style={styles.mark} resizeMode="contain" />
          <Pressable
            style={[styles.accountButton, { backgroundColor: format.accentSoft }]}
            onPress={() => router.push((user ? '/account-settings?section=profile' : '/auth/login') as never)}
          >
            <MaterialIcons name={user ? 'person' : 'login'} size={22} color={format.accentDark} />
          </Pressable>
        </View>
        <Text style={[styles.kicker, { color: format.accentDark }]}>{user ? 'Tu UCAPSA' : 'UCAPSA'}</Text>
        <Text style={[styles.title, { color: format.text }]}>{user ? displayName : 'Bienvenido'}</Text>
        <Text style={[styles.subtitle, { color: format.muted }]}>{user ? 'Lo importante de tu cuenta, sin buscar entre menus.' : 'Consulta servicios, anuncios y calendario oficial.'}</Text>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Cargando informacion...</Text></View> : null}

      {!loading && user ? (
        <View style={styles.block}>
          <Text style={[styles.sectionTitle, { color: format.text }]}>Lo importante</Text>
          {!profileComplete ? <ActionCard icon="person" title="Completa tus datos" text="Falta informacion basica de tu perfil." onPress={() => router.push('/account-settings?section=profile' as never)} /> : null}
          {hasPaymentAttention ? <ActionCard icon="payments" title="Revisa tus pagos" text={payments.attention_total > 0.005 ? `Requiere atencion: ${money(payments.attention_total)}` : 'Hay un pago pendiente de revision.'} onPress={() => router.push('/payments' as never)} /> : null}
          {nextProgram ? <ActionCard icon="school" title={`Proxima clase: ${getProgramCodeLabel(nextProgram.program.code)}`} text={nextClassText(nextProgram)} onPress={() => router.push(`/client/class-detail?enrollmentId=${encodeURIComponent(nextProgram.enrollment.id)}` as never)} /> : null}
          {membership?.status === 'pending' ? <ActionCard icon="badge" title="Membresia en revision" text="Tu solicitud sigue pendiente." onPress={() => router.push('/client/membership' as never)} /> : null}
          {profileComplete && !hasPaymentAttention && !nextProgram && membership?.status !== 'pending' ? (
            <View style={styles.okCard}><MaterialIcons name="check-circle" size={22} color={ucapsaBrand.colors.success} /><Text style={styles.okText}>No hay acciones pendientes en tu cuenta.</Text></View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.quickRow}>
        {user && activePrograms.length > 0 ? <QuickAction icon="qr-code-scanner" label="Asistencia" onPress={() => router.push('/attendance' as never)} /> : null}
        <QuickAction icon="event" label="Calendario" onPress={() => router.push('/calendar' as never)} />
        <QuickAction icon="campaign" label="Anuncios" onPress={() => router.push('/announcements' as never)} />
        {!user ? <QuickAction icon="login" label="Iniciar sesion" onPress={() => router.push('/auth/login' as never)} /> : null}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: format.text }]}>Avisos</Text>
        <Pressable onPress={() => router.push('/announcements' as never)}><Text style={[styles.link, { color: format.accentDark }]}>Ver todos</Text></Pressable>
      </View>
      {announcements[0] ? <AnnouncementCard announcement={announcements[0]} onPress={() => setSelectedAnnouncement(announcements[0])} onOpenEvent={announcements[0].event ? () => router.push('/calendar' as never) : undefined} /> : <Empty text="No hay anuncios publicados." />}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: format.text }]}>Agenda</Text>
        <Pressable onPress={() => router.push('/calendar' as never)}><Text style={[styles.link, { color: format.accentDark }]}>Abrir calendario</Text></Pressable>
      </View>
      {events[0] ? <EventCard event={events[0].event} startDateOverride={events[0].start_date} occurrenceIndex={events[0].is_recurring ? events[0].occurrence_index : undefined} onPress={() => setSelectedEvent(events[0])} /> : <Empty text="No hay eventos proximos." />}

      <UcapsaDetailModal visible={Boolean(selectedAnnouncement)} type="announcement" title={selectedAnnouncement?.title ?? ''} body={selectedAnnouncement?.content} dateLabel={selectedAnnouncement?.announcement_date ? new Date(selectedAnnouncement.announcement_date).toLocaleDateString('es-MX') : null} onClose={() => setSelectedAnnouncement(null)} />
      <UcapsaDetailModal visible={Boolean(selectedEvent)} type="event" title={selectedEvent?.event.title ?? ''} body={selectedEvent?.event.description} dateLabel={selectedEvent ? new Date(selectedEvent.start_date).toLocaleString('es-MX') : null} location={selectedEvent?.event.location} repeatLabel={selectedEvent?.repeat_label} onClose={() => setSelectedEvent(null)} />
    </KeyboardAwareScreen>
  );
}

function ActionCard({ icon, title, text, onPress }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; text: string; onPress: () => void }) {
  return (
    <Pressable style={styles.actionCard} onPress={onPress}>
      <View style={styles.actionIcon}><MaterialIcons name={icon} size={21} color={ucapsaBrand.colors.redDark} /></View>
      <View style={{ flex: 1 }}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionText}>{text}</Text></View>
      <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.redDark} />
    </Pressable>
  );
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; onPress: () => void }) {
  return <Pressable style={styles.quickAction} onPress={onPress}><MaterialIcons name={icon} size={21} color={ucapsaBrand.colors.redDark} /><Text style={styles.quickText}>{label}</Text></Pressable>;
}

function Empty({ text }: { text: string }) {
  return <View style={styles.empty}><Text style={styles.emptyText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  hero: { gap: 5, borderRadius: 24, borderWidth: 1, padding: 18, marginBottom: 15 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  mark: { width: 44, height: 44 },
  accountButton: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { fontSize: 29, lineHeight: 34, fontWeight: '900' },
  subtitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12 },
  muted: { fontSize: 13, fontWeight: '700' },
  block: { gap: 9, marginBottom: 14 },
  sectionTitle: { fontSize: 19, fontWeight: '900' },
  actionCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 13 },
  actionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  actionTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  actionText: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
  okCard: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 18, borderWidth: 1, borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', padding: 14 },
  okText: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '800' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 16 },
  quickAction: { minWidth: '30%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', paddingVertical: 11, paddingHorizontal: 10 },
  quickText: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 3, marginBottom: 8 },
  link: { fontSize: 12, fontWeight: '900' },
  empty: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 15, marginBottom: 12 },
  emptyText: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '700' },
});
