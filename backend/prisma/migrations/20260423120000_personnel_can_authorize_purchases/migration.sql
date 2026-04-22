-- Purchase authorizer eligibility
ALTER TABLE `Personnel` ADD COLUMN `canAuthorizePurchases` BOOLEAN NOT NULL DEFAULT false;
