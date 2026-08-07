import type { OneRmFormula } from '$lib/constants';

/**
 * Estimated one-rep max.
 *
 * All three formulas are regressions fitted to sets in the low rep ranges and
 * they diverge badly past about a dozen reps, so high-rep sets are excluded
 * rather than charted as implausible maxes. Nothing here is persisted — the
 * estimate is recomputed on read so changing the formula in settings
 * retroactively redraws every chart.
 */

/** Sets above this rep count are not used for 1RM estimation. */
export const MAX_REPS_FOR_ESTIMATE = 12;

/**
 * The load a given percentage of a max works out to — the inverse of
 * `estimateOneRm`, and just as much an estimate. Only ever a starting point the
 * lifter overwrites from the bar.
 */
export function percentOfOneRm(
	oneRmKg: number | null | undefined,
	percent: number | null | undefined
): number | null {
	if (oneRmKg == null || percent == null) return null;
	if (oneRmKg <= 0 || percent <= 0) return null;
	return (oneRmKg * percent) / 100;
}

export const ONE_RM_FORMULA_LABELS: Record<OneRmFormula, string> = {
	epley: 'Epley',
	brzycki: 'Brzycki',
	lombardi: 'Lombardi'
};

export const ONE_RM_FORMULA_DESCRIPTIONS: Record<OneRmFormula, string> = {
	epley: 'w × (1 + reps ÷ 30). The common default; slightly generous at high reps.',
	brzycki: 'w ÷ (1.0278 − 0.0278 × reps). More conservative than Epley past 5 reps.',
	lombardi: 'w × reps^0.10. A gentle curve that stays close to the lifted weight.'
};

/**
 * @param weightKg total load moved
 * @param reps completed reps for the set
 * @returns the estimate in kg, or null when the set cannot support one
 */
export function estimateOneRm(
	weightKg: number | null | undefined,
	reps: number | null | undefined,
	formula: OneRmFormula = 'epley'
): number | null {
	if (weightKg == null || reps == null) return null;
	if (weightKg <= 0 || reps <= 0) return null;
	if (reps > MAX_REPS_FOR_ESTIMATE) return null;

	// A single rep already is the max — no formula should inflate it.
	if (reps === 1) return weightKg;

	switch (formula) {
		case 'epley':
			return weightKg * (1 + reps / 30);
		case 'brzycki':
			return weightKg / (1.0278 - 0.0278 * reps);
		case 'lombardi':
			return weightKg * Math.pow(reps, 0.1);
	}
}

/** The best estimate across a group of sets, e.g. every set of an exercise. */
export function bestOneRm(
	entries: Array<{ weightKg: number | null; reps: number | null }>,
	formula: OneRmFormula = 'epley'
): number | null {
	let best: number | null = null;
	for (const entry of entries) {
		const estimate = estimateOneRm(entry.weightKg, entry.reps, formula);
		if (estimate != null && (best == null || estimate > best)) best = estimate;
	}
	return best;
}
