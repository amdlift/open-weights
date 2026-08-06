import type { UnitSystem } from '$lib/constants';
import { parseDuration, parseOptionalNumber, toKg, toMetres } from '$lib/units';

/**
 * Form fields arrive in whatever units the user has chosen; the database only
 * ever stores metric. These readers are the boundary — every action that writes
 * a measurement goes through them, and none of them accept an already-converted
 * value.
 *
 * Each returns `undefined` when the field was not part of the submission (leave
 * the column alone) and `null` when it was submitted empty (clear the column).
 * Blank is not zero: a set with no weight recorded is not a set lifted with an
 * empty bar.
 */

export function readWeightKg(
	form: FormData,
	field: string,
	units: UnitSystem
): number | null | undefined {
	if (!form.has(field)) return undefined;
	const value = parseOptionalNumber(form.get(field));
	if (value == null) return null;
	if (value < 0) return null;
	return toKg(value, units);
}

export function readDistanceM(
	form: FormData,
	field: string,
	units: UnitSystem
): number | null | undefined {
	if (!form.has(field)) return undefined;
	const value = parseOptionalNumber(form.get(field));
	if (value == null || value < 0) return null;
	return toMetres(value, units);
}

/** Accepts `90`, `2:05`, `1h30m` — see `parseDuration`. */
export function readDurationS(form: FormData, field: string): number | null | undefined {
	if (!form.has(field)) return undefined;
	const raw = form.get(field);
	if (typeof raw !== 'string' || !raw.trim()) return null;
	const seconds = parseDuration(raw);
	return seconds != null && seconds >= 0 ? seconds : null;
}

export function readInteger(
	form: FormData,
	field: string,
	options: { min?: number; max?: number } = {}
): number | null | undefined {
	if (!form.has(field)) return undefined;
	const value = parseOptionalNumber(form.get(field));
	if (value == null) return null;
	const rounded = Math.round(value);
	if (options.min != null && rounded < options.min) return null;
	if (options.max != null && rounded > options.max) return null;
	return rounded;
}

/** RPE is a 6–10 scale in half-point steps; anything else is a typo. */
export function readRpe(form: FormData, field: string): number | null | undefined {
	if (!form.has(field)) return undefined;
	const value = parseOptionalNumber(form.get(field));
	if (value == null) return null;
	const snapped = Math.round(value * 2) / 2;
	if (snapped < 5 || snapped > 10) return null;
	return snapped;
}

export function readTrimmedText(
	form: FormData,
	field: string,
	maxLength = 2000
): string | null | undefined {
	if (!form.has(field)) return undefined;
	const raw = form.get(field);
	if (typeof raw !== 'string') return null;
	const text = raw.trim().slice(0, maxLength);
	return text || null;
}

export function readBoolean(form: FormData, field: string): boolean | undefined {
	if (!form.has(field)) return undefined;
	const raw = form.get(field);
	return raw === 'true' || raw === 'on' || raw === '1';
}
