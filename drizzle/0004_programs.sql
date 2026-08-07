CREATE TABLE `program_day_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`program_day_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`target_sets` integer,
	`target_reps_min` integer,
	`target_reps_max` integer,
	`intensity_mode` text,
	`target_rpe` real,
	`target_percent_one_rm` real,
	`target_distance_m` real,
	`target_duration_s` integer,
	`notes` text,
	FOREIGN KEY (`program_day_id`) REFERENCES `program_days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `program_day_exercises_day_idx` ON `program_day_exercises` (`program_day_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `program_day_exercises_exercise_idx` ON `program_day_exercises` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `program_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`program_id` integer NOT NULL,
	`week_number` integer NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`title` text,
	`notes` text,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `program_days_program_idx` ON `program_days` (`program_id`,`week_number`,`order_index`);--> statement-breakpoint
CREATE TABLE `program_enrollments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`program_id` integer NOT NULL,
	`started_on` text NOT NULL,
	`completed_on` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `program_enrollments_user_idx` ON `program_enrollments` (`user_id`,`completed_on`);--> statement-breakpoint
CREATE TABLE `program_one_rms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`enrollment_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`one_rm_kg` real NOT NULL,
	`is_manual` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `program_enrollments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `program_one_rms_unique` ON `program_one_rms` (`enrollment_id`,`exercise_id`);--> statement-breakpoint
CREATE TABLE `programs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`days_per_week` integer DEFAULT 3 NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `programs_user_idx` ON `programs` (`user_id`);--> statement-breakpoint
ALTER TABLE `sets` ADD `target_weight_kg` real;--> statement-breakpoint
ALTER TABLE `sets` ADD `target_reps_min` integer;--> statement-breakpoint
ALTER TABLE `sets` ADD `target_reps_max` integer;--> statement-breakpoint
ALTER TABLE `sets` ADD `target_rpe` real;--> statement-breakpoint
ALTER TABLE `sets` ADD `target_percent_one_rm` real;--> statement-breakpoint
ALTER TABLE `sets` ADD `target_distance_m` real;--> statement-breakpoint
ALTER TABLE `sets` ADD `target_duration_s` integer;--> statement-breakpoint
ALTER TABLE `workouts` ADD `program_enrollment_id` integer REFERENCES program_enrollments(id);--> statement-breakpoint
ALTER TABLE `workouts` ADD `program_day_id` integer REFERENCES program_days(id);--> statement-breakpoint
CREATE INDEX `workouts_program_idx` ON `workouts` (`program_enrollment_id`,`program_day_id`);