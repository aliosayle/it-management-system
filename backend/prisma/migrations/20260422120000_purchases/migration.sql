-- CreateTable Purchase
CREATE TABLE `Purchase` (
    `id` VARCHAR(191) NOT NULL,
    `destination` ENUM('STOCK', 'PERSONNEL_BIN') NOT NULL,
    `authorizedByPersonnelId` VARCHAR(191) NOT NULL,
    `targetPersonnelId` VARCHAR(191) NULL,
    `bonStoredPath` VARCHAR(1024) NOT NULL,
    `bonOriginalName` VARCHAR(512) NOT NULL,
    `notes` TEXT NULL,
    `createdByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable PurchaseLine
CREATE TABLE `PurchaseLine` (
    `id` VARCHAR(191) NOT NULL,
    `purchaseId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(14, 4) NOT NULL,
    `lineIndex` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable StockMovement
ALTER TABLE `StockMovement` ADD COLUMN `purchaseId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Purchase_authorizedByPersonnelId_idx` ON `Purchase`(`authorizedByPersonnelId`);
CREATE INDEX `Purchase_createdAt_idx` ON `Purchase`(`createdAt`);
CREATE INDEX `PurchaseLine_purchaseId_idx` ON `PurchaseLine`(`purchaseId`);
CREATE INDEX `PurchaseLine_productId_idx` ON `PurchaseLine`(`productId`);
CREATE INDEX `StockMovement_purchaseId_idx` ON `StockMovement`(`purchaseId`);

-- AddForeignKey
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_authorizedByPersonnelId_fkey` FOREIGN KEY (`authorizedByPersonnelId`) REFERENCES `Personnel`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_targetPersonnelId_fkey` FOREIGN KEY (`targetPersonnelId`) REFERENCES `Personnel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PurchaseLine` ADD CONSTRAINT `PurchaseLine_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `Purchase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PurchaseLine` ADD CONSTRAINT `PurchaseLine_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `Purchase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
