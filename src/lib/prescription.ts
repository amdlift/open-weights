import type { IntensityMode, UnitSystem } from '$lib/constants';
import { percentOfOneRm } from '$lib/one-rm';
import { roundToLoadable } from '$lib/units';

/**
 * Turning a plan into the numbers a set row shows.
 *
 * Lives outside `$lib/server` because the program editor previews a resolved
 * weight while you type the percentage, so the browser needs this too.
 */

/** What a plan says, before any max is applied. Shape-compatible with both a
 *  routine item and a program prescription. */
export type Prescription = {
	targetRepsMin: number | null;
	targetRepsMax: number | null;
	intensityMode: IntensityMode | null;
	targetRpe: number | null;
	targetPercentOneRm: number | null;
	targetDistanceM: number | null;
	targetDurationS: number | null;
};

/** The same plan with a load worked out — column for column what goes into the
 *  `target_*` columns of a set. */
export type ResolvedPrescription = {
	targetWeightKg: number | null;
	targetRepsMin: number | null;
	targetRepsMax: number | null;
	targetRpe: number | null;
	targetPercentOneRm: number | null;
	targetDistanceM: number | null;
	targetDurationS: number | null;
};

/**
 * Work out the numbers for one prescribed exercise.
 *
 * Three cases, and the third is the one that matters:
 *
 *  - `rpe` — no weight, deliberately. Effort is the instruction and the load is
 *    the lifter's answer to it, which is how a routine has always worked.
 *  - `percent_1rm` with a reference — rounded to something loadable.
 *  - `percent_1rm` with no reference — the percentage is carried through anyway
 *    so the row can read "75% — set a reference" instead of either prescribing
 *    nothing or inventing a weight out of thin air. This happens whenever an
 *    exercise joins the program after the run started, or the lifter left it
 *    blank on the enrolment form.
 */
export function resolvePrescription(
	prescription: Prescription,
	referenceOneRmKg: number | null,
	system: UnitSystem
): ResolvedPrescription {
	const base: ResolvedPrescription = {
		targetWeightKg: null,
		targetRepsMin: prescription.targetRepsMin,
		targetRepsMax: prescription.targetRepsMax,
		targetRpe: null,
		targetPercentOneRm: null,
		targetDistanceM: prescription.targetDistanceM,
		targetDurationS: prescription.targetDurationS
	};

	if (prescription.intensityMode === 'rpe') {
		return { ...base, targetRpe: prescription.targetRpe };
	}

	if (prescription.intensityMode === 'percent_1rm') {
		const percent = prescription.targetPercentOneRm;
		const weight = percentOfOneRm(referenceOneRmKg, percent);
		return {
			...base,
			targetPercentOneRm: percent,
			targetWeightKg: weight == null ? null : roundToLoadable(weight, system)
		};
	}

	return base;
}

/** True once a plan has said anything at all about this exercise. */
export function hasPrescription(resolved: ResolvedPrescription): boolean {
	return (
		resolved.targetWeightKg != null ||
		resolved.targetRepsMin != null ||
		resolved.targetRpe != null ||
		resolved.targetPercentOneRm != null ||
		resolved.targetDistanceM != null ||
		resolved.targetDurationS != null
	);
}
