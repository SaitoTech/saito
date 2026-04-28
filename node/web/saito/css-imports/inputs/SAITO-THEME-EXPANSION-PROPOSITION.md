# Saito Web Theme Expansion — Research Summary & Proposition

**Date:** 2026-04-28  
**Scope:** Extend palette-first theming (as explored for videocall) across the shared web CSS stack so new themes can be shipped by defining palettes and token maps, with improved surfaces, buttons, overlays, and typography discipline.

**Naming:** Informal spellings such as **“cyto”** or **“sido”** in conversation mean **Saito**. This document refers only to the **Saito** shared CSS stack and `saito-*` filenames.

---

## 1. Research Findings — What Exists Today

### 1.1 Actual filenames

The shared UI stack lives under:

- **Aggregate stylesheet:** `web/saito/saito.css` — `@import` list for all shared pieces.
- **Core tokens & chrome:** `web/saito/css-imports/saito-variables.css`, `saito-base.css`, component files (`saito-buttons.css`, `saito-overlay.css`, `saito-modal.css`, etc.).
- **Theme overlays:** `web/saito/css-imports/themes/saito-dark.theme.css`, `saito-prism.theme.css`, `saito-raven.theme.css`.

There are **no** alternate-prefix CSS files (e.g. `cyto-*.css`); implementation names are **`saito-*`**.

### 1.2 How global CSS is assembled

`saito.css` imports theme files **before** `saito-variables.css`. That order is workable because:

- **Defaults** are set on `:root` in `saito-variables.css`.
- **Theme overrides** are scoped to `html[data-theme='…']`, which wins for matching properties when the attribute is set (specificity beats bare `:root` for those declarations).

Themes included in the bundle today: **prism**, **dark**, **raven** (plus implicit **lite** via modules — see below).

### 1.3 Token model (`saito-variables.css`)

The baseline design system is **CSS custom properties** on `:root`, grouped roughly as:

| Area | Representative variables |
|------|-------------------------|
| Neutrals | `--saito-gray-050` … `--saito-gray-950` |
| Brand | `--saito-primary`, `--saito-primary-dark`, `--saito-secondary`, `--dreamscape`, `--saito-primary-background` |
| Canvas & surfaces | `--saito-background-color`, `--saito-surface-color`, `--saito-surface-hover`, `--saito-surface-selected`, `--saito-surface-inverse` |
| Typography | `--saito-font`, `--saito-font-medium`, `--saito-font-heavy`, `--saito-font-color-*`, heading sizes |
| Structure | `--saito-border-radius`, `--border-padding-*`, `--border-thickness-*`, `--saito-border-color*` |
| Depth | `--saito-box-shadow`, `--saito-box-shadow-low`, `--saito-box-shadow-high` |
| Overlays | `--background-color-shim-light|normal|dark` (backdrop tints) |

**Font:** Default UI face is **Visuelt Light** (`--saito-font`), which already matches the goal of a thin, app-like default.

### 1.4 How themes work

Each theme file repeats the pattern:

```css
html[data-theme='prism'] { /* overrides */ }
```

- **dark** / **raven:** Mostly token swaps (background, surfaces, font colors, borders, shadows). Compact files.
- **prism:** Token swaps **plus** extensive **component-level** rules (buttons, `.saito-modal`, `.saito-table-*`, inputs, `.saito-module`, scrollbars, etc.). This establishes a precedent: **one theme can reshape components** without touching every module — at the cost of a larger theme file and higher coupling to class names.

### 1.5 Runtime theme selection

- `Browser.switchTheme(theme)` sets `document.documentElement.setAttribute('data-theme', theme)` and persists per active module slug in `app.options.theme` (`lib/saito/browser.ts`).
- Settings UI builds options from `mod.theme_options` (`mods/settings/lib/theme-switcher-overlay.js`).

Modules that expose `theme_options` control which theme names are valid for that application.

### 1.6 Module CSS vs global CSS (Red Square example)

Red Square’s `mods/redsquare/web/style.css` imports a **stack of module-local sheets** after the global bundle. `redsquare-saito.css` illustrates the usual integration pattern:

- Uses **`html[data-theme='lite']`** for header tweaks (not defined in `/themes/` — lite is partly **module-scoped**).
- Overrides **`body`** font to Segoe UI for that product skin while still using `--saito-font-color` and `--saito-background-color`.
- Layout rules (grid columns, sidebars) are module-specific; **colors and borders** still pull from shared tokens (`--saito-border-color`, etc.).

**Implication:** Any global token rename or new semantic layer must remain backward-compatible, or Red Square–style sheets need coordinated updates.

