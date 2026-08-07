import { and, asc, eq, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm';
import {
	supportsOneRm,
	type EquipmentType,
	type ExerciseKind,
	type IntensityMode,
	type MuscleGroup,
	type OneRmFormula,
	type UnitSystem
} from '$lib/constants';
import type { IsoDate } from '$lib/dates';
import { resolvePrescription, type Prescription } from '$lib/prescription';
import { getDb, type Db } from './db';
import * as schema from './db/schema';
import { getExerciseRecords } from './stats';
import { writePrescribedExercise } from './workouts';

/**
 * Multi-week programs.
 *
 * The governing idea is that a program plans and a workout records. Starting a
 * day copies the plan onto the new workout's sets and leaves a soft link back
 * to the cell it came from; nothing afterwards is constrained by it. You can
 * add exercises, skip sets, train the days out of order or ignore the program
 * for a fortnight, and the only consequence is what "up next" reports.
 */

export type ProgramPrescriptionRow = Prescription & {
	id: number;
	orderIndex: number;
	targetSets: number | null;
	notes: string | null;
	exercise: {
		id: number;
		name: string;
		kind: ExerciseKind;
		primaryMuscle: MuscleGroup | null;
		equipment: EquipmentType | null;
	};
};

export type ProgramDayCell = {
	id: number;
	weekNumber: number;
	orderIndex: number;
	title: string | null;
	notes: string | null;
	exerciseCount: number;
	/** Enough to label a grid cell without a second query. */
	exerciseNames: string[];
};

export type ProgramDayDetail = Omit<ProgramDayCell, 'exerciseCount' | 'exerciseNames'> & {
	exercises: ProgramPrescriptionRow[];
};

export type ProgramWeek = { weekNumber: number; days: ProgramDayCell[] };

export type ProgramDetail = {
	id: number;
	name: string;
	notes: string | null;
	daysPerWeek: number;
	isArchived: boolean;
	weeks: ProgramWeek[];
	/** Every exercise the program prescribes anywhere, deduplicated. */
	exerciseIds: number[];
};

export type ProgramSummary = {
	id: number;
	name: string;
	notes: string | null;
	daysPerWeek: number;
	isArchived: boolean;
	weekCount: number;
	dayCount: number;
	exerciseCount: number;
	activeEnrollmentId: number | null;
};

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/**
 * Every mutation below resolves its target back to a user id first. Route
 * params are attacker-controlled, so "this id is mine" is never inferred from
 * the URL.
 */
function ownsProgram(userId: number, programId: number, db: Db): boolean {
	return (
		db
			.select({ id: schema.programs.id })
			.from(schema.programs)
			.where(and(eq(schema.programs.id, programId), eq(schema.programs.userId, userId)))
			.get() != null
	);
}

function ownsEnrollment(userId: number, enrollmentId: number, db: Db): boolean {
	return (
		db
			.select({ id: schema.programEnrollments.id })
			.from(schema.programEnrollments)
			.where(
				and(
					eq(schema.programEnrollments.id, enrollmentId),
					eq(schema.programEnrollments.userId, userId)
				)
			)
			.get() != null
	);
}

function programIdForDay(userId: number, programDayId: number, db: Db): number | null {
	const row = db
		.select({ programId: schema.programDays.programId })
		.from(schema.programDays)
		.innerJoin(schema.programs, eq(schema.programs.id, schema.programDays.programId))
		.where(and(eq(schema.programDays.id, programDayId), eq(schema.programs.userId, userId)))
		.get();
	return row?.programId ?? null;
}

function programIdForPrescription(userId: number, prescriptionId: number, db: Db): number | null {
	const row = db
		.select({ programId: schema.programDays.programId })
		.from(schema.programDayExercises)
		.innerJoin(
			schema.programDays,
			eq(schema.programDays.id, schema.programDayExercises.programDayId)
		)
		.innerJoin(schema.programs, eq(schema.programs.id, schema.programDays.programId))
		.where(
			and(eq(schema.programDayExercises.id, prescriptionId), eq(schema.programs.userId, userId))
		)
		.get();
	return row?.programId ?? null;
}

function touch(programId: number, db: Db): void {
	db.update(schema.programs)
		.set({ updatedAt: new Date() })
		.where(eq(schema.programs.id, programId))
		.run();
}

/**
 * Clear the program links on any workout pointing at these cells.
 *
 * Should be unnecessary — the schema declares `on delete set null` — but
 * drizzle-kit renders SQLite `ALTER TABLE … ADD COLUMN` without the delete
 * action, so in the database those two foreign keys are NO ACTION and a delete
 * would fail outright. Deleting a plan must never cost you the sessions you
 * logged under it, so the links come off by hand first.
 */
function unlinkWorkouts(
	tx: Db,
	target: { dayIds?: number[]; enrollmentId?: number }
): void {
	if (target.dayIds?.length) {
		tx.update(schema.workouts)
			.set({ programDayId: null })
			.where(inArray(schema.workouts.programDayId, target.dayIds))
			.run();
	}
	if (target.enrollmentId != null) {
		tx.update(schema.workouts)
			.set({ programEnrollmentId: null })
			.where(eq(schema.workouts.programEnrollmentId, target.enrollmentId))
			.run();
	}
}

function dayIdsOf(tx: Db, programId: number, weekNumber?: number): number[] {
	const where =
		weekNumber == null
			? eq(schema.programDays.programId, programId)
			: and(
					eq(schema.programDays.programId, programId),
					eq(schema.programDays.weekNumber, weekNumber)
				);
	return tx
		.select({ id: schema.programDays.id })
		.from(schema.programDays)
		.where(where)
		.all()
		.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function listPrograms(userId: number, db: Db = getDb()): ProgramSummary[] {
	const rows = db
		.select()
		.from(schema.programs)
		.where(eq(schema.programs.userId, userId))
		.orderBy(asc(schema.programs.isArchived), asc(schema.programs.name))
		.all();
	if (rows.length === 0) return [];

	const ids = rows.map((r) => r.id);

	const dayStats = db
		.select({
			programId: schema.programDays.programId,
			weekCount: sql<number>`count(distinct ${schema.programDays.weekNumber})`,
			dayCount: sql<number>`count(*)`
		})
		.from(schema.programDays)
		.where(inArray(schema.programDays.programId, ids))
		.groupBy(schema.programDays.programId)
		.all();

	const exerciseCounts = db
		.select({
			programId: schema.programDays.programId,
			count: sql<number>`count(*)`
		})
		.from(schema.programDayExercises)
		.innerJoin(
			schema.programDays,
			eq(schema.programDays.id, schema.programDayExercises.programDayId)
		)
		.where(inArray(schema.programDays.programId, ids))
		.groupBy(schema.programDays.programId)
		.all();

	const active = db
		.select({
			id: schema.programEnrollments.id,
			programId: schema.programEnrollments.programId
		})
		.from(schema.programEnrollments)
		.where(
			and(
				eq(schema.programEnrollments.userId, userId),
				isNull(schema.programEnrollments.completedOn)
			)
		)
		.all();

	const daysBy = new Map(dayStats.map((d) => [d.programId, d]));
	const exercisesBy = new Map(exerciseCounts.map((e) => [e.programId, e.count]));
	const activeBy = new Map(active.map((a) => [a.programId, a.id]));

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		notes: row.notes,
		daysPerWeek: row.daysPerWeek,
		isArchived: row.isArchived,
		weekCount: daysBy.get(row.id)?.weekCount ?? 0,
		dayCount: daysBy.get(row.id)?.dayCount ?? 0,
		exerciseCount: exercisesBy.get(row.id) ?? 0,
		activeEnrollmentId: activeBy.get(row.id) ?? null
	}));
}

