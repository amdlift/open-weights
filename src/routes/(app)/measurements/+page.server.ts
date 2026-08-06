import { fail } from '@sveltejs/kit';
import { MEASUREMENT_FIELDS } from '$lib/constants';
import { isIsoDate, todayIn } from '$lib/dates';
import { inchToCm, parseOptionalNumber } from '$lib/units';
import {
	deleteMeasurement,
	listMeasurements,
	upsertMeasurement,
	type MeasurementInput
} from '$lib/server/measurements';
import { readTrimmedText, readWeightKg } from '$lib/server/form-values';
import { getBodyweightSeries, movingAverage } from '$lib/server/stats';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const user = locals.user!;
	const series = getBodyweightSeries(user.id);

	return {
		entries: listMeasurements(user.id),
		series,
		// A week is long enough to flatten day-to-day water swings without
		// hiding a real trend.
		trend: movingAverage(series, 7),
		today: todayIn(user.timezone)
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();

		const measuredOn = String(form.get('measuredOn') ?? '');
		if (!isIsoDate(measuredOn)) return fail(400, { error: 'Choose a valid date.' });
		if (measuredOn > todayIn(user.timezone)) {
			return fail(400, { error: 'You cannot record a measurement in the future.' });
		}

		const weightKg = readWeightKg(form, 'weightKg', user.unitSystem);
		if (weightKg != null && (weightKg < 20 || weightKg > 500)) {
			return fail(400, { error: 'That bodyweight looks wrong — check the number.' });
		}

		const bodyFatPct = form.has('bodyFatPct') ? parseOptionalNumber(form.get('bodyFatPct')) : undefined;
		if (bodyFatPct != null && (bodyFatPct < 1 || bodyFatPct > 70)) {
			return fail(400, { error: 'Body fat percentage should be between 1 and 70.' });
		}

		// Only fields present in this submission are written, so saving from the
		// quick bodyweight form never clears circumferences recorded earlier.
		const input: MeasurementInput = {};
		if (weightKg !== undefined) input.weightKg = weightKg;
		if (bodyFatPct !== undefined) input.bodyFatPct = bodyFatPct;
		const notes = readTrimmedText(form, 'notes', 500);
		if (notes !== undefined) input.notes = notes;

		for (const field of MEASUREMENT_FIELDS) {
			if (!form.has(field.key)) continue;
			const raw = parseOptionalNumber(form.get(field.key));
			if (raw == null) {
				input[field.key] = null;
				continue;
			}
			// Circumferences are entered in inches for imperial users.
			const cm = user.unitSystem === 'imperial' ? inchToCm(raw) : raw;
			if (cm <= 0 || cm > 300) {
				return fail(400, {
					error: `That ${field.label.toLowerCase()} measurement looks wrong.`
				});
			}
			input[field.key] = cm;
		}

		upsertMeasurement(user.id, measuredOn, input);
		return { saved: measuredOn };
	},

	delete: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		deleteMeasurement(user.id, Number(form.get('id')));
		return { deleted: true };
	}
};
