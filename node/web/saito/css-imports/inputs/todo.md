# Saito Theme Engine TODO

## 1. Finish shared component token coverage

- [x] First pass: move high-traffic shared UI files onto semantic tokens for colors, shadows, borders, radii, and textures.
- [x] First pass: prioritize `saito-chat.css`, `saito-wallet.css`, `saito-nft.css`, `saito-calendar.css`, `saito-tooltip.css`, `saito-post.css`, modal/header leftovers, and form edge cases.
- [ ] Continue module-by-module cleanup as flows are reviewed in-browser.
- [ ] Keep game/art-specific CSS visually stable unless the value is clearly shared UI chrome.

## 2. Add explicit chrome semantics

- [x] Add/standardize tokens for header chrome, tooltips, dropdowns, menus, floating action buttons, notifications, empty states, timelines/progress, and status colors.
- [x] Prefer component tokens over direct `--saito-white`, `--saito-black`, gray hex values, or local `rgba()` shadows in shared app chrome.
- [ ] Revisit game/canvas-specific chrome separately.

## 3. Normalize shadows and borders

- [x] Use `--saito-elevation-*` and component shadow aliases for app surfaces.
- [x] Use soft outline tokens before stronger divider tokens.
- [ ] Reserve hard-coded shadows/borders for game boards, canvas art, and intentionally branded module assets.

## 4. Define theme QA targets

- [ ] Verify each theme against header/menu, modal, overlay form, card/module grid, chat, wallet/crypto, and one feed/list view.
- [ ] Check both desktop and mobile layouts for text overlap, contrast, and surface layering.

## 5. Reduce Prism selector overrides

- [ ] Keep Prism mostly palette + semantic token mappings.
- [ ] Move broad selector behavior such as link styling and table/title colors into reusable tokens where possible.

## 6. Clean Stack explore inline visual styles

- [ ] Move loading, empty, and error states from inline styles in `mods/stack/lib/ui/overlay/explore.js` into CSS classes.
- [ ] Use shared empty-state/loading tokens once they exist.

## 7. Noir global theme

- [x] Review videocall Noir design source.
- [x] Add global `saito-noir.theme.css` based on the cinematic obsidian/ember aesthetic.
- [x] Import Noir in the shared Saito CSS bundle and include it in default theme options.
- [x] Tune RedSquare reply composer: hidden preview scrollbar, white ember CTA text, true pill CTA shape, transparent media controls, and richer Noir panel gradient.
- [ ] Run visual QA across the standard theme targets before final tuning.
