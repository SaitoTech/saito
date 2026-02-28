# Observer overlay → HUD transition — timing instrumentation

Instrumentation in `game-observer.js` logs high-resolution timings and DOM state to debug the visual gap between loading overlay removal and HUD appearance. No behavior was changed.

---

## 1. Log points (all in game-observer.js)

Each `[GO-TIMING]` log includes a snapshot object with:

- **t** — `performance.now()`
- **is_loading**
- **overlayExists** — `#observer-sync-overlay` in DOM
- **hudExists** — `#game-observer-hud` in DOM
- **sync_in_progress**
- **stability_monitor_active**
- **all_moves_length**

### finishLoading()

| Label | When |
|-------|------|
| `finishLoading entry` | Entry to finishLoading() |
| `immediately before is_loading = false` | Right before `this.is_loading = false` |
| `immediately after is_loading = false` | Right after |
| `immediately before requestAnimationFrame` | Just before scheduling rAF |
| `inside rAF callback before this.render()` | First line inside the rAF callback |

### render()

| Label | When |
|-------|------|
| `render() top` | Very top of render() |
| `immediately before overlay removal (prevSync.remove())` | Before `prevSync.remove()` |
| `immediately after overlay removal` | After `prevSync.remove()` |
| `immediately after HUD injected (addElementToDom)` | After addElementToDom(html) for HUD |
| `immediately after HUD injected (replaceElementById)` | After replaceElementById(html, 'game-observer-hud') |
| `after attachEvents()` | After attachEvents() |
| `after updateUIState()` | After updateUIState() |

### MutationObserver (temporary, in finishLoading())

- **MutationObserver: observer-sync-overlay removed** — when the overlay node (or a subtree containing it) is removed from the DOM. Log includes `t: performance.now()`.
- **MutationObserver: game-observer-hud inserted** — when the HUD node (or a subtree containing it) is added. Log includes `t: performance.now()`.

Observer is created before `requestAnimationFrame`, observes `document.body` with `childList: true, subtree: true`, and disconnects after 3s.

### Summary log

After the transition, a single **`[GO-TIMING] SUMMARY`** is printed with:

- **overlayRemoved** — time when overlay was removed (after `prevSync.remove()`)
- **hudInserted** — time when HUD was injected (after addElementToDom/replaceElementById)
- **rafFired** — time when the rAF callback ran (before `render()`)
- **delayOverlayToHudMs** — `(hudInserted - overlayRemoved)` in ms (same frame ≈ 0–2 ms; next frame ≈ 16+ ms)

---

## 2. Console timeline summary — how to read it

1. **Time overlay removed**  
   Use the snapshot from **`immediately after overlay removal`** (field **t**), or **MutationObserver: observer-sync-overlay removed** (field **t**), or **SUMMARY.overlayRemoved**.

2. **Time HUD inserted**  
   Use **`immediately after HUD injected (...)`** (field **t**), or **MutationObserver: game-observer-hud inserted** (field **t**), or **SUMMARY.hudInserted**.

3. **Time rAF callback fired**  
   Use **`inside rAF callback before this.render()`** (field **t**), or **SUMMARY.rafFired**.

4. **Total delay overlay removal → HUD insertion**  
   Use **SUMMARY.delayOverlayToHudMs**, or compute `hudInserted - overlayRemoved` from the snapshots.

---

## 3. What to infer

- **Delay caused by requestAnimationFrame?**  
  If `rafFired` is ~16 ms (or one frame) after “immediately before requestAnimationFrame”, the overlay is removed in the rAF callback and the HUD is inserted in the same callback. So overlay removal and HUD insertion are in the same frame; the only extra delay is the one frame of rAF. If there is a visible gap, the cause is elsewhere (e.g. layout/paint or main-thread work).

- **render() blocked by main-thread work?**  
  Compare **t** at `render() top` vs at `immediately after overlay removal` and `immediately after HUD injected`. If the gap between “render() top” and “after overlay removal” is large, something before overlay removal is slow. If the gap between “after overlay removal” and “after HUD injected” is large, the DOM insertion or something in between is slow.

- **Overlay removal and HUD insertion in different render passes?**  
  MutationObserver logs give the actual DOM mutation times. If “observer-sync-overlay removed” and “game-observer-hud inserted” have **t** values in the same callback and within a few ms, they are in the same JS turn; the browser may still paint them in different frames. If **delayOverlayToHudMs** is large, the two mutations are in different JS turns (e.g. rAF vs next frame or later).

- **finishLoading() called while queue processing still ongoing?**  
  At **`finishLoading entry`** and **`immediately before is_loading = false`**, check **sync_in_progress** and **stability_monitor_active**. If either is true at finishLoading entry, the transition may have started before the queue was idle.

---

## 4. Files touched

- **lib/saito/ui/game-observer/game-observer.js** — instrumentation only (no logic change):
  - `_timingSnapshot()` helper
  - `_timing_overlay_removed`, `_timing_hud_inserted`, `_timing_raf_fired` in constructor
  - Logs at all points above
  - MutationObserver in finishLoading()
  - SUMMARY log and reset after updateUIState()
