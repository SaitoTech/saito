# The Island Expedition: art direction

Settlers X uses original vector illustrations inspired by European ligne claire adventure comics: precise navy ink, flat pigment, expressive silhouettes, warm paper and a sunlit coastal world. The adventurers, island architecture and compositions are original; no established comic characters, logos or panels are included.

The palette is navy `#223344`, paper `#fff5d9`, sea `#66c9cb`, vermilion `#e8583f`, ochre `#efbc47`, forest `#6c9562` and expedition blue `#40799a`. Keep interface chrome restrained so the map and illustrated cards carry the colour. Prefer solid fills and deliberate outlines to gradients, shadows or photorealism.

## Asset inventory

- `web/img/resources/`: six square landscape illustrations. Brick has a working kiln and stacked bricks; wood has a conifer forest and cut timber; wheat has golden grain and a windmill; wool has a flock in green pasture; ore has a mountain mine and ore outcrop; desert has a cactus and rolling dunes.
- `web/img/cards/`: 21 complete portrait card illustrations, including the six resources, all requested development-card identities, robber variants and achievement cards. Each includes a paper border, collection mark, distinct narrative vignette, title and decorative subtitle. Dimensions: 320 × 450.
- `web/img/icons/`: 11 transparent vector symbols: village, city, road, bandit, knight, generic port and the five productive resources.
- `web/img/portraits/`: four original illustrated expedition members: navigator, botanist, engineer and cartographer. These are numbered 1–4 to support stable assignment to player seats, independent of player colour.
- `web/img/cover.svg`: a 1280 × 720 illustrated coastal island, sailing cutter, settlement, mountains, fields and compass.
- `web/img/ship.svg`: transparent expedition sailing cutter.
- `web/img/compass.svg`: transparent compass rose with a warm paper face.
- `web/img/manifest.json`: machine-readable paths, descriptive names and native dimensions for all 45 illustrations.

All square assets use a 240 × 240 viewBox. Use resource scenes for cards, square tiles and map texture panels; use the transparent icon variants where a compact symbol must sit over interface or 3D colours. Retain SVGs as source assets and let the browser rasterize them at device resolution. Every asset includes an accessible title and label; interactive controls still need action-specific accessible names.

## Editing

The illustrations are generated from the hand-authored SVG primitives and scene compositions in `web/img/generate-assets.py`. Run `python3 mods/settlersx/web/img/generate-assets.py` from the repository root to rebuild the entire collection and its manifest. The generator uses only Python's standard library. It requires no image API, remote font, external raster image or build dependency.

Card subtitles are decorative flavour text, never additional rules. Existing Settlers mechanics and card descriptions remain authoritative. The scene assets deliberately preserve the existing resource vocabulary: brick, wood, wheat, wool and ore.

Validation: all 45 generated SVGs parsed successfully with Python's XML parser; the manifest includes each generated SVG exactly once.
