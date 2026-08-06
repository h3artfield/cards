export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function formatEventTimeRange(
  startAt: string,
  endAt: string,
  allDay?: boolean,
  timeZone?: string,
): string {
  if (allDay) return "All day";
  const start = new Date(startAt);
  const end = new Date(endAt);
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  };
  return `${start.toLocaleTimeString(undefined, opts).toLowerCase()} - ${end.toLocaleTimeString(undefined, opts).toLowerCase()}`;
}

/** Sunday-start grid covering full weeks for the month. */
export function calendarGridDays(month: Date): Date[] {
  const first = startOfMonth(month);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

export function monthQueryRange(month: Date): { from: string; to: string } {
  const from = startOfMonth(month);
  const to = addMonths(from, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** `YYYY-MM` → ISO range for that calendar month. */
export function monthRangeIso(monthKey: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  const from = new Date(year, monthIndex, 1);
  const to = new Date(year, monthIndex + 1, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function eventOverlapsDay(
  event: { startAt: string; endAt: string },
  day: Date,
): boolean {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return start < dayEnd && end >= dayStart;
}
