import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

import { MemberCredentialCard } from '../../components/domain/MemberCredentialCard';
import { ProgramCredentialCard } from '../../components/domain/ProgramCredentialCard';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  formatDate,
  getAdminMembershipRows,
  getDisplayName,
  getMembershipStatusLabel,
  getMyMembership,
  getPaymentStatusLabel,
  isMembershipDateExpired,
  requestMembership,
  updateMembershipDetails,
  updateMembershipPaymentStatus,
  updateMembershipStatus,
  requestPermanentMembershipDeletion,
  getMembershipDeleteRequests,
  approveMembershipDeleteRequest,
  rejectMembershipDeleteRequest,
  type MembershipAdminRow,
  type MembershipDeleteRequestRow,
  type UpdateMembershipDetailsInput,
} from '../../services/memberships.service';
import { deleteMembershipPayment, registerMembershipPayment } from '../../services/payments.service';
import { getMyProgramEnrollments } from '../../services/programs.service';
import type { Membership, MembershipPaymentStatus, MembershipStatus, Payment, ProgramEnrollmentWithDetails } from '../../types/app.types';

const wordmark = require('../../../assets/images/brand/ucapsa-wordmark.png');
const mark = require('../../../assets/images/brand/ucapsa-mark.png');
const TABLE_PREFS_KEY = 'ucapsa.miucapsa.membership.table.columns.v4';
const TABLE_SORT_KEY = 'ucapsa.miucapsa.membership.table.sort.v1';
const ACTION_MEMORY_KEY = 'ucapsa.miucapsa.membership.table.actions.v1';

type AdminPerspective = 'stats' | 'table';

type AdminMembershipFilter =
  | 'all'
  | 'active'
  | 'inactive'
  | 'pending_requests'
  | 'paid_this_month'
  | 'payment_pending_this_month'
  | 'expired_by_date';

type AdminSortMode =
  | 'followup'
  | 'name_asc'
  | 'name_desc'
  | 'action_asc'
  | 'action_desc'
  | 'email_asc'
  | 'email_desc'
  | 'member_number_asc'
  | 'member_number_desc'
  | 'status_asc'
  | 'status_desc'
  | 'payment_asc'
  | 'payment_desc'
  | 'last_payment_desc'
  | 'last_payment_asc'
  | 'validity_asc'
  | 'validity_desc';

type VisibleColumns = {
  email: boolean;
  memberNumber: boolean;
  status: boolean;
  payment: boolean;
  lastPayment: boolean;
  validity: boolean;
};

type ActionMemoryItem = {
  status: 'paid' | 'pending';
  monthKey: string;
  updatedAt: string;
};

type ActionMemory = Record<string, ActionMemoryItem>;

const defaultColumns: VisibleColumns = {
  email: true,
  memberNumber: true,
  status: true,
  payment: true,
  lastPayment: true,
  validity: true,
};

const columnOptions: Array<{ key: keyof VisibleColumns; label: string }> = [
  { key: 'email', label: 'Correo' },
  { key: 'memberNumber', label: 'Numero' },
  { key: 'status', label: 'Estado' },
  { key: 'payment', label: 'Pago' },
  { key: 'lastPayment', label: 'Ultimo pago' },
  { key: 'validity', label: 'Vigencia' },
];

const adminFilterOptions: Array<{ value: AdminMembershipFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
  { value: 'pending_requests', label: 'Solicitudes' },
  { value: 'paid_this_month', label: 'Pagados' },
  { value: 'payment_pending_this_month', label: 'Falta pago' },
  { value: 'expired_by_date', label: 'Vigencia vencida' },
];

const sortValues: AdminSortMode[] = [
  'followup',
  'name_asc',
  'name_desc',
  'action_asc',
  'action_desc',
  'email_asc',
  'email_desc',
  'member_number_asc',
  'member_number_desc',
  'status_asc',
  'status_desc',
  'payment_asc',
  'payment_desc',
  'last_payment_desc',
  'last_payment_asc',
  'validity_asc',
  'validity_desc',
];

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isThisMonth(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function isInactiveStatus(status: MembershipStatus) {
  return status === 'cancelled' || status === 'expired' || status === 'rejected';
}

function hasPaidThisMonth(row: MembershipAdminRow) {
  return row.membership.current_payment_status === 'paid' && isThisMonth(row.membership.last_payment_at);
}

function hasPaidStatus(row: MembershipAdminRow) {
  return row.membership.current_payment_status === 'paid';
}

function shouldPayThisMonth(row: MembershipAdminRow) {
  if (row.membership.status !== 'active') return false;
  if (row.membership.current_payment_status === 'not_required') return false;
  return true;
}

function hasPaymentPendingThisMonth(row: MembershipAdminRow) {
  return shouldPayThisMonth(row) && row.membership.current_payment_status !== 'paid';
}

function getLastPaymentDate(row: MembershipAdminRow) {
  return row.membership.last_payment_at ?? row.payments.find((payment) => payment.status === 'paid')?.paid_at ?? null;
}

function getFilterLabel(value: AdminMembershipFilter) {
  return adminFilterOptions.find((item) => item.value === value)?.label ?? 'Todos';
}

function compareText(a: string | null | undefined, b: string | null | undefined) {
  return (a || '').localeCompare(b || '', 'es-MX', { sensitivity: 'base', numeric: true });
}

function toggleSort(current: AdminSortMode, asc: AdminSortMode, desc: AdminSortMode) {
  return current === asc ? desc : asc;
}

function headerLabel(label: string, current: AdminSortMode, asc: AdminSortMode, desc: AdminSortMode) {
  if (current === asc) return `${label} ASC`;
  if (current === desc) return `${label} DESC`;
  return label;
}

function actionSortLabel(row: MembershipAdminRow, actionMemory: ActionMemory) {
  const state = getActionState(row, actionMemory);
  if (state === 'paid') return '3 pagado';
  if (state === 'not_required') return '4 no aplica';
  if (state === 'pending') return '2 pendiente marcado';
  if (hasPaymentPendingThisMonth(row)) return '0 requiere accion';
  return '1 abierto';
}

function getActionState(row: MembershipAdminRow, actionMemory: ActionMemory): 'open' | 'paid' | 'pending' | 'not_required' {
  if (row.membership.current_payment_status === 'paid') return 'paid';
  if (row.membership.current_payment_status === 'not_required') return 'not_required';
  if (row.membership.current_payment_status === 'pending' || row.membership.current_payment_status === 'overdue') return 'pending';
  const item = actionMemory[row.membership.id];
  if (item?.monthKey === getCurrentMonthKey()) return item.status;
  return 'open';
}

function getFollowupRank(row: MembershipAdminRow, actionMemory: ActionMemory) {
  const actionState = getActionState(row, actionMemory);
  if (actionState === 'open' && hasPaymentPendingThisMonth(row)) return 0;
  if (actionState === 'pending') return 1;
  if (actionState === 'open') return 2;
  return 3;
}

function getTime(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}


function dateKeyFromValue(value: string | null | undefined) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function dateKeyToIso(value: string | null | undefined) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return `${value}T12:00:00.000Z`;
}

function isInactiveRow(row: MembershipAdminRow) {
  return isInactiveStatus(row.membership.status);
}