/**
 * The whole grid, with each cell summarised rather than fully expanded. The
 * editor works one day at a time, and a twelve-week block is a few hundred
 * prescriptions nobody is looking at.
 */
export function getProgram(
	userId: number,
	programId: number,
	db: Db = getDb()
): ProgramDetail | null {
	const program = db
		.select()
		.from(schema.programs)
		.where(and(eq(schema.programs.id, programId), eq(schema.programs.userId, userId)))
		.get();
	if (!program) return null;

	const days = db
		.select()
		.from(schema.programDays)
		.where(eq(schema.programDays.programId, programId))
		.orderBy(
			asc(schema.programDays.weekNumber),
			asc(schema.programDays.orderIndex),
			asc(schema.programDays.id)
		)
		.all();

	const items = days.length
		? db
				.select({
					programDayId: schema.programDayExercises.programDayId,
					exerciseId: schema.exercises.id,
					name: schema.exercises.name,
					orderIndex: schema.programDayExercises.orderIndex
				})
				.from(schema.programDayExercises)
				.innerJoin(
					schema.exercises,
					eq(schema.exercises.id, schema.programDayExercises.exerciseId)
				)
				.where(
					inArray(
						schema.programDayExercises.programDayId,
						days.map((d) => d.id)
					)
				)
				.orderBy(asc(schema.programDayExercises.orderIndex), asc(schema.programDayExercises.id))
				.all()
		: [];

	const byDay = new Map<number, typeof items>();
	for (const item of items) {
		const list = byDay.get(item.programDayId) ?? [];
		list.push(item);
		byDay.set(item.programDayId, list);
	}

	const weeks: ProgramWeek[] = [];
	for (const day of days) {
		const names = (byDay.get(day.id) ?? []).map((i) => i.name);
		const cell: ProgramDayCell = {
			id: day.id,
			weekNumber: day.weekNumber,
			orderIndex: day.orderIndex,
			title: day.title,
			notes: day.notes,
			exerciseCount: names.length,
			exerciseNames: names
		};
		const week = weeks.find((w) => w.weekNumber === day.weekNumber);
		if (week) week.days.push(cell);
		else weeks.push({ weekNumber: day.weekNumber, days: [cell] });
	}

	return {
		id: program.id,
		name: program.name,
		notes: program.notes,
		daysPerWeek: program.daysPerWeek,
		isArchived: program.isArchived,
		weeks,
		exerciseIds: [...new Set(items.map((i) => i.exerciseId))]
	};
}

/** One authored cell, expanded. Addressed by position because that is what the
 *  editor's URL carries. */
export function getProgramDayAt(
	userId: number,
	programId: number,
	weekNumber: number,
	orderIndex: number,
	db: Db = getDb()
): ProgramDayDetail | null {
	const day = db
		.select({ id: schema.programDays.id })
		.from(schema.programDays)
		.innerJoin(schema.programs, eq(schema.programs.id, schema.programDays.programId))
		.where(
			and(
				eq(schema.programs.userId, userId),
				eq(schema.programDays.programId, programId),
				eq(schema.programDays.weekNumber, weekNumber),
				eq(schema.programDays.orderIndex, orderIndex)
			)
		)
		.get();
	return day ? getProgramDay(userId, day.id, db) : null;
}

