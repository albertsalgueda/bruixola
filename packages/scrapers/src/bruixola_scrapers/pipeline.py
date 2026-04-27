"""bruixola_scrapers.pipeline — orchestrator stub.

Wave 2 fills this in:
  scrape (parallel platforms) →
  dedupe (by platform + platform_id, then by address+m²) →
  geocode (Nominatim with cache) →
  derive (condition_label, okupa_risk) →
  walk-times (OSRM) →
  HUT join →
  yield (ranges + SERPAVI ceiling gate) →
  staging-to-canonical transactional merge →
  DuckDB rebuild from canonical CSVs.

Usage (once implemented):
    uv run bruixola-scrape
    uv run bruixola-scrape --source habitaclia
    uv run bruixola-scrape --re-derive
"""

from __future__ import annotations

import sys

import typer
from rich.console import Console

console = Console()
app = typer.Typer(help="Brúixola scraper pipeline.")


@app.command()
def main(
    source: str | None = typer.Option(
        None,
        help="Single platform to refresh: habitaclia | fotocasa | solvia | api_cat. "
        "Omit to refresh all.",
    ),
    re_derive: bool = typer.Option(
        False,
        "--re-derive",
        help="Skip platform fetch; re-run derive + yield over existing canonical CSVs.",
    ),
) -> None:
    """Pipeline entry point."""
    console.print("[yellow]Brúixola pipeline — Wave 2 not implemented yet.[/yellow]")
    console.print(
        "  source:    [bold]{}[/bold]".format(source or "(all)"),
    )
    console.print("  re-derive: [bold]{}[/bold]".format(re_derive))
    console.print()
    console.print("Implementation order (Wave 2):")
    console.print("  1. platforms/base.py   — rate limit, UA, retry, robots.txt")
    console.print("  2. platforms/{habitaclia,fotocasa,solvia,api_cat}.py")
    console.print("  3. geocode.py          — Nominatim + cache")
    console.print("  4. derive.py           — condition_label, okupa_risk regex rules")
    console.print("  5. yield_calc.py       — P25/P50/P75 ranges + SERPAVI ceiling")
    console.print("  6. staging→canonical merge job")
    console.print("  7. DuckDB rebuild from canonical CSVs")
    sys.exit(0)


if __name__ == "__main__":
    app()
