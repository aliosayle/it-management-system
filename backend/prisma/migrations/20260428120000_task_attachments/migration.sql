-- AlterEnum TaskActivityType
ALTER TABLE `TaskActivity` MODIFY `type` ENUM('COMMENT', 'STATUS_CHANGE', 'ASSIGNMENT', 'FOLLOW_UP_SCHEDULED', 'FOLLOW_UP_COMPLETED', 'EDIT', 'ATTACHMENT_ADDED') NOT NULL;

-- CreateTable
CREATE TABLE `TaskAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `storedPath` VARCHAR(1024) NOT NULL,
    `originalName` VARCHAR(512) NOT NULL,
    `mimeType` VARCHAR(128) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TaskAttachment_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TaskAttachment` ADD CONSTRAINT `TaskAttachment_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TaskAttachment` ADD CONSTRAINT `TaskAttachment_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
