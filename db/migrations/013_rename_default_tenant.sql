-- 013_rename_default_tenant.sql
--
-- Renames the seeded default tenant away from a personal identifier. The
-- earlier 007 migration created the tenant with slug='albert' and
-- display_name='Albert · Brúixola' as a one-tenant convenience. Both strings
-- surface in the UI (the /properties header shows the slug, the page <title>
-- the display_name), so we want them neutral.
--
-- New values:
--   slug         = 'default'
--   display_name = 'Brúixola'

UPDATE public.tenants
SET
  slug         = 'default',
  display_name = 'Brúixola'
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND slug = 'albert';