### 1.7 Videocall / “Neon Nocturne” direction

`mods/videocall/web/stitch_web_call_ui_refresh/saito_noir/DESIGN.md` describes a **palette-first**, Material-adjacent vocabulary:

- Surfaces: `surface-container-low` / `surface-container` / `surface-container-high`
- Rules: tonal layering over harsh borders, long soft shadows, glass / blur for floating controls, gradient primary CTAs
- Typography: dual stack (display vs body) — **broader than** current global Visuelt-only approach

That document is **design intent**, not yet wired as shared CSS variables in `css-imports/`. It is the natural conceptual source for a **palette block** when generalizing.

---

## 2. Gaps & Pain Points

1. **Palette layer** — **Implemented:** `saito-variables.css` now exposes `--palette-*` tokens and maps existing `--saito-*` compatibility tokens through them. Lite, dark, raven, and prism now declare palette values.
2. **Lite theme split** — **Implemented:** `lite` is now first-class in `css-imports/themes/saito-lite.theme.css`; Red Square keeps layout-only module overrides.
3. **Overlay / modal tokenization** — **Implemented:** backdrops, panels, panel shadows, modal background, modal texture, and modal border now use shared semantic tokens (`--saito-overlay-*`, `--saito-modal-*`).
4. **Buttons** — **Implemented:** buttons now use `--saito-button-*` semantics, `--saito-focus-ring`, and the disabled-state `var(---saito-background-color)` typo is fixed.
5. **Prism’s breadth** — **Mostly addressed:** prism now declares palette + component semantic tokens for inputs, tables, cards, buttons, modal surfaces, and overlays. Remaining component rules are limited to distinctive behavior such as button lift/opacity, header blur, and Prism utilities.
6. **Textures / patterns** — **Implemented baseline:** `--palette-texture-overlay` and `--saito-modal-texture` let themes opt in or out. Dark/raven/prism currently disable modal texture; lite keeps the tiled-logo texture.

---

## 3. Proposition — Architecture

### 3.1 Three layers (recommended)

1. **Palette layer (new)** — Raw aesthetic intent, mostly independent of legacy names:  
   `--palette-bg`, `--palette-bg-elevated`, `--palette-surface-1..n`, `--palette-primary`, `--palette-on-primary`, `--palette-outline`, `--palette-danger`, optional `--palette-gradient-primary`, `--palette-shadow-ambient`, etc.
2. **Semantic / compatibility layer** — Existing `--saito-*` variables **reference** the palette layer in `saito-variables.css` and in each `html[data-theme]` block. Existing modules keep working.
3. **Component layer** — `saito-buttons.css`, `saito-overlay.css`, `saito-modal.css`, etc. gradually prefer **semantic tokens** (`--saito-button-primary-bg`, `--saito-overlay-backdrop`, …) that default to palette-backed values.

This matches the videocall doc’s separation between **meaning** (surface tier) and **implementation** (hex).

### 3.2 Theme file shape (goal)

Each theme file should ideally:

1. Set palette variables for that skin.
2. Map `--saito-*` (and new semantic tokens) from those palettes in one compact block.
3. Optionally add **small** component overrides only where tokens cannot express the design (Prism-like rules become the exception, not the default).

### 3.3 Concrete token additions (initial set)

**Spacing & rhythm (global)**

- `--saito-space-xs` … `--saito-space-xl` (or scale 1–6) derived once; replace ad hoc `1rem` / `2rem` in shared components over time.
- `--saito-radius-sm`, `--saito-radius-md` (alias `--saito-border-radius`), `--saito-radius-lg`, `--saito-radius-full`.

**Elevation**

- `--saito-elevation-0..3` as shadow stacks (or rely on color-mix from `--palette-shadow`).

**Overlay system**

- `--saito-overlay-backdrop`: single source for `.saito-overlay-backdrop` (today: `--background-color-shim-*`).
- `--saito-overlay-panel-bg`, `--saito-overlay-panel-shadow`, optional `--saito-overlay-panel-border`.

**Buttons**

- `--saito-button-primary-bg`, `--saito-button-primary-bg-hover`, `--saito-button-primary-fg`
- `--saito-button-secondary-bg`, `--saito-button-secondary-border`
- `--saito-focus-ring`: consistent `:focus-visible` outline

**Inputs, tables, cards**

- `--saito-input-bg`, `--saito-input-border`, `--saito-input-border-focus`, `--saito-input-font`
- `--saito-table-row-bg`, `--saito-table-row-bg-hover`, `--saito-table-header-*`
- `--saito-card-bg`, `--saito-card-border-*`, `--saito-card-shadow-*`, `--saito-card-transform-hover`

