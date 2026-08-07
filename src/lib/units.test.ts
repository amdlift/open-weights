import { describe, expect, it } from 'vitest';
import {
	cmToFeetInches,
	feetInchesToCm,
	formatDistance,
	formatDuration,
	formatHeight,
	formatPace,
	formatWeight,
	fromKg,
	fromMetres,
	kgToLb,
	parseDuration,
	parseOptionalNumber,
	roundToLoadable,
	toKg,
	toMetres,
	trimNumber
} from './units';

describe('weight conversion', () => {
	it('uses the exact international pound', () => {
		expect(fromKg(100, 'imperial')).toBeCloseTo(220.462, 3);
		expect(toKg(225, 'imperial')).toBeCloseTo(102.058, 3);
	});

	it('is a no-op for metric', () => {
		expect(fromKg(82.5, 'metric')).toBe(82.5);
		expect(toKg(82.5, 'metric')).toBe(82.5);
	});

	it('round-trips without drift a user could see', () => {
		for (const kg of [2.5, 20, 60.5, 100, 227.5]) {
			expect(toKg(fromKg(kg, 'imperial'), 'imperial')).toBeCloseTo(kg, 9);
		}
	});

	it('formats without trailing zeros', () => {
		expect(formatWeight(100, 'metric')).toBe('100 kg');
		expect(formatWeight(102.5, 'metric')).toBe('102.5 kg');
		expect(formatWeight(null, 'metric')).toBe('—');
	});
});

describe('height conversion', () => {
	it('splits into feet and inches', () => {
		expect(cmToFeetInches(180)).toEqual({ feet: 5, inches: 11 });
		expect(cmToFeetInches(182.88)).toEqual({ feet: 6, inches: 0 });
	});

	it('round-trips feet/inches back to centimetres', () => {
		expect(feetInchesToCm(6, 0)).toBeCloseTo(182.88, 5);
		const { feet, inches } = cmToFeetInches(175);
		expect(feetInchesToCm(feet, inches)).toBeCloseTo(175, 0);
	});

	it('formats per unit system', () => {
		expect(formatHeight(180, 'metric')).toBe('180 cm');
		expect(formatHeight(180, 'imperial')).toBe('5′ 11″');
	});
});

describe('distance conversion', () => {
	it('converts metres to km and miles', () => {
		expect(fromMetres(5000, 'metric')).toBe(5);
		expect(fromMetres(1609.344, 'imperial')).toBeCloseTo(1, 9);
	});

	it('round-trips', () => {
		for (const metres of [400, 1609.344, 5000, 42195]) {
			expect(toMetres(fromMetres(metres, 'imperial'), 'imperial')).toBeCloseTo(metres, 6);
			expect(toMetres(fromMetres(metres, 'metric'), 'metric')).toBeCloseTo(metres, 9);
		}
	});

	it('formats to two decimals', () => {
		expect(formatDistance(5000, 'metric')).toBe('5 km');
		expect(formatDistance(5432, 'metric')).toBe('5.43 km');
		expect(formatDistance(null, 'metric')).toBe('—');
	});
});

describe('formatDuration', () => {
	it('drops the hour segment when it is zero', () => {
		expect(formatDuration(125)).toBe('2:05');
		expect(formatDuration(59)).toBe('0:59');
	});

	it('includes hours when present', () => {
		expect(formatDuration(3725)).toBe('1:02:05');
		expect(formatDuration(3600)).toBe('1:00:00');
	});

	it('handles missing and negative input', () => {
		expect(formatDuration(null)).toBe('—');
		expect(formatDuration(-5)).toBe('0:00');
	});
});

describe('parseDuration', () => {
	it('reads bare numbers as seconds', () => {
		expect(parseDuration('45')).toBe(45);
		expect(parseDuration(' 90 ')).toBe(90);
	});

	it('reads clock notation', () => {
		expect(parseDuration('2:05')).toBe(125);
		expect(parseDuration('1:02:05')).toBe(3725);
	});

	it('reads unit suffixes', () => {
		expect(parseDuration('90s')).toBe(90);
		expect(parseDuration('45m')).toBe(2700);
		expect(parseDuration('1h30m')).toBe(5400);
		expect(parseDuration('1h 30m 15s')).toBe(5415);
	});

	it('rejects input it cannot fully read', () => {
		expect(parseDuration('')).toBeNull();
		expect(parseDuration('banana')).toBeNull();
		expect(parseDuration('1h banana')).toBeNull();
		expect(parseDuration('1:2:3:4')).toBeNull();
		expect(parseDuration('1::2')).toBeNull();
	});
});

describe('formatPace', () => {
	it('reports time per km or per mile', () => {
		// 5 km in 25:00 -> 5:00 /km
		expect(formatPace(5000, 1500, 'metric')).toBe('5:00 /km');
		// 1 mile in 8:00 -> 8:00 /mi
		expect(formatPace(1609.344, 480, 'imperial')).toBe('8:00 /mi');
	});

	it('returns a dash rather than dividing by zero', () => {
		expect(formatPace(0, 600, 'metric')).toBe('—');
		expect(formatPace(5000, 0, 'metric')).toBe('—');
		expect(formatPace(null, null, 'metric')).toBe('—');
	});
});

describe('parseOptionalNumber', () => {
	it('distinguishes blank from zero', () => {
		expect(parseOptionalNumber('')).toBeNull();
		expect(parseOptionalNumber('   ')).toBeNull();
		expect(parseOptionalNumber('0')).toBe(0);
	});

	it('accepts a comma decimal separator', () => {
		expect(parseOptionalNumber('82,5')).toBe(82.5);
	});

	it('rejects non-numeric text', () => {
		expect(parseOptionalNumber('heavy')).toBeNull();
		expect(parseOptionalNumber(null)).toBeNull();
	});
});

describe('trimNumber', () => {
	it('rounds then removes trailing zeros', () => {
		expect(trimNumber(100.04, 1)).toBe('100');
		expect(trimNumber(100.06, 1)).toBe('100.1');
		expect(trimNumber(5, 2)).toBe('5');
	});
});

describe('roundToLoadable', () => {
	it('snaps to the nearest 2.5 kg in a metric gym', () => {
		expect(roundToLoadable(102.6, 'metric')).toBe(102.5);
		expect(roundToLoadable(103.8, 'metric')).toBe(105);
		expect(roundToLoadable(105, 'metric')).toBe(105);
	});

	it('snaps to the nearest 5 lb in an imperial gym', () => {
		// Rounding in kg and converting for display is the bug this prevents:
		// it would hand the lifter 226.2 lb, which is not a weight.
		expect(kgToLb(roundToLoadable(102.6, 'imperial'))).toBeCloseTo(225, 9);
		expect(kgToLb(roundToLoadable(104.5, 'imperial'))).toBeCloseTo(230, 9);
	});

	it('never lands between plates in either system', () => {
		for (const kg of [40.3, 77.7, 102.6, 181.1]) {
			expect(roundToLoadable(kg, 'metric') % 2.5).toBeCloseTo(0, 9);
			expect(kgToLb(roundToLoadable(kg, 'imperial')) % 5).toBeCloseTo(0, 9);
		}
	});
});
