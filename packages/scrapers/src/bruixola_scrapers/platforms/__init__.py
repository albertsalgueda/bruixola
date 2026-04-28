"""bruixola_scrapers.platforms — per-portal adapters.

base.PlatformAdapter is the contract; each portal implementation lives in
its own module and is registered in REGISTRY below.

v1 active: pisos.com (server-rendered, friendly to BruixolaBot UA).
Stubbed:   habitaclia, fotocasa (Imperva-blocked), solvia (SPA), api_cat (Wave 2).
"""

from .api_cat import ApiCatAdapter
from .base import PlatformAdapter, RawListing, RobotsBlocked
from .finques_camprodon import FinquesCamprodonAdapter
from .fotocasa import FotocasaAdapter
from .habitaclia import HabitacliaAdapter
from .idealista import IdealistaAdapter
from .pisos import PisosComAdapter
from .solvia import SolviaAdapter

REGISTRY: dict[str, type[PlatformAdapter]] = {
    "pisos": PisosComAdapter,
    "habitaclia": HabitacliaAdapter,
    "idealista": IdealistaAdapter,
    "fotocasa": FotocasaAdapter,
    "solvia": SolviaAdapter,
    "api_cat": ApiCatAdapter,
    "finques_camprodon": FinquesCamprodonAdapter,
}

ACTIVE: tuple[str, ...] = ("pisos", "finques_camprodon", "habitaclia", "idealista")


def get_adapter(name: str) -> PlatformAdapter:
    cls = REGISTRY.get(name)
    if cls is None:
        raise KeyError(f"unknown platform '{name}' (known: {sorted(REGISTRY)})")
    return cls()


__all__ = [
    "ACTIVE",
    "REGISTRY",
    "PlatformAdapter",
    "RawListing",
    "RobotsBlocked",
    "get_adapter",
]