export function getProgramDay(
	userId: number,
	programDayId: number,
	db: Db = getDb()
): ProgramDayDetail | null {
	const day = db
		.select({
			id: schema.programDays.id,
			weekNumber: schema.programDays.weekNumber,
			orderIndex: schema.programDays.orderIndex,
			title: schema.programDays.title,
			notes: schema.programDays.notes
		})
		.from(schema.programDays)
		.innerJoin(schema.programs, eq(schema.programs.id, schema.programDays.programId))
		.where(and(eq(schema.programDays.id, programDayId), eq(schema.programs.userId, userId)))
		.get();
	if (!day) return null;

	const exercises = db
		.select({
			item: schema.programDayExercises,
			exerciseId: schema.exercises.id,
			name: schema.exercises.name,
			kind: schema.exercises.kind,
			primaryMuscle: schema.exercises.primaryMuscle,
			equipment: schema.exercises.equipment
		})
		.from(schema.programDayExercises)
		.innerJoin(schema.exercises, eq(schema.exercises.id, schema.programDayExercises.exerciseId))
		.where(eq(schema.programDayExercises.programDayId, programDayId))
		.orderBy(asc(schema.programDayExercises.orderIndex), asc(schema.programDayExercises.id))
		.all();

	return {
		...day,
		exercises: exercises.map(({ item, ...ex }) => ({
			id: item.id,
			orderIndex: item.orderIndex,
			targetSets: item.targetSets,
			targetRepsMin: item.targetRepsMin,
			targetRepsMax: item.targetRepsMax,
			intensityMode: item.intensityMode,
			targetRpe: item.targetRpe,
			targetPercentOneRm: item.targetPercentOneRm,
			targetDistanceM: item.targetDistanceM,
			targetDurationS: item.targetDurationS,
			notes: item.notes,
			exercise: {
				id: ex.exerciseId,
				name: ex.name,
				kind: ex.kind,
				primaryMuscle: ex.primaryMuscle,
				equipment: ex.equipment
			}
		}))
	};
}

// ---------------------------------------------------------------------------
// Program CRUD
// ---------------------------------------------------------------------------

export function createProgram(
	userId: number,
	input: { name: string; notes?: string | null; daysPerWeek?: number; weeks?: number },
	db: Db = getDb()
): number {
	const daysPerWeek = Math.min(Math.max(input.daysPerWeek ?? 3, 1), 7);
	const weeks = Math.min(Math.max(input.weeks ?? 4, 1), 52);

	return db.transaction((tx) => {
		const programId = tx
			.insert(schema.programs)
			.values({
				userId,
				name: input.name.trim(),
				notes: input.notes?.trim() || null,
				daysPerWeek
			})
			.returning({ id: schema.programs.id })
			.get().id;

		// The grid is materialised up front so the editor opens onto something to
		// fill in rather than an empty page with a button on it.
		for (let week = 1; week <= weeks; week++) {
			for (let day = 0; day < daysPerWeek; day++) {
				tx.insert(schema.programDays)
					.values({ programId, weekNumber: week, orderIndex: day })
					.run();
			}
		}

		return programId;
	});
}

export function updateProgram(
	userId: number,
	programId: number,
	input: { name?: string; notes?: string | null; isArchived?: boolean; daysPerWeek?: number },
	db: Db = getDb()
): boolean {
	if (!ownsProgram(userId, programId, db)) return false;

	const patch: Record<string, unknown> = { updatedAt: new Date() };
	if (input.name !== undefined) patch.name = input.name.trim();
	if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
	if (input.isArchived !== undefined) patch.isArchived = input.isArchived;
	if (input.daysPerWeek !== undefined) {
		patch.daysPerWeek = Math.min(Math.max(input.daysPerWeek, 1), 7);
	}

	db.update(schema.programs).set(patch).where(eq(schema.programs.id, programId)).run();
	return true;
}

/**
 * Reshape every week to `daysPerWeek` cells.
 *
 * Growing appends empty days; shrinking drops the trailing ones and everything
 * prescribed in them. Obeys without argument — the editor is responsible for
 * saying how many authored days are about to go, and a refusal here would only
 * be a confirmation dialog wearing a validation error's clothes.
 */
export function resizeProgramWeeks(
	userId: number,
	programId: number,
	daysPerWeek: number,
	db: Db = getDb()
): boolean {
	if (!ownsProgram(userId, programId, db)) return false;
	const target = Math.min(Math.max(daysPerWeek, 1), 7);

	return db.transaction((tx) => {
		const days = tx
			.select()
			.from(schema.programDays)
			.where(eq(schema.programDays.programId, programId))
			.orderBy(asc(schema.programDays.weekNumber), asc(schema.programDays.orderIndex))
			.all();

		const weekNumbers = [...new Set(days.map((d) => d.weekNumber))];
		for (const week of weekNumbers) {
			const inWeek = days.filter((d) => d.weekNumber === week);
			if (inWeek.length > target) {
				const doomed = inWeek.slice(target).map((d) => d.id);
				unlinkWorkouts(tx as Db, { dayIds: doomed });
				tx.delete(schema.programDays).where(inArray(schema.programDays.id, doomed)).run();
			} else {
				for (let i = inWeek.length; i < target; i++) {
					tx.insert(schema.programDays)
						.values({ programId, weekNumber: week, orderIndex: i })
						.run();
				}
			}
		}

		tx.update(schema.programs)
			.set({ daysPerWeek: target, updatedAt: new Date() })
			.where(eq(schema.programs.id, programId))
			.run();
		return true;
	});
}

export function deleteProgram(userId: number, programId: number, db: Db = getDb()): boolean {
	if (!ownsProgram(userId, programId, db)) return false;

	return db.transaction((tx) => {
		const enrollments = tx
			.select({ id: schema.programEnrollments.id })
			.from(schema.programEnrollments)
			.where(eq(schema.programEnrollments.programId, programId))
			.all();

		unlinkWorkouts(tx as Db, { dayIds: dayIdsOf(tx as Db, programId) });
		for (const e of enrollments) unlinkWorkouts(tx as Db, { enrollmentId: e.id });

		tx.delete(schema.programs).where(eq(schema.programs.id, programId)).run();
		return true;
	});
}

/** Copy a whole program, template only — no runs, no snapshotted maxes. */
export function duplicateProgram(
	userId: number,
	programId: number,
	db: Db = getDb()
): number | null {
	const source = getProgram(userId, programId, db);
	if (!source) return null;

	return db.transaction((tx) => {
		const newId = tx
			.insert(schema.programs)
			.values({
				userId,
				name: `${source.name} (copy)`,
				notes: source.notes,
				daysPerWeek: source.daysPerWeek
			})
			.returning({ id: schema.programs.id })
			.get().id;

		for (const week of source.weeks) {
			for (const day of week.days) {
				copyDayInto(tx as Db, newId, day.id, week.weekNumber, day.orderIndex);
			}
		}

		return newId;
	});
}

