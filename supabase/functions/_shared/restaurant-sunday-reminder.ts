/**
 * Mexico-local date keys are passed from the existing reminder scheduler.
 * Pure policy: one Saturday reminder for Sunday's published menu,
 * never a separate push campaign.
 */
export function isSaturdayForSundayMenu(
  mexicoTodayKey: string,
  classDateKey: string,
  reminderType: string,
  daysAhead: number,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mexicoTodayKey) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(classDateKey) ||
    reminderType !== 'class_24h' || daysAhead !== 1) return false;

  const [y, m, d] = mexicoTodayKey.split('-').map(Number);
  const today = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (Number.isNaN(today.getTime()) ||
    today.toISOString().slice(0, 10) !== mexicoTodayKey ||
    today.getUTCDay() !== 6) return false;

  const sunday = new Date(today);
  sunday.setUTCDate(sunday.getUTCDate() + 1);
  return sunday.toISOString().slice(0, 10) === classDateKey;
}
