# SettlersX — The island adventure

## Direction

A new module, preserving Settlers' actual Saitoa rules while replacing its presentation. Original ligne claire expedition artwork: ivory paper, dark navy contours, vermilion accents, turquoise sea, gold wheat, green forests, terracotta roofs. An illustrated, physical island is the centrepiece. No external fonts, CDN or online artwork dependencies.

## Parallel assignments

1. **Gameplay adapter:** copy existing rules and queues, preserve all game options, bridge existing legal input targets to 3D selection, replace HUD with the expedition interface. Preserve development cards, bank/peer trades, statistics, initial-placement restrictions, two-player Robin Hood and awards.
2. **Three.js island:** canonical hex topology; outlined dimensional terrain; roads, villages, cities, ports and robber; trackball rotation, zoom and reset; state-driven construction and goods animation; low-motion and WebGL fallback.
3. **SVG illustration:** resource and development cards, icons, portraits, compass, ship and cover. Original adventure characters and reusable assets.
4. **Interface/integration:** responsive expedition-table shell, information inventory, readable action controls and illustrated overlays; local preview using the same rules; browser and parity verification.

## Boundaries

- All new source, assets, tooling and documentation live in `mods/settlersx`.
- The existing `mods/settlers` remains unchanged.
- Scene only renders state and reports selections. Original game code determines legality and resolves actions.
- Preview transport is local only. Live encrypted deck/network verification requires a multi-wallet Saito game.

## Acceptance

- The 19-hex board uses exactly the original canonical vertex, edge and harbour IDs.
- All old gameplay information remains accessible: public scores, resources/dev-card counts, knights, awards, ports, private hand, dice, turn, offers, prices, log, rules and statistics.
- Legal placements work on the 3D map. Camera gestures do not place pieces.
- Browser validation covers desktop/mobile layouts, scene rendering, setup/build actions, overlays, and fallback.