// ---------------------------------------------------------------------------
// Weeks
// ---------------------------------------------------------------------------

/** Deep-copy one authored cell into a program at a given position. */
function copyDayInto(
	tx: Db,
	programId: number,
	sourceDayId: number,
	weekNumber: number,
	orderIndex: number
): number {
	const source = tx
		.select()
		.from(schema.programDays)
		.where(eq(schema.programDays.id, sourceDayId))
		.get()!;

	const newDayId = tx
		.insert(schema.programDays)
		.values({
			programId,
			weekNumber,
			orderIndex,
			title: source.title,
			notes: source.notes
		})
		.returning({ id: schema.programDays.id })
		.get().id;

	const items = tx
		.select()
		.from(schema.programDayExercises)
		.where(eq(schema.programDayExercises.programDayId, sourceDayId))
		.orderBy(asc(schema.programDayExercises.orderIndex), asc(schema.programDayExercises.id))
		.all();

	items.forEach((item, index) => {
		tx.insert(schema.programDayExercises)
			.values({
				programDayId: newDayId,
				exerciseId: item.exerciseId,
				orderIndex: index,
				targetSets: item.targetSets,
				targetRepsMin: item.targetRepsMin,
				targetRepsMax: item.targetRepsMax,
				intensityMode: item.intensityMode,
				targetRpe: item.targetRpe,
				targetPercentOneRm: item.targetPercentOneRm,
				targetDistanceM: item.targetDistanceM,
				targetDurationS: item.targetDurationS,
				notes: item.notes
			})
			.run();
	});

	return newDayId;
}

/** Append an empty week. Returns its number. */
export function addProgramWeek(
	userId: number,
	programId: number,
	db: Db = getDb()
): number | null {
	if (!ownsProgram(userId, programId, db)) return null;

	return db.transaction((tx) => {
		const program = tx
			.select({ daysPerWeek: schema.programs.daysPerWeek })
			.from(schema.programs)
			.where(eq(schema.programs.id, programId))
			.get()!;

		const last =
			tx
				.select({ value: sql<number | null>`max(${schema.programDays.weekNumber})` })
				.from(schema.programDays)
				.where(eq(schema.programDays.programId, programId))
				.get()?.value ?? 0;

		const weekNumber = last + 1;
		for (let i = 0; i < program.daysPerWeek; i++) {
			tx.insert(schema.programDays).values({ programId, weekNumber, orderIndex: i }).run();
		}

		touch(programId, tx as Db);
		return weekNumber;
	});
}

/**
 * Copy a week in immediately after itself, pushing the later weeks down.
 *
 * The one feature that makes a twelve-week block writable by hand. Every real
 * program is the same week with the numbers nudged, and authoring sixty cells
 * from scratch is where people give up and go back to a spreadsheet.
 */
export function duplicateProgramWeek(
	userId: number,
	programId: number,
	weekNumber: number,
	db: Db = getDb()
): number | null {
	if (!ownsProgram(userId, programId, db)) return null;

	return db.transaction((tx) => {
		const source = tx
			.select()
			.from(schema.programDays)
			.where(
				and(
					eq(schema.programDays.programId, programId),
					eq(schema.programDays.weekNumber, weekNumber)
				)
			)
			.orderBy(asc(schema.programDays.orderIndex), asc(schema.programDays.id))
			.all();
		if (source.length === 0) return null;

		// Safe only because `program_days_program_idx` is not unique: this shift
		// collides transiently with the rows it is moving past.
		tx.update(schema.programDays)
			.set({ weekNumber: sql`${schema.programDays.weekNumber} + 1` })
			.where(
				and(
					eq(schema.programDays.programId, programId),
					sql`${schema.programDays.weekNumber} > ${weekNumber}`
				)
			)
			.run();

		source.forEach((day, index) => {
			copyDayInto(tx as Db, programId, day.id, weekNumber + 1, index);
		});

		touch(programId, tx as Db);
		return weekNumber + 1;
	});
}

/** Delete a week and close the gap, keeping week numbers dense. */
export function deleteProgramWeek(
	userId: number,
	programId: number,
	weekNumber: number,
	db: Db = getDb()
): boolean {
	if (!ownsProgram(userId, programId, db)) return false;

	return db.transaction((tx) => {
		const doomed = dayIdsOf(tx as Db, programId, weekNumber);
		if (doomed.length === 0) return false;

		unlinkWorkouts(tx as Db, { dayIds: doomed });
		tx.delete(schema.programDays).where(inArray(schema.programDays.id, doomed)).run();

		tx.update(schema.programDays)
			.set({ weekNumber: sql`${schema.programDays.weekNumber} - 1` })
			.where(
				and(
					eq(schema.programDays.programId, programId),
					sql`${schema.programDays.weekNumber} > ${weekNumber}`
				)
			)
			.run();

		touch(programId, tx as Db);
		return true;
	});
}

// ---------------------------------------------------------------------------
// Day cells
// ---------------------------------------------------------------------------

export function updateProgramDay(
	userId: number,
	programDayId: number,
	input: { title?: string | null; notes?: string | null },
	db: Db = getDb()
): boolean {
	const programId = programIdForDay(userId, programDayId, db);
	if (programId == null) return false;

	const patch: Record<string, unknown> = {};
	if (input.title !== undefined) patch.title = input.title?.trim() || null;
	if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
	if (Object.keys(patch).length === 0) return true;

	db.update(schema.programDays)
		.set(patch)
		.where(eq(schema.programDays.id, programDayId))
		.run();
	touch(programId, db);
	return true;
}

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------

export function addExerciseToProgramDay(
	userId: number,
	programDayId: number,
	exerciseId: number,
	db: Db = getDb()
): number | null {
	const programId = programIdForDay(userId, programDayId, db);
	if (programId == null) return null;

	return db.transaction((tx) => {
		const next =
			(tx
				.select({ value: sql<number | null>`max(${schema.programDayExercises.orderIndex})` })
				.from(schema.programDayExercises)
				.where(eq(schema.programDayExercises.programDayId, programDayId))
				.get()?.value ?? -1) + 1;

		const id = tx
			.insert(schema.programDayExercises)
			.values({ programDayId, exerciseId, orderIndex: next, targetSets: 3 })
			.returning({ id: schema.programDayExercises.id })
			.get().id;

		touch(programId, tx as Db);
		return id;
	});
}

