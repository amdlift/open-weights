import { fail } from '@sveltejs/kit';
import {
	EQUIPMENT_TYPES,
	EXERCISE_KINDS,
	MUSCLE_GROUPS,
	isOneOf,
	type EquipmentType,
	type MuscleGroup
} from '$lib/constants';
import { createCustomExercise, listExercises, setExerciseHidden } from '$lib/server/exercises';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;

	const muscleParam = url.searchParams.get('muscle') ?? 'all';
	const equipmentParam = url.searchParams.get('equipment') ?? 'all';

	return {
		/*
		 * The whole library, hidden entries included. It is ~130 rows, so shipping
		 * it once and filtering on the client makes search instant — the page used
		 * to round-trip through here on every filter change, which is why it
		 * needed an "Apply" button.
		 */
		exercises: listExercises(user.id, { includeHidden: true }),
		/*
		 * Read from the URL only to seed the controls, so existing links and
		 * bookmarks still open the view they describe. The client owns them after
		 * that and writes them back with replaceState.
		 */
		filters: {
			search: url.searchParams.get('q') ?? '',
			muscle: isOneOf(MUSCLE_GROUPS, muscleParam) ? (muscleParam as MuscleGroup) : ('all' as const),
			equipment: isOneOf(EQUIPMENT_TYPES, equipmentParam)
				? (equipmentParam as EquipmentType)
				: ('all' as const),
			showHidden: url.searchParams.get('hidden') === '1',
			customOnly: url.searchParams.get('mine') === '1'
		}
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();

		const name = String(form.get('name') ?? '').trim();
		const kindRaw = String(form.get('kind') ?? '');
		const muscleRaw = String(form.get('primaryMuscle') ?? '');
		const equipmentRaw = String(form.get('equipment') ?? '');
		const notes = String(form.get('notes') ?? '').trim();

		const values = { name, kind: kindRaw, primaryMuscle: muscleRaw, equipment: equipmentRaw, notes };

		if (!name) return fail(400, { ...values, error: 'Give the exercise a name.' });
		if (name.length > 80) {
			return fail(400, { ...values, error: 'Keep the name under 80 characters.' });
		}
		if (!isOneOf(EXERCISE_KINDS, kindRaw)) {
			return fail(400, { ...values, error: 'Choose what this exercise tracks.' });
		}

		const created = createCustomExercise(user.id, {
			name,
			kind: kindRaw,
			primaryMuscle: isOneOf(MUSCLE_GROUPS, muscleRaw) ? muscleRaw : null,
			equipment: isOneOf(EQUIPMENT_TYPES, equipmentRaw) ? equipmentRaw : null,
			notes: notes || null
		});

		return { created: { id: created.id, name: created.name } };
	},

	toggleHidden: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		const exerciseId = Number(form.get('exerciseId'));
		if (!Number.isInteger(exerciseId)) return fail(400, { error: 'Unknown exercise.' });

		setExerciseHidden(user.id, exerciseId, form.get('hidden') === 'true');
		return { ok: true };
	}
};
