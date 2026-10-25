export const NOTICE_DELIVERY_METHODS = [
  'presencial', 'correo_entregado', 'otro_documentado',
] as const;
export type NoticeDeliveryMethod = typeof NOTICE_DELIVERY_METHODS[number];
export function requireNoticeDeliveryMethod(value: NoticeDeliveryMethod | null | undefined, label: string): NoticeDeliveryMethod {
  if (!NOTICE_DELIVERY_METHODS.some((item) => item === value)) {
    throw new Error('Confirma cómo se entregó el aviso vigente a ' + label + '.');
  }
  return value!;
}
