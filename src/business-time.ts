const BUSINESS_TIME_ZONE = 'Africa/Nairobi';

function dateParts(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

/** Calendar date for a timestamp in the business timezone (Kenya). */
export function businessDate(date: Date): string {
  const parts = dateParts(date);
  return parts.year + '-' + parts.month + '-' + parts.day;
}

/** Add calendar days to an ISO date without inheriting the device timezone. */
export function addBusinessDays(source: string, amount: number): string {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(source) || !Number.isInteger(amount)) {
    throw new Error('A valid ISO date and whole-day offset are required.');
  }
  const date = new Date(source + 'T12:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** Format a date-only business record without shifting its calendar day. */
export function formatBusinessDate(value: string): string {
  return formatBusinessDay(value, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatBusinessDay(value: string, options: Intl.DateTimeFormatOptions): string {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return '—';
  const date = new Date(value + 'T12:00:00.000Z');
  return new Intl.DateTimeFormat('en-KE', { ...options, timeZone: 'UTC' }).format(date);
}

/** Format timestamps for staff and managers in the business timezone. */
export function formatBusinessDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-KE', {
    timeZone: BUSINESS_TIME_ZONE, day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}
