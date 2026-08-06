/**
 * Calendar-day helpers.
 *
 * Workouts and measurements are keyed by a `YYYY-MM-DD` string in the user's
 * own timezone, not by an instant. A 9pm workout logged in Europe/Berlin must
 * land on that day's calendar square regardless of where the server is, and it
 * must stay there forever — which an instant plus a later timezone change would
 * not guarantee.
 */

export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
	if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
	const [y, m, d] = value.split('-').map(Number);
	if (m < 1 || m > 12 || d < 1) return false;
	return d <= daysInMonth(y, m);
}

export function daysInMonth(year: number, month1: number): number {
	return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Today's calendar date in the given IANA timezone. */
export function todayIn(timezone: string, now: Date = new Date()): IsoDate {
	return toIsoDateIn(now, timezone);
}

export function toIsoDateIn(instant: Date, timezone: string): IsoDate {
	// en-CA formats as YYYY-MM-DD, which saves reassembling the parts by hand.
	try {
		return new Intl.DateTimeFormat('en-CA', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).format(instant);
	} catch {
		// An unknown timezone should not take the page down; fall back to UTC.
		return instant.toISOString().slice(0, 10);
	}
}

export function isValidTimezone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

/**
 * Parse `YYYY-MM-DD` into a Date at UTC midnight. Only ever use the result for
 * date arithmetic and formatting with `timeZone: 'UTC'` — it is a calendar day,
 * not a moment.
 */
export function parseIsoDate(date: IsoDate): Date {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d));
}

export function formatIsoDate(date: Date): IsoDate {
	return date.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
	const d = parseIsoDate(date);
	d.setUTCDate(d.getUTCDate() + days);
	return formatIsoDate(d);
}

export function addMonths(date: IsoDate, months: number): IsoDate {
	const d = parseIsoDate(date);
	const targetMonth = d.getUTCMonth() + months;
	const year = d.getUTCFullYear() + Math.floor(targetMonth / 12);
	const month = ((targetMonth % 12) + 12) % 12;
	// Clamp so that adding a month to the 31st does not roll into the next one.
	const day = Math.min(d.getUTCDate(), daysInMonth(year, month + 1));
	return formatIsoDate(new Date(Date.UTC(year, month, day)));
}

/** Whole days from `a` to `b`; negative when `b` precedes `a`. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
	return Math.round((parseIsoDate(b).getTime() - parseIsoDate(a).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: IsoDate): number {
	return parseIsoDate(date).getUTCDay();
}

export function startOfWeek(date: IsoDate, weekStartsOn: number): IsoDate {
	const diff = (dayOfWeek(date) - weekStartsOn + 7) % 7;
	return addDays(date, -diff);
}

export function startOfMonth(date: IsoDate): IsoDate {
	return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: IsoDate): IsoDate {
	const [y, m] = date.split('-').map(Number);
	return `${date.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
}

/**
 * The 6×7 grid a month calendar renders, padded with the surrounding days so
 * every month occupies the same height and the layout never jumps.
 */
export function monthGrid(month: IsoDate, weekStartsOn: number): IsoDate[] {
	const first = startOfWeek(startOfMonth(month), weekStartsOn);
	return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

// --- display --------------------------------------------------------------

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const key = JSON.stringify(options);
	let fmt = cache.get(key);
	if (!fmt) {
		fmt = new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' });
		cache.set(key, fmt);
	}
	return fmt;
}

export function formatDateLong(date: IsoDate): string {
	return formatter({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
		parseIsoDate(date)
	);
}

export function formatDateMedium(date: IsoDate): string {
	return formatter({ day: 'numeric', month: 'short', year: 'numeric' }).format(parseIsoDate(date));
}

export function formatMonthYear(date: IsoDate): string {
	return formatter({ month: 'long', year: 'numeric' }).format(parseIsoDate(date));
}

export function weekdayNames(weekStartsOn: number): string[] {
	const fmt = formatter({ weekday: 'short' });
	// 2024-01-07 is a Sunday, so offsetting from it gives any week start.
	return Array.from({ length: 7 }, (_, i) =>
		fmt.format(parseIsoDate(addDays('2024-01-07', (weekStartsOn + i) % 7)))
	);
}

/** "Today", "Yesterday", or a medium date — used in workout lists. */
export function formatRelativeDay(date: IsoDate, today: IsoDate): string {
	const diff = daysBetween(date, today);
	if (diff === 0) return 'Today';
	if (diff === 1) return 'Yesterday';
	if (diff === -1) return 'Tomorrow';
	return formatDateMedium(date);
}

/** Whole years between a date of birth and today, or null if unknown. */
export function ageFrom(dateOfBirth: IsoDate | null | undefined, today: IsoDate): number | null {
	if (!dateOfBirth || !isIsoDate(dateOfBirth)) return null;
	const [by, bm, bd] = dateOfBirth.split('-').map(Number);
	const [ty, tm, td] = today.split('-').map(Number);
	let age = ty - by;
	if (tm < bm || (tm === bm && td < bd)) age -= 1;
	return age >= 0 ? age : null;
}
