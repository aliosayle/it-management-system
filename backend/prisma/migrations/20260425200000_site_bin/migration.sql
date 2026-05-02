-- Bin kind (person vs site) on personnel items; new site bin table.
ALTER TABLE `PersonnelBinItem` ADD COLUMN `kind` ENUM('PERSONNEL', 'SITE') NOT NULL DEFAULT 'PERSONNEL';

CREATE TABLE `SiteBinItem` (
    `id` VARCHAR(191) NOT NULL,
    `siteId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(14, 4) NOT NULL DEFAULT 1,
    `note` TEXT NULL,
    `kind` ENUM('PERSONNEL', 'SITE') NOT NULL DEFAULT 'SITE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SiteBinItem_siteId_productId_key`(`siteId`, `productId`),
    INDEX `SiteBinItem_siteId_idx`(`siteId`),
    INDEX `SiteBinItem_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SiteBinItem` ADD CONSTRAINT `SiteBinItem_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SiteBinItem` ADD CONSTRAINT `SiteBinItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Purchase` MODIFY COLUMN `destination` ENUM('STOCK', 'PERSONNEL_BIN', 'MIXED', 'SITE_BIN') NOT NULL;

ALTER TABLE `Purchase` ADD COLUMN `targetSiteId` VARCHAR(191) NULL;
CREATE INDEX `Purchase_targetSiteId_idx` ON `Purchase`(`targetSiteId`);
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_targetSiteId_fkey` FOREIGN KEY (`targetSiteId`) REFERENCES `Site`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `PurchaseLine` MODIFY COLUMN `destination` ENUM('STOCK', 'PERSONNEL_BIN', 'MIXED', 'SITE_BIN') NOT NULL;

ALTER TABLE `PurchaseLine` ADD COLUMN `targetSiteId` VARCHAR(191) NULL;
CREATE INDEX `PurchaseLine_targetSiteId_idx` ON `PurchaseLine`(`targetSiteId`);
ALTER TABLE `PurchaseLine` ADD CONSTRAINT `PurchaseLine_targetSiteId_fkey` FOREIGN KEY (`targetSiteId`) REFERENCES `Site`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