export type PrescriptionTargets = {
	targetSets?: number | null;
	targetRepsMin?: number | null;
	targetRepsMax?: number | null;
	intensityMode?: IntensityMode | null;
	targetRpe?: number | null;
	targetPercentOneRm?: number | null;
	targetDistanceM?: number | null;
	targetDurationS?: number | null;
	notes?: string | null;
};

/**
 * Patch one prescription. `undefined` leaves a column alone, the same
 * blank-is-not-zero contract the form readers produce.
 *
 * Refuses a percentage on a movement that has no meaningful one-rep max. The
 * editor hides the control, but a hand-rolled POST is not the editor and 75% of
 * a plank is not a number.
 */
export function updateProgramPrescription(
	userId: number,
	prescriptionId: number,
	targets: PrescriptionTargets,
	db: Db = getDb()
): boolean {
	const programId = programIdForPrescription(userId, prescriptionId, db);
	if (programId == null) return false;

	if (targets.intensityMode === 'percent_1rm') {
		const row = db
			.select({ kind: schema.exercises.kind })
			.from(schema.programDayExercises)
			.innerJoin(schema.exercises, eq(schema.exercises.id, schema.programDayExercises.exerciseId))
			.where(eq(schema.programDayExercises.id, prescriptionId))
			.get();
		if (!row || !supportsOneRm(row.kind)) return false;
	}

	const patch = Object.fromEntries(
		Object.entries(targets).filter(([, value]) => value !== undefined)
	);
	if (Object.keys(patch).length === 0) return true;

	db.update(schema.programDayExercises)
		.set(patch)
		.where(eq(schema.programDayExercises.id, prescriptionId))
		.run();
	touch(programId, db);
	return true;
}

export function removeProgramPrescription(
	userId: number,
	prescriptionId: number,
	db: Db = getDb()
): boolean {
	const programId = programIdForPrescription(userId, prescriptionId, db);
	if (programId == null) return false;

	db.delete(schema.programDayExercises)
		.where(eq(schema.programDayExercises.id, prescriptionId))
		.run();
	touch(programId, db);
	return true;
}

export function moveProgramPrescription(
	userId: number,
	prescriptionId: number,
	direction: -1 | 1,
	db: Db = getDb()
): boolean {
	const programId = programIdForPrescription(userId, prescriptionId, db);
	if (programId == null) return false;

	return db.transaction((tx) => {
		const dayId = tx
			.select({ programDayId: schema.programDayExercises.programDayId })
			.from(schema.programDayExercises)
			.where(eq(schema.programDayExercises.id, prescriptionId))
			.get()!.programDayId;

		const ordered = tx
			.select({ id: schema.programDayExercises.id })
			.from(schema.programDayExercises)
			.where(eq(schema.programDayExercises.programDayId, dayId))
			.orderBy(asc(schema.programDayExercises.orderIndex), asc(schema.programDayExercises.id))
			.all()
			.map((r) => r.id);

		const from = ordered.indexOf(prescriptionId);
		const to = from + direction;
		if (from < 0 || to < 0 || to >= ordered.length) return false;

		ordered.splice(to, 0, ordered.splice(from, 1)[0]);
		// Rewriting every index keeps them dense, so ordering never depends on
		// gaps left behind by earlier moves.
		ordered.forEach((id, index) => {
			tx.update(schema.programDayExercises)
				.set({ orderIndex: index })
				.where(eq(schema.programDayExercises.id, id))
				.run();
		});

		touch(programId, tx as Db);
		return true;
	});
}

// ---------------------------------------------------------------------------
// Enrolment
// ---------------------------------------------------------------------------

export type OneRmSuggestion = {
	exerciseId: number;
	name: string;
	kind: ExerciseKind;
	/** Best estimate from logged history, or null when there is nothing to go on. */
	estimatedOneRmKg: number | null;
	/**
	 * Why there is no estimate, so the form can tell "never logged this" apart
	 * from "logged it, but only for sets too long to estimate from". Collapsing
	 * the two reads as a bug to anyone who trains high reps.
	 */
	source: 'estimate' | 'high_reps_only' | 'none';
	basisWeightKg: number | null;
	basisReps: number | null;
	basisDate: IsoDate | null;
};

/**
 * The exercises this program prescribes by percentage, with the number to
 * prefill on the enrolment form.
 *
 * Reuses the Records page's notion of a best 1RM rather than inventing a second
 * one — the two must never disagree about how strong you are.
 */
export function suggestOneRmSnapshot(
	userId: number,
	programId: number,
	formula: OneRmFormula,
	db: Db = getDb()
): OneRmSuggestion[] {
	const rows = db
		.selectDistinct({
			exerciseId: schema.exercises.id,
			name: schema.exercises.name,
			kind: schema.exercises.kind
		})
		.from(schema.programDayExercises)
		.innerJoin(
			schema.programDays,
			eq(schema.programDays.id, schema.programDayExercises.programDayId)
		)
		.innerJoin(schema.exercises, eq(schema.exercises.id, schema.programDayExercises.exerciseId))
		.innerJoin(schema.programs, eq(schema.programs.id, schema.programDays.programId))
		.where(
			and(
				eq(schema.programs.id, programId),
				eq(schema.programs.userId, userId),
				eq(schema.programDayExercises.intensityMode, 'percent_1rm')
			)
		)
		.orderBy(asc(schema.exercises.name))
		.all();

	return rows.map((row) => {
		const records = getExerciseRecords(userId, row.exerciseId, formula, db);
		if (records.bestOneRm) {
			return {
				exerciseId: row.exerciseId,
				name: row.name,
				kind: row.kind,
				estimatedOneRmKg: records.bestOneRm.value,
				source: 'estimate' as const,
				basisWeightKg: records.bestOneRm.weightKg,
				basisReps: records.bestOneRm.reps,
				basisDate: records.bestOneRm.date
			};
		}
		return {
			exerciseId: row.exerciseId,
			name: row.name,
			kind: row.kind,
			estimatedOneRmKg: null,
			// A heaviest set with no estimate means every logged set ran past the
			// rep ceiling the formulas stay honest within.
			source: records.heaviestSet ? ('high_reps_only' as const) : ('none' as const),
			basisWeightKg: records.heaviestSet?.weightKg ?? null,
			basisReps: records.heaviestSet?.reps ?? null,
			basisDate: records.heaviestSet?.date ?? null
		};
	});
}

