-- Grant existing USER accounts full page access on all resources except users (ADMIN bypasses checks).
INSERT INTO `UserPagePermission` (`id`, `userId`, `resource`, `canView`, `canRead`, `canAdd`, `canEdit`, `canDelete`)
SELECT
  CONCAT('seed_', u.`id`, '_', r.`resource`),
  u.`id`,
  r.`resource`,
  true,
  true,
  true,
  true,
  true
FROM `User` u
CROSS JOIN (
  SELECT 'companies' AS `resource`
  UNION ALL SELECT 'sites'
  UNION ALL SELECT 'departments'
  UNION ALL SELECT 'personnel'
  UNION ALL SELECT 'products'
  UNION ALL SELECT 'suppliers'
  UNION ALL SELECT 'stock'
  UNION ALL SELECT 'purchases'
) r
WHERE u.`role` = 'USER'
  AND NOT EXISTS (
    SELECT 1 FROM `UserPagePermission` p WHERE p.`userId` = u.`id` LIMIT 1
  );
