CREATE TABLE `party_players` (
	`room_code` text NOT NULL,
	`player_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`blueprint_json` text NOT NULL,
	`ready` integer DEFAULT 0 NOT NULL,
	`ready_heat` integer DEFAULT 1 NOT NULL,
	`packet_seq` integer DEFAULT -1 NOT NULL,
	`events_json` text DEFAULT '[]' NOT NULL,
	`offer_json` text,
	`answer_json` text,
	`host_seen_offer_json` text,
	`last_seen_at` integer NOT NULL,
	PRIMARY KEY(`room_code`, `player_id`),
	FOREIGN KEY (`room_code`) REFERENCES `party_rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `party_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`host_token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`closed_at` integer,
	`updated_at` integer NOT NULL,
	`state_json` text
);
--> statement-breakpoint
CREATE INDEX `party_rooms_expiry_idx` ON `party_rooms` (`expires_at`);