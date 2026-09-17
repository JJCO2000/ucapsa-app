import type { PaymentObligationWithBalance } from '../types/app.types';

const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function money(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(value);
}

export function paymentDateLabel(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, '0')} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

export function obligationStatusLabel(item: PaymentObligationWithBalance) {
  if (item.display_status === 'paid') return 'Pagado';
  if (item.display_status === 'partial') return 'Parcial';
  if (item.display_status === 'overdue') return 'Vencido';
  if (item.display_status === 'future') return 'Futuro';
  return 'Pendiente';
}
