/**
 * Visible calendar month is the only source of the class expansion window.
 * A fixed "today +/- N days" horizon silently paints future months grey even
 * though a recurring schedule may exist. Keep the selected agenda day in scope
 * when the user swipes to another month without selecting a new date.
 */
export function calendarMonthDateKeys(monthKey: string, selectedDate: string): string[] {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthKey);
  if (!match) return [];
  const year = Number(match[1]);
  const month = Number(match[2]);
  const first = new Date(year, month - 1, 1, 12, 0, 0, 0);
  const last = new Date(year, month, 0, 12, 0, 0, 0);
  const start = new Date(first);
  const end = new Date(last);
  // React Native Calendars can show neighboring-month date cells.
  start.setDate(start.getDate() - 7);
  end.setDate(end.getDate() + 7);
  const keys: string[] = [];
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    keys.push([
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-'));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(selectedDate) && !keys.includes(selectedDate)) {
    keys.push(selectedDate);
  }
  return keys;
}
