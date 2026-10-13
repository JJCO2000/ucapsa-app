/**
 * Orden operativo para solicitudes de entrenamiento.
 * Primero nuevas (sin respuesta), después seguimiento.
 * Dentro de cada etapa, las más antiguas requieren atención antes.
 */
export type ProgramInterestAttentionRow = {
  id: string;
  status: 'pending' | 'contacted' | 'closed';
  created_at: string;
};

const STATUS_RANK: Record<ProgramInterestAttentionRow['status'], number> = {
  pending: 0,
  contacted: 1,
  closed: 2,
};

export function sortProgramInterestsByAttention<T extends ProgramInterestAttentionRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) =>
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    a.created_at.localeCompare(b.created_at) ||
    a.id.localeCompare(b.id),
  );
}
