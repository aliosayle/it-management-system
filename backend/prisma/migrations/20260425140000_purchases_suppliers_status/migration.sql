-- CreateTable Supplier
CREATE TABLE `Supplier` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(512) NOT NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(64) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Supplier_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Legacy placeholder for existing purchases without a supplier
INSERT INTO `Supplier` (`id`, `name`, `email`, `phone`, `notes`, `createdAt`, `updatedAt`)
VALUES (
    'legacy_supplier_unspecified',
    'Unspecified (legacy)',
    NULL,
    NULL,
    'Auto-created for purchases recorded before suppliers were added.',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
);

-- AlterTable Personnel
ALTER TABLE `Personnel` ADD COLUMN `isBuyer` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable PurchaseLine (unit price before status columns reference order)
ALTER TABLE `PurchaseLine` ADD COLUMN `unitPrice` DECIMAL(14, 4) NOT NULL DEFAULT 0;

-- AlterTable Purchase — add nullable columns first, backfill, then enforce NOT NULL where needed
ALTER TABLE `Purchase` ADD COLUMN `status` ENUM('PENDING', 'COMPLETE', 'CANCELLED') NOT NULL DEFAULT 'PENDING';
UPDATE `Purchase` SET `status` = 'COMPLETE';

ALTER TABLE `Purchase` ADD COLUMN `supplierId` VARCHAR(191) NULL;
UPDATE `Purchase` SET `supplierId` = 'legacy_supplier_unspecified' WHERE `supplierId` IS NULL;

ALTER TABLE `Purchase` ADD COLUMN `buyerPersonnelId` VARCHAR(191) NULL;
UPDATE `Purchase` SET `buyerPersonnelId` = `authorizedByPersonnelId` WHERE `buyerPersonnelId` IS NULL;

UPDATE `Personnel` p
INNER JOIN `Purchase` pu ON pu.`buyerPersonnelId` = p.`id`
SET p.`isBuyer` = true
WHERE p.`isBuyer` = false;

ALTER TABLE `Purchase` MODIFY `supplierId` VARCHAR(191) NOT NULL;
ALTER TABLE `Purchase` MODIFY `buyerPersonnelId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `Purchase_supplierId_idx` ON `Purchase`(`supplierId`);
CREATE INDEX `Purchase_buyerPersonnelId_idx` ON `Purchase`(`buyerPersonnelId`);
CREATE INDEX `Purchase_status_idx` ON `Purchase`(`status`);
CREATE INDEX `Supplier_name_idx` ON `Supplier`(`name`);

-- AddForeignKey
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_buyerPersonnelId_fkey` FOREIGN KEY (`buyerPersonnelId`) REFERENCES `Personnel`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
