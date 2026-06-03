-- Uses existing `task_attachments` table (snake_case). Create only if missing.
CREATE TABLE IF NOT EXISTS `task_attachments` (
    `id` VARCHAR(191) NOT NULL,
    `task_id` VARCHAR(191) NOT NULL,
    `stored_path` VARCHAR(1024) NOT NULL,
    `original_name` VARCHAR(512) NOT NULL,
    `mime_type` VARCHAR(128) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `uploaded_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `task_attachments_task_id_idx`(`task_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
