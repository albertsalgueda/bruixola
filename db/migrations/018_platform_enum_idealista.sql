-- 018_platform_enum_idealista.sql
-- Add 'idealista' to platform_t. We can now scrape Idealista via Firecrawl
-- stealth proxy (their DataDome WAF is bypassed by Firecrawl's stack).
-- Fotocasa stays out of scope: Firecrawl can't crack their tier-2 WAF
-- protection on listing URLs (only the homepage loads).

alter type platform_t add value if not exists 'idealista';
