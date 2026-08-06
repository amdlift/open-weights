import type { EquipmentType, ExerciseKind, MuscleGroup } from '../../constants';

export type SeedExercise = {
	slug: string;
	name: string;
	kind: ExerciseKind;
	primaryMuscle: MuscleGroup;
	equipment: EquipmentType;
};

/**
 * The built-in exercise primitives shipped with the image.
 *
 * `slug` is the stable identity: the seeder upserts on it, so adding entries
 * here is safe across upgrades and renaming `name` will update existing rows.
 * Never reuse or repurpose a slug — that would silently rewrite user history.
 * Removing one is also not enough to delete it; rows already referenced by a
 * workout are archived rather than dropped.
 */
export const SEED_EXERCISES: SeedExercise[] = [
	// --- Chest ------------------------------------------------------------
	{ slug: 'barbell-bench-press', name: 'Barbell Bench Press', kind: 'weight_reps', primaryMuscle: 'chest', equipment: 'barbell' },
	{ slug: 'incline-barbell-bench-press', name: 'Incline Barbell Bench Press', kind: 'weight_reps', primaryMuscle: 'chest', equipment: 'barbell' },
	{ slug: 'decline-barbell-bench-press', name: 'Decline Barbell Bench Press', kind: 'weight_reps', primaryMuscle: 'chest', equipment: 'barbell' },
	{ slug: 'dumbbell-bench-press', name: 'Dumbbell Bench Press', kind: 'weight_reps', primaryMuscle: 'chest', equipment: 'dumbbell' },
	{ slug: 'incline-dumbbell-bench-press', name: 'Incline Dumbbell Bench Press', kind: 'weight_reps', primaryMuscle: 'chest', equipment: 'dumbbell' },
	{ slug: 'dumbbell-fly', name: 'Dumbbell Fly', kind: 'weight_reps', primaryMuscle: 'chest', equipment: 'dumbbell' },
	{ slug: 'incline-dumbbell-fly', name: 'Incline Dumbbell Fly', kind: 'weight_reps', primaryMuscle: 'chest', equipment: 'dumbbell' },
	{ slug: 'cable-fly', name: 'Cable Fly', kind: 'weight_reps', primaryMuscle: 'chest', equipment: 'cable' },
	{ slug: 'cable-crossover', name: 'Cable Crossover', kind: 'weight_reps', primaryMuscle: 'chest', equipment: 'cable' },
	{ slug: 'machine-chest-press', name: 'Machine Chest Press', kind: 'weight_reps', primaryMuscle: 'chest', equipment: 'machine' },
	{ slug: 'pec-deck', name: 'Pec Deck', kind: 'weight_reps', primaryMuscle: 'chest', equipment: 'machine' },
	{ slug: 'push-up', name: 'Push-Up', kind: 'bodyweight_reps', primaryMuscle: 'chest', equipment: 'bodyweight' },
	{ slug: 'diamond-push-up', name: 'Diamond Push-Up', kind: 'bodyweight_reps', primaryMuscle: 'chest', equipment: 'bodyweight' },
	{ slug: 'chest-dip', name: 'Chest Dip', kind: 'weighted_bodyweight', primaryMuscle: 'chest', equipment: 'bodyweight' },

	// --- Back -------------------------------------------------------------
	{ slug: 'deadlift', name: 'Deadlift', kind: 'weight_reps', primaryMuscle: 'back', equipment: 'barbell' },
	{ slug: 'sumo-deadlift', name: 'Sumo Deadlift', kind: 'weight_reps', primaryMuscle: 'back', equipment: 'barbell' },
	{ slug: 'trap-bar-deadlift', name: 'Trap Bar Deadlift', kind: 'weight_reps', primaryMuscle: 'back', equipment: 'barbell' },
	{ slug: 'rack-pull', name: 'Rack Pull', kind: 'weight_reps', primaryMuscle: 'back', equipment: 'barbell' },
	{ slug: 'barbell-row', name: 'Barbell Row', kind: 'weight_reps', primaryMuscle: 'back', equipment: 'barbell' },
	{ slug: 'pendlay-row', name: 'Pendlay Row', kind: 'weight_reps', primaryMuscle: 'back', equipment: 'barbell' },
	{ slug: 't-bar-row', name: 'T-Bar Row', kind: 'weight_reps', primaryMuscle: 'back', equipment: 'barbell' },
	{ slug: 'dumbbell-row', name: 'Dumbbell Row', kind: 'weight_reps', primaryMuscle: 'back', equipment: 'dumbbell' },
	{ slug: 'chest-supported-row', name: 'Chest-Supported Row', kind: 'weight_reps', primaryMuscle: 'back', equipment: 'machine' },
	{ slug: 'seated-cable-row', name: 'Seated Cable Row', kind: 'weight_reps', primaryMuscle: 'back', equipment: 'cable' },
	{ slug: 'lat-pulldown', name: 'Lat Pulldown', kind: 'weight_reps', primaryMuscle: 'back', equipment: 'cable' },
	{ slug: 'wide-grip-lat-pulldown', name: 'Wide-Grip Lat Pulldown', kind: 'weight_reps', primaryMuscle: 'back', equipment: 'cable' },
	{ slug: 'straight-arm-pulldown', name: 'Straight-Arm Pulldown', kind: 'weight_reps', primaryMuscle: 'back', equipment: 'cable' },
	{ slug: 'pull-up', name: 'Pull-Up', kind: 'weighted_bodyweight', primaryMuscle: 'back', equipment: 'bodyweight' },
	{ slug: 'chin-up', name: 'Chin-Up', kind: 'weighted_bodyweight', primaryMuscle: 'back', equipment: 'bodyweight' },
	{ slug: 'inverted-row', name: 'Inverted Row', kind: 'bodyweight_reps', primaryMuscle: 'back', equipment: 'bodyweight' },
	{ slug: 'barbell-shrug', name: 'Barbell Shrug', kind: 'weight_reps', primaryMuscle: 'back', equipment: 'barbell' },
	{ slug: 'dumbbell-shrug', name: 'Dumbbell Shrug', kind: 'weight_reps', primaryMuscle: 'back', equipment: 'dumbbell' },
	{ slug: 'back-extension', name: 'Back Extension', kind: 'weighted_bodyweight', primaryMuscle: 'back', equipment: 'bodyweight' },

	// --- Shoulders --------------------------------------------------------
	{ slug: 'overhead-press', name: 'Overhead Press', kind: 'weight_reps', primaryMuscle: 'shoulders', equipment: 'barbell' },
	{ slug: 'push-press', name: 'Push Press', kind: 'weight_reps', primaryMuscle: 'shoulders', equipment: 'barbell' },
	{ slug: 'seated-dumbbell-press', name: 'Seated Dumbbell Shoulder Press', kind: 'weight_reps', primaryMuscle: 'shoulders', equipment: 'dumbbell' },
	{ slug: 'arnold-press', name: 'Arnold Press', kind: 'weight_reps', primaryMuscle: 'shoulders', equipment: 'dumbbell' },
	{ slug: 'machine-shoulder-press', name: 'Machine Shoulder Press', kind: 'weight_reps', primaryMuscle: 'shoulders', equipment: 'machine' },
	{ slug: 'lateral-raise', name: 'Lateral Raise', kind: 'weight_reps', primaryMuscle: 'shoulders', equipment: 'dumbbell' },
	{ slug: 'cable-lateral-raise', name: 'Cable Lateral Raise', kind: 'weight_reps', primaryMuscle: 'shoulders', equipment: 'cable' },
	{ slug: 'front-raise', name: 'Front Raise', kind: 'weight_reps', primaryMuscle: 'shoulders', equipment: 'dumbbell' },
	{ slug: 'rear-delt-fly', name: 'Rear Delt Fly', kind: 'weight_reps', primaryMuscle: 'shoulders', equipment: 'dumbbell' },
	{ slug: 'face-pull', name: 'Face Pull', kind: 'weight_reps', primaryMuscle: 'shoulders', equipment: 'cable' },
	{ slug: 'upright-row', name: 'Upright Row', kind: 'weight_reps', primaryMuscle: 'shoulders', equipment: 'barbell' },
	{ slug: 'landmine-press', name: 'Landmine Press', kind: 'weight_reps', primaryMuscle: 'shoulders', equipment: 'barbell' },
	{ slug: 'pike-push-up', name: 'Pike Push-Up', kind: 'bodyweight_reps', primaryMuscle: 'shoulders', equipment: 'bodyweight' },

	// --- Biceps -----------------------------------------------------------
	{ slug: 'barbell-curl', name: 'Barbell Curl', kind: 'weight_reps', primaryMuscle: 'biceps', equipment: 'barbell' },
	{ slug: 'ez-bar-curl', name: 'EZ-Bar Curl', kind: 'weight_reps', primaryMuscle: 'biceps', equipment: 'barbell' },
	{ slug: 'dumbbell-curl', name: 'Dumbbell Curl', kind: 'weight_reps', primaryMuscle: 'biceps', equipment: 'dumbbell' },
	{ slug: 'hammer-curl', name: 'Hammer Curl', kind: 'weight_reps', primaryMuscle: 'biceps', equipment: 'dumbbell' },
	{ slug: 'incline-dumbbell-curl', name: 'Incline Dumbbell Curl', kind: 'weight_reps', primaryMuscle: 'biceps', equipment: 'dumbbell' },
	{ slug: 'preacher-curl', name: 'Preacher Curl', kind: 'weight_reps', primaryMuscle: 'biceps', equipment: 'barbell' },
	{ slug: 'cable-curl', name: 'Cable Curl', kind: 'weight_reps', primaryMuscle: 'biceps', equipment: 'cable' },
	{ slug: 'concentration-curl', name: 'Concentration Curl', kind: 'weight_reps', primaryMuscle: 'biceps', equipment: 'dumbbell' },

	// --- Triceps ----------------------------------------------------------
	{ slug: 'close-grip-bench-press', name: 'Close-Grip Bench Press', kind: 'weight_reps', primaryMuscle: 'triceps', equipment: 'barbell' },
	{ slug: 'tricep-pushdown', name: 'Tricep Pushdown', kind: 'weight_reps', primaryMuscle: 'triceps', equipment: 'cable' },
	{ slug: 'rope-pushdown', name: 'Rope Pushdown', kind: 'weight_reps', primaryMuscle: 'triceps', equipment: 'cable' },
	{ slug: 'overhead-tricep-extension', name: 'Overhead Tricep Extension', kind: 'weight_reps', primaryMuscle: 'triceps', equipment: 'dumbbell' },
	{ slug: 'skullcrusher', name: 'Skullcrusher', kind: 'weight_reps', primaryMuscle: 'triceps', equipment: 'barbell' },
	{ slug: 'tricep-kickback', name: 'Tricep Kickback', kind: 'weight_reps', primaryMuscle: 'triceps', equipment: 'dumbbell' },
	{ slug: 'bench-dip', name: 'Bench Dip', kind: 'bodyweight_reps', primaryMuscle: 'triceps', equipment: 'bodyweight' },
	{ slug: 'tricep-dip', name: 'Tricep Dip', kind: 'weighted_bodyweight', primaryMuscle: 'triceps', equipment: 'bodyweight' },

	// --- Forearms ---------------------------------------------------------
	{ slug: 'wrist-curl', name: 'Wrist Curl', kind: 'weight_reps', primaryMuscle: 'forearms', equipment: 'barbell' },
	{ slug: 'reverse-wrist-curl', name: 'Reverse Wrist Curl', kind: 'weight_reps', primaryMuscle: 'forearms', equipment: 'barbell' },
	{ slug: 'reverse-curl', name: 'Reverse Curl', kind: 'weight_reps', primaryMuscle: 'forearms', equipment: 'barbell' },
	{ slug: 'farmers-carry', name: "Farmer's Carry", kind: 'duration', primaryMuscle: 'forearms', equipment: 'dumbbell' },
	{ slug: 'dead-hang', name: 'Dead Hang', kind: 'duration', primaryMuscle: 'forearms', equipment: 'bodyweight' },

	// --- Quads ------------------------------------------------------------
	{ slug: 'back-squat', name: 'Back Squat', kind: 'weight_reps', primaryMuscle: 'quads', equipment: 'barbell' },
	{ slug: 'front-squat', name: 'Front Squat', kind: 'weight_reps', primaryMuscle: 'quads', equipment: 'barbell' },
	{ slug: 'goblet-squat', name: 'Goblet Squat', kind: 'weight_reps', primaryMuscle: 'quads', equipment: 'dumbbell' },
	{ slug: 'hack-squat', name: 'Hack Squat', kind: 'weight_reps', primaryMuscle: 'quads', equipment: 'machine' },
	{ slug: 'leg-press', name: 'Leg Press', kind: 'weight_reps', primaryMuscle: 'quads', equipment: 'machine' },
	{ slug: 'leg-extension', name: 'Leg Extension', kind: 'weight_reps', primaryMuscle: 'quads', equipment: 'machine' },
	{ slug: 'bulgarian-split-squat', name: 'Bulgarian Split Squat', kind: 'weight_reps', primaryMuscle: 'quads', equipment: 'dumbbell' },
	{ slug: 'walking-lunge', name: 'Walking Lunge', kind: 'weight_reps', primaryMuscle: 'quads', equipment: 'dumbbell' },
	{ slug: 'step-up', name: 'Step-Up', kind: 'weight_reps', primaryMuscle: 'quads', equipment: 'dumbbell' },
	{ slug: 'pistol-squat', name: 'Pistol Squat', kind: 'bodyweight_reps', primaryMuscle: 'quads', equipment: 'bodyweight' },
	{ slug: 'air-squat', name: 'Air Squat', kind: 'bodyweight_reps', primaryMuscle: 'quads', equipment: 'bodyweight' },
	{ slug: 'wall-sit', name: 'Wall Sit', kind: 'duration', primaryMuscle: 'quads', equipment: 'bodyweight' },

	// --- Hamstrings -------------------------------------------------------
	{ slug: 'romanian-deadlift', name: 'Romanian Deadlift', kind: 'weight_reps', primaryMuscle: 'hamstrings', equipment: 'barbell' },
	{ slug: 'stiff-leg-deadlift', name: 'Stiff-Leg Deadlift', kind: 'weight_reps', primaryMuscle: 'hamstrings', equipment: 'barbell' },
	{ slug: 'lying-leg-curl', name: 'Lying Leg Curl', kind: 'weight_reps', primaryMuscle: 'hamstrings', equipment: 'machine' },
	{ slug: 'seated-leg-curl', name: 'Seated Leg Curl', kind: 'weight_reps', primaryMuscle: 'hamstrings', equipment: 'machine' },
	{ slug: 'nordic-curl', name: 'Nordic Hamstring Curl', kind: 'bodyweight_reps', primaryMuscle: 'hamstrings', equipment: 'bodyweight' },
	{ slug: 'glute-ham-raise', name: 'Glute-Ham Raise', kind: 'weighted_bodyweight', primaryMuscle: 'hamstrings', equipment: 'bodyweight' },
	{ slug: 'good-morning', name: 'Good Morning', kind: 'weight_reps', primaryMuscle: 'hamstrings', equipment: 'barbell' },

	// --- Glutes -----------------------------------------------------------
	{ slug: 'hip-thrust', name: 'Hip Thrust', kind: 'weight_reps', primaryMuscle: 'glutes', equipment: 'barbell' },
	{ slug: 'glute-bridge', name: 'Glute Bridge', kind: 'bodyweight_reps', primaryMuscle: 'glutes', equipment: 'bodyweight' },
	{ slug: 'cable-kickback', name: 'Cable Kickback', kind: 'weight_reps', primaryMuscle: 'glutes', equipment: 'cable' },
	{ slug: 'hip-abduction', name: 'Hip Abduction', kind: 'weight_reps', primaryMuscle: 'glutes', equipment: 'machine' },

	// --- Calves -----------------------------------------------------------
	{ slug: 'standing-calf-raise', name: 'Standing Calf Raise', kind: 'weight_reps', primaryMuscle: 'calves', equipment: 'machine' },
	{ slug: 'seated-calf-raise', name: 'Seated Calf Raise', kind: 'weight_reps', primaryMuscle: 'calves', equipment: 'machine' },
	{ slug: 'donkey-calf-raise', name: 'Donkey Calf Raise', kind: 'weight_reps', primaryMuscle: 'calves', equipment: 'machine' },
	{ slug: 'calf-press', name: 'Calf Press', kind: 'weight_reps', primaryMuscle: 'calves', equipment: 'machine' },

	// --- Core -------------------------------------------------------------
	{ slug: 'plank', name: 'Plank', kind: 'duration', primaryMuscle: 'core', equipment: 'bodyweight' },
	{ slug: 'side-plank', name: 'Side Plank', kind: 'duration', primaryMuscle: 'core', equipment: 'bodyweight' },
	{ slug: 'hollow-body-hold', name: 'Hollow Body Hold', kind: 'duration', primaryMuscle: 'core', equipment: 'bodyweight' },
	{ slug: 'hanging-leg-raise', name: 'Hanging Leg Raise', kind: 'weighted_bodyweight', primaryMuscle: 'core', equipment: 'bodyweight' },
	{ slug: 'hanging-knee-raise', name: 'Hanging Knee Raise', kind: 'bodyweight_reps', primaryMuscle: 'core', equipment: 'bodyweight' },
	{ slug: 'crunch', name: 'Crunch', kind: 'bodyweight_reps', primaryMuscle: 'core', equipment: 'bodyweight' },
	{ slug: 'cable-crunch', name: 'Cable Crunch', kind: 'weight_reps', primaryMuscle: 'core', equipment: 'cable' },
	{ slug: 'sit-up', name: 'Sit-Up', kind: 'bodyweight_reps', primaryMuscle: 'core', equipment: 'bodyweight' },
	{ slug: 'decline-sit-up', name: 'Decline Sit-Up', kind: 'weighted_bodyweight', primaryMuscle: 'core', equipment: 'bodyweight' },
	{ slug: 'russian-twist', name: 'Russian Twist', kind: 'weight_reps', primaryMuscle: 'core', equipment: 'other' },
	{ slug: 'ab-wheel-rollout', name: 'Ab Wheel Rollout', kind: 'bodyweight_reps', primaryMuscle: 'core', equipment: 'other' },
	{ slug: 'dead-bug', name: 'Dead Bug', kind: 'bodyweight_reps', primaryMuscle: 'core', equipment: 'bodyweight' },
	{ slug: 'bicycle-crunch', name: 'Bicycle Crunch', kind: 'bodyweight_reps', primaryMuscle: 'core', equipment: 'bodyweight' },
	{ slug: 'mountain-climber', name: 'Mountain Climber', kind: 'bodyweight_reps', primaryMuscle: 'core', equipment: 'bodyweight' },
	{ slug: 'pallof-press', name: 'Pallof Press', kind: 'weight_reps', primaryMuscle: 'core', equipment: 'cable' },

	// --- Full body / olympic ---------------------------------------------
	{ slug: 'clean-and-jerk', name: 'Clean and Jerk', kind: 'weight_reps', primaryMuscle: 'full_body', equipment: 'barbell' },
	{ slug: 'power-clean', name: 'Power Clean', kind: 'weight_reps', primaryMuscle: 'full_body', equipment: 'barbell' },
	{ slug: 'hang-clean', name: 'Hang Clean', kind: 'weight_reps', primaryMuscle: 'full_body', equipment: 'barbell' },
	{ slug: 'snatch', name: 'Snatch', kind: 'weight_reps', primaryMuscle: 'full_body', equipment: 'barbell' },
	{ slug: 'thruster', name: 'Thruster', kind: 'weight_reps', primaryMuscle: 'full_body', equipment: 'barbell' },
	{ slug: 'kettlebell-swing', name: 'Kettlebell Swing', kind: 'weight_reps', primaryMuscle: 'full_body', equipment: 'kettlebell' },
	{ slug: 'turkish-get-up', name: 'Turkish Get-Up', kind: 'weight_reps', primaryMuscle: 'full_body', equipment: 'kettlebell' },
	{ slug: 'burpee', name: 'Burpee', kind: 'bodyweight_reps', primaryMuscle: 'full_body', equipment: 'bodyweight' },
	{ slug: 'sled-push', name: 'Sled Push', kind: 'duration', primaryMuscle: 'full_body', equipment: 'other' },
	{ slug: 'battle-ropes', name: 'Battle Ropes', kind: 'duration', primaryMuscle: 'full_body', equipment: 'other' },

	// --- Cardio -----------------------------------------------------------
	{ slug: 'running', name: 'Running', kind: 'cardio', primaryMuscle: 'cardio', equipment: 'other' },
	{ slug: 'treadmill-running', name: 'Treadmill Running', kind: 'cardio', primaryMuscle: 'cardio', equipment: 'cardio_machine' },
	{ slug: 'walking', name: 'Walking', kind: 'cardio', primaryMuscle: 'cardio', equipment: 'other' },
	{ slug: 'treadmill-walking', name: 'Treadmill Walking', kind: 'cardio', primaryMuscle: 'cardio', equipment: 'cardio_machine' },
	{ slug: 'hiking', name: 'Hiking', kind: 'cardio', primaryMuscle: 'cardio', equipment: 'other' },
	{ slug: 'cycling', name: 'Cycling', kind: 'cardio', primaryMuscle: 'cardio', equipment: 'other' },
	{ slug: 'stationary-bike', name: 'Stationary Bike', kind: 'cardio', primaryMuscle: 'cardio', equipment: 'cardio_machine' },
	{ slug: 'assault-bike', name: 'Assault Bike', kind: 'cardio', primaryMuscle: 'cardio', equipment: 'cardio_machine' },
	{ slug: 'rowing-machine', name: 'Rowing Machine', kind: 'cardio', primaryMuscle: 'cardio', equipment: 'cardio_machine' },
	{ slug: 'ski-erg', name: 'Ski Erg', kind: 'cardio', primaryMuscle: 'cardio', equipment: 'cardio_machine' },
	{ slug: 'elliptical', name: 'Elliptical', kind: 'cardio', primaryMuscle: 'cardio', equipment: 'cardio_machine' },
	{ slug: 'stair-climber', name: 'Stair Climber', kind: 'cardio', primaryMuscle: 'cardio', equipment: 'cardio_machine' },
	{ slug: 'swimming', name: 'Swimming', kind: 'cardio', primaryMuscle: 'cardio', equipment: 'other' },
	{ slug: 'jump-rope', name: 'Jump Rope', kind: 'cardio', primaryMuscle: 'cardio', equipment: 'other' },
	{ slug: 'rucking', name: 'Rucking', kind: 'cardio', primaryMuscle: 'cardio', equipment: 'other' }
];