/**
 * Start a run of a program.
 *
 * The reference maxes are written here and only here. Fixing them for the whole
 * block is the point: a PR in week 6 must not silently reprice weeks 7 to 12,
 * and neither must changing the estimation formula in Settings.
 */
export function enrolInProgram(
	userId: number,
	programId: number,
	input: {
		startedOn: IsoDate;
		/** kg. Exercises left out simply have no reference, which is allowed. */
		oneRms: Array<{ exerciseId: number; oneRmKg: number; isManual: boolean }>;
	},
	db: Db = getDb()
): number | null {
	if (!ownsProgram(userId, programId, db)) return null;

	return db.transaction((tx) => {
		const enrollmentId = tx
			.insert(schema.programEnrollments)
			.values({ userId, programId, startedOn: input.startedOn })
			.returning({ id: schema.programEnrollments.id })
			.get().id;

		// Only ids this program actually prescribes: `oneRms` came off a form.
		const allowed = new Set(
			tx
				.selectDistinct({ exerciseId: schema.programDayExercises.exerciseId })
				.from(schema.programDayExercises)
				.innerJoin(
					schema.programDays,
					eq(schema.programDays.id, schema.programDayExercises.programDayId)
				)
				.where(eq(schema.programDays.programId, programId))
				.all()
				.map((r) => r.exerciseId)
		);

		for (const entry of input.oneRms) {
			if (!allowed.has(entry.exerciseId)) continue;
			if (!(entry.oneRmKg > 0)) continue;
			tx.insert(schema.programOneRms)
				.values({
					enrollmentId,
					exerciseId: entry.exerciseId,
					oneRmKg: entry.oneRmKg,
					isManual: entry.isManual
				})
				.run();
		}

		return enrollmentId;
	});
}

export type EnrollmentSummary = {
	id: number;
	programId: number;
	programName: string;
	startedOn: IsoDate;
	completedOn: IsoDate | null;
	doneDays: number;
	totalDays: number;
};

export function listEnrollments(
	userId: number,
	options: { activeOnly?: boolean } = {},
	db: Db = getDb()
): EnrollmentSummary[] {
	const conditions = [eq(schema.programEnrollments.userId, userId)];
	if (options.activeOnly) conditions.push(isNull(schema.programEnrollments.completedOn));

	const rows = db
		.select({
			id: schema.programEnrollments.id,
			programId: schema.programEnrollments.programId,
			programName: schema.programs.name,
			startedOn: schema.programEnrollments.startedOn,
			completedOn: schema.programEnrollments.completedOn
		})
		.from(schema.programEnrollments)
		.innerJoin(schema.programs, eq(schema.programs.id, schema.programEnrollments.programId))
		.where(and(...conditions))
		.orderBy(asc(schema.programEnrollments.completedOn), asc(schema.programEnrollments.startedOn))
		.all();

	return rows.map((row) => ({ ...row, ...progressOf(userId, row.id, row.programId, db) }));
}

/** How far through a run the user is. Derived from linked finished workouts. */
function progressOf(
	userId: number,
	enrollmentId: number,
	programId: number,
	db: Db
): { doneDays: number; totalDays: number } {
	const total =
		db
			.select({ value: sql<number>`count(*)` })
			.from(schema.programDays)
			.where(eq(schema.programDays.programId, programId))
			.get()?.value ?? 0;

	const done =
		db
			.select({ value: sql<number>`count(distinct ${schema.workouts.programDayId})` })
			.from(schema.workouts)
			.where(
				and(
					eq(schema.workouts.userId, userId),
					eq(schema.workouts.programEnrollmentId, enrollmentId),
					isNotNull(schema.workouts.programDayId),
					isNotNull(schema.workouts.endedAt)
				)
			)
			.get()?.value ?? 0;

	return { doneDays: done, totalDays: total };
}

export type EnrollmentDetail = EnrollmentSummary & {
	oneRms: Array<{ exerciseId: number; name: string; oneRmKg: number; isManual: boolean }>;
	/** Exercises prescribed by percentage with no reference max on this run. */
	missingOneRmCount: number;
};

export function getEnrollment(
	userId: number,
	enrollmentId: number,
	db: Db = getDb()
): EnrollmentDetail | null {
	const row = db
		.select({
			id: schema.programEnrollments.id,
			programId: schema.programEnrollments.programId,
			programName: schema.programs.name,
			startedOn: schema.programEnrollments.startedOn,
			completedOn: schema.programEnrollments.completedOn
		})
		.from(schema.programEnrollments)
		.innerJoin(schema.programs, eq(schema.programs.id, schema.programEnrollments.programId))
		.where(
			and(
				eq(schema.programEnrollments.id, enrollmentId),
				eq(schema.programEnrollments.userId, userId)
			)
		)
		.get();
	if (!row) return null;

	const oneRms = db
		.select({
			exerciseId: schema.programOneRms.exerciseId,
			name: schema.exercises.name,
			oneRmKg: schema.programOneRms.oneRmKg,
			isManual: schema.programOneRms.isManual
		})
		.from(schema.programOneRms)
		.innerJoin(schema.exercises, eq(schema.exercises.id, schema.programOneRms.exerciseId))
		.where(eq(schema.programOneRms.enrollmentId, enrollmentId))
		.orderBy(asc(schema.exercises.name))
		.all();

	const prescribed = db
		.selectDistinct({ exerciseId: schema.programDayExercises.exerciseId })
		.from(schema.programDayExercises)
		.innerJoin(
			schema.programDays,
			eq(schema.programDays.id, schema.programDayExercises.programDayId)
		)
		.where(
			and(
				eq(schema.programDays.programId, row.programId),
				eq(schema.programDayExercises.intensityMode, 'percent_1rm')
			)
		)
		.all()
		.map((r) => r.exerciseId);

	const have = new Set(oneRms.map((r) => r.exerciseId));

	return {
		...row,
		...progressOf(userId, row.id, row.programId, db),
		oneRms,
		missingOneRmCount: prescribed.filter((id) => !have.has(id)).length
	};
}

