import { and, desc, eq } from 'drizzle-orm';
import type { MeasurementField } from '$lib/constants';
import type { IsoDate } from '$lib/dates';
import { getDb, type Db } from './db';
import * as schema from './db/schema';

/**
 * Every field is optional on purpose: omitting one means "leave it alone",
 * which is what lets the quick bodyweight form coexist with the full one.
 * Passing `null` is the explicit way to clear a value.
 */
export type MeasurementInput = {
	weightKg?: number | null;
	bodyFatPct?: number | null;
	notes?: string | null;
} & Partial<Record<MeasurementField, number | null>>;

export function listMeasurements(userId: number, db: Db = getDb()) {
	return db
		.select()
		.from(schema.bodyMeasurements)
		.where(eq(schema.bodyMeasurements.userId, userId))
		.orderBy(desc(schema.bodyMeasurements.measuredOn))
		.all();
}

export function getMeasurement(userId: number, date: IsoDate, db: Db = getDb()) {
	return (
		db
			.select()
			.from(schema.bodyMeasurements)
			.where(
				and(
					eq(schema.bodyMeasurements.userId, userId),
					eq(schema.bodyMeasurements.measuredOn, date)
				)
			)
			.get() ?? null
	);
}

/**
 * One entry per day: logging again for a date you already recorded updates that
 * entry rather than adding a second one. Weighing yourself twice in a morning
 * should not put two points on the trend line.
 *
 * Only the fields actually submitted are written, so saving a bodyweight from
 * the quick form never wipes the circumferences recorded earlier that day.
 */
export function upsertMeasurement(
	userId: number,
	date: IsoDate,
	input: MeasurementInput,
	db: Db = getDb()
): void {
	const patch = Object.fromEntries(
		Object.entries(input).filter(([, value]) => value !== undefined)
	);

	db.insert(schema.bodyMeasurements)
		.values({ userId, measuredOn: date, ...patch })
		.onConflictDoUpdate({
			target: [schema.bodyMeasurements.userId, schema.bodyMeasurements.measuredOn],
			set: patch
		})
		.run();
}

export function deleteMeasurement(userId: number, id: number, db: Db = getDb()): boolean {
	const existing = db
		.select({ id: schema.bodyMeasurements.id })
		.from(schema.bodyMeasurements)
		.where(
			and(eq(schema.bodyMeasurements.id, id), eq(schema.bodyMeasurements.userId, userId))
		)
		.get();
	if (!existing) return false;

	db.delete(schema.bodyMeasurements).where(eq(schema.bodyMeasurements.id, id)).run();
	return true;
}
