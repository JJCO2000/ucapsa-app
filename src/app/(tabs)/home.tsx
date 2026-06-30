import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AchievementMiniRow } from '../../components/domain/AchievementBadgeGrid';
import { AnnouncementCard } from '../../components/domain/AnnouncementCard';
import { EventCard } from '../../components/domain/EventCard';
import { UcapsaRoleCard, UcapsaRoleHero } from '../../components/layout/UcapsaRoleLayout';
import { UcapsaDetailModal } from '../../components/ui/UcapsaDetailModal';
import { ucapsaBrand } from '../../constants/brand';
import { getActiveModuleLabels, getFormatTitle, resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getMyAchievements, type AchievementWithState } from '../../services/achievements.service';
import { getVisibleAnnouncements } from '../../services/announcements.service';
import { getVisibleEvents } from '../../services/events.service';
import { getAdminMembershipRows, getMyMembership } from '../../services/memberships.service';
import { getMyProgramEnrollments } from '../../services/programs.service';
import type { Announcement, EventOccurrence, Membership, ProgramEnrollmentWithDetails } from '../../types/app.types';
import { getUpcomingOccurrences } from '../../utils/events.utils';

const wordmark = require('../../../assets/images/brand/ucapsa-wordmark.png');
const mark = require('../../../assets/images/brand/ucapsa-mark.png');

