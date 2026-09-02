# Saito Websitex Redesign Plan

This file is intentionally kept in the module root so it can be excluded from
Git, edited, or used to selectively retain parts of the redesign.

## Local module activation

`websitex/websitex.js` has been added to both the `core` and `lite` lists in the
local `config/modules.config.js`, exposing the experiment at `/websitex` after
the normal compile/restart workflow. The repository ignores this configuration
file, so other environments must add the same entries locally.

## North star

Reframe the website as a live product experience rather than a protocol slide
deck. A visitor should understand Saito in seconds, launch an application in
under a minute, and discover the technical depth progressively.

Core message:

> The network is the platform. Saito is an open network for peer-to-peer
> applications that run in the browser.

## Implementation slices

Each slice is designed to be useful independently. Remove or postpone a slice
without invalidating the rest of the page.

### Slice A — Foundation and navigation

- [x] Replace full-viewport mandatory scroll snapping with normal document flow.
- [x] Add a persistent desktop navigation bar.
- [x] Add an accessible mobile navigation sheet.
- [x] Add clear entry points for users, developers, and node operators.
- [x] Establish one responsive typography, colour, spacing, and surface system.

Files:

- `web/index.html`
- `web/style.css`
- `web/css/website-2026.css`
- `web/js/site-2026.js`

### Slice B — Hero and application launcher

- [x] Lead with a plain-language product promise.
- [x] Add primary "Enter Saito" and secondary "See how it works" actions.
- [x] Replace the 3D carousel with a responsive application launcher.
- [x] Provide app category filtering.
- [x] Use real Saito application icons and direct launch links.

Safe to retain on its own: yes.

### Slice C — Browser/network proof

- [x] Add an opt-in "Watch this browser join" demonstration.
- [x] Make every step explicit and reversible.
- [x] Use real browser capabilities where available and label simulated
      explanatory steps honestly.
- [x] Avoid transmitting data or creating a blockchain transaction.

Note: the static website does not currently load the Saito client bundle, so
this slice demonstrates local key material, capability discovery, and the
connection sequence without claiming a live peer handshake. It detects an
injected Saito runtime and reports it if present. A later phase can connect this
panel to official client lifecycle events.

Safe to remove: yes; delete the `#live-proof` section and the related JS
selectors.

### Slice D — Network explanation

- [x] Replace the modal/fullscreen consensus animation with a concise,
      scroll-visible four-step narrative.
- [x] Preserve links to the wiki, whitepaper, and mechanism-design papers.
- [x] Use a lightweight routed-packet diagram with a reduced-motion fallback.

Safe to retain on its own: yes.

### Slice E — Shared ownership and applications

- [x] Merge the separate asset, commerce, and ecosystem stories into one
      coherent chapter.
- [x] Explain create, publish, settle, and use as a single lifecycle.
- [x] Show how one wallet/asset layer connects applications.
- [x] Retain the Store and programmable-finance calls to action.

Safe to retain on its own: yes.

### Slice F — Developer path

- [x] Add a dedicated developer section.
- [x] Explain modules, shared capabilities, and browser-native applications.
- [x] Provide paths to the quickstart/wiki, module source, and node repository.
- [x] Include a small representative module example.

Safe to remove: yes.

### Slice G — Proof, community, and conversion

- [x] Add evidence links for running applications, source, papers, and docs.
- [x] Replace the text-only community section with useful destinations.
- [x] End with distinct paths for users, builders, and node operators.
- [x] Correct page metadata and structured data.

Safe to retain on its own: yes.

### Slice H — Quality and performance

- [x] Keep first render independent of large legacy inline SVG animations.
- [x] Use semantic HTML and visible keyboard focus.
- [x] Respect `prefers-reduced-motion`.
- [x] Respect mobile safe areas and coarse pointers.
- [x] Avoid hover-only information.
- [x] Keep all primary interactions usable without JavaScript.
- [x] Add progressive reveal effects without hiding content before JS loads.

## Optional follow-ups

These require runtime services or product decisions and are deliberately not
faked in the static implementation:

- [ ] Connect the browser proof panel to actual Saito peer lifecycle events.
- [ ] Add reliable live network metrics (block height, peers, recent activity).
- [ ] Add a curated or live RedSquare community feed.
- [ ] Add application screenshots or short product recordings.
- [ ] Add measured analytics for app launches and developer-path conversion.
- [ ] Run moderated usability testing with first-time and returning visitors.
- [ ] Run automated accessibility testing in CI.
- [ ] Add visual regression snapshots for phone, tablet, laptop, and wide
      desktop breakpoints.

## Acceptance checks

- [x] HTML parses without duplicate IDs or missing local assets.
- [x] All internal and external calls to action point to valid intended routes.
- [ ] Desktop layout checked at 1440×900 and 1920×1080.
- [ ] Mobile layout checked at 390×844 and 360×740.
- [ ] Keyboard navigation checked through menu, filters, demo, and accordions.
- [x] Reduced-motion interaction path checked.
- [ ] No horizontal page overflow.
- [x] No console errors during primary interactions.

## Content decisions worth revisiting

- Whether the hero should say "Apps that connect people. Directly." or the more
  technical "The network is the platform."
- Whether "Enter Saito" should open the launcher, RedSquare, or a dedicated app
  home.
- Which three applications deserve featured placement.
- Whether Store, Vault, and Stack are ready for prominent public traffic.
- Which community destinations are official and actively maintained.
- Whether reliable public network metrics are available for the website.