/**
 * Correct a reference max mid-run.
 *
 * Only changes days not yet started: a workout already generated keeps the
 * weights it was generated with, because those record what was asked of you on
 * the day rather than a live view of the plan.
 */
export function updateEnrollmentOneRm(
	userId: number,
	enrollmentId: number,
	exerciseId: number,
	oneRmKg: number,
	db: Db = getDb()
): boolean {
	if (!ownsEnrollment(userId, enrollmentId, db)) return false;
	if (!(oneRmKg > 0)) return false;

	db.insert(schema.programOneRms)
		.values({ enrollmentId, exerciseId, oneRmKg, isManual: true })
		.onConflictDoUpdate({
			target: [schema.programOneRms.enrollmentId, schema.programOneRms.exerciseId],
			set: { oneRmKg, isManual: true }
		})
		.run();
	return true;
}

export function completeEnrollment(
	userId: number,
	enrollmentId: number,
	completedOn: IsoDate,
	db: Db = getDb()
): boolean {
	if (!ownsEnrollment(userId, enrollmentId, db)) return false;
	db.update(schema.programEnrollments)
		.set({ completedOn, updatedAt: new Date() })
		.where(eq(schema.programEnrollments.id, enrollmentId))
		.run();
	return true;
}

export function reopenEnrollment(
	userId: number,
	enrollmentId: number,
	db: Db = getDb()
): boolean {
	if (!ownsEnrollment(userId, enrollmentId, db)) return false;
	db.update(schema.programEnrollments)
		.set({ completedOn: null, updatedAt: new Date() })
		.where(eq(schema.programEnrollments.id, enrollmentId))
		.run();
	return true;
}

/** Abandon a run. The workouts logged under it survive and lose only the badge. */
export function deleteEnrollment(
	userId: number,
	enrollmentId: number,
	db: Db = getDb()
): boolean {
	if (!ownsEnrollment(userId, enrollmentId, db)) return false;

	return db.transaction((tx) => {
		unlinkWorkouts(tx as Db, { enrollmentId });
		tx.delete(schema.programEnrollments)
			.where(eq(schema.programEnrollments.id, enrollmentId))
			.run();
		return true;
	});
}

// ---------------------------------------------------------------------------
// Up next
// ---------------------------------------------------------------------------

export type UpNext = {
	enrollmentId: number;
	programId: number;
	programName: string;
	programDayId: number;
	weekNumber: number;
	/** Position within the week, 1-based for display. */
	dayNumber: number;
	title: string | null;
	exerciseNames: string[];
	/** Set when this cell already has a workout that was never finished. */
	resumeWorkoutId: number | null;
	doneDays: number;
	totalDays: number;
};

/**
 * The next session of a run: the first cell with no finished workout against it.
 *
 * "No workout at all" would be the obvious rule and it is wrong — starting day
 * 3 would immediately make day 4 the next one, so the dashboard would advance
 * past the session you are standing in the middle of. A cell that has an
 * unfinished workout resolves to that workout instead, and the caller offers to
 * resume it.
 *
 * Derived every time rather than stored. A cursor would be wrong the moment you
 * deleted a workout, trained the days out of order, or ran the program again.
 */
export function getUpNext(
	userId: number,
	enrollmentId: number,
	db: Db = getDb()
): UpNext | null {
	const enrollment = db
		.select({
			id: schema.programEnrollments.id,
			programId: schema.programEnrollments.programId,
			programName: schema.programs.name
		})
		.from(schema.programEnrollments)
		.innerJoin(schema.programs, eq(schema.programs.id, schema.programEnrollments.programId))
		.where(
			and(
				eq(schema.programEnrollments.id, enrollmentId),
				eq(schema.programEnrollments.userId, userId),
				isNull(schema.programEnrollments.completedOn)
			)
		)
		.get();
	if (!enrollment) return null;

	const finished = db
		.select({ programDayId: schema.workouts.programDayId })
		.from(schema.workouts)
		.where(
			and(
				eq(schema.workouts.programEnrollmentId, enrollmentId),
				isNotNull(schema.workouts.programDayId),
				isNotNull(schema.workouts.endedAt)
			)
		)
		.all()
		.map((r) => r.programDayId!);

	const conditions = [eq(schema.programDays.programId, enrollment.programId)];
	if (finished.length) {
		conditions.push(notInArray(schema.programDays.id, finished));
	}

	const next = db
		.select()
		.from(schema.programDays)
		.where(and(...conditions))
		.orderBy(
			asc(schema.programDays.weekNumber),
			asc(schema.programDays.orderIndex),
			asc(schema.programDays.id)
		)
		.limit(1)
		.get();
	if (!next) return null;

	const open = db
		.select({ id: schema.workouts.id })
		.from(schema.workouts)
		.where(
			and(
				eq(schema.workouts.programEnrollmentId, enrollmentId),
				eq(schema.workouts.programDayId, next.id),
				isNull(schema.workouts.endedAt)
			)
		)
		.get();

	const names = db
		.select({ name: schema.exercises.name })
		.from(schema.programDayExercises)
		.innerJoin(schema.exercises, eq(schema.exercises.id, schema.programDayExercises.exerciseId))
		.where(eq(schema.programDayExercises.programDayId, next.id))
		.orderBy(asc(schema.programDayExercises.orderIndex))
		.all()
		.map((r) => r.name);

	return {
		enrollmentId,
		programId: enrollment.programId,
		programName: enrollment.programName,
		programDayId: next.id,
		weekNumber: next.weekNumber,
		dayNumber: next.orderIndex + 1,
		title: next.title,
		exerciseNames: names,
		resumeWorkoutId: open?.id ?? null,
		...progressOf(userId, enrollmentId, enrollment.programId, db)
	};
}

