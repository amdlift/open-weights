import type { UnitSystem } from '$lib/constants';

/**
 * Unit conversion and formatting.
 *
 * Everything in the database is metric (kg, cm, metres, seconds). This module
 * is the only place allowed to move between that canonical form and whatever
 * the user has chosen to see, so a display bug can never corrupt stored data.
 */

const KG_PER_LB = 0.45359237;
const CM_PER_INCH = 2.54;
const METRES_PER_MILE = 1609.344;
const INCHES_PER_FOOT = 12;

// --- weight ---------------------------------------------------------------

export const kgToLb = (kg: number): number => kg / KG_PER_LB;
export const lbToKg = (lb: number): number => lb * KG_PER_LB;

export function fromKg(kg: number, system: UnitSystem): number {
	return system === 'imperial' ? kgToLb(kg) : kg;
}

export function toKg(value: number, system: UnitSystem): number {
	return system === 'imperial' ? lbToKg(value) : value;
}

export const weightUnit = (system: UnitSystem): string => (system === 'imperial' ? 'lb' : 'kg');

/**
 * Weights display to one decimal, but trailing `.0` is noise on a set list —
 * `100 kg` reads better than `100.0 kg`.
 */
export function formatWeight(kg: number | null | undefined, system: UnitSystem): string {
	if (kg == null) return '—';
	return `${trimNumber(fromKg(kg, system), 1)} ${weightUnit(system)}`;
}

// --- length / height ------------------------------------------------------

export const cmToInch = (cm: number): number => cm / CM_PER_INCH;
export const inchToCm = (inch: number): number => inch * CM_PER_INCH;

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
	const totalInches = Math.round(cmToInch(cm));
	return {
		feet: Math.floor(totalInches / INCHES_PER_FOOT),
		inches: totalInches % INCHES_PER_FOOT
	};
}

export function feetInchesToCm(feet: number, inches: number): number {
	return inchToCm(feet * INCHES_PER_FOOT + inches);
}

export function formatHeight(cm: number | null | undefined, system: UnitSystem): string {
	if (cm == null) return '—';
	if (system === 'imperial') {
		const { feet, inches } = cmToFeetInches(cm);
		return `${feet}′ ${inches}″`;
	}
	return `${Math.round(cm)} cm`;
}

/** Circumference measurements — always a plain number plus a unit. */
export function formatLength(cm: number | null | undefined, system: UnitSystem): string {
	if (cm == null) return '—';
	const value = system === 'imperial' ? cmToInch(cm) : cm;
	return `${trimNumber(value, 1)} ${system === 'imperial' ? 'in' : 'cm'}`;
}

export const lengthUnit = (system: UnitSystem): string => (system === 'imperial' ? 'in' : 'cm');

// --- distance -------------------------------------------------------------

export const metresToKm = (m: number): number => m / 1000;
export const metresToMiles = (m: number): number => m / METRES_PER_MILE;
export const kmToMetres = (km: number): number => km * 1000;
export const milesToMetres = (mi: number): number => mi * METRES_PER_MILE;

export function fromMetres(m: number, system: UnitSystem): number {
	return system === 'imperial' ? metresToMiles(m) : metresToKm(m);
}

export function toMetres(value: number, system: UnitSystem): number {
	return system === 'imperial' ? milesToMetres(value) : kmToMetres(value);
}

export const distanceUnit = (system: UnitSystem): string => (system === 'imperial' ? 'mi' : 'km');

export function formatDistance(m: number | null | undefined, system: UnitSystem): string {
	if (m == null) return '—';
	return `${trimNumber(fromMetres(m, system), 2)} ${distanceUnit(system)}`;
}

// --- duration -------------------------------------------------------------

/** `3725 -> "1:02:05"`, `125 -> "2:05"`. Hours are dropped when zero. */
export function formatDuration(seconds: number | null | undefined): string {
	if (seconds == null) return '—';
	const total = Math.max(0, Math.round(seconds));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Parse the durations people actually type: `45` (minutes in a duration field
 * is ambiguous, so bare numbers are seconds), `2:05`, `1:02:05`, `90s`, `45m`,
 * `1h30m`. Returns null when the input cannot be read as a duration.
 */
export function parseDuration(input: string): number | null {
	const text = input.trim().toLowerCase();
	if (!text) return null;

	if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text));

	if (text.includes(':')) {
		const parts = text.split(':');
		if (parts.length > 3 || parts.some((p) => p === '' || !/^\d+(\.\d+)?$/.test(p))) return null;
		return parts.reduce((acc, part) => acc * 60 + Number(part), 0);
	}

	const unitPattern = /(\d+(?:\.\d+)?)\s*(h|m|s)/g;
	let total = 0;
	let matched = false;
	let consumed = 0;
	for (const match of text.matchAll(unitPattern)) {
		matched = true;
		consumed += match[0].length;
		const value = Number(match[1]);
		total += value * (match[2] === 'h' ? 3600 : match[2] === 'm' ? 60 : 1);
	}
	// Reject things like "1h banana" that only partly parse.
	if (!matched || consumed !== text.replace(/\s/g, '').length) return null;

	return Math.round(total);
}

/** Pace, the number every runner actually wants: mm:ss per km or per mile. */
export function formatPace(
	metres: number | null | undefined,
	seconds: number | null | undefined,
	system: UnitSystem
): string {
	if (!metres || !seconds || metres <= 0 || seconds <= 0) return '—';
	const perUnit = seconds / fromMetres(metres, system);
	return `${formatDuration(perUnit)} /${distanceUnit(system)}`;
}

// --- shared ---------------------------------------------------------------

/** Round to `decimals` places, then drop any trailing zeros. */
export function trimNumber(value: number, decimals: number): string {
	return String(Number(value.toFixed(decimals)));
}

/**
 * Read a number out of a form field. Blank means "not provided" (null), which
 * is different from zero — a set with 0 reps is not the same as a set whose
 * reps were never entered.
 */
export function parseOptionalNumber(input: FormDataEntryValue | null): number | null {
	if (typeof input !== 'string') return null;
	const text = input.trim().replace(',', '.');
	if (!text) return null;
	const value = Number(text);
	return Number.isFinite(value) ? value : null;
}
