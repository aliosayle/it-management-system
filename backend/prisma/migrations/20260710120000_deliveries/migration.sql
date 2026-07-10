-- CreateTable Delivery
CREATE TABLE `Delivery` (
    `id` VARCHAR(191) NOT NULL,
    `destination` ENUM('PERSONNEL_BIN', 'SITE_BIN', 'DEPARTMENT', 'GENERAL') NOT NULL,
    `targetPersonnelId` VARCHAR(191) NULL,
    `targetSiteId` VARCHAR(191) NULL,
    `departmentId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Delivery_createdByUserId_idx`(`createdByUserId`),
    INDEX `Delivery_createdAt_idx`(`createdAt`),
    INDEX `Delivery_targetPersonnelId_idx`(`targetPersonnelId`),
    INDEX `Delivery_targetSiteId_idx`(`targetSiteId`),
    INDEX `Delivery_departmentId_idx`(`departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable DeliveryLine
CREATE TABLE `DeliveryLine` (
    `id` VARCHAR(191) NOT NULL,
    `deliveryId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `lineIndex` INTEGER NOT NULL DEFAULT 0,
    `quantity` DECIMAL(14, 4) NOT NULL,
    `unitPrice` DECIMAL(14, 4) NOT NULL,
    `priceSource` ENUM('LAST_PURCHASE', 'AVERAGE_PURCHASE', 'MANUAL', 'ZERO') NOT NULL,
    `lineTotal` DECIMAL(14, 4) NOT NULL,

    INDEX `DeliveryLine_deliveryId_idx`(`deliveryId`),
    INDEX `DeliveryLine_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable StockMovement
ALTER TABLE `StockMovement` ADD COLUMN `deliveryId` VARCHAR(191) NULL;
CREATE INDEX `StockMovement_deliveryId_idx` ON `StockMovement`(`deliveryId`);

-- AddForeignKey
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_targetPersonnelId_fkey` FOREIGN KEY (`targetPersonnelId`) REFERENCES `Personnel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_targetSiteId_fkey` FOREIGN KEY (`targetSiteId`) REFERENCES `Site`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DeliveryLine` ADD CONSTRAINT `DeliveryLine_deliveryId_fkey` FOREIGN KEY (`deliveryId`) REFERENCES `Delivery`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DeliveryLine` ADD CONSTRAINT `DeliveryLine_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_deliveryId_fkey` FOREIGN KEY (`deliveryId`) REFERENCES `Delivery`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
