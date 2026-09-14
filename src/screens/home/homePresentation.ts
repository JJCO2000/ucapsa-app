import { Alert, Linking } from 'react-native';

import { getProgramLevelLabel } from '../../services/programs.service';
import type {
  CustomerValuePrimaryNextAction,
  CustomerValueSnapshot,
} from '../../services/customer-value.service';
import type { Announcement } from '../../types/app.types';

const GUEST_WHATSAPP_MESSAGE = 'Hola UCAPSA, vi la app y quiero saber que programa recomiendan para mi perro.';
const GUEST_WHATSAPP_URL = `https://wa.me/525522410679?text=${encodeURIComponent(GUEST_WHATSAPP_MESSAGE)}`;
const RECENT_ACHIEVEMENT_DAYS = 14;

export type NextPresentation = {
  eyebrow: string;
  title: string;
  detail: string;
  icon: 'account-balance-wallet' | 'school' | 'event' | 'workspace-premium';
};

export function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || value;
}

export function formatDate(value: string | null | undefined, includeYear = false) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    ...(includeYear ? { year: 'numeric' as const } : {}),
  });
}

function money(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value);
}

export function programTitle(program: CustomerValueSnapshot['whatIHave']['programs'][number]) {
  if (program.programCode === 'comandos') return `Comandos ${getProgramLevelLabel(program.programLevel)}`;
  return program.programName;
}

export function nextPresentation(
  snapshot: CustomerValueSnapshot,
  action: Exclude<CustomerValuePrimaryNextAction, null>,
): NextPresentation {
  if (action.kind === 'payment') {
    if (action.source === 'legacy_membership') {
      return {
        eyebrow: 'NECESITA TU ATENCIÓN',
        title: 'Revisa tus pagos',
        detail: 'Hay un pago pendiente de revisión.',
        icon: 'account-balance-wallet',
      };
    }
    const amount = action.remainingAmount == null ? null : money(action.remainingAmount);
    const date = formatDate(action.dueDate);
    return {
      eyebrow: action.status === 'overdue' ? 'VENCIDO' : 'PAGO PENDIENTE',
      title: action.status === 'overdue' ? 'Tienes un pago vencido' : 'Revisa tu próximo pago',
      detail: [amount, date].filter(Boolean).join(' · ') || 'Abre Pagos para revisar el detalle.',
      icon: 'account-balance-wallet',
    };
  }

  if (action.kind === 'class') {
    const title = action.programCode === 'comandos'
      ? `Comandos ${getProgramLevelLabel(action.programLevel)}`
      : action.programName;
    return {
      eyebrow: 'PRÓXIMA CLASE',
      title,
      detail: [action.dogName, formatDate(action.dateKey), action.startTime].filter(Boolean).join(' · '),
      icon: 'school',
    };
  }

  if (action.kind === 'event') {
    return {
      eyebrow: 'PRÓXIMO EVENTO',
      title: action.title,
      detail: [formatDate(action.startDate), action.location].filter(Boolean).join(' · ') || 'Consulta el calendario UCAPSA.',
      icon: 'event',
    };
  }

  const membership = snapshot.whatIHave.membership;
  if (action.status === 'pending') {
    return {
      eyebrow: 'MEMBRESÍA',
      title: 'Solicitud en revisión',
      detail: 'UCAPSA está revisando tu solicitud.',
      icon: 'workspace-premium',
    };
  }

  if (membership?.status === 'active' && !membership.isValidToday) {
    const today = new Date().toISOString().slice(0, 10);
    const start = membership.startDate?.slice(0, 10) ?? null;
    const end = membership.endDate?.slice(0, 10) ?? null;
    if (end && end < today) {
      return {
        eyebrow: 'MEMBRESÍA',
        title: 'Revisa tu renovación',
        detail: `Venció el ${formatDate(membership.endDate, true) ?? end}.`,
        icon: 'workspace-premium',
      };
    }
    if (start && start > today) {
      return {
        eyebrow: 'MEMBRESÍA',
        title: 'Tu membresía está programada',
        detail: `Inicia el ${formatDate(membership.startDate, true) ?? start}.`,
        icon: 'workspace-premium',
      };
    }
  }

  return {
    eyebrow: 'MEMBRESÍA',
    title: 'Revisa tu membresía',
    detail: action.endDate ? `Vigencia: ${formatDate(action.endDate, true) ?? action.endDate}` : 'Consulta su estado actual.',
    icon: 'workspace-premium',
  };
}

export function newestRecentAchievement(snapshot: CustomerValueSnapshot | null) {
  if (!snapshot) return null;
  const now = Date.now();
  const maxAge = RECENT_ACHIEVEMENT_DAYS * 24 * 60 * 60 * 1000;
  const sorted = [...snapshot.whatIAchieved.achievements]
    .filter((item) => item.awardedAt)
    .sort((a, b) => b.awardedAt.localeCompare(a.awardedAt));
  const first = sorted[0] ?? null;
  if (!first) return null;
  const time = new Date(first.awardedAt).getTime();
  if (!Number.isFinite(time) || now - time > maxAge) return null;
  return first;
}

export function isImportantNotice(announcement: Announcement | null) {
  if (!announcement) return false;
  return announcement.is_pinned || announcement.priority === 'urgent' || announcement.priority === 'high';
}

export async function openGuestWhatsApp() {
  try {
    await Linking.openURL(GUEST_WHATSAPP_URL);
  } catch {
    Alert.alert('No se pudo abrir WhatsApp', 'Revisa tu conexión e intenta de nuevo.');
  }
}