function rowMatchesSearch(row: MembershipAdminRow, rawTerm: string) {
  const term = rawTerm.trim().toLowerCase();
  if (!term) return true;
  const haystack = [
    getDisplayName(row.profile),
    row.profile?.email,
    row.profile?.phone,
    row.profile?.dog_name,
    row.membership.member_number,
    getMembershipStatusLabel(row.membership.status),
    getPaymentStatusLabel(row.membership.current_payment_status),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
}

function buildAutomaticMemberNumber(row: MembershipAdminRow) {
  if (row.membership.member_number?.trim()) return row.membership.member_number.trim();
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const shortId = row.membership.id.replace(/-/g, '').slice(0, 5).toUpperCase();
  return `SOC-${year}${month}-${shortId}`;
}

function getSortedRows(rows: MembershipAdminRow[], sortMode: AdminSortMode, actionMemory: ActionMemory) {
  const next = [...rows];

  next.sort((a, b) => {
    const inactiveDiff = Number(isInactiveRow(a)) - Number(isInactiveRow(b));
    if (inactiveDiff !== 0) return inactiveDiff;

    const nameA = getDisplayName(a.profile);
    const nameB = getDisplayName(b.profile);
    const fallback = compareText(nameA, nameB);

    if (sortMode === 'followup') {
      const rankDiff = getFollowupRank(a, actionMemory) - getFollowupRank(b, actionMemory);
      return rankDiff || fallback;
    }

    if (sortMode === 'name_asc') return fallback;
    if (sortMode === 'name_desc') return compareText(nameB, nameA);
    if (sortMode === 'action_asc') return compareText(actionSortLabel(a, actionMemory), actionSortLabel(b, actionMemory)) || fallback;
    if (sortMode === 'action_desc') return compareText(actionSortLabel(b, actionMemory), actionSortLabel(a, actionMemory)) || fallback;
    if (sortMode === 'email_asc') return compareText(a.profile?.email, b.profile?.email) || fallback;
    if (sortMode === 'email_desc') return compareText(b.profile?.email, a.profile?.email) || fallback;
    if (sortMode === 'member_number_asc') return compareText(a.membership.member_number, b.membership.member_number) || fallback;
    if (sortMode === 'member_number_desc') return compareText(b.membership.member_number, a.membership.member_number) || fallback;
    if (sortMode === 'status_asc') return compareText(getMembershipStatusLabel(a.membership.status), getMembershipStatusLabel(b.membership.status)) || fallback;
    if (sortMode === 'status_desc') return compareText(getMembershipStatusLabel(b.membership.status), getMembershipStatusLabel(a.membership.status)) || fallback;
    if (sortMode === 'payment_asc') return compareText(getPaymentStatusLabel(a.membership.current_payment_status), getPaymentStatusLabel(b.membership.current_payment_status)) || fallback;
    if (sortMode === 'payment_desc') return compareText(getPaymentStatusLabel(b.membership.current_payment_status), getPaymentStatusLabel(a.membership.current_payment_status)) || fallback;
    if (sortMode === 'last_payment_desc') return getTime(getLastPaymentDate(b)) - getTime(getLastPaymentDate(a)) || fallback;
    if (sortMode === 'last_payment_asc') return getTime(getLastPaymentDate(a)) - getTime(getLastPaymentDate(b)) || fallback;
    if (sortMode === 'validity_asc') return getTime(a.membership.end_date) - getTime(b.membership.end_date) || fallback;
    if (sortMode === 'validity_desc') return getTime(b.membership.end_date) - getTime(a.membership.end_date) || fallback;

    return fallback;
  });

  return next;
}

export default function MembershipScreen() {
  const { user, profile, role, isAdmin } = useSession();
  const isSuperAdmin = role === 'super_admin';
  const params = useLocalSearchParams<{ view?: string; filter?: string; sort?: string }>();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [programEnrollments, setProgramEnrollments] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [adminRows, setAdminRows] = useState<MembershipAdminRow[]>([]);
  const [deleteRequests, setDeleteRequests] = useState<MembershipDeleteRequestRow[]>([]);
  const [perspective, setPerspective] = useState<AdminPerspective>('stats');
  const [filter, setFilter] = useState<AdminMembershipFilter>('all');
  const [sortMode, setSortMode] = useState<AdminSortMode>('followup');
  const [filterOpen, setFilterOpen] = useState(false);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [columns, setColumns] = useState<VisibleColumns>(defaultColumns);
  const [actionMemory, setActionMemory] = useState<ActionMemory>({});
  const [selectedRow, setSelectedRow] = useState<MembershipAdminRow | null>(null);
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    async function loadPrefs() {
      const [rawColumns, rawSort, rawActions] = await Promise.all([
        AsyncStorage.getItem(TABLE_PREFS_KEY),
        AsyncStorage.getItem(TABLE_SORT_KEY),
        AsyncStorage.getItem(ACTION_MEMORY_KEY),
      ]);

      if (rawColumns) {
        try {
          setColumns({ ...defaultColumns, ...(JSON.parse(rawColumns) as Partial<VisibleColumns>) });
        } catch {
          setColumns(defaultColumns);
        }
      }

      if (rawSort && sortValues.includes(rawSort as AdminSortMode)) {
        setSortMode(rawSort as AdminSortMode);
      }

      if (rawActions) {
        try {
          const parsed = JSON.parse(rawActions) as ActionMemory;
          const monthKey = getCurrentMonthKey();
          const filtered = Object.fromEntries(Object.entries(parsed).filter(([, item]) => item.monthKey === monthKey));
          setActionMemory(filtered);
          await AsyncStorage.setItem(ACTION_MEMORY_KEY, JSON.stringify(filtered));
        } catch {
          setActionMemory({});
        }
      }
    }

    void loadPrefs();
  }, []);

  useEffect(() => {
    if (params.view === 'table') setPerspective('table');
    if (typeof params.filter === 'string' && adminFilterOptions.some((item) => item.value === params.filter)) {
      setFilter(params.filter as AdminMembershipFilter);
    }
    if (typeof params.sort === 'string' && sortValues.includes(params.sort as AdminSortMode)) {
      void persistSort(params.sort as AdminSortMode);
    }
  }, [params.view, params.filter, params.sort]);

  async function persistColumns(nextColumns: VisibleColumns) {
    setColumns(nextColumns);
    await AsyncStorage.setItem(TABLE_PREFS_KEY, JSON.stringify(nextColumns));
  }

  async function persistSort(nextSort: AdminSortMode) {
    setSortMode(nextSort);
    await AsyncStorage.setItem(TABLE_SORT_KEY, nextSort);
  }

  async function rememberAction(membershipId: string, status: 'paid' | 'pending') {
    const next = {
      ...actionMemory,
      [membershipId]: { status, monthKey: getCurrentMonthKey(), updatedAt: new Date().toISOString() },
    } satisfies ActionMemory;
    setActionMemory(next);
    await AsyncStorage.setItem(ACTION_MEMORY_KEY, JSON.stringify(next));
  }

  const loadClientMembership = useCallback(async () => {
    if (!user || isAdmin) return;
    setLoading(true);
    try {
      const [membershipData, programData] = await Promise.all([getMyMembership(), getMyProgramEnrollments()]);
      setMembership(membershipData);
      setProgramEnrollments(programData);
    } catch (error) {
      Alert.alert('No se pudo cargar', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  const loadAdminMembershipPanel = useCallback(async () => {
    if (!user || !isAdmin) return;
    setLoading(true);
    try {
      const [rows, requests] = await Promise.all([
        getAdminMembershipRows(),
        isSuperAdmin ? getMembershipDeleteRequests() : Promise.resolve([]),
      ]);
      setAdminRows(rows);
      setDeleteRequests(requests);
    } catch (error) {
      Alert.alert('No se pudo cargar socios', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, isSuperAdmin]);

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
    if (isAdmin) await loadAdminMembershipPanel();
    else await loadClientMembership();
    setRefreshing(false);
  }

  function openStatsFilter(nextFilter: AdminMembershipFilter) {
    setFilter(nextFilter);
    setPerspective('table');
    setFilterOpen(false);
    setColumnSettingsOpen(false);
  }

  async function handleRequestMembership() {
    try {
      const data = await requestMembership();
      setMembership(data);
      Alert.alert('Solicitud enviada', 'Administracion revisara tu solicitud de membresia.');
    } catch (error) {
      Alert.alert('No se pudo solicitar', error instanceof Error ? error.message : 'Intenta de nuevo.');
    }
  }

  async function handleMarkPaid(row: MembershipAdminRow) {
    setSavingPaymentId(row.membership.id);
    try {
      await registerMembershipPayment({
        userId: row.membership.user_id,
        membershipId: row.membership.id,
        amount: 0,
        notes: 'Pago rapido registrado desde Mi UCAPSA.',
        periodLabel: 'Mensualidad',
        paymentMethod: 'manual',
      });
      await rememberAction(row.membership.id, 'paid');
      await loadAdminMembershipPanel();
      setSelectedRow(null);
    } catch (error) {
      Alert.alert('No se pudo marcar pagado', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setSavingPaymentId(null);
    }
  }

  async function handleMarkPending(row: MembershipAdminRow) {
    setSavingPaymentId(row.membership.id);
    try {
      await updateMembershipPaymentStatus(row.membership.id, 'pending', 'Pago marcado pendiente desde Mi UCAPSA.');
      await rememberAction(row.membership.id, 'pending');
      await loadAdminMembershipPanel();
      setSelectedRow(null);
    } catch (error) {
      Alert.alert('No se pudo marcar pendiente', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setSavingPaymentId(null);
    }
  }

  async function handleToggleAction(row: MembershipAdminRow) {
    const state = getActionState(row, actionMemory);
    if (state === 'paid') {
      await handleMarkPending(row);
      return;
    }

    await handleMarkPaid(row);
  }

  function handleApproveRequest(row: MembershipAdminRow) {
    Alert.alert(
      'Aceptar solicitud',
      `Activar la membresia de ${getDisplayName(row.profile)}? Se asignara numero de socio y el pago quedara pendiente.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aceptar socio',
          onPress: async () => {
            setSavingPaymentId(row.membership.id);
            try {
              await updateMembershipStatus(row.membership, 'active', {
                memberNumber: buildAutomaticMemberNumber(row),
                startDate: getTodayDateKey(),
                endDate: row.membership.end_date,
                paymentNotes: 'Solicitud aprobada desde Mi UCAPSA.',
              });
              await updateMembershipPaymentStatus(row.membership.id, 'pending', 'Membresia aprobada. Pago pendiente de registrar.');
              await loadAdminMembershipPanel();
              setSelectedRow(null);
            } catch (error) {
              Alert.alert('No se pudo aceptar', error instanceof Error ? error.message : 'Intenta de nuevo.');
            } finally {
              setSavingPaymentId(null);
            }
          },
        },
      ],
    );
  }

  function handleRejectRequest(row: MembershipAdminRow) {
    Alert.alert(
      'Rechazar solicitud',
      `Rechazar la solicitud de ${getDisplayName(row.profile)}? La persona volvera a verse como cliente.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: async () => {
            setSavingPaymentId(row.membership.id);
            try {
              await updateMembershipStatus(row.membership, 'rejected', {
                paymentNotes: 'Solicitud rechazada desde Mi UCAPSA.',
              });
              await updateMembershipPaymentStatus(row.membership.id, 'not_required', 'Solicitud rechazada.');
              await loadAdminMembershipPanel();
              setSelectedRow(null);
            } catch (error) {
              Alert.alert('No se pudo rechazar', error instanceof Error ? error.message : 'Intenta de nuevo.');
            } finally {
              setSavingPaymentId(null);
            }
          },
        },
      ],
    );
  }


  async function handleSaveMembershipDetails(row: MembershipAdminRow, input: UpdateMembershipDetailsInput) {
    setSavingPaymentId(row.membership.id);
    try {
      await updateMembershipDetails(row.membership, input);
      await loadAdminMembershipPanel();
      setSelectedRow(null);
      Alert.alert('Ficha actualizada', 'Los datos del socio se guardaron correctamente.');
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setSavingPaymentId(null);
    }
  }

  function handleDeletePayment(row: MembershipAdminRow, payment: Payment) {
    Alert.alert(
      'Eliminar pago',
      'Esto eliminara este pago del historial y recalculara el ultimo pago visible. Usalo solo para correcciones o pruebas.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar pago',
          style: 'destructive',
          onPress: async () => {
            setSavingPaymentId(row.membership.id);
            try {
              await deleteMembershipPayment(payment.id, row.membership.id);
              await loadAdminMembershipPanel();
              setSelectedRow(null);
            } catch (error) {
              Alert.alert('No se pudo eliminar pago', error instanceof Error ? error.message : 'Intenta de nuevo.');
            } finally {
              setSavingPaymentId(null);
            }
          },
        },
      ],
    );
  }

  function handleDeactivateMembership(row: MembershipAdminRow) {
    Alert.alert('Desactivar socio', 'La persona dejara de aparecer como socio activo, pero se conservara su historial.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desactivar',
        style: 'destructive',
        onPress: async () => {
          await handleSaveMembershipDetails(row, {
            status: 'cancelled',
            currentPaymentStatus: 'not_required',
            paymentNotes: 'Membresia desactivada desde ficha de socio.',
          });
        },
      },
    ]);
  }

  function handleReactivateMembership(row: MembershipAdminRow) {
    Alert.alert('Reactivar socio', 'La membresia volvera a quedar activa y el pago se marcara como pendiente.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Reactivar',
        onPress: async () => {
          await handleSaveMembershipDetails(row, {
            status: 'active',
            currentPaymentStatus: 'pending',
            paymentNotes: 'Membresia reactivada desde ficha de socio.',
          });
        },
      },
    ]);
  }

  function handleRequestPermanentDelete(row: MembershipAdminRow) {
    Alert.alert(
      'Solicitar eliminacion definitiva',
      'Se desactivara la membresia y se creara una solicitud para que super_admin apruebe o rechace la eliminacion definitiva.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Solicitar',
          style: 'destructive',
          onPress: async () => {
            setSavingPaymentId(row.membership.id);
            try {
              await requestPermanentMembershipDeletion(row, 'Solicitud desde ficha de socio.');
              await loadAdminMembershipPanel();
              setSelectedRow(null);
              Alert.alert('Solicitud enviada', 'La membresia quedo desactivada mientras super_admin revisa la eliminacion definitiva.');
            } catch (error) {
              Alert.alert('No se pudo solicitar', error instanceof Error ? error.message : 'Intenta de nuevo.');
            } finally {
              setSavingPaymentId(null);
            }
          },
        },
      ],
    );
  }

  function handleApproveDeleteRequest(row: MembershipDeleteRequestRow) {
    Alert.alert('Aprobar eliminacion definitiva', 'Esto eliminara la membresia y sus pagos relacionados. No elimina la cuenta de login.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Aprobar eliminacion',
        style: 'destructive',
        onPress: async () => {
          setSavingPaymentId(row.request.membership_id);
          try {
            await approveMembershipDeleteRequest(row);
            await loadAdminMembershipPanel();
          } catch (error) {
            Alert.alert('No se pudo aprobar', error instanceof Error ? error.message : 'Intenta de nuevo.');
          } finally {
            setSavingPaymentId(null);
          }
        },
      },
    ]);
  }

  function handleRejectDeleteRequest(row: MembershipDeleteRequestRow) {
    Alert.alert('Rechazar eliminacion definitiva', 'Se conservara la membresia desactivada para revision manual.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Rechazar',
        onPress: async () => {
          setSavingPaymentId(row.request.membership_id);
          try {
            await rejectMembershipDeleteRequest(row);
            await loadAdminMembershipPanel();
          } catch (error) {
            Alert.alert('No se pudo rechazar', error instanceof Error ? error.message : 'Intenta de nuevo.');
          } finally {
            setSavingPaymentId(null);
          }
        },
      },
    ]);
  }

  const currentMonthLabel = useMemo(() => new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }), []);

  const adminMembershipStats = useMemo(() => {
    const active = adminRows.filter((row) => row.membership.status === 'active').length;
    const inactive = adminRows.filter((row) => isInactiveStatus(row.membership.status)).length;
    const pendingRequests = adminRows.filter((row) => row.membership.status === 'pending').length;
    const paidThisMonth = adminRows.filter(hasPaidStatus).length;
    const pendingPaymentThisMonth = adminRows.filter(hasPaymentPendingThisMonth).length;
    const expiredByDate = adminRows.filter((row) => row.membership.status === 'active' && isMembershipDateExpired(row.membership)).length;
    return { active, inactive, pendingRequests, paidThisMonth, pendingPaymentThisMonth, expiredByDate, total: adminRows.length };
  }, [adminRows]);

  const pendingRequestRows = useMemo(() => adminRows.filter((row) => row.membership.status === 'pending'), [adminRows]);

  const filteredAdminRows = useMemo(() => {
    const byFilter = filter === 'all'
      ? adminRows
      : adminRows.filter((row) => {
          if (filter === 'active') return row.membership.status === 'active';
          if (filter === 'inactive') return isInactiveStatus(row.membership.status);
          if (filter === 'pending_requests') return row.membership.status === 'pending';
          if (filter === 'paid_this_month') return hasPaidStatus(row);
          if (filter === 'payment_pending_this_month') return hasPaymentPendingThisMonth(row);
          if (filter === 'expired_by_date') return row.membership.status === 'active' && isMembershipDateExpired(row.membership);
          return true;
        });

    return byFilter.filter((row) => rowMatchesSearch(row, searchTerm));
  }, [adminRows, filter, searchTerm]);

  const sortedAdminRows = useMemo(() => getSortedRows(filteredAdminRows, sortMode, actionMemory), [filteredAdminRows, sortMode, actionMemory]);

  if (!user) {
    return (
      <KeyboardAwareScreen>
        <View style={styles.publicHero}>
          <Image source={wordmark} style={styles.wordmark} resizeMode="contain" />
          <Text style={styles.publicTitle}>Mi UCAPSA</Text>
        </View>
        <Link href="/auth/login" asChild>
          <Pressable style={styles.primaryButton}><Text style={styles.primaryButtonText}>Iniciar sesion</Text></Pressable>
        </Link>
      </KeyboardAwareScreen>
    );
  }

  if (isAdmin) {
    return (
      <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ucapsaBrand.colors.red} />}>
        <View style={styles.adminHero}>
          <View style={styles.adminHeroTop}>
            <View style={styles.heroIconBubble}><Image source={mark} style={styles.heroMark} resizeMode="contain" /></View>
            <Pressable
              style={styles.switchButton}
              onPress={() => {
                setPerspective((current) => (current === 'stats' ? 'table' : 'stats'));
                setFilterOpen(false);
                setColumnSettingsOpen(false);
              }}
            >
              <Text style={styles.switchButtonText}>{perspective === 'stats' ? 'Ver tabla' : 'Ver estadisticas'}</Text>
            </Pressable>
          </View>
          <Text style={styles.eyebrow}>Mi UCAPSA Admin</Text>
          <Text style={styles.title}>Socios y membresias</Text>
        </View>

        {loading ? <Text style={styles.muted}>Cargando socios...</Text> : null}

        {pendingRequestRows.length > 0 ? (
          <PendingRequestsPanel
            rows={pendingRequestRows}
            savingId={savingPaymentId}
            onOpen={setSelectedRow}
            onApprove={handleApproveRequest}
            onReject={handleRejectRequest}
          />
        ) : null}

        {isSuperAdmin && deleteRequests.length > 0 ? (
          <DeleteRequestsPanel
            rows={deleteRequests}
            savingId={savingPaymentId}
            onApprove={handleApproveDeleteRequest}
            onReject={handleRejectDeleteRequest}
          />
        ) : null}

        {perspective === 'stats' ? (
          <>
            <View style={styles.monthSummaryCard}>
              <Text style={styles.monthSummaryTitle}>Resumen de {currentMonthLabel}</Text>
            </View>

            <View style={styles.statsGrid}>
              <StatBubble label="Activos" value={adminMembershipStats.active} helper="Membresia activa" onPress={() => openStatsFilter('active')} />
              <StatBubble label="Inactivos" value={adminMembershipStats.inactive} helper="Cancelados o vencidos" onPress={() => openStatsFilter('inactive')} />
              <StatBubble label="Solicitudes" value={adminMembershipStats.pendingRequests} helper="Pendientes" onPress={() => openStatsFilter('pending_requests')} />
              <StatBubble label="Pagados" value={adminMembershipStats.paidThisMonth} helper="Estado pagado" onPress={() => openStatsFilter('paid_this_month')} />
              <StatBubble label="Falta pago" value={adminMembershipStats.pendingPaymentThisMonth} helper="Pendientes" onPress={() => openStatsFilter('payment_pending_this_month')} />
              <StatBubble label="Vigencia vencida" value={adminMembershipStats.expiredByDate} helper="Revisar" onPress={() => openStatsFilter('expired_by_date')} />
            </View>

            <Pressable style={styles.primaryButton} onPress={() => setPerspective('table')}>
              <Text style={styles.primaryButtonText}>Abrir tabla de socios</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.tableTopCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Tabla de socios</Text>
                <Text style={styles.sectionSubtitle}>{sortedAdminRows.length} de {adminRows.length} registros</Text>
              </View>
            </View>

            <TextInput
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Buscar nombre, correo, telefono, perro o numero..."
              style={styles.searchInput}
            />

            <View style={styles.controlRow}>
              <Pressable style={styles.controlButton} onPress={() => { setFilterOpen((current) => !current); setColumnSettingsOpen(false); }}>
                <Text style={styles.controlButtonText}>Ver: {getFilterLabel(filter)}</Text>
              </Pressable>
              <Pressable style={styles.controlButton} onPress={() => { setColumnSettingsOpen((current) => !current); setFilterOpen(false); }}>
                <Text style={styles.controlButtonText}>Columnas</Text>
              </Pressable>
            </View>

            {filterOpen ? (
              <View style={styles.dropdownMenu}>
                {adminFilterOptions.map((option) => (
                  <Pressable key={option.value} style={[styles.dropdownItem, filter === option.value && styles.dropdownItemActive]} onPress={() => { setFilter(option.value); setFilterOpen(false); }}>
                    <Text style={[styles.dropdownItemText, filter === option.value && styles.dropdownItemTextActive]}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {columnSettingsOpen ? (
              <View style={styles.columnsCard}>
                <Text style={styles.columnsTitle}>Mostrar columnas</Text>
                <Text style={styles.columnsHint}>Nombre y accion siempre se muestran.</Text>
                <View style={styles.columnsGrid}>
                  {columnOptions.map((option) => {
                    const isVisible = columns[option.key];
                    return (
                      <Pressable key={option.key} style={[styles.columnChip, isVisible && styles.columnChipActive]} onPress={() => persistColumns({ ...columns, [option.key]: !isVisible })}>
                        <Text style={[styles.columnChipText, isVisible && styles.columnChipTextActive]}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {sortedAdminRows.length === 0 && !loading ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>Sin resultados</Text>
                <Text style={styles.emptyText}>Cambia el filtro para ver otros registros.</Text>
              </View>
            ) : null}

            {sortedAdminRows.length > 0 ? (
              <View style={styles.realTableCard}>
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View style={styles.realTable}>
                    <View style={styles.realTableHeader}>
                      <TableCell text={headerLabel('Nombre', sortMode, 'name_asc', 'name_desc')} width={180} header onPress={() => persistSort(toggleSort(sortMode, 'name_asc', 'name_desc'))} />
                      <TableCell text={headerLabel('Accion', sortMode, 'action_asc', 'action_desc')} width={190} header onPress={() => persistSort(toggleSort(sortMode, 'action_asc', 'action_desc'))} />
                      {columns.email ? <TableCell text={headerLabel('Correo', sortMode, 'email_asc', 'email_desc')} width={220} header onPress={() => persistSort(toggleSort(sortMode, 'email_asc', 'email_desc'))} /> : null}
                      {columns.memberNumber ? <TableCell text={headerLabel('Numero', sortMode, 'member_number_asc', 'member_number_desc')} width={130} header onPress={() => persistSort(toggleSort(sortMode, 'member_number_asc', 'member_number_desc'))} /> : null}
                      {columns.status ? <TableCell text={headerLabel('Estado', sortMode, 'status_asc', 'status_desc')} width={125} header onPress={() => persistSort(toggleSort(sortMode, 'status_asc', 'status_desc'))} /> : null}
                      {columns.payment ? <TableCell text={headerLabel('Pago', sortMode, 'payment_asc', 'payment_desc')} width={145} header onPress={() => persistSort(toggleSort(sortMode, 'payment_asc', 'payment_desc'))} /> : null}
                      {columns.lastPayment ? <TableCell text={headerLabel('Ultimo pago', sortMode, 'last_payment_asc', 'last_payment_desc')} width={140} header onPress={() => persistSort(toggleSort(sortMode, 'last_payment_asc', 'last_payment_desc'))} /> : null}
                      {columns.validity ? <TableCell text={headerLabel('Vigencia', sortMode, 'validity_asc', 'validity_desc')} width={140} header onPress={() => persistSort(toggleSort(sortMode, 'validity_asc', 'validity_desc'))} /> : null}
                    </View>

                    {sortedAdminRows.map((row) => (
                      <View key={row.membership.id} style={styles.realTableRow}>
                        <TableCell text={getDisplayName(row.profile)} width={180} strong onPress={() => setSelectedRow(row)} />
                        <ActionCell
                          row={row}
                          actionState={getActionState(row, actionMemory)}
                          saving={savingPaymentId === row.membership.id}
                          onPaid={() => handleMarkPaid(row)}
                          onPending={() => handleMarkPending(row)}
                          onToggle={() => handleToggleAction(row)}
                        />
                        {columns.email ? <TableCell text={row.profile?.email ?? 'Sin correo'} width={220} onPress={() => setSelectedRow(row)} /> : null}
                        {columns.memberNumber ? <TableCell text={row.membership.member_number ?? 'Pendiente'} width={130} onPress={() => setSelectedRow(row)} /> : null}
                        {columns.status ? <TableCell text={getMembershipStatusLabel(row.membership.status)} width={125} onPress={() => setSelectedRow(row)} /> : null}
                        {columns.payment ? <TableCell text={getPaymentStatusLabel(row.membership.current_payment_status)} width={145} onPress={() => setSelectedRow(row)} /> : null}
                        {columns.lastPayment ? <TableCell text={formatDate(getLastPaymentDate(row))} width={140} onPress={() => setSelectedRow(row)} /> : null}
                        {columns.validity ? <TableCell text={formatDate(row.membership.end_date)} width={140} onPress={() => setSelectedRow(row)} /> : null}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            ) : null}
          </>
        )}

        <MemberDetailModal
          row={selectedRow}
          saving={selectedRow ? savingPaymentId === selectedRow.membership.id : false}
          onClose={() => setSelectedRow(null)}
          onPaid={selectedRow ? () => handleMarkPaid(selectedRow) : undefined}
          onPending={selectedRow ? () => handleMarkPending(selectedRow) : undefined}
          onSaveDetails={selectedRow ? (input) => handleSaveMembershipDetails(selectedRow, input) : undefined}
          onDeletePayment={selectedRow ? (payment) => handleDeletePayment(selectedRow, payment) : undefined}
          onDeactivate={selectedRow ? () => handleDeactivateMembership(selectedRow) : undefined}
          onReactivate={selectedRow ? () => handleReactivateMembership(selectedRow) : undefined}
          onRequestPermanentDelete={selectedRow ? () => handleRequestPermanentDelete(selectedRow) : undefined}
        />
      </KeyboardAwareScreen>
    );
  }

  const expiredByDate = isMembershipDateExpired(membership);
  const displayName = profile?.full_name || profile?.email || user.email || 'Usuario';
  const activeProgramEnrollments = programEnrollments.filter((item) => item.enrollment.status === 'active');
  const hasActiveMembership = membership?.status === 'active';
  const hasActiveProgram = activeProgramEnrollments.length > 0;
  const showMembershipRequest = !membership && !hasActiveProgram;
  const showPendingMembership = membership?.status === 'pending' && !hasActiveMembership;
  const showInactiveMembership = Boolean(membership && membership.status !== 'pending' && membership.status !== 'active' && !hasActiveProgram);

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.clientHero}>
        <View style={styles.heroIconBubble}><Image source={mark} style={styles.heroMark} resizeMode="contain" /></View>
        <Text style={styles.eyebrow}>Mi UCAPSA</Text>
        <Text style={styles.title}>Credenciales y membresia</Text>
      </View>

      {loading ? <Text style={styles.muted}>Cargando membresia...</Text> : null}

      {showMembershipRequest ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Aun no tienes membresia</Text>
          <Text style={styles.cardText}>Solicitala para que administracion revise y active tu credencial.</Text>
          <Pressable onPress={handleRequestMembership} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Solicitar membresia</Text></Pressable>
        </View>
      ) : null}

      {showPendingMembership ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Solicitud pendiente</Text>
          <Text style={styles.noticeText}>Administracion revisara tu solicitud. Cuando sea aprobada, aqui apareceran tu credencial y QR.</Text>
        </View>
      ) : null}

      {membership && showInactiveMembership ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Membresia {getMembershipStatusLabel(membership.status).toLowerCase()}</Text>
          <Text style={styles.cardText}>Tu membresia no esta aceptada, no esta reconocida o falta revision de contrato. Si necesitas reactivarla, solicita revision a administracion.</Text>
          <Pressable onPress={handleRequestMembership} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Solicitar revision</Text></Pressable>
        </View>
      ) : null}

      {membership?.status === 'active' ? (
        <>
          <Text style={styles.clientSectionTitle}>Membresia activa</Text>
          <MemberCredentialCard
            membership={membership}
            profile={profile}
            displayName={displayName}
            expiredByDate={expiredByDate}
          />
        </>
      ) : null}

      {activeProgramEnrollments.length > 0 ? (
        <>
          <Text style={styles.clientSectionTitle}>Clases activas</Text>
          {activeProgramEnrollments.map((item) => (
            <ProgramCredentialCard key={item.enrollment.id} item={item} />
          ))}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}


function PendingRequestsPanel({
  rows,
  savingId,
  onOpen,
  onApprove,
  onReject,
}: {
  rows: MembershipAdminRow[];
  savingId: string | null;
  onOpen: (row: MembershipAdminRow) => void;
  onApprove: (row: MembershipAdminRow) => void;
  onReject: (row: MembershipAdminRow) => void;
}) {
  return (
    <View style={styles.requestsPanel}>
      <View style={styles.requestsHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.requestsEyebrow}>Solicitudes pendientes</Text>
          <Text style={styles.requestsTitle}>Aceptar o rechazar socios</Text>
        </View>
        <Text style={styles.requestsCount}>{rows.length}</Text>
      </View>

      {rows.map((row) => {
        const saving = savingId === row.membership.id;
        return (
          <View key={row.membership.id} style={styles.requestCard}>
            <Pressable style={{ flex: 1 }} onPress={() => onOpen(row)}>
              <Text style={styles.requestName}>{getDisplayName(row.profile)}</Text>
              <Text style={styles.requestMeta}>{row.profile?.email ?? 'Sin correo'}</Text>
              <Text style={styles.requestMeta}>Perro: {row.profile?.dog_name || 'Sin registrar'}</Text>
            </Pressable>
            <View style={styles.requestActions}>
              <Pressable disabled={saving} style={styles.approveButton} onPress={() => onApprove(row)}>
                <Text style={styles.approveText}>{saving ? '...' : 'Aceptar'}</Text>
              </Pressable>
              <Pressable disabled={saving} style={styles.rejectButton} onPress={() => onReject(row)}>
                <Text style={styles.rejectText}>Rechazar</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}


function DeleteRequestsPanel({
  rows,
  savingId,
  onApprove,
  onReject,
}: {
  rows: MembershipDeleteRequestRow[];
  savingId: string | null;
  onApprove: (row: MembershipDeleteRequestRow) => void;
  onReject: (row: MembershipDeleteRequestRow) => void;
}) {
  return (
    <View style={styles.requestsPanel}>
      <View style={styles.requestsHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.requestsEyebrow}>Super admin</Text>
          <Text style={styles.requestsTitle}>Eliminaciones definitivas</Text>
        </View>
        <Text style={styles.requestsCount}>{rows.length}</Text>
      </View>

      {rows.map((row) => {
        const saving = savingId === row.request.membership_id;
        return (
          <View key={row.request.id} style={styles.requestCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.requestName}>{row.request.snapshot_name || getDisplayName(row.profile)}</Text>
              <Text style={styles.requestMeta}>{row.request.snapshot_email || row.profile?.email || 'Sin correo'}</Text>
              <Text style={styles.requestMeta}>Numero: {row.request.snapshot_member_number || row.membership?.member_number || 'Sin numero'}</Text>
            </View>
            <View style={styles.requestActions}>
              <Pressable disabled={saving} style={styles.rejectButton} onPress={() => onReject(row)}>
                <Text style={styles.rejectText}>Rechazar</Text>
              </Pressable>
              <Pressable disabled={saving} style={styles.approveButton} onPress={() => onApprove(row)}>
                <Text style={styles.approveText}>{saving ? '...' : 'Eliminar'}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ActionCell({ row, actionState, saving, onPaid, onPending, onToggle }: { row: MembershipAdminRow; actionState: 'open' | 'paid' | 'pending' | 'not_required'; saving: boolean; onPaid: () => void; onPending: () => void; onToggle: () => void }) {
  if (actionState === 'paid') {
    return <StatusAction label={saving ? '...' : 'Pagado'} tone="success" width={190} onPress={onToggle} disabled={saving} />;
  }

  if (actionState === 'pending') {
    return <StatusAction label={saving ? '...' : 'Pendiente de pago'} tone="warning" width={190} onPress={onToggle} disabled={saving} />;
  }

  if (actionState === 'not_required') {
    return <StatusAction label={saving ? '...' : 'No aplica'} tone="neutral" width={190} onPress={onToggle} disabled />;
  }

  return (
    <View style={[styles.tableCell, styles.actionCell, { width: 190 }]}> 
      <View style={styles.tableActionRow}>
        <Pressable disabled={saving} style={styles.tablePaidButton} onPress={onPaid}>
          <Text style={styles.tablePaidButtonText}>{saving ? '...' : 'Pagado'}</Text>
        </Pressable>
        <Pressable disabled={saving} style={styles.tablePendingButton} onPress={onPending}>
          <Text style={styles.tablePendingButtonText}>Pendiente</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StatusAction({ label, tone, width, onPress, disabled }: { label: string; tone: 'success' | 'warning' | 'neutral'; width: number; onPress: () => void; disabled?: boolean }) {
  const pillStyle = tone === 'success' ? styles.statusActionSuccess : tone === 'warning' ? styles.statusActionWarning : styles.statusActionNeutral;
  const textStyle = tone === 'success' ? styles.statusActionSuccessText : tone === 'warning' ? styles.statusActionWarningText : styles.statusActionNeutralText;

  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.tableCell, styles.actionCell, { width }]}> 
      <View style={[styles.statusActionPill, pillStyle]}>
        <Text style={[styles.statusActionText, textStyle]}>{label}</Text>
      </View>
    </Pressable>
  );
}

function TableCell({ text, width, header, strong, onPress }: { text: string; width: number; header?: boolean; strong?: boolean; onPress?: () => void }) {
  const content = (
    <Text numberOfLines={2} style={[header ? styles.tableHeaderText : styles.tableCellText, strong && styles.tableCellStrong]}>
      {text}
    </Text>
  );

  if (onPress) {
    return (
      <Pressable style={[styles.tableCell, { width }, header && styles.tableHeaderCell]} onPress={onPress}>
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.tableCell, { width }, header && styles.tableHeaderCell]}>
      {content}
    </View>
  );
}


function MemberDetailModal({
  row,
  saving,
  onClose,
  onPaid,
  onPending,
  onSaveDetails,
  onDeletePayment,
  onDeactivate,
  onReactivate,
  onRequestPermanentDelete,
}: {
  row: MembershipAdminRow | null;
  saving: boolean;
  onClose: () => void;
  onPaid?: () => void;
  onPending?: () => void;
  onSaveDetails?: (input: UpdateMembershipDetailsInput) => void;
  onDeletePayment?: (payment: Payment) => void;
  onDeactivate?: () => void;
  onReactivate?: () => void;
  onRequestPermanentDelete?: () => void;
}) {
  const [memberNumber, setMemberNumber] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<MembershipPaymentStatus>('pending');
  const [lastPaymentDate, setLastPaymentDate] = useState('');
  const [validUntilDate, setValidUntilDate] = useState('');
  const [datePickerTarget, setDatePickerTarget] = useState<'lastPayment' | 'validity' | null>(null);

  useEffect(() => {
    setMemberNumber(row?.membership.member_number ?? '');
    setPaymentStatus(row?.membership.current_payment_status ?? 'pending');
    setLastPaymentDate(row ? dateKeyFromValue(getLastPaymentDate(row)) : '');
    setValidUntilDate(dateKeyFromValue(row?.membership.end_date));
  }, [row]);

  if (!row) return null;

  function handleSave() {
    onSaveDetails?.({
      memberNumber,
      currentPaymentStatus: paymentStatus,
      lastPaymentAt: paymentStatus === 'paid' ? dateKeyToIso(lastPaymentDate || getTodayDateKey()) : null,
      endDate: dateKeyToIso(validUntilDate),
      paymentNotes: 'Datos editados desde ficha de socio.',
    });
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <KeyboardAwareScreen contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalEyebrow}>Ficha de socio</Text>
          <Text style={styles.modalTitle}>{getDisplayName(row.profile)}</Text>
          <Text style={styles.modalMuted}>{row.profile?.email ?? 'Sin correo'}</Text>

          <View style={styles.modalActionsRow}>
            <Pressable disabled={saving || !onPaid} onPress={onPaid} style={styles.modalPaidButton}>
              <Text style={styles.modalPaidText}>{saving ? 'Guardando...' : 'Marcar pagado'}</Text>
            </Pressable>
            <Pressable disabled={saving || !onPending} onPress={onPending} style={styles.modalPendingButton}>
              <Text style={styles.modalPendingText}>Marcar pendiente</Text>
            </Pressable>
          </View>

          <View style={styles.detailBox}>
            <Detail label="Nombre" value={getDisplayName(row.profile)} />
            <Detail label="Correo" value={row.profile?.email} />
            <Detail label="Telefono" value={row.profile?.phone} />
            <Detail label="Perro" value={row.profile?.dog_name} />
            <Detail label="Rol" value={row.profile?.role} />
            <Detail label="Estado" value={getMembershipStatusLabel(row.membership.status)} />
            <Detail label="Inicio" value={formatDate(row.membership.start_date)} />
            <Detail label="Token QR" value={row.membership.qr_token} />
          </View>

          <View style={styles.editorBox}>
            <Text style={styles.paymentHistoryTitle}>Editar membresia</Text>
            <Text style={styles.detailLabel}>Numero de socio</Text>
            <TextInput value={memberNumber} onChangeText={setMemberNumber} placeholder="Numero de socio" style={styles.modalInput} />

            <Text style={styles.detailLabel}>Estado de pago</Text>
            <PaymentStatusSelector value={paymentStatus} onChange={setPaymentStatus} />

            <Text style={styles.detailLabel}>Ultimo pago</Text>
            <Pressable style={styles.dateButton} onPress={() => setDatePickerTarget('lastPayment')}>
              <Text style={styles.dateButtonText}>{lastPaymentDate || 'Sin fecha'}</Text>
              <Text style={styles.dateButtonIcon}>cal</Text>
            </Pressable>

            <Text style={styles.detailLabel}>Vigencia</Text>
            <View style={styles.dateChoiceRow}>
              <Pressable style={[styles.dateButton, { flex: 1 }]} onPress={() => setDatePickerTarget('validity')}>
                <Text style={styles.dateButtonText}>{validUntilDate || 'Sin fecha de vigencia'}</Text>
                <Text style={styles.dateButtonIcon}>cal</Text>
              </Pressable>
              <Pressable style={styles.noDateButton} onPress={() => setValidUntilDate('')}>
                <Text style={styles.noDateButtonText}>Sin fecha</Text>
              </Pressable>
            </View>

            <Pressable disabled={saving || !onSaveDetails} onPress={handleSave} style={styles.modalPaidButton}>
              <Text style={styles.modalPaidText}>{saving ? 'Guardando...' : 'Guardar cambios de socio'}</Text>
            </Pressable>
          </View>

          <View style={styles.dangerBox}>
            <Text style={styles.paymentHistoryTitle}>Estado de la membresia</Text>
            {row.membership.status === 'active' ? (
              <Pressable disabled={saving || !onDeactivate} onPress={onDeactivate} style={styles.dangerOutlineButton}>
                <Text style={styles.dangerOutlineText}>Desactivar socio</Text>
              </Pressable>
            ) : (
              <Pressable disabled={saving || !onReactivate} onPress={onReactivate} style={styles.modalPaidButton}>
                <Text style={styles.modalPaidText}>Reactivar socio</Text>
              </Pressable>
            )}
            <Pressable disabled={saving || !onRequestPermanentDelete} onPress={onRequestPermanentDelete} style={styles.dangerSolidButton}>
              <Text style={styles.dangerSolidText}>Solicitar eliminacion definitiva</Text>
            </Pressable>
          </View>

          <Text style={styles.paymentHistoryTitle}>Historial de pagos</Text>
          {row.payments.length === 0 ? (
            <View style={styles.paymentRow}><Text style={styles.paymentText}>Sin pagos registrados.</Text></View>
          ) : (
            row.payments.map((payment: Payment) => (
              <View key={payment.id} style={styles.paymentRow}>
                <Text style={styles.paymentTitle}>{payment.period_label || payment.concept}</Text>
                <Text style={styles.paymentText}>Fecha: {formatDate(payment.paid_at)}</Text>
                <Text style={styles.paymentText}>Monto: ${payment.amount}</Text>
                <Text style={styles.paymentText}>Nota: {payment.notes || 'Sin nota'}</Text>
                <Pressable disabled={saving || !onDeletePayment} onPress={() => onDeletePayment?.(payment)} style={styles.deletePaymentButton}>
                  <Text style={styles.deletePaymentText}>Eliminar pago</Text>
                </Pressable>
              </View>
            ))
          )}

          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Cerrar</Text>
          </Pressable>

          <DatePickerModal
            visible={Boolean(datePickerTarget)}
            value={datePickerTarget === 'lastPayment' ? lastPaymentDate : validUntilDate}
            onSelect={(value) => {
              if (datePickerTarget === 'lastPayment') setLastPaymentDate(value);
              if (datePickerTarget === 'validity') setValidUntilDate(value);
              setDatePickerTarget(null);
            }}
            onClose={() => setDatePickerTarget(null)}
          />
        </KeyboardAwareScreen>
      </View>
    </Modal>
  );
}

function PaymentStatusSelector({ value, onChange }: { value: MembershipPaymentStatus; onChange: (value: MembershipPaymentStatus) => void }) {
  const options: Array<{ value: MembershipPaymentStatus; label: string }> = [
    { value: 'pending', label: 'Pendiente' },
    { value: 'paid', label: 'Pagado' },
    { value: 'not_required', label: 'No aplica' },
  ];

  return (
    <View style={styles.statusSelectorRow}>
      {options.map((option) => (
        <Pressable key={option.value} onPress={() => onChange(option.value)} style={[styles.statusSelector, value === option.value && styles.statusSelectorActive]}>
          <Text style={[styles.statusSelectorText, value === option.value && styles.statusSelectorTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function DatePickerModal({ visible, value, onSelect, onClose }: { visible: boolean; value: string; onSelect: (value: string) => void; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.dateModalBackdrop}>
        <View style={styles.dateModalCard}>
          <Text style={styles.dateModalTitle}>Seleccionar fecha</Text>
          <Calendar
            current={value || getTodayDateKey()}
            markedDates={value ? { [value]: { selected: true, selectedColor: ucapsaBrand.colors.red } } : {}}
            onDayPress={(day) => onSelect(day.dateString)}
            theme={{ todayTextColor: ucapsaBrand.colors.red, arrowColor: ucapsaBrand.colors.red }}
          />
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function StatBubble({ label, value, helper, onPress }: { label: string; value: number; helper: string; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.statBubble, onPress && styles.statBubblePressable, pressed && styles.statBubblePressed]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statHelper}>{helper}</Text>
    </Pressable>
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

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>{value || 'Sin dato'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  publicHero: { backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 30, padding: 22, gap: 8 },
  wordmark: { width: 180, height: 42, marginBottom: 6 },
  publicTitle: { color: ucapsaBrand.colors.text, fontSize: 30, fontWeight: '900' },
  adminHero: { backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 30, padding: 20 },
  adminHeroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  clientHero: { backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 30, padding: 20, gap: 8 },
  heroIconBubble: { width: 46, height: 46, borderRadius: 23, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  heroMark: { width: 26, height: 26 },
  eyebrow: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 29, fontWeight: '900', marginTop: 4 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 18 },
  switchButton: { backgroundColor: ucapsaBrand.colors.redSoft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  switchButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  monthSummaryCard: { backgroundColor: ucapsaBrand.colors.surfaceAlt, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 24, padding: 16, marginBottom: 14 },
  monthSummaryTitle: { color: ucapsaBrand.colors.redDark, fontSize: 17, fontWeight: '900' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBubble: { width: '48%', backgroundColor: '#fff', borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 14 },
  statBubblePressable: { borderColor: ucapsaBrand.colors.redSoft },
  statBubblePressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  statValue: { color: ucapsaBrand.colors.red, fontSize: 28, fontWeight: '900' },
  statLabel: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900', marginTop: 4 },
  statHelper: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },

  requestsPanel: { gap: 12, padding: 16, borderRadius: 24, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  requestsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  requestsEyebrow: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  requestsTitle: { color: ucapsaBrand.colors.text, fontSize: 19, fontWeight: '900', marginTop: 2 },
  requestsCount: { overflow: 'hidden', color: ucapsaBrand.colors.redDark, backgroundColor: ucapsaBrand.colors.redSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, fontWeight: '900' },
  requestCard: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 18, backgroundColor: ucapsaBrand.colors.surfaceAlt, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  requestName: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  requestMeta: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '700', marginTop: 3 },
  requestActions: { gap: 8, minWidth: 92 },
  approveButton: { alignItems: 'center', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: ucapsaBrand.colors.red },
  approveText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  rejectButton: { alignItems: 'center', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  rejectText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  tableTopCard: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'space-between' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 22, fontWeight: '900' },
  clientSectionTitle: { color: ucapsaBrand.colors.text, fontSize: 19, fontWeight: '900', marginTop: 8, marginBottom: 8 },
  sectionSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  controlRow: { flexDirection: 'row', gap: 8 },
  controlButton: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 12, alignItems: 'center' },
  controlButtonText: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  dropdownMenu: { overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff' },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F6E6E9' },
  dropdownItemActive: { backgroundColor: ucapsaBrand.colors.redSoft },
  dropdownItemText: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '800' },
  dropdownItemTextActive: { color: ucapsaBrand.colors.redDark, fontWeight: '900' },
  columnsCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 22, padding: 14, gap: 8 },
  columnsTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  columnsHint: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '700' },
  columnsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  columnChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  columnChipActive: { backgroundColor: ucapsaBrand.colors.redSoft, borderColor: ucapsaBrand.colors.redSoft },
  columnChipText: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800' },
  columnChipTextActive: { color: ucapsaBrand.colors.redDark, fontWeight: '900' },
  realTableCard: { overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 22 },
  realTable: { backgroundColor: '#fff' },
  realTableHeader: { flexDirection: 'row', backgroundColor: ucapsaBrand.colors.redDark },
  realTableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F6E6E9', backgroundColor: '#fff' },
  tableCell: { minHeight: 58, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRightWidth: 1, borderRightColor: '#F6E6E9' },
  tableHeaderCell: { minHeight: 46, borderRightColor: '#B65263' },
  tableHeaderText: { color: '#fff', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  tableCellText: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '700' },
  tableCellStrong: { fontWeight: '900' },
  actionCell: { alignItems: 'center' },
  tableActionRow: { flexDirection: 'row', gap: 8 },
  tablePaidButton: { borderRadius: 12, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 11, paddingVertical: 9 },
  tablePaidButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  tablePendingButton: { borderRadius: 12, backgroundColor: ucapsaBrand.colors.surfaceAlt, borderWidth: 1, borderColor: ucapsaBrand.colors.border, paddingHorizontal: 10, paddingVertical: 8 },
  tablePendingButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  statusActionPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  statusActionSuccess: { backgroundColor: '#E8F5EE' },
  statusActionWarning: { backgroundColor: '#FFF5E6' },
  statusActionNeutral: { backgroundColor: '#F1F5F9' },
  statusActionText: { fontSize: 12, fontWeight: '900' },
  statusActionSuccessText: { color: ucapsaBrand.colors.success },
  statusActionWarningText: { color: ucapsaBrand.colors.warning },
  statusActionNeutralText: { color: '#334155' },
  emptyBox: { gap: 6, padding: 18, borderRadius: 22, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  emptyText: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 26, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 18, marginBottom: 16 },
  cardTitle: { color: ucapsaBrand.colors.text, fontSize: 20, fontWeight: '900', marginBottom: 8 },
  cardText: { color: ucapsaBrand.colors.muted, fontSize: 15, lineHeight: 22 },
  noticeCard: { backgroundColor: ucapsaBrand.colors.surfaceAlt, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 22, padding: 16, marginBottom: 16 },
  noticeTitle: { color: ucapsaBrand.colors.redDark, fontSize: 16, fontWeight: '900' },
  noticeText: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  primaryButton: { backgroundColor: ucapsaBrand.colors.red, borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  primaryButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  credentialCard: { backgroundColor: '#fff', borderRadius: 30, padding: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  credentialHeader: { flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 18 },
  avatar: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '900' },
  credentialEyebrow: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  credentialName: { color: ucapsaBrand.colors.text, fontSize: 22, fontWeight: '900', marginTop: 2 },
  credentialDog: { color: ucapsaBrand.colors.muted, fontSize: 14, marginTop: 4, fontWeight: '700' },
  infoGrid: { gap: 10 },
  infoItem: { backgroundColor: ucapsaBrand.colors.surfaceAlt, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  infoLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  infoValue: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900', marginTop: 4 },
  warningBox: { backgroundColor: '#FFF6ED', borderColor: '#F5D0A5', borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 14 },
  warningText: { color: '#9A4E00', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  qrPanel: { alignItems: 'center', marginTop: 20, paddingTop: 18, borderTopWidth: 1, borderTopColor: '#F4E3E7' },
  qrTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900', marginTop: 12 },
  qrSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(37, 21, 26, 0.35)' },
  modalContent: { backgroundColor: ucapsaBrand.colors.background, marginTop: 40, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 40 },
  modalEyebrow: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900', marginTop: 4 },
  modalMuted: { color: ucapsaBrand.colors.muted, fontSize: 14, marginTop: 4, marginBottom: 14 },
  modalActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  modalPaidButton: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 16, backgroundColor: ucapsaBrand.colors.red },
  modalPaidText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  modalPendingButton: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  modalPendingText: { color: ucapsaBrand.colors.redDark, fontSize: 14, fontWeight: '900' },
  detailBox: { backgroundColor: '#fff', borderRadius: 22, padding: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginBottom: 14 },
  detailRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F7E6EA' },
  detailLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  detailValue: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '700', marginTop: 3 },
  paymentHistoryTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 8 },
  paymentRow: { backgroundColor: '#fff', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginBottom: 8 },
  paymentTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  paymentText: { color: ucapsaBrand.colors.muted, fontSize: 13, marginTop: 3 },
  closeButton: { backgroundColor: ucapsaBrand.colors.text, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  closeButtonText: { color: '#fff', fontWeight: '900' },

  searchInput: { minHeight: 48, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '700' },
  editorBox: { backgroundColor: '#fff', borderRadius: 22, padding: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginBottom: 14, gap: 10 },
  modalInput: { minHeight: 46, paddingHorizontal: 12, borderRadius: 14, backgroundColor: ucapsaBrand.colors.surfaceAlt, borderWidth: 1, borderColor: ucapsaBrand.colors.border, color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '700' },
  statusSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusSelector: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  statusSelectorActive: { backgroundColor: ucapsaBrand.colors.redSoft, borderColor: ucapsaBrand.colors.red },
  statusSelectorText: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '900' },
  statusSelectorTextActive: { color: ucapsaBrand.colors.redDark },
  dateButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderRadius: 14, backgroundColor: ucapsaBrand.colors.surfaceAlt, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  dateChoiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noDateButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  noDateButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  dateButtonText: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  dateButtonIcon: { fontSize: 18 },
  dangerBox: { backgroundColor: '#FFF6F7', borderRadius: 22, padding: 14, borderWidth: 1, borderColor: '#F3B8C2', marginBottom: 14, gap: 10 },
  dangerOutlineButton: { alignItems: 'center', paddingVertical: 13, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.red },
  dangerOutlineText: { color: ucapsaBrand.colors.redDark, fontSize: 14, fontWeight: '900' },
  dangerSolidButton: { alignItems: 'center', paddingVertical: 13, borderRadius: 16, backgroundColor: ucapsaBrand.colors.redDark },
  dangerSolidText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  deletePaymentButton: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: '#FFF0F2', borderWidth: 1, borderColor: '#F3B8C2' },
  deletePaymentText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  dateModalBackdrop: { flex: 1, backgroundColor: 'rgba(37, 21, 26, 0.45)', justifyContent: 'center', padding: 18 },
  dateModalCard: { backgroundColor: '#fff', borderRadius: 24, padding: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  dateModalTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 10 },
});





