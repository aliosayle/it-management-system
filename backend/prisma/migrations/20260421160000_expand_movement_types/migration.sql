-- Expand StockMovement.type enum (MySQL)
ALTER TABLE `StockMovement` MODIFY COLUMN `type` ENUM(
  'IN',
  'OUT',
  'ADJUST',
  'RETURN',
  'FOUND',
  'SCRAP',
  'LOSS'
) NOT NULL;
