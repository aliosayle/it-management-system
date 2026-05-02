-- Departments under sites; optional charge / allocation on purchase lines.
CREATE TABLE `Department` (
    `id` VARCHAR(191) NOT NULL,
    `siteId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(256) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Department_siteId_name_key`(`siteId`, `name`),
    INDEX `Department_siteId_idx`(`siteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Department` ADD CONSTRAINT `Department_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PurchaseLine` ADD COLUMN `departmentId` VARCHAR(191) NULL;
CREATE INDEX `PurchaseLine_departmentId_idx` ON `PurchaseLine`(`departmentId`);
ALTER TABLE `PurchaseLine` ADD CONSTRAINT `PurchaseLine_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