function formatDateShort(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function getProgramLabel(item: ProgramEnrollmentWithDetails) {
  if (item.program.code === 'puppy') return 'Puppy';
  if (item.program.code === 'comandos') return 'Comandos';
  return item.program.name;
}

export default function HomeScreen() {
  const { user, profile, role, isAdmin } = useSession();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<EventOccurrence[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [programEnrollments, setProgramEnrollments] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventOccurrence | null>(null);
  const [achievements, setAchievements] = useState<AchievementWithState[]>([]);
  const [adminStats, setAdminStats] = useState({ active: 0, requests: 0, pendingPayments: 0 });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [announcementResult, eventResult] = await Promise.all([getVisibleAnnouncements(3), getVisibleEvents()]);
      setAnnouncements(announcementResult.slice(0, 3));
      setEvents(getUpcomingOccurrences(eventResult, 3));

      if (isAdmin) {
        const rows = await getAdminMembershipRows();
        setAdminStats({
          active: rows.filter((row) => row.membership.status === 'active').length,
          requests: rows.filter((row) => row.membership.status === 'pending').length,
          pendingPayments: rows.filter((row) => row.membership.current_payment_status === 'pending').length,
        });
        setMembership(null);
        setProgramEnrollments([]);
        setAchievements([]);
        return;
      }

      if (user) {
        const [membershipResult, programResult] = await Promise.all([getMyMembership(), getMyProgramEnrollments()]);
        setMembership(membershipResult);
        setProgramEnrollments(programResult);

        void getMyAchievements()
          .then(setAchievements)
          .catch(() => setAchievements([]));
        return;
      }

      setMembership(null);
      setProgramEnrollments([]);
      setAchievements([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  useEffect(() => { void loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { void loadData(); return undefined; }, [loadData]));

  const displayName = profile?.full_name || profile?.email || user?.email || 'Visitante';
  const effectiveRole = role ?? profile?.role ?? null;
  const membershipStatus = membership?.status ?? null;
  const isActiveMember = effectiveRole === 'member' || membershipStatus === 'active';
  const activeProgramEnrollments = programEnrollments.filter((item) => item.enrollment.status === 'active');
  const hasPuppy = activeProgramEnrollments.some((item) => item.program.code === 'puppy');
  const hasComandos = activeProgramEnrollments.some((item) => item.program.code === 'comandos');
  const activeModuleLabels = getActiveModuleLabels({ isMember: isActiveMember, hasPuppy, hasComandos });
  const isPendingMemberRequest = membershipStatus === 'pending' && activeModuleLabels.length === 0;
  const hasDogName = Boolean((profile?.dog_name ?? '').trim());
  const clientHeroSubtitle = !user
    ? 'Inicia sesion para ver tu perfil UCAPSA.'
    : !hasDogName && !isAdmin
      ? 'Completa tu perfil.'
      : 'Consulta tus avisos y logros.';
  const format = useMemo(
    () => resolveUcapsaFormat({ user, role: effectiveRole, isAdmin, membershipStatus, hasActivePrograms: activeProgramEnrollments.length > 0 }),
    [user, effectiveRole, isAdmin, membershipStatus, activeProgramEnrollments.length],
  );

  const membershipIcon = isAdmin || isActiveMember ? 'crown' : hasPuppy ? 'dog' : hasComandos ? 'school' : 'paw';
  const membershipTitle = isAdmin
    ? 'Mi UCAPSA Admin'
    : activeModuleLabels.length > 0
      ? 'Tus modulos activos'
      : isPendingMemberRequest
        ? 'Solicitud pendiente'
        : user
          ? 'Cliente UCAPSA'
          : 'Conoce UCAPSA';
  const membershipText = isAdmin
    ? 'Socios, pagos, solicitudes y control operativo.'
    : activeModuleLabels.length > 0
      ? `${activeModuleLabels.join(', ')}. Credenciales, QR y horarios disponibles.`
      : isPendingMemberRequest
        ? 'Administracion revisara tu solicitud.'
        : user
          ? hasDogName ? 'Consulta tus avisos y logros.' : 'Completa tu perfil.'
          : 'Inicia sesion para credencial, QR y membresia.';

  const isPremiumHome = format.key === 'member' && !isAdmin;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: isPremiumHome ? '#270711' : format.background }]} edges={['top']}>
      <ScrollView
        style={[styles.container, { backgroundColor: isPremiumHome ? '#270711' : format.background }]}
        contentContainerStyle={[styles.content, isPremiumHome && styles.premiumContent]}
      >
        {isPremiumHome ? (
          <PremiumMemberHome
            displayName={displayName}
            membership={membership}
            activeModules={activeModuleLabels}
            programs={activeProgramEnrollments}
            upcomingEvents={events}
            achievements={achievements}
          />
        ) : (
          <>
            {isAdmin ? (
              <UcapsaRoleHero
                format={format}
                eyebrow={format.shortLabel}
                title={getFormatTitle(format, displayName)}
                subtitle={`Rol: ${role ?? 'admin'}`}
                icon={format.icon}
              />
            ) : (
              <ClientHomeHero
                format={format}
                eyebrow={format.shortLabel}
                title={getFormatTitle(format, displayName)}
                subtitle={clientHeroSubtitle}
                icon={format.icon}
                achievements={achievements}
              />
            )}

            <View style={styles.wordmarkCard}>
              <Image source={wordmark} style={styles.wordmark} resizeMode="contain" />
              <Text style={[styles.wordmarkText, { color: format.muted }]}>La universidad de tu perro</Text>
            </View>

            <View style={styles.mainActions}>
              <Pressable style={[styles.primaryAction, { backgroundColor: format.primaryButton }]} onPress={() => router.push('/announcements' as never)}>
                <Text style={[styles.primaryActionText, { color: format.primaryButtonText }]}>Anuncios</Text>
              </Pressable>
              <Pressable style={[styles.secondaryAction, { backgroundColor: format.secondaryButton }]} onPress={() => router.push('/calendar' as never)}>
                <Text style={[styles.secondaryActionText, { color: format.secondaryButtonText }]}>Calendario</Text>
              </Pressable>
            </View>

            {isAdmin ? (
              <View style={styles.adminStrip}>
                <Metric label="Socios activos" value={adminStats.active} icon="verified-user" format={format} onPress={() => router.push('/membership?view=table&filter=active' as never)} />
                <Metric label="Solicitudes" value={adminStats.requests} icon="mark-email-unread" format={format} onPress={() => router.push('/membership?view=table&filter=pending_requests' as never)} />
                <Metric label="Falta pago" value={adminStats.pendingPayments} icon="payments" format={format} onPress={() => router.push('/membership?view=table&filter=payment_pending_this_month&sort=followup' as never)} />
              </View>
            ) : null}

            <UcapsaRoleCard format={format} title={membershipTitle} subtitle={membershipText} icon={membershipIcon} iconFamily="community" onPress={() => router.push('/membership' as never)} />

            <View style={styles.quickGrid}>
              <Shortcut label="Perfil" icon="person" format={format} onPress={() => router.push('/profile' as never)} />
              <Shortcut label="Calendario" icon="event" format={format} onPress={() => router.push('/calendar' as never)} />
              {isAdmin ? <Shortcut label="Admin socios" icon="groups" format={format} onPress={() => router.push('/admin/members' as never)} /> : null}
              {isAdmin ? <Shortcut label="Clases" icon="school" format={format} onPress={() => router.push('/admin/classes' as never)} /> : null}
              {isAdmin ? <Shortcut label="Eventos" icon="event" format={format} onPress={() => router.push('/admin/events' as never)} /> : null}
            </View>
          </>
        )}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={isPremiumHome ? '#FACC15' : format.accent} />
            <Text style={[styles.muted, { color: isPremiumHome ? '#FFE3E8' : format.muted }]}>Cargando informacion...</Text>
          </View>
        ) : null}

        <SectionHeader label="Anuncios" title="Recientes" link="Ver todos" accent={isPremiumHome ? '#FACC15' : ucapsaBrand.colors.blue} premium={isPremiumHome} onPress={() => router.push('/announcements' as never)} />
        {!loading && announcements.length === 0 ? (
          <Empty title="Sin anuncios" text="Los comunicados publicados apareceran aqui." format={format} premium={isPremiumHome} />
        ) : announcements.map((announcement) => (
          <AnnouncementCard
            key={announcement.id}
            announcement={announcement}
            onPress={isAdmin ? () => router.push(`/admin/announcements?announcementId=${announcement.id}` as never) : () => setSelectedAnnouncement(announcement)}
            onOpenEvent={announcement.event ? () => router.push('/calendar' as never) : undefined}
          />
        ))}

        <SectionHeader label="Eventos" title="Proximos" link="Ver agenda" accent={isPremiumHome ? '#FACC15' : format.accent} premium={isPremiumHome} onPress={() => router.push('/calendar' as never)} />
        {!loading && events.length === 0 ? (
          <Empty title="Sin eventos proximos" text="Los eventos publicados apareceran aqui." format={format} premium={isPremiumHome} />
        ) : events.map((occurrence) => (
          <EventCard
            key={occurrence.id}
            event={occurrence.event}
            startDateOverride={occurrence.start_date}
            occurrenceIndex={occurrence.is_recurring ? occurrence.occurrence_index : undefined}
            onPress={isAdmin ? () => router.push(`/admin/events?eventId=${occurrence.event.id}` as never) : () => setSelectedEvent(occurrence)}
          />
        ))}
      </ScrollView>

      <UcapsaDetailModal visible={Boolean(selectedAnnouncement)} type="announcement" title={selectedAnnouncement?.title ?? ''} body={selectedAnnouncement?.content} dateLabel={selectedAnnouncement?.announcement_date ? new Date(selectedAnnouncement.announcement_date).toLocaleDateString('es-MX') : null} onClose={() => setSelectedAnnouncement(null)} />
      <UcapsaDetailModal visible={Boolean(selectedEvent)} type="event" title={selectedEvent?.event.title ?? ''} body={selectedEvent?.event.description} dateLabel={selectedEvent ? new Date(selectedEvent.start_date).toLocaleString('es-MX') : null} location={selectedEvent?.event.location} repeatLabel={selectedEvent?.repeat_label} onClose={() => setSelectedEvent(null)} />
    </SafeAreaView>
  );
}


