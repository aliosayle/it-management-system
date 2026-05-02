-- Per-line supplier (header Purchase.supplierId kept as first-line supplier for compatibility).
ALTER TABLE `PurchaseLine` ADD COLUMN `supplierId` VARCHAR(191) NULL;

UPDATE `PurchaseLine` pl
INNER JOIN `Purchase` p ON pl.`purchaseId` = p.`id`
SET pl.`supplierId` = p.`supplierId`;

ALTER TABLE `PurchaseLine` MODIFY COLUMN `supplierId` VARCHAR(191) NOT NULL;

CREATE INDEX `PurchaseLine_supplierId_idx` ON `PurchaseLine`(`supplierId`);

ALTER TABLE `PurchaseLine` ADD CONSTRAINT `PurchaseLine_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
