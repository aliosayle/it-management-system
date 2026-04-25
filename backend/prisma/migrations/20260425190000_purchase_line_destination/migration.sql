-- Per-line receive destination; purchase header may become MIXED.
ALTER TABLE `Purchase` MODIFY COLUMN `destination` ENUM('STOCK', 'PERSONNEL_BIN', 'MIXED') NOT NULL;

ALTER TABLE `PurchaseLine` ADD COLUMN `destination` ENUM('STOCK', 'PERSONNEL_BIN', 'MIXED') NOT NULL DEFAULT 'STOCK',
    ADD COLUMN `targetPersonnelId` VARCHAR(191) NULL;

UPDATE `PurchaseLine` pl
INNER JOIN `Purchase` p ON p.id = pl.`purchaseId`
SET pl.`destination` = CASE WHEN p.`destination` = 'PERSONNEL_BIN' THEN 'PERSONNEL_BIN' ELSE 'STOCK' END,
    pl.`targetPersonnelId` = CASE WHEN p.`destination` = 'PERSONNEL_BIN' THEN p.`targetPersonnelId` ELSE NULL END;

CREATE INDEX `PurchaseLine_targetPersonnelId_idx` ON `PurchaseLine`(`targetPersonnelId`);

ALTER TABLE `PurchaseLine` ADD CONSTRAINT `PurchaseLine_targetPersonnelId_fkey` FOREIGN KEY (`targetPersonnelId`) REFERENCES `Personnel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