function ClientHomeHero({ format, eyebrow, title, subtitle, icon, achievements }: { format: ReturnType<typeof resolveUcapsaFormat>; eyebrow: string; title: string; subtitle: string; icon: string; achievements: AchievementWithState[] }) {
  return (
    <View style={[styles.clientHeroCard, { backgroundColor: format.surface, borderColor: format.border }]}> 
      <View style={styles.clientHeroTopRow}>
        <View style={[styles.clientHeroIcon, { backgroundColor: format.accentSoft }]}> 
          <MaterialCommunityIcons name={icon as any} size={26} color={format.accent} />
        </View>
        <Image source={mark} style={styles.clientHeroMark} resizeMode="contain" />
      </View>
      <Text style={[styles.clientHeroEyebrow, { color: format.accentDark }]}>{eyebrow}</Text>
      <Text style={[styles.clientHeroTitle, { color: format.text }]}>{title}</Text>
      <Text style={[styles.clientHeroSubtitle, { color: format.muted }]}>{subtitle}</Text>
      <AchievementMiniRow items={achievements} premium={false} onPress={() => router.push('/achievements' as never)} />
    </View>
  );
}

function PremiumMemberHome({ displayName, membership, activeModules, programs, upcomingEvents, achievements }: { displayName: string; membership: Membership | null; activeModules: string[]; programs: ProgramEnrollmentWithDetails[]; upcomingEvents: EventOccurrence[]; achievements: AchievementWithState[] }) {
  const memberNumber = membership?.member_number || 'Pendiente';
  const nextEvent = upcomingEvents[0] ?? null;

  return (
    <View style={styles.premiumWrap}>
      <View style={styles.premiumHero}>
        <View style={styles.premiumGlowOne} />
        <View style={styles.premiumGlowTwo} />
        <View style={styles.premiumGlowThree} />

        <View style={styles.premiumTopBar}>
          <View style={styles.premiumLogoBadge}>
            <Image source={mark} style={styles.premiumMark} resizeMode="contain" />
          </View>
          <View style={styles.premiumStatusPill}>
            <MaterialCommunityIcons name="crown" size={15} color="#7A1020" />
            <Text style={styles.premiumStatusText}>Socio activo</Text>
          </View>
        </View>

        <Text style={styles.premiumEyebrow}>Socio UCAPSA</Text>
        <Text style={styles.premiumTitle}>{displayName}</Text>
        <Text style={styles.premiumSubtitle}>Membresia #{memberNumber}</Text>

        <View style={styles.premiumModuleRow}>
          {(activeModules.length > 0 ? activeModules : ['Socio']).map((label) => (
            <Text key={label} style={styles.premiumModulePill}>{label}</Text>
          ))}
        </View>

        <AchievementMiniRow items={achievements} premium onPress={() => router.push('/achievements' as never)} />
      </View>

      <View style={styles.premiumMainCard}>
        <View style={styles.premiumMainTop}>
          <View style={styles.premiumCrownSeal}>
            <MaterialCommunityIcons name="crown" size={28} color="#7A1020" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.premiumCardKicker}>Credencial digital</Text>
            <Text style={styles.premiumCardTitle}>Tu acceso UCAPSA</Text>
          </View>
        </View>
        <Pressable style={styles.premiumPrimaryButton} onPress={() => router.push('/membership' as never)}>
          <Text style={styles.premiumPrimaryButtonText}>Abrir credencial</Text>
          <MaterialIcons name="chevron-right" size={22} color="#7A1020" />
        </Pressable>
      </View>

      <View style={styles.premiumGrid}>
        <PremiumAction icon="qrcode-scan" label="QR" text="Verificar" onPress={() => router.push('/membership' as never)} />
        <PremiumAction icon="calendar-month" label="Agenda" text={nextEvent ? formatDateShort(nextEvent.start_date) : 'Calendario'} onPress={() => router.push('/calendar' as never)} />
        <PremiumAction icon="dog" label="Clases" text={programs.length > 0 ? programs.map(getProgramLabel).join(', ') : 'Sin clases'} onPress={() => router.push('/membership' as never)} />
      </View>
    </View>
  );
}

