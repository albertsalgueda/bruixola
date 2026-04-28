"""storage.rest — PostgREST writer for environments that can't reach the
direct Postgres host (e.g. IPv6-only DSN behind a firewall). Goes over HTTPS
to https://{project}.supabase.co/rest/v1/* — IPv4-friendly.

Auth: publishable key (anon role). Writes require an RLS policy permitting
INSERT/UPDATE for anon — only set up temporarily during a bootstrap import,
then dropped. For the real production scraper, prefer SupabaseStore (psycopg)
or supabase-py with SUPABASE_SERVICE_ROLE_KEY.
"""

from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

from ..platforms.base import RawListing

logger = logging.getLogger(__name__)


def _load_env_walking_up() -> None:
    here = Path(__file__).resolve()
    for parent in [here.parent, *here.parents]:
        env_path = parent / ".env"
        if env_path.is_file():
            load_dotenv(env_path)
            return
    load_dotenv()


@dataclass
class RestStore:
    base_url: str            # e.g. https://yqivzzrdhevdmngwglmw.supabase.co
    publishable_key: str     # sb_publishable_…
    _client: httpx.Client = field(init=False)

    def __post_init__(self) -> None:
        self._client = httpx.Client(
            base_url=self.base_url.rstrip("/") + "/rest/v1",
            headers={
                "apikey": self.publishable_key,
                "Authorization": f"Bearer {self.publishable_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout=30.0,
        )

    @classmethod
    def from_env(cls) -> RestStore:
        _load_env_walking_up()
        url = os.environ.get("SUPABASE_URL") or os.environ.get(
            "NEXT_PUBLIC_SUPABASE_URL"
        )
        key = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get(
            "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        )
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY required for REST writer."
            )
        return cls(base_url=url, publishable_key=key)

    # ── crawl_runs ──────────────────────────────────────────────────────

    def open_crawl(
        self,
        platform: str,
        source_host: str | None = None,
        notes: str | None = None,
    ) -> uuid.UUID:
        resp = self._client.post(
            "/crawl_runs",
            params={"select": "id"},
            headers={"Prefer": "return=representation"},
            json={
                "platform": platform,
                "source_host": source_host,
                "status": "running",
                "notes": notes,
            },
        )
        resp.raise_for_status()
        return uuid.UUID(resp.json()[0]["id"])

    def close_crawl(
        self,
        crawl_id: uuid.UUID,
        *,
        status: str,
        listings_seen: int = 0,
        pages_fetched: int = 0,
        error_count: int = 0,
        notes: str | None = None,
    ) -> None:
        body: dict[str, Any] = {
            "status": status,
            "listings_seen": listings_seen,
            "pages_fetched": pages_fetched,
            "error_count": error_count,
        }
        if notes is not None:
            body["notes"] = notes
        # PostgREST: PATCH ?id=eq.<uuid>
        resp = self._client.patch(
            "/crawl_runs",
            params={"id": f"eq.{crawl_id}"},
            json=body,
        )
        resp.raise_for_status()
        # Set finished_at via raw RPC — PostgREST patch can't easily call now().
        # Fall back to letting status='ok' suffice; a follow-up admin job can
        # backfill finished_at if needed. Keep this writer minimal.

    # ── listings (streaming upsert) ─────────────────────────────────────

    def upsert_listing(self, listing: RawListing, *, crawl_id: uuid.UUID) -> str:
        if listing.city_slug is None:
            raise ValueError(
                f"city_slug must be resolved before upsert ({listing.url})"
            )

        payload = {
            "id": listing.bruixola_id,
            "platform": listing.platform,
            "platform_id": listing.platform_id,
            "url": listing.url,
            "title": listing.title,
            "description": listing.description,
            "city_slug": listing.city_slug,
            "address": listing.address,
            "price_eur": listing.price_eur,
            "m2": listing.m2,
            "beds": listing.beds,
            "baths": listing.baths,
            "lift": listing.lift,
            "energy_cert": listing.energy_cert,
            "year_built": listing.year_built,
            "year_renovated": listing.year_renovated,
            "photos": listing.photos or [],
            "source_kind": listing.source_kind,
            "source_host": listing.source_host,
            "crawl_id": str(crawl_id),
            "removed_at": None,
            # scraped_at + first_seen_at left to DB defaults; can't write
            # now() via REST without a trigger, but DB defaults handle it.
        }
        resp = self._client.post(
            "/listings",
            params={"on_conflict": "id"},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            json=payload,
        )
        if resp.status_code >= 400:
            logger.error("upsert %s failed: %s %s", listing.url, resp.status_code, resp.text[:300])
            resp.raise_for_status()
        return listing.bruixola_id

    def fetch_cities(
        self,
        *,
        city: str | None = None,
        comarca: str | None = None,
        only_top_n: int | None = None,
    ) -> list[str]:
        params: dict[str, str] = {"select": "slug,population"}
        if city:
            params["slug"] = f"eq.{city}"
        elif comarca:
            params["comarca_slug"] = f"eq.{comarca}"
        params["order"] = "population.desc.nullslast"
        if only_top_n is not None:
            params["limit"] = str(only_top_n)
        resp = self._client.get("/cities", params=params)
        resp.raise_for_status()
        return [r["slug"] for r in resp.json() if r.get("slug")]

    def close(self) -> None:
        self._client.close()
