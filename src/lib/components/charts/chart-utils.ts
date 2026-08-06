import type { IsoDate } from '$lib/dates';

/** The fixed categorical order. Index into this; never generate a new hue. */
export const SERIES_COLORS = [
	'var(--ow-series-1)',
	'var(--ow-series-2)',
	'var(--ow-series-3)',
	'var(--ow-series-4)',
	'var(--ow-series-5)',
	'var(--ow-series-6)'
] as const;

export const MAX_SERIES = SERIES_COLORS.length;

export function seriesColor(index: number): string {
	// Deliberately clamps rather than wrapping: a cycled palette would give two
	// series the same hue with no hint that it happened.
	return SERIES_COLORS[Math.min(index, MAX_SERIES - 1)];
}

export type Margin = { top: number; right: number; bottom: number; left: number };

export type LinePoint = { date: IsoDate; value: number };

export type LineSeries = {
	id: string | number;
	label: string;
	points: LinePoint[];
};

/**
 * Axis ticks rounded to values a person would choose — 0, 50, 100 rather than
 * 0, 47.3, 94.6.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
	if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
	if (min === max) return [min];

	const span = max - min;
	const rawStep = span / Math.max(1, count);
	const magnitude = 10 ** Math.floor(Math.log10(rawStep));
	const normalized = rawStep / magnitude;
	const step =
		(normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) *
		magnitude;

	const start = Math.ceil(min / step) * step;
	const ticks: number[] = [];
	for (let v = start; v <= max + step / 1000; v += step) {
		// Floating point accumulation leaves values like 39.99999999; round to the
		// step's own precision so tick labels do not sprout decimals.
		ticks.push(Number(v.toFixed(10)));
	}
	return ticks;
}

/** Pad a domain so marks never sit on the frame. Zero-height domains get a unit. */
export function paddedDomain(values: number[], padRatio = 0.08): [number, number] {
	const finite = values.filter((v) => Number.isFinite(v));
	if (finite.length === 0) return [0, 1];

	let min = Math.min(...finite);
	let max = Math.max(...finite);

	if (min === max) {
		const pad = Math.abs(min) * 0.05 || 1;
		return [min - pad, max + pad];
	}

	const pad = (max - min) * padRatio;
	min -= pad;
	max += pad;
	return [min, max];
}

/** Compact axis and tile values: 1284 -> "1,284", 12900 -> "12.9k". */
export function compactNumber(value: number): string {
	const abs = Math.abs(value);
	if (abs >= 1_000_000) return `${trim(value / 1_000_000)}M`;
	if (abs >= 10_000) return `${trim(value / 1000)}k`;
	return Math.round(value).toLocaleString();
}

function trim(value: number): string {
	return String(Number(value.toFixed(1)));
}

/**
 * Index of the point nearest a pixel position, for crosshair tooltips. Returns
 * -1 for an empty series.
 */
export function nearestIndex(positions: number[], x: number): number {
	if (positions.length === 0) return -1;
	let best = 0;
	let bestDistance = Infinity;
	for (let i = 0; i < positions.length; i++) {
		const distance = Math.abs(positions[i] - x);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = i;
		}
	}
	return best;
}

/** Every distinct date across a set of series, ascending — the shared x domain. */
export function unionDates(series: LineSeries[]): IsoDate[] {
	const all = new Set<IsoDate>();
	for (const s of series) for (const p of s.points) all.add(p.date);
	return [...all].sort((a, b) => a.localeCompare(b));
}