function PremiumAction({ icon, label, text, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; text: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.premiumAction, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.premiumActionIcon}>
        <MaterialCommunityIcons name={icon} size={22} color="#FACC15" />
      </View>
      <Text style={styles.premiumActionLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.premiumActionText}>{text}</Text>
    </Pressable>
  );
}

function Metric({ label, value, icon, format, onPress }: { label: string; value: number; icon: keyof typeof MaterialIcons.glyphMap; format: ReturnType<typeof resolveUcapsaFormat>; onPress: () => void }) {
  return (
    <Pressable style={[styles.metricItem, { backgroundColor: format.surface, borderColor: format.border }]} onPress={onPress}>
      <MaterialIcons name={icon} size={20} color={format.accent} />
      <Text style={[styles.metricValue, { color: format.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: format.muted }]}>{label}</Text>
    </Pressable>
  );
}

function Shortcut({ label, icon, format, onPress }: { label: string; icon: keyof typeof MaterialIcons.glyphMap; format: ReturnType<typeof resolveUcapsaFormat>; onPress: () => void }) {
  return (
    <Pressable style={[styles.shortcut, { backgroundColor: format.surface, borderColor: format.border }]} onPress={onPress}>
      <MaterialIcons name={icon} size={22} color={format.accent} />
      <Text style={[styles.shortcutText, { color: format.text }]}>{label}</Text>
    </Pressable>
  );
}

