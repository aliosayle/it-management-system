-- Grant deliveries permissions to USER accounts that already have page permissions but lack deliveries rows.
INSERT INTO `UserPagePermission` (`id`, `userId`, `resource`, `canView`, `canRead`, `canAdd`, `canEdit`, `canDelete`)
SELECT
  CONCAT('seed_deliveries_', u.`id`),
  u.`id`,
  'deliveries',
  true,
  true,
  true,
  true,
  true
FROM `User` u
WHERE u.`role` = 'USER'
  AND NOT EXISTS (
    SELECT 1 FROM `UserPagePermission` p
    WHERE p.`userId` = u.`id` AND p.`resource` = 'deliveries'
  );
