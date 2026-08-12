/**
 * Wall-clock time helpers for the office timezone (default WIB = UTC+7).
 *
 * The bot stores WIB wall-clock strings ('YYYY-MM-DD', 'HH:mm') so the board
 * reads naturally and the cron can compare against "now in WIB" regardless of
 * the Worker runtime's own timezone (which is UTC).
 */

/** WIB offset from UTC in minutes (UTC+7). */
export const WIB_OFFSET_MIN = 420;

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

/**
 * Returns a Date whose UTC fields represent the wall-clock time at the given
 * offset. Read it via getUTC* methods. This lets us avoid depending on the
 * runtime's local timezone entirely.
 */
export function shiftedNow(now: Date = new Date(), offsetMin: number = WIB_OFFSET_MIN): Date {
	return new Date(now.getTime() + offsetMin * 60_000);
}

/** 'YYYY-MM-DD' at the given offset. */
export function dateLocalString(
	now: Date = new Date(),
	offsetMin: number = WIB_OFFSET_MIN,
): string {
	const d = shiftedNow(now, offsetMin);
	return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** 'HH:mm' at the given offset. */
export function timeLocalString(
	now: Date = new Date(),
	offsetMin: number = WIB_OFFSET_MIN,
): string {
	const d = shiftedNow(now, offsetMin);
	return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

// Accepts both colon ('12:30') and dot ('12.30') — dot is the common Indonesian style.
const HHMM_RE = /^(\d{1,2})[:.](\d{2})$/;

/** Parse 'HH:mm' or 'HH.mm' into { hours, minutes }, or null on invalid input. */
export function parseHHmm(input: string): { hours: number; minutes: number } | null {
	const m = input.trim().match(HHMM_RE);
	if (!m) return null;
	const h = Number(m[1]);
	const min = Number(m[2]);
	if (h > 23 || min > 59) return null;
	return { hours: h, minutes: min };
}

/** Normalize '12.30' or '12:30' → '12:30'. Returns null on invalid input. */
export function normalizeHHmm(input: string): string | null {
	const p = parseHHmm(input);
	return p ? `${pad2(p.hours)}:${pad2(p.minutes)}` : null;
}

/** Minutes since midnight for an 'HH:mm'/'HH.mm' string. NaN on bad input. */
export function minutesSinceMidnight(hhmm: string): number {
	const p = parseHHmm(hhmm);
	return p ? p.hours * 60 + p.minutes : Number.NaN;
}

/** Validates an 'HH:mm'/'HH.mm' string. */
export function isValidHHmm(hhmm: string): boolean {
	return parseHHmm(hhmm) !== null;
}

/**
 * Minutes from `fromHHmm` to `toHHmm` within the same day. Can be negative if
 * `toHHmm` is earlier than `fromHHmm`. Returns NaN on bad input.
 */
export function minutesBetween(fromHHmm: string, toHHmm: string): number {
	return minutesSinceMidnight(toHHmm) - minutesSinceMidnight(fromHHmm);
}

/** The set of quick-pick leave times offered in the propose flow. */
export const QUICK_LEAVE_TIMES = ["11:45", "12:00", "12:15", "12:30", "12:45"];

const WEEKDAYS_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTHS_ID = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"Mei",
	"Jun",
	"Jul",
	"Agu",
	"Sep",
	"Okt",
	"Nov",
	"Des",
];

/**
 * Pretty-print a 'YYYY-MM-DD' date as 'Sen, 12 Agu' (Indonesian).
 * Parses as UTC midnight so the weekday is independent of the runtime tz.
 */
export function formatHumanDate(dateLocal: string): string {
	const d = new Date(`${dateLocal}T00:00:00Z`);
	if (Number.isNaN(d.getTime())) return dateLocal;
	const dow = WEEKDAYS_ID[d.getUTCDay()];
	if (!dow) return dateLocal;
	const mon = MONTHS_ID[d.getUTCMonth()];
	if (!mon) return dateLocal;
	return `${dow}, ${d.getUTCDate()} ${mon}`;
}

/**
 * Parse the args of "/usul <name> [time]" → { name, leave }.
 * Accepts colon or dot in the time ('12:30' / '12.30'); normalizes to 'HH:mm'.
 * If the last token isn't a time, the whole input is the name and `leave`
 * falls back to defaultTime.
 */
export function parseProposeArgs(
	raw: string,
	defaultTime: string,
): { name: string; leave: string } {
	const trimmed = raw.trim();
	if (!trimmed) return { name: "", leave: defaultTime };
	const tokens = trimmed.split(/\s+/);
	const last = tokens[tokens.length - 1] ?? "";
	if (tokens.length > 1) {
		const norm = normalizeHHmm(last);
		if (norm) {
			return { name: tokens.slice(0, -1).join(" "), leave: norm };
		}
	}
	return { name: trimmed, leave: defaultTime };
}
