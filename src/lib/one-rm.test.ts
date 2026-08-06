import { describe, expect, it } from 'vitest';
import { bestOneRm, estimateOneRm, MAX_REPS_FOR_ESTIMATE } from './one-rm';

describe('estimateOneRm', () => {
	it('returns the lifted weight for a single', () => {
		for (const formula of ['epley', 'brzycki', 'lombardi'] as const) {
			expect(estimateOneRm(140, 1, formula)).toBe(140);
		}
	});

	it('matches published Epley values', () => {
		// 100 kg x 5 -> 100 * (1 + 5/30)
		expect(estimateOneRm(100, 5, 'epley')).toBeCloseTo(116.667, 3);
		expect(estimateOneRm(100, 10, 'epley')).toBeCloseTo(133.333, 3);
	});

	it('matches published Brzycki values', () => {
		// 100 / (1.0278 - 0.0278*5) = 100 / 0.8888
		expect(estimateOneRm(100, 5, 'brzycki')).toBeCloseTo(112.511, 3);
		// 100 / (1.0278 - 0.0278*10) = 100 / 0.7498
		expect(estimateOneRm(100, 10, 'brzycki')).toBeCloseTo(133.369, 3);
	});

	it('matches published Lombardi values', () => {
		expect(estimateOneRm(100, 5, 'lombardi')).toBeCloseTo(117.462, 3);
	});

	it('is monotonic in both weight and reps', () => {
		for (const formula of ['epley', 'brzycki', 'lombardi'] as const) {
			expect(estimateOneRm(100, 5, formula)!).toBeLessThan(estimateOneRm(110, 5, formula)!);
			expect(estimateOneRm(100, 4, formula)!).toBeLessThan(estimateOneRm(100, 5, formula)!);
		}
	});

	it('refuses rep counts the formulas cannot model', () => {
		expect(estimateOneRm(60, MAX_REPS_FOR_ESTIMATE)).not.toBeNull();
		expect(estimateOneRm(60, MAX_REPS_FOR_ESTIMATE + 1)).toBeNull();
		expect(estimateOneRm(60, 30)).toBeNull();
	});

	it('refuses incomplete or nonsensical sets', () => {
		expect(estimateOneRm(null, 5)).toBeNull();
		expect(estimateOneRm(100, null)).toBeNull();
		expect(estimateOneRm(0, 5)).toBeNull();
		expect(estimateOneRm(100, 0)).toBeNull();
		expect(estimateOneRm(-20, 5)).toBeNull();
	});

	it('never lets Brzycki divide through zero within the supported range', () => {
		// The denominator hits zero at ~37 reps; the rep cap keeps us clear of it.
		for (let reps = 1; reps <= MAX_REPS_FOR_ESTIMATE; reps++) {
			const value = estimateOneRm(100, reps, 'brzycki');
			expect(Number.isFinite(value)).toBe(true);
			expect(value!).toBeGreaterThan(0);
		}
	});
});

describe('bestOneRm', () => {
	it('picks the highest estimate across sets', () => {
		const best = bestOneRm(
			[
				{ weightKg: 100, reps: 5 }, // 116.7
				{ weightKg: 120, reps: 2 }, // 128.0
				{ weightKg: 130, reps: 1 } // 130.0
			],
			'epley'
		);
		expect(best).toBeCloseTo(130, 5);
	});

	it('skips sets that cannot be estimated', () => {
		const best = bestOneRm([
			{ weightKg: null, reps: 5 },
			{ weightKg: 60, reps: 20 },
			{ weightKg: 80, reps: 3 }
		]);
		expect(best).toBeCloseTo(88, 5);
	});

	it('returns null when nothing is usable', () => {
		expect(bestOneRm([])).toBeNull();
		expect(bestOneRm([{ weightKg: null, reps: null }])).toBeNull();
	});
});