Palette themes only need to set palette + these semantic hooks; base CSS uses the hooks.

### 3.4 Typography

- **Keep Visuelt Light as default** `--saito-font` for the “thin web app” baseline.
- Add optional **`--saito-font-alt`** or document when Prism swaps to system UI — themes choose stack without forcing every module to change.
- Introduce **`--saito-font-weight-display`** / **`--saito-letter-spacing-ui`** only if needed to avoid scattered `letter-spacing: 1px` on buttons.

### 3.5 Textures, borders, patterns

- Prefer **tonal surfaces** and **very soft borders** (`color-mix` on `--palette-outline`) before adding bitmap noise.
- If texture is required: expose **`--palette-texture-overlay`** and component-level aliases such as **`--saito-modal-texture`** (`none | url(...)`) and apply with `background-image` layering on selected shells (modal / header), not on every div — performance and readability first.
- **Gradients:** centralize in `--saito-primary-background` and optional `--saito-canvas-gradient` so videocall-style CTAs reuse the same machinery.

### 3.6 Light / dark

- Continue **`html[data-theme]`** as the switch.
- For each palette, define **both** a light and dark variant **or** document which themes are dark-only (prism, raven, dark) vs lite.
- Consider **`prefers-color-scheme`** only as a future optional auto-pick; current design is **explicit theme names** — keep that unless product asks for auto.

---

## 4. Migration Phasing (low risk)

| Phase | Work |
|-------|------|
| **A** | **Done:** palette + semantic tokens added to `saito-variables.css`; existing `--saito-*` compatibility tokens now map through them. |
| **B** | **Done:** button disabled typo fixed; `--saito-focus-ring`, `--saito-button-*`, `--saito-overlay-*`, and `--saito-modal-*` are wired into shared CSS. |
| **C** | **Mostly done:** **prism** now uses palette + semantic component tokens for core colors, surfaces, borders, inputs, tables, cards, buttons, modals, and overlays; only distinctive Prism behavior remains as selector rules. |
| **D** | (Deferred) Packaged “noir” / videocall-style theme in global bundle — **keep videocall CSS in the mod** for now. |
| **E** | ~~Audit Red Square lite rules~~ **Done:** lite lives in `themes/saito-lite.theme.css`; Red Square keeps layout-only overrides in module CSS. |
| **F** | **Done:** first hard-coded color cleanup across shared CSS plus high-impact Red Square / Arcade surfaces. Added chip and muted tokens; tokenized tweet thread lines, module title chips, Arcade observer controls, install ribbon, and overlay shadows. |

---

## 5. Risks & Mitigations

- **Specificity wars:** Theme files that restyle many selectors (Prism) can fight modules. Mitigation: prefer variables; keep overrides to shells (`.saito-modal`, `.saito-overlay`) not leaf widgets.
- **Module hard-coded colors:** First Red Square / Arcade cleanup is done. Remaining raw colors are mostly intentional palette definitions, text-shadow detail, curation/readability states, or module art/brand decisions; audit module-by-module before broader changes.
- **Build order:** Keep theme imports + variables order documented; new tokens belong in variables or a dedicated `saito-palette-defaults.css` imported early if the file grows.

---

## 6. Success Criteria

- New theme can be added as **one CSS file** consisting mainly of **palette + token mapping**, without copying pages of component CSS.
- Buttons, overlays, and primary surfaces **visibly align** with videocall-quality depth (gradients, shadows, backdrop) where the theme opts in.
- **Visuelt** remains the default thin UI face; themes may override without breaking modules that only use variables.
- Red Square and other modules continue to work with **only** targeted updates (lite consolidation, removed duplicate hex where it duplicates tokens).

---

## 7. Resolved decisions

1. **Lite theme:** First-class file `css-imports/themes/saito-lite.theme.css`; modules only supply layout overrides. Runtime default falls through to **`dark`** when no saved preference and no `data-theme` on `<html>` (`browser.ts`).
2. **Videocall styling:** Keep video call polish **only** under `mods/videocall/web/css`; no videocall-derived theme in the global bundle for now (Phase D palette demo deferred).
3. **Scrollbars / selection:** Shared stylesheet `css-imports/saito-dark-themes-chrome.css` applies WebKit scrollbar + `::selection` (+ Firefox `scrollbar-color`) for **`dark`**, **`raven`**, and **`prism`** using each theme’s tokens.

---

*End of proposition.*
