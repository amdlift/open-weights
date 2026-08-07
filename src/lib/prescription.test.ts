import { describe, expect, it } from 'vitest';
import type { Prescription } from './prescription';
import { hasPrescription, resolvePrescription } from './prescription';
import { kgToLb } from './units';

function plan(overrides: Partial<Prescription> = {}): Prescription {
	return {
		targetRepsMin: 5,
		targetRepsMax: null,
		intensityMode: null,
		targetRpe: null,
		targetPercentOneRm: null,
		targetDistanceM: null,
		targetDurationS: null,
		...overrides
	};
}

describe('an RPE prescription never names a weight', () => {
	it('carries the effort and leaves the load to the lifter', () => {
		const resolved = resolvePrescription(
			plan({ intensityMode: 'rpe', targetRpe: 8 }),
			140,
			'metric'
		);

		expect(resolved.targetRpe).toBe(8);
		// A reference max was available and deliberately not used: effort is the
		// instruction, the bar is where the lifter answers it.
		expect(resolved.targetWeightKg).toBeNull();
		expect(resolved.targetPercentOneRm).toBeNull();
	});

	it('keeps the rep range intact', () => {
		const resolved = resolvePrescription(
			plan({ targetRepsMin: 8, targetRepsMax: 12, intensityMode: 'rpe', targetRpe: 7.5 }),
			null,
			'metric'
		);

		expect(resolved.targetRepsMin).toBe(8);
		expect(resolved.targetRepsMax).toBe(12);
	});
});

describe('a percentage resolves against the reference max', () => {
	it('rounds to a loadable metric weight', () => {
		const resolved = resolvePrescription(
			plan({ intensityMode: 'percent_1rm', targetPercentOneRm: 75 }),
			140,
			'metric'
		);

		// 75% of 140 is 105, already loadable.
		expect(resolved.targetWeightKg).toBe(105);
		expect(resolved.targetPercentOneRm).toBe(75);
	});

	it('rounds an awkward percentage to the nearest 2.5 kg', () => {
		const resolved = resolvePrescription(
			plan({ intensityMode: 'percent_1rm', targetPercentOneRm: 72 }),
			142.5,
			'metric'
		);

		// 72% of 142.5 is 102.6.
		expect(resolved.targetWeightKg).toBe(102.5);
	});

	it('rounds to whole pounds for an imperial lifter', () => {
		const resolved = resolvePrescription(
			plan({ intensityMode: 'percent_1rm', targetPercentOneRm: 72 }),
			142.5,
			'imperial'
		);

		// The bug this exists to prevent: rounding in kg and displaying in lb
		// gives 226.2 lb, which is not a weight anyone can load.
		const lb = kgToLb(resolved.targetWeightKg!);
		expect(Math.abs(lb - Math.round(lb))).toBeLessThan(1e-9);
		expect(Math.round(lb) % 5).toBe(0);
	});

	it('keeps the percentage when there is no reference to resolve it', () => {
		const resolved = resolvePrescription(
			plan({ intensityMode: 'percent_1rm', targetPercentOneRm: 75 }),
			null,
			'metric'
		);

		// The row still has something to say — "75%, set a reference" — rather
		// than silently prescribing nothing or inventing a load.
		expect(resolved.targetPercentOneRm).toBe(75);
		expect(resolved.targetWeightKg).toBeNull();
	});

	it('refuses to resolve against a nonsense max', () => {
		const resolved = resolvePrescription(
			plan({ intensityMode: 'percent_1rm', targetPercentOneRm: 75 }),
			0,
			'metric'
		);

		expect(resolved.targetWeightKg).toBeNull();
	});
});

describe('a plan with no intensity mode', () => {
	it('drops a stale rpe left behind by switching modes', () => {
		const resolved = resolvePrescription(
			plan({ intensityMode: null, targetRpe: 8, targetPercentOneRm: 75 }),
			140,
			'metric'
		);

		// The editor keeps both columns so toggling does not destroy your typing,
		// so the mode is the only thing that decides what actually applies.
		expect(resolved.targetRpe).toBeNull();
		expect(resolved.targetPercentOneRm).toBeNull();
		expect(resolved.targetWeightKg).toBeNull();
		expect(resolved.targetRepsMin).toBe(5);
	});
});

describe('cardio and timed work', () => {
	it('carries distance and duration through untouched', () => {
		const resolved = resolvePrescription(
			plan({ targetRepsMin: null, targetDistanceM: 5000, targetDurationS: 1500 }),
			null,
			'metric'
		);

		expect(resolved.targetDistanceM).toBe(5000);
		expect(resolved.targetDurationS).toBe(1500);
	});
});

describe('hasPrescription', () => {
	it('is false for a plan that says nothing', () => {
		const resolved = resolvePrescription(plan({ targetRepsMin: null }), null, 'metric');
		expect(hasPrescription(resolved)).toBe(false);
	});

	it('is true once any target survives resolution', () => {
		const resolved = resolvePrescription(plan(), null, 'metric');
		expect(hasPrescription(resolved)).toBe(true);
	});
});
