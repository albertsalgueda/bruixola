"""bruixola_scrapers.storage — Supabase-backed persistence for scraped rows.

The pipeline writes one listing at a time (streaming) so a crashed run
never loses already-persisted rows.
"""

from .supabase import (
    SupabaseStore,
    close_crawl,
    open_crawl,
    upsert_listing,
)

__all__ = [
    "SupabaseStore",
    "close_crawl",
    "open_crawl",
    "upsert_listing",
]
