-- 014_platform_enum_extend.sql
-- Extend listings.platform enum to support pisos.com (server-rendered, our v1
-- target) and a generic 'local' bucket for town-specific outlets.
--
-- Habitaclia + Fotocasa actively block our identifying UA at the HTTP layer
-- (Imperva). Per CLAUDE.md rule 8 we don't UA-rotate, so we pivot v1 to the
-- portals that respond cleanly. Habitaclia + Fotocasa adapters remain stubbed
-- and re-activate once we add a paid proxy (flagged cost) or move to the
-- Generalitat open-data feed.

alter type platform_t add value if not exists 'pisos';
alter type platform_t add value if not exists 'local';
