DROP INDEX "meta_accounts_account_key_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "meta_accounts_owner_account_key_idx" ON "meta_accounts" USING btree ("owner_hash","account_key");--> statement-breakpoint
CREATE INDEX "meta_accounts_account_key_idx" ON "meta_accounts" USING btree ("account_key");