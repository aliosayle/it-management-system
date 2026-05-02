-- Line/header destination: department allocation (warehouse receipt + department tag).
ALTER TABLE `Purchase` MODIFY COLUMN `destination` ENUM(
  'STOCK',
  'PERSONNEL_BIN',
  'SITE_BIN',
  'MIXED',
  'DEPARTMENT'
) NOT NULL;

ALTER TABLE `PurchaseLine` MODIFY COLUMN `destination` ENUM(
  'STOCK',
  'PERSONNEL_BIN',
  'SITE_BIN',
  'MIXED',
  'DEPARTMENT'
) NOT NULL;

UPDATE `PurchaseLine` SET `departmentId` = NULL WHERE `destination` <> 'DEPARTMENT';
