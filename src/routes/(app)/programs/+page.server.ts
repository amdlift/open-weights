import { fail, redirect } from '@sveltejs/kit';
import { readInteger } from '$lib/server/form-values';
import {
	createProgram,
	deleteProgram,
	duplicateProgram,
	listEnrollments,
	listPrograms,
	updateProgram
} from '$lib/server/programs';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const user = locals.user!;
	return {
		programs: listPrograms(user.id),
		enrollments: listEnrollments(user.id)
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();

		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Give the program a name.' });
		if (name.length > 80) return fail(400, { error: 'Keep the name under 80 characters.' });

		const daysPerWeek = readInteger(form, 'daysPerWeek', { min: 1, max: 7 });
		if (daysPerWeek == null) {
			return fail(400, { error: 'Pick between 1 and 7 training days a week.' });
		}
		const weeks = readInteger(form, 'weeks', { min: 1, max: 52 });
		if (weeks == null) return fail(400, { error: 'A program runs between 1 and 52 weeks.' });

		const programId = createProgram(user.id, { name, daysPerWeek, weeks });
		redirect(303, `/programs/${programId}?week=1&day=1`);
	},

	duplicate: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		const programId = Number(form.get('programId'));
		if (!Number.isInteger(programId)) return fail(400, { error: 'Pick a program.' });

		const newId = duplicateProgram(user.id, programId);
		if (newId == null) return fail(400, { error: 'No such program.' });
		redirect(303, `/programs/${newId}`);
	},

	toggleArchived: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		updateProgram(user.id, Number(form.get('programId')), {
			isArchived: form.get('isArchived') === 'true'
		});
		return { ok: true };
	},

	delete: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		deleteProgram(user.id, Number(form.get('programId')));
		return { deleted: true };
	}
};