function SectionHeader({ label, title, link, accent, premium, onPress }: { label: string; title: string; link: string; accent: string; premium?: boolean; onPress: () => void }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View>
        <Text style={[styles.sectionLabel, { color: accent }]}>{label}</Text>
        <Text style={[styles.sectionTitle, premium && styles.sectionTitlePremium]}>{title}</Text>
      </View>
      <Pressable onPress={onPress}><Text style={[styles.sectionLink, { color: accent }]}>{link}</Text></Pressable>
    </View>
  );
}

function Empty({ title, text, format, premium }: { title: string; text: string; format: ReturnType<typeof resolveUcapsaFormat>; premium?: boolean }) {
  return (
    <View style={[styles.emptyBox, { backgroundColor: premium ? 'rgba(255,255,255,0.08)' : format.surface, borderColor: premium ? 'rgba(250,204,21,0.22)' : format.border }]}> 
      <Text style={[styles.emptyTitle, { color: premium ? '#FFFFFF' : format.text }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: premium ? '#FFE3E8' : format.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  content: { gap: 16, padding: 20, paddingBottom: 120 },
  premiumContent: { paddingTop: 18, gap: 18 },
  heroMark: { width: 42, height: 42 },
  heroAccessory: { alignItems: 'flex-end', justifyContent: 'center', gap: 6, maxWidth: 138 },
  clientHeroCard: { gap: 10, padding: 22, borderRadius: 30, borderWidth: 1 },
  clientHeroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  clientHeroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  clientHeroMark: { width: 52, height: 52 },
  clientHeroEyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  clientHeroTitle: { fontSize: 32, lineHeight: 37, fontWeight: '900' },
  clientHeroSubtitle: { fontSize: 16, lineHeight: 23, fontWeight: '800' },
  wordmarkCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  wordmark: { width: 160, height: 40 },
  wordmarkText: { flex: 1, fontSize: 12, fontWeight: '800' },
  mainActions: { flexDirection: 'row', gap: 10 },
  primaryAction: { flex: 1, borderRadius: 18, paddingVertical: 14, alignItems: 'center' },
  primaryActionText: { fontSize: 15, fontWeight: '900' },
  secondaryAction: { flex: 1, borderRadius: 18, paddingVertical: 14, alignItems: 'center' },
  secondaryActionText: { fontSize: 15, fontWeight: '900' },
  adminStrip: { flexDirection: 'row', gap: 10 },
  metricItem: { flex: 1, gap: 4, padding: 12, borderRadius: 20, borderWidth: 1 },
  metricValue: { fontSize: 23, fontWeight: '900' },
  metricLabel: { fontSize: 11, fontWeight: '800' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  shortcut: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 20, borderWidth: 1 },
  shortcutText: { fontSize: 14, fontWeight: '900' },
  loadingBox: { gap: 10, alignItems: 'center', padding: 20 },
  muted: { fontSize: 14 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 2 },
  sectionLabel: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  sectionTitle: { color: '#25151A', fontSize: 22, fontWeight: '900', marginTop: 2 },
  sectionTitlePremium: { color: '#FFFFFF' },
  sectionLink: { fontSize: 13, fontWeight: '900' },
  emptyBox: { gap: 4, padding: 18, borderRadius: 22, borderWidth: 1 },
  emptyTitle: { fontSize: 16, fontWeight: '900' },
  emptyText: { fontSize: 14, lineHeight: 20 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.995 }] },

  premiumWrap: { gap: 15 },
  premiumHero: { position: 'relative', overflow: 'hidden', minHeight: 250, padding: 22, borderRadius: 34, backgroundColor: '#6D0817', borderWidth: 1, borderColor: 'rgba(250, 204, 21, 0.42)' },
  premiumGlowOne: { position: 'absolute', top: -80, right: -54, width: 190, height: 190, borderRadius: 95, backgroundColor: '#FACC15', opacity: 0.28 },
  premiumGlowTwo: { position: 'absolute', bottom: -90, left: -50, width: 210, height: 210, borderRadius: 105, backgroundColor: '#12040A', opacity: 0.72 },
  premiumGlowThree: { position: 'absolute', top: 96, right: 20, width: 92, height: 92, borderRadius: 46, backgroundColor: '#FFFFFF', opacity: 0.08 },
  premiumTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  premiumLogoBadge: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: '#FFE8B5' },
  premiumMark: { width: 30, height: 30 },
  premiumStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#FFE8B5' },
  premiumStatusText: { color: '#7A1020', fontSize: 12, fontWeight: '900' },
  premiumEyebrow: { color: '#FACC15', fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  premiumTitle: { color: '#FFFFFF', fontSize: 34, lineHeight: 38, fontWeight: '900', marginTop: 4 },
  premiumSubtitle: { color: '#FFE3E8', fontSize: 15, fontWeight: '800', marginTop: 6 },
  premiumModuleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  premiumModulePill: { overflow: 'hidden', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)', color: '#FFE8B5', borderWidth: 1, borderColor: 'rgba(250,204,21,0.28)', fontSize: 12, fontWeight: '900' },
  premiumMainCard: { gap: 14, padding: 18, borderRadius: 30, backgroundColor: '#FFF7CC', borderWidth: 1, borderColor: '#FACC15', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  premiumMainTop: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  premiumCrownSeal: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#FACC15' },
  premiumCardKicker: { color: '#7A1020', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  premiumCardTitle: { color: '#25151A', fontSize: 22, fontWeight: '900', marginTop: 2 },
  premiumCardText: { color: '#6B4B00', fontSize: 13, fontWeight: '800', lineHeight: 18, marginTop: 2 },
  premiumPrimaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F4C7A0' },
  premiumPrimaryButtonText: { color: '#7A1020', fontSize: 15, fontWeight: '900' },
  premiumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  premiumAction: { width: '48%', minHeight: 118, justifyContent: 'space-between', padding: 14, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1, borderColor: 'rgba(250,204,21,0.26)' },
  premiumActionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(250,204,21,0.12)' },
  premiumActionLabel: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', marginTop: 8 },
  premiumActionText: { color: '#FFE3E8', fontSize: 12, fontWeight: '800', marginTop: 2 },
});
