CREATE TABLE `counters` (
	`name` text PRIMARY KEY NOT NULL,
	`value` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text,
	`period_end` text,
	`hmrc_message_class` text,
	`hmrc_status` text DEFAULT 'created' NOT NULL,
	`hmrc_correlation_id` text,
	`hmrc_poll_endpoint` text,
	`hmrc_poll_interval_seconds` integer,
	`hmrc_submission_id` text,
	`hmrc_irmark` text,
	`hmrc_payload_hash` text,
	`hmrc_raw_response` text,
	`hmrc_message` text,
	`ch_status` text,
	`ch_message` text,
	`ch_transaction_id` text,
	`ch_submission_number` text,
	`ch_raw_response` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
