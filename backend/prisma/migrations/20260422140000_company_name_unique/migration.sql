-- Prevent duplicate company names (case-insensitive collation treats case variants as duplicates per MySQL rules).
CREATE UNIQUE INDEX `Company_name_key` ON `Company`(`name`);
