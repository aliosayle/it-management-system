-- CreateTable
CREATE TABLE `ProductCategory` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(128) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ProductCategory_label_key`(`label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed from existing product categories (non-empty, trimmed)
INSERT INTO `ProductCategory` (`id`, `label`, `createdAt`)
SELECT UUID(), t.trimmed, CURRENT_TIMESTAMP(3)
FROM (
    SELECT TRIM(`category`) AS trimmed
    FROM `Product`
    WHERE TRIM(`category`) <> ''
    GROUP BY TRIM(`category`)
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM `ProductCategory` pc WHERE pc.`label` = t.trimmed
);
