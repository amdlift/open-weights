/**
 * Shared vocabulary for the whole app.
 *
 * These live outside `$lib/server` because both the database schema and the
 * client-rendered forms need them, and anything under `$lib/server` is barred
 * from the browser bundle.
 */

export const EXERCISE_KINDS = [
	'weight_reps',
	'bodyweight_reps',
	'weighted_bodyweight',
	'cardio',
	'duration'
] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];

export const EXERCISE_KIND_LABELS: Record<ExerciseKind, string> = {
	weight_reps: 'Weight & reps',
	bodyweight_reps: 'Bodyweight reps',
	weighted_bodyweight: 'Bodyweight + added weight',
	cardio: 'Cardio (distance & time)',
	duration: 'Timed hold'
};

export const EXERCISE_KIND_HINTS: Record<ExerciseKind, string> = {
	weight_reps: 'Barbell, dumbbell, cable and machine work.',
	bodyweight_reps: 'Push-ups, air squats — reps only.',
	weighted_bodyweight: 'Pull-ups and dips, where the weight is what you add.',
	cardio: 'Runs, rides, rows — distance and time.',
	duration: 'Planks, carries, hangs — time only.'
};

/** Which fields the set editor shows, derived from the exercise kind. */
export function fieldsForKind(kind: ExerciseKind): {
	weight: boolean;
	reps: boolean;
	rpe: boolean;
	distance: boolean;
	duration: boolean;
} {
	switch (kind) {
		case 'weight_reps':
			return { weight: true, reps: true, rpe: true, distance: false, duration: false };
		case 'weighted_bodyweight':
			return { weight: true, reps: true, rpe: true, distance: false, duration: false };
		case 'bodyweight_reps':
			return { weight: false, reps: true, rpe: true, distance: false, duration: false };
		case 'cardio':
			return { weight: false, reps: false, rpe: false, distance: true, duration: true };
		case 'duration':
			return { weight: false, reps: false, rpe: false, distance: false, duration: true };
	}
}

/** True when sets of this kind can contribute to a 1RM estimate. */
export function supportsOneRm(kind: ExerciseKind): boolean {
	return kind === 'weight_reps' || kind === 'weighted_bodyweight';
}

/** True when sets of this kind contribute weight × reps to volume totals. */
export function supportsVolume(kind: ExerciseKind): boolean {
	return kind === 'weight_reps' || kind === 'weighted_bodyweight';
}

export const MUSCLE_GROUPS = [
	'chest',
	'back',
	'shoulders',
	'biceps',
	'triceps',
	'forearms',
	'quads',
	'hamstrings',
	'glutes',
	'calves',
	'core',
	'full_body',
	'cardio'
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
	chest: 'Chest',
	back: 'Back',
	shoulders: 'Shoulders',
	biceps: 'Biceps',
	triceps: 'Triceps',
	forearms: 'Forearms',
	quads: 'Quads',
	hamstrings: 'Hamstrings',
	glutes: 'Glutes',
	calves: 'Calves',
	core: 'Core',
	full_body: 'Full body',
	cardio: 'Cardio'
};

/**
 * Muscle groups folded into five movement patterns.
 *
 * The volume chart is a stacked bar, and thirteen stacked categories is far past
 * what any categorical palette can keep distinguishable — the honest fix is
 * fewer, meaningful buckets rather than more hues. These five are also the split
 * a lifter actually asks about ("am I neglecting legs?").
 */
export const MOVEMENT_GROUPS = ['push', 'pull', 'legs', 'core', 'other'] as const;
export type MovementGroup = (typeof MOVEMENT_GROUPS)[number];

export const MOVEMENT_GROUP_LABELS: Record<MovementGroup, string> = {
	push: 'Push',
	pull: 'Pull',
	legs: 'Legs',
	core: 'Core',
	other: 'Other'
};

const MOVEMENT_GROUP_BY_MUSCLE: Record<MuscleGroup, MovementGroup> = {
	chest: 'push',
	shoulders: 'push',
	triceps: 'push',
	back: 'pull',
	biceps: 'pull',
	forearms: 'pull',
	quads: 'legs',
	hamstrings: 'legs',
	glutes: 'legs',
	calves: 'legs',
	core: 'core',
	full_body: 'other',
	cardio: 'other'
};

export function movementGroupFor(muscle: MuscleGroup | null | undefined): MovementGroup {
	return muscle ? MOVEMENT_GROUP_BY_MUSCLE[muscle] : 'other';
}

export const EQUIPMENT_TYPES = [
	'barbell',
	'dumbbell',
	'machine',
	'cable',
	'bodyweight',
	'kettlebell',
	'band',
	'cardio_machine',
	'other'
] as const;
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

export const EQUIPMENT_LABELS: Record<EquipmentType, string> = {
	barbell: 'Barbell',
	dumbbell: 'Dumbbell',
	machine: 'Machine',
	cable: 'Cable',
	bodyweight: 'Bodyweight',
	kettlebell: 'Kettlebell',
	band: 'Band',
	cardio_machine: 'Cardio machine',
	other: 'Other'
};

export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const UNIT_SYSTEM_LABELS: Record<UnitSystem, string> = {
	metric: 'Metric (kg, cm, km)',
	imperial: 'Imperial (lb, ft/in, mi)'
};

export const ONE_RM_FORMULAS = ['epley', 'brzycki', 'lombardi'] as const;
export type OneRmFormula = (typeof ONE_RM_FORMULAS)[number];

export const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABELS: Record<Gender, string> = {
	male: 'Male',
	female: 'Female',
	other: 'Other',
	prefer_not_to_say: 'Prefer not to say'
};

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
	system: 'Match system',
	light: 'Light',
	dark: 'Dark'
};

export const USER_ROLES = ['admin', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Circumference fields, in the order they are shown. One list so the form, the
 * history table, the server validation and the export never drift apart.
 */
export const MEASUREMENT_FIELDS = [
	{ key: 'neckCm', label: 'Neck' },
	{ key: 'chestCm', label: 'Chest' },
	{ key: 'waistCm', label: 'Waist' },
	{ key: 'hipsCm', label: 'Hips' },
	{ key: 'armCm', label: 'Arm' },
	{ key: 'thighCm', label: 'Thigh' },
	{ key: 'calfCm', label: 'Calf' }
] as const;

export type MeasurementField = (typeof MEASUREMENT_FIELDS)[number]['key'];

// --- credentials ----------------------------------------------------------

export const MIN_PASSWORD_LENGTH = 8;
/** Argon2 will hash more, but nothing good comes of unbounded input. */
export const MAX_PASSWORD_LENGTH = 256;

// --- misc -----------------------------------------------------------------

/** Rate of perceived exertion, in the half-point steps lifters actually use. */
export const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

export function isOneOf<T extends readonly string[]>(
	values: T,
	candidate: unknown
): candidate is T[number] {
	return typeof candidate === 'string' && (values as readonly string[]).includes(candidate);
}