/** The up-next of whichever run is live, for the dashboard. */
export function getActiveUpNext(userId: number, db: Db = getDb()): UpNext | null {
	const active = db
		.select({ id: schema.programEnrollments.id })
		.from(schema.programEnrollments)
		.where(
			and(
				eq(schema.programEnrollments.userId, userId),
				isNull(schema.programEnrollments.completedOn)
			)
		)
		.orderBy(asc(schema.programEnrollments.startedOn))
		.limit(1)
		.get();

	return active ? getUpNext(userId, active.id, db) : null;
}

/** Which cells of a run already have a workout, for ticking off the grid. */
export function getEnrollmentProgress(
	userId: number,
	enrollmentId: number,
	db: Db = getDb()
): Map<number, { workoutId: number; isFinished: boolean; performedOn: IsoDate }> {
	const rows = db
		.select({
			programDayId: schema.workouts.programDayId,
			workoutId: schema.workouts.id,
			endedAt: schema.workouts.endedAt,
			performedOn: schema.workouts.performedOn
		})
		.from(schema.workouts)
		.where(
			and(
				eq(schema.workouts.userId, userId),
				eq(schema.workouts.programEnrollmentId, enrollmentId),
				isNotNull(schema.workouts.programDayId)
			)
		)
		.orderBy(asc(schema.workouts.id))
		.all();

	const progress = new Map<
		number,
		{ workoutId: number; isFinished: boolean; performedOn: IsoDate }
	>();
	for (const row of rows) {
		progress.set(row.programDayId!, {
			workoutId: row.workoutId,
			isFinished: row.endedAt != null,
			performedOn: row.performedOn
		});
	}
	return progress;
}

// ---------------------------------------------------------------------------
// Starting a session
// ---------------------------------------------------------------------------

export type StartDayResult = {
	workoutId: number | null;
	/** True when an existing workout for this cell was handed back instead. */
	reused?: boolean;
	reason?: 'not_found' | 'enrollment_closed';
};

/**
 * Start today's session from a program cell.
 *
 * A result object rather than a bare null because the caller has several
 * different things to tell the user: here is a new workout, here is the one you
 * already started, this run is closed, or this is not yours.
 *
 * `units` decides the rounding increment for percentage targets and comes from
 * the caller's profile, the same way the 1RM formula is threaded into stats.
 */
export function startProgramDay(
	userId: number,
	enrollmentId: number,
	programDayId: number,
	input: { performedOn: IsoDate; units: UnitSystem },
	db: Db = getDb()
): StartDayResult {
	return db.transaction((tx) => {
		const cell = tx
			.select({
				dayId: schema.programDays.id,
				weekNumber: schema.programDays.weekNumber,
				orderIndex: schema.programDays.orderIndex,
				title: schema.programDays.title,
				notes: schema.programDays.notes,
				completedOn: schema.programEnrollments.completedOn
			})
			.from(schema.programDays)
			.innerJoin(
				schema.programEnrollments,
				eq(schema.programEnrollments.programId, schema.programDays.programId)
			)
			.where(
				and(
					eq(schema.programDays.id, programDayId),
					eq(schema.programEnrollments.id, enrollmentId),
					eq(schema.programEnrollments.userId, userId)
				)
			)
			.get();
		if (!cell) return { workoutId: null, reason: 'not_found' as const };
		if (cell.completedOn != null) {
			return { workoutId: null, reason: 'enrollment_closed' as const };
		}

		// The database permits a second attempt at a day — bombing one and
		// redoing it is real — but the default path hands back what is there.
		const existing = tx
			.select({ id: schema.workouts.id })
			.from(schema.workouts)
			.where(
				and(
					eq(schema.workouts.programEnrollmentId, enrollmentId),
					eq(schema.workouts.programDayId, programDayId),
					isNull(schema.workouts.endedAt)
				)
			)
			.get();
		if (existing) return { workoutId: existing.id, reused: true };

		const items = tx
			.select()
			.from(schema.programDayExercises)
			.where(eq(schema.programDayExercises.programDayId, programDayId))
			.orderBy(asc(schema.programDayExercises.orderIndex), asc(schema.programDayExercises.id))
			.all();

		const snapshot = new Map(
			tx
				.select({
					exerciseId: schema.programOneRms.exerciseId,
					oneRmKg: schema.programOneRms.oneRmKg
				})
				.from(schema.programOneRms)
				.where(eq(schema.programOneRms.enrollmentId, enrollmentId))
				.all()
				.map((r) => [r.exerciseId, r.oneRmKg])
		);

		const workoutId = tx
			.insert(schema.workouts)
			.values({
				userId,
				performedOn: input.performedOn,
				title: cell.title ?? `Week ${cell.weekNumber} · Day ${cell.orderIndex + 1}`,
				notes: cell.notes,
				startedAt: new Date(),
				programEnrollmentId: enrollmentId,
				programDayId
			})
			.returning({ id: schema.workouts.id })
			.get().id;

		items.forEach((item, index) => {
			writePrescribedExercise(tx as Db, workoutId, {
				exerciseId: item.exerciseId,
				orderIndex: index,
				targetSets: item.targetSets,
				notes: item.notes,
				prescription: resolvePrescription(
					item,
					snapshot.get(item.exerciseId) ?? null,
					input.units
				)
			});
		});

		return { workoutId, reused: false };
	});
}
