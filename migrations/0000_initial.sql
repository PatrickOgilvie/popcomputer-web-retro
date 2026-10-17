CREATE TABLE `invites` (
	`token` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`created_by` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `invites_team_idx` ON `invites` (`team_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`team_id`, `user_id`),
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "memberships_role" CHECK("memberships"."role" IN ('owner', 'admin', 'member'))
);
--> statement-breakpoint
CREATE INDEX `memberships_user_idx` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`retro_id` text NOT NULL,
	`author_id` text,
	`board_column` text NOT NULL,
	`body` text NOT NULL,
	`done_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`retro_id`) REFERENCES `retros`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "notes_body_length" CHECK(length("notes"."body") BETWEEN 1 AND 500),
	CONSTRAINT "notes_column" CHECK("notes"."board_column" IN ('went_well', 'to_improve', 'action')),
	CONSTRAINT "notes_only_actions_are_done" CHECK("notes"."board_column" = 'action' OR "notes"."done_at" IS NULL)
);
--> statement-breakpoint
CREATE INDEX `notes_retro_idx` ON `notes` (`retro_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `retros` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`title` text NOT NULL,
	`phase` text DEFAULT 'collecting' NOT NULL,
	`votes_per_person` integer DEFAULT 3 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "retros_title_length" CHECK(length("retros"."title") BETWEEN 1 AND 100),
	CONSTRAINT "retros_phase" CHECK("retros"."phase" IN ('collecting', 'voting', 'discussing', 'closed')),
	CONSTRAINT "retros_votes_per_person" CHECK("retros"."votes_per_person" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE INDEX `retros_team_created_idx` ON `retros` (`team_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "teams_name_length" CHECK(length("teams"."name") BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_slug_unique` ON `teams` (`slug`);--> statement-breakpoint
CREATE TABLE `votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`retro_id` text NOT NULL,
	`note_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`retro_id`) REFERENCES `retros`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `votes_retro_user_idx` ON `votes` (`retro_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `votes_note_idx` ON `votes` (`note_id`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_key_unique` ON `rate_limit` (`key`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);