"""storage.supabase — streaming Postgres writes for the scraper.

Uses psycopg (DATABASE_URL) for the direct Postgres path — bypasses RLS by
connecting as the database owner. This is the "scraper writes from a trusted
backend host" model.

The service-role-key path via supabase-py also works in principle and is
preferred for hosted environments where DATABASE_URL is not exposed; if
SUPABASE_SERVICE_ROLE_KEY is set we'll prefer that. Otherwise we fall back to
DATABASE_URL.

Streaming model: pipeline.py upserts one listing at a time. Re-appearing
listings auto-un-delist via the upsert path:
    on conflict (id) do update set
        scraped_at = now(),
        removed_at = null,
        ...
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import psycopg
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
    load_dotenv()  # cwd fallback


@dataclass
class SupabaseStore:
    dsn: str
    _conn: psycopg.Connection = field(init=False)

    def __post_init__(self) -> None:
        # autocommit=True so each upsert is its own transaction — keeps
        # streaming-write semantics honest (a crash mid-row never holds locks).
        self._conn = psycopg.connect(self.dsn, autocommit=True)
        # Make sure JSONB-style values serialize cleanly.
        psycopg.types.json.set_json_dumps(json.dumps, self._conn)

    @classmethod
    def from_env(cls) -> SupabaseStore:
        _load_env_walking_up()
        dsn = os.environ.get("DATABASE_URL")
        if not dsn:
            raise RuntimeError(
                "DATABASE_URL must be set in .env. Refusing to run scraper "
                "without write creds."
            )
        return cls(dsn=dsn)

    @classmethod
    def supports_direct_pg(cls) -> bool:
        """Check whether the local network can reach the Postgres host.
        Returns False on IPv6-only hosts behind a firewall, etc."""
        _load_env_walking_up()
        dsn = os.environ.get("DATABASE_URL")
        if not dsn:
            return False
        try:
            psycopg.connect(dsn, autocommit=True, connect_timeout=3).close()
            return True
        except psycopg.OperationalError:
            return False

    # supabase-py kept for compatibility with code paths that need it.
    @property
    def _client(self) -> Any:  # legacy attribute used by pipeline._resolve_cities
        return _ReadOnlyTableProxy(self._conn)

    # ── crawl_runs ──────────────────────────────────────────────────────

    def open_crawl(
        self,
        platform: str,
        source_host: str | None = None,
        notes: str | None = None,
    ) -> uuid.UUID:
        with self._conn.cursor() as cur:
            cur.execute(
                """
                insert into public.crawl_runs (platform, source_host, status, notes)
                values (%s, %s, 'running', %s)
                returning id
                """,
                (platform, source_host, notes),
            )
            row = cur.fetchone()
        if row is None:
            raise RuntimeError("failed to insert crawl_runs row")
        crawl_id = row[0]
        logger.info("opened crawl %s for %s", crawl_id, platform)
        return crawl_id

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
        with self._conn.cursor() as cur:
            cur.execute(
                """
                update public.crawl_runs
                   set finished_at  = now(),
                       status       = %s,
                       listings_seen = %s,
                       pages_fetched = %s,
                       error_count   = %s,
                       notes        = coalesce(%s, notes)
                 where id = %s
                """,
                (status, listings_seen, pages_fetched, error_count, notes, str(crawl_id)),
            )
        logger.info("closed crawl %s status=%s seen=%s", crawl_id, status, listings_seen)

    # ── listings (streaming upsert) ─────────────────────────────────────

    def upsert_listing(self, listing: RawListing, *, crawl_id: uuid.UUID) -> str:
        if listing.city_slug is None:
            raise ValueError(
                f"city_slug must be resolved before upsert ({listing.url})"
            )

        bid = listing.bruixola_id

        with self._conn.cursor() as cur:
            cur.execute(
                """
                insert into public.listings (
                    id, platform, platform_id, url, title, description,
                    city_slug, address,
                    price_eur, m2, beds, baths, lift, energy_cert,
                    year_built, year_renovated,
                    photos, source_kind, source_host, crawl_id,
                    scraped_at, removed_at
                ) values (
                    %(id)s, %(platform)s, %(platform_id)s, %(url)s, %(title)s, %(description)s,
                    %(city_slug)s, %(address)s,
                    %(price_eur)s, %(m2)s, %(beds)s, %(baths)s, %(lift)s, %(energy_cert)s,
                    %(year_built)s, %(year_renovated)s,
                    %(photos)s, %(source_kind)s, %(source_host)s, %(crawl_id)s,
                    now(), null
                )
                on conflict (id) do update set
                    platform        = excluded.platform,
                    platform_id     = excluded.platform_id,
                    url             = excluded.url,
                    title           = excluded.title,
                    description     = excluded.description,
                    city_slug       = excluded.city_slug,
                    address         = excluded.address,
                    price_eur       = excluded.price_eur,
                    m2              = excluded.m2,
                    beds            = excluded.beds,
                    baths           = excluded.baths,
                    lift            = excluded.lift,
                    energy_cert     = excluded.energy_cert,
                    year_built      = excluded.year_built,
                    year_renovated  = excluded.year_renovated,
                    photos          = excluded.photos,
                    source_kind     = excluded.source_kind,
                    source_host     = excluded.source_host,
                    crawl_id        = excluded.crawl_id,
                    scraped_at      = now(),
                    removed_at      = null
                """,
                {
                    "id": bid,
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
                },
            )
        return bid

    def fetch_cities(
        self,
        *,
        city: str | None = None,
        comarca: str | None = None,
        only_top_n: int | None = None,
    ) -> list[str]:
        with self._conn.cursor() as cur:
            if city:
                cur.execute("select slug from public.cities where slug = %s", (city,))
            elif comarca:
                cur.execute(
                    """
                    select slug from public.cities
                     where comarca_slug = %s
                     order by population desc nulls last
                    """,
                    (comarca,),
                )
            else:
                cur.execute(
                    "select slug from public.cities order by population desc nulls last"
                )
            rows = cur.fetchall()
        slugs = [r[0] for r in rows if r and r[0]]
        if only_top_n is not None:
            slugs = slugs[:only_top_n]
        return slugs


class _ReadOnlyTableProxy:
    """Tiny shim so older code that does store._client.table('cities')... keeps
    working. Implements just .select().eq().order().execute() for our needs."""

    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def table(self, name: str) -> _ProxyTable:
        return _ProxyTable(self._conn, name)


@dataclass
class _ProxyTable:
    conn: psycopg.Connection
    name: str
    _select: str = "*"
    _filters: list[tuple[str, Any]] = field(default_factory=list)
    _order_by: tuple[str, bool] | None = None  # (col, desc)
    _limit: int | None = None

    def select(self, columns: str) -> _ProxyTable:
        self._select = columns
        return self

    def eq(self, col: str, val: Any) -> _ProxyTable:
        self._filters.append((col, val))
        return self

    def order(self, col: str, desc: bool = False) -> _ProxyTable:
        self._order_by = (col, desc)
        return self

    def limit(self, n: int) -> _ProxyTable:
        self._limit = n
        return self

    def execute(self) -> Any:
        sql = f"select {self._select} from public.{self.name}"
        params: list[Any] = []
        if self._filters:
            sql += " where " + " and ".join(f"{c} = %s" for c, _ in self._filters)
            params.extend(v for _, v in self._filters)
        if self._order_by is not None:
            col, desc = self._order_by
            sql += f" order by {col} {'desc nulls last' if desc else 'asc'}"
        if self._limit is not None:
            sql += f" limit {self._limit}"
        with self.conn.cursor() as cur:
            cur.execute(sql, params)
            cols = [d.name for d in (cur.description or [])]
            data = [dict(zip(cols, row, strict=False)) for row in cur.fetchall()]
        return _Result(data)


@dataclass
class _Result:
    data: list[dict[str, Any]]


# ── module-level convenience wrappers ───────────────────────────────────

_singleton: SupabaseStore | None = None


def _store() -> SupabaseStore:
    global _singleton
    if _singleton is None:
        _singleton = SupabaseStore.from_env()
    return _singleton


def open_crawl(platform: str, source_host: str | None = None) -> uuid.UUID:
    return _store().open_crawl(platform, source_host=source_host)


def close_crawl(
    crawl_id: uuid.UUID,
    *,
    status: str,
    listings_seen: int = 0,
    pages_fetched: int = 0,
    error_count: int = 0,
    notes: str | None = None,
) -> None:
    _store().close_crawl(
        crawl_id,
        status=status,
        listings_seen=listings_seen,
        pages_fetched=pages_fetched,
        error_count=error_count,
        notes=notes,
    )


def upsert_listing(listing: RawListing, *, crawl_id: uuid.UUID) -> str:
    return _store().upsert_listing(listing, crawl_id=crawl_id)
