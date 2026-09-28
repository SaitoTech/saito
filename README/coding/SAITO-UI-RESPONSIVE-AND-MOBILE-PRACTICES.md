# Saito Responsive and Mobile UI Practices

## Purpose

Saito does not have a centralized responsive or mobile UI framework.

Responsive behavior is instead distributed across three layers:

1. The Saito UI and CSS system provides responsive behavior for shared components.
2. Individual applications control how their own page layouts adapt.
3. Games have a separate responsive model because boards, HUDs, and game controls often need viewport measurement and scaling that ordinary applications do not.

The important principle for developers and AI coding agents is therefore not to search for a generic Saito "mobile framework." There isn't one.

Instead, determine which part of the interface is responsible for the behavior and implement the responsive behavior at that level.

CSS should normally handle changes in layout, stacking, visibility, spacing, and sizing. JavaScript should be used when the application needs information that CSS cannot provide, such as the actual visual viewport, a change in the host element for a component, or the scale and position of a game board.

The repository contains recurring breakpoint values, particularly 600px, 620px, and 768px. These values have different meanings and should not be treated as interchangeable global breakpoints.

---

## 1. Saito Does Not Have a Formal Responsive Framework

There is no centralized responsive API comparable to a frontend framework's breakpoint system.

There is no general set of classes such as:

    hide-on-mobile
    show-on-mobile
    mobile-column
    desktop-only

There is also no single shared breakpoint variable that every application uses.

The shared Saito CSS contains several responsive rules, but applications still own the responsive behavior of their own pages.

This is deliberate in at least part of the architecture. The shared page-layout CSS contains a commented-out rule that would otherwise collapse the standard three-column Saito page layout:

    @media screen and (max-width: 900px) {
        .saito-container {
            padding: 0;
            grid-template-columns: 1fr;
        }
        ...
    }

The comment explains that this should be handled module by module.

This is an important architectural distinction:

> Saito provides responsive behavior for shared UI components, but does not impose one responsive page layout on every application.

An application may therefore have a very different mobile layout from another application while still using the same Saito UI components.

---

## 2. The Three Responsive Layers

Responsive behavior can generally be understood as three layers.

### Saito design-system and shared UI layer

This includes things such as:

- the Saito header
- the application menu
- overlays
- buttons
- inputs
- chat
- sidebars
- floating controls
- other shared UI

These components have their own responsive CSS and, where necessary, their own JavaScript.

An application using a Saito overlay should normally inherit the overlay's mobile behavior rather than recreate it.

### Application integration layer

Each application decides how its page is arranged.

This includes:

- number of columns
- page widths
- sidebar behavior
- mobile navigation
- whether panels disappear
- whether panels are replaced
- page-specific viewport handling
- application-specific safe-area padding

The application should implement these rules in its own base/page CSS and associated components.

### Component layer

Individual components control their own internal layout.

A component should normally have a distinctive root class and short descendant names, for example:

    .tweet
      .header
      .body
      .footer

Responsive rules affecting the tweet should generally live with the tweet's CSS rather than in an unrelated parent stylesheet.

The parent controls where the component is placed.

The component controls how it behaves inside that space.

This preserves the component ownership model used elsewhere in Saito.

---

## 3. CSS Is the Default Mechanism

For ordinary responsive behavior, prefer CSS.

CSS is the appropriate mechanism for things such as:

- changing the number of columns
- stacking elements
- reducing padding
- changing widths
- hiding secondary controls
- converting a sidebar into a bottom navigation bar
- changing typography
- changing spacing
- adapting buttons
- making an overlay full-screen
- adjusting component internals
- responding to viewport width
- responding to viewport orientation where appropriate

For example, an application may change from:

    grid-template-columns: 80px minmax(0, 1fr) 300px;

to:

    grid-template-columns: 1fr;

at a mobile breakpoint.

There is usually no reason for JavaScript to calculate the viewport width and manually apply those styles.

Use JavaScript when the application needs to do something that CSS alone cannot accomplish.

---

## 4. JavaScript Has Specific Responsive Responsibilities

There are several legitimate reasons for responsive JavaScript in Saito.

### Visual viewport handling

Mobile browsers change the visual viewport when:

- the virtual keyboard opens
- browser chrome changes
- the visible area changes without the layout viewport changing

Saito uses `window.visualViewport` in several places for this reason.

The common pattern is:

1. observe `visualViewport`
2. measure the visible viewport
3. write the result into a CSS custom property
4. let CSS consume that property

For example, an application may establish:

    --application-page-viewport-height

and then use it from CSS.

This is preferable to moving an entire layout system into JavaScript merely because mobile browsers have unusual viewport behavior.

### Changing the component host

Sometimes mobile behavior changes which component is displayed or where a component is mounted.

This cannot always be expressed as CSS.

RedSquare is an example. Its mobile interface has separate hosts for feed, chat, and settings:

    .manager[data-mobile-view="feed"]
    .redsquare-mobile-chat
    .redsquare-mobile-settings

The application uses JavaScript to select the active view.

This is an application-state decision rather than merely a visual CSS decision.

### Game board measurement and scaling

Games are another legitimate use.

A game board may have an intrinsic coordinate system and need to be fitted into the available viewport.

JavaScript can measure the actual board and viewport and calculate a scale.

That is fundamentally different from using JavaScript merely to ask whether the screen is 600px wide.

---

## 5. Do Not Confuse Viewport Width with a Mobile Device

Saito has `app.browser.isMobileBrowser()`.

This is a user-agent/device test.

It is not a responsive breakpoint.

It is not equivalent to:

    window.innerWidth <= 600

The distinction matters.

A desktop browser window can be resized below 600px without becoming a mobile device according to `isMobileBrowser()`.

Conversely, a phone can have a viewport wider than 600px in some situations.

`isMobileBrowser()` is therefore appropriate when behavior genuinely depends on device characteristics or mobile-browser interaction.

Examples in the repository include:

- mobile-specific sharing behavior
- shortened anonymous usernames
- mobile game presentation choices
- mobile chat behavior
- interaction behavior

It should not be used simply to decide whether a page should have one column.

For layout, use CSS media queries or, when JavaScript genuinely needs the state, viewport measurements/media queries.

---

## 6. Important Breakpoints

Saito does not have one formal breakpoint system, but several values recur.

The most important values are:

### 600px

600px is the recurring narrow/mobile layout boundary.

It is used for things such as:

- RedSquare's one-column layout
- RedSquare's bottom navigation
- chat becoming full-screen
- mobile overlay subform behavior
- shared button sizing
- game HUD classification
- various mobile controls
- game splash behavior

When creating an ordinary application that needs a mobile layout, 600px is therefore an important existing Saito convention.

It should not, however, be treated as a universal law. Application-specific layouts can require other values.

### 620px

620px is primarily associated with Saito header and floating-control chrome.

For example:

- hamburger panel width
- header padding
- floating plus button
- header icon sizing

620px is close to 600px but represents a different existing set of design decisions.

Do not mechanically replace every 620px rule with 600px.

### 768px

768px has a different role.

The shared Saito CSS uses it for:

- root font-size changes
- heading/paragraph size changes
- full-screen overlays
- input and related UI behavior

The overlay JavaScript also uses 768px as the point at which visual viewport measurements become relevant.

Thus:

    600px

and:

    768px

should not be treated as two names for the same concept.

600px is predominantly a narrow/mobile application layout boundary.

768px is an important shared Saito UI and typography boundary.

### Other values

Other breakpoints occur in individual applications and components:

- 375px
- 400px
- 420px
- 480px
- 525px
- 650px
- 660px
- 700px
- 720px
- 800px
- 820px
- 900px
- 992px
- 1000px
- 1200px

These should not automatically be interpreted as members of a global Saito breakpoint system.

Many exist because a particular component has a particular layout problem.

A developer should therefore inspect the existing component and its surrounding CSS before introducing or changing a breakpoint.

---

## 7. Shared Saito UI Already Handles Much of Mobile Behavior

Applications should take advantage of responsive behavior already implemented by shared Saito UI.

Do not reimplement behavior that the shared component already owns unless the application genuinely needs a different presentation.

### Header

The Saito header changes behavior around 620px.

The hamburger panel becomes full-width and the header padding and logo dimensions change.

The game header is separate and has additional behavior around 600px and short landscape viewports.

The header's use of `isMobileBrowser()` is not its primary layout mechanism.

### Slide-in menu

The ordinary application menu is part of the Saito header system.

At mobile widths it can become a full-width panel.

Applications should not create their own replacement for this simply because the application is being viewed on a phone.

If an application has a different navigation concept, that is an application-level component and should be implemented separately.

RedSquare's navigation is an example of such application-specific UI.

### Overlays

Saito overlays already have mobile behavior.

At widths up to 768px, an overlay becomes effectively full-screen:

- viewport-sized
- no normal desktop border radius
- no normal desktop shadow
- contained scrolling
- safe-area handling
- visual viewport support

The overlay uses:

    100dvh

as part of its modern viewport handling and can consume a dynamically supplied visual viewport height.

An application should therefore normally use `SaitoOverlay` rather than building an independent mobile modal system.

An application can still override the shared behavior when a particular overlay needs a different presentation.

Store does this for listing detail overlays.

### Buttons

Shared Saito buttons reduce their minimum widths at 600px and allow button rows to wrap.

This is an example of a shared component handling its own mobile adaptation.

Application CSS may customize the visual appearance, but should not unnecessarily duplicate the entire responsive behavior.

### Chat

Chat has a distinct mobile interaction mode.

At 600px it becomes full-screen and uses visual viewport dimensions.

The implementation also has JavaScript behavior because mobile chat needs to respond to the virtual keyboard and browser viewport.

This is a legitimate case where CSS and JavaScript cooperate.

---

## 8. Application Page Layouts Are Application-Owned

The standard Saito page container can support multi-column layouts, but the shared stylesheet does not force every application into one mobile transformation.

An application should decide what its mobile information architecture should be.

Possible strategies include:

- collapsing columns
- removing secondary columns
- converting a sidebar into a bottom bar
- replacing a panel with a full-screen view
- allowing a component to scroll independently
- using an overlay
- preserving the same structure but tightening spacing

The correct choice depends on the application.

Do not introduce a generic responsive controller or layout manager merely to standardize this behavior.

The application already owns the page structure.

---

## 9. RedSquare as a Reference Application

RedSquare is a useful current example of how an ordinary Saito application can implement responsive behavior.

It should be treated as a reference implementation, not as a framework.

Its base CSS changes the page layout at several widths.

At approximately 1200px:

    --saito-width: 1000px

and the columns become narrower.

At approximately 820px:

- the right sidebar is removed
- the available page height is tied to a visual viewport variable

At 600px:

- the page becomes one column
- bottom navigation space is reserved
- mobile views are selected
- safe-area space is respected

Its menu component independently changes shape.

At desktop sizes it is a side navigation.

At smaller sizes it becomes an icon-oriented menu.

At 600px it becomes a fixed bottom navigation bar.

The menu owns its own presentation in:

    redsquare-menu.css

The page owns the overall layout in:

    redsquare-base.css

Tweets own their own responsive behavior in their component CSS.

This is the preferred ownership relationship.

The parent page should not contain hundreds of selectors describing how tweets behave on mobile.

---

## 10. Mobile View Switching

RedSquare demonstrates an important distinction between responsive styling and responsive application state.

On mobile, RedSquare has separate views for:

- feed
- chat
- settings

The application uses JavaScript to select which view is active.

The views are associated with:

    data-mobile-view

and the inactive views use the `hidden` attribute.

This is different from simply changing CSS from three columns to one column.

If an application genuinely changes which interface is active, JavaScript state is appropriate.

Do not create JavaScript merely to reproduce a CSS layout change.

The distinction is:

    CSS:
    "These three elements should now stack."

versus:

    JavaScript:
    "The user is now viewing the chat screen rather than the feed screen."

---

## 11. Component-Owned Responsive CSS

Responsive rules should normally remain close to the component they affect.

For example:

    .tweet {
        ...
    }

    @media (max-width: 600px) {
        .tweet {
            ...
        }
    }

is generally preferable to having an unrelated application-wide stylesheet reach into the tweet's internal elements.

The component's CSS can control:

- its internal spacing
- its typography
- its internal layout
- its mobile stacking
- its mobile controls
- its own overflow behavior

The parent should control:

- where the component is placed
- the size of its containing region
- the overall page grid
- whether the component is shown
- whether the component occupies a column, row, panel, etc.

This is the same component ownership principle used elsewhere in Saito.

A parent may still apply a modifier through the component's root when context genuinely changes its presentation.

For example:

    .tweet.embedded

or:

    .tweet.focused

can legitimately affect the component's presentation.

The important point is that the relationship remains visible through the component root.

---

## 12. Page-Level Versus Component-Level Responsive Behavior

A useful distinction is:

### Page-level responsive behavior

This includes:

- number of columns
- sidebar removal
- navigation placement
- page width
- page height
- overall scrolling
- mobile view selection

This belongs in the application's base/page architecture.

### Component-level responsive behavior

This includes:

- card stacking
- tweet formatting
- button arrangement
- internal spacing
- image sizing
- local typography
- internal overflow

This belongs in the component's CSS.

### Shared-component responsive behavior

This includes:

- overlays
- header
- buttons
- shared inputs
- chat
- shared navigation

This belongs in the Saito shared UI implementation.

Avoid moving rules between these levels simply to make one file appear cleaner.

The location of the rule should follow ownership.

---

## 13. Viewport Height and Mobile Browser Chrome

Mobile width is not the only responsive problem.

Mobile browsers can change the visible viewport when:

- the address bar expands or contracts
- the keyboard opens
- browser chrome changes
- orientation changes

Saito uses modern viewport units in combination with `visualViewport` where necessary.

The principal units encountered in current code are:

    100dvh
    100svh

`100dvh` is useful when an interface needs to track the dynamic visible viewport.

`100svh` is useful where the smallest stable viewport is preferable, such as certain full-screen panels.

Older code also uses:

    100vh

especially in games and splash pages.

Do not mechanically replace every occurrence of `100vh`.

Some of these rules are legacy, while others are part of specialized game layouts. Inspect the surrounding behavior before changing them.

---

## 14. The Virtual Keyboard

The virtual keyboard is a particularly important case because it changes the visual viewport without necessarily changing the application's ordinary layout assumptions.

Saito handles this in several places by observing:

    window.visualViewport

and writing CSS variables.

For example, an application can maintain a variable representing the currently visible page height and let CSS consume it.

This is preferable to continuously calculating pixel positions for every element in JavaScript.

The general pattern is:

    visualViewport
        ↓
    JavaScript measurement
        ↓
    CSS custom property
        ↓
    CSS layout

This keeps the actual layout in CSS.

RedSquare uses this pattern for its page viewport.

Saito overlays use it for their viewport dimensions.

Chat uses it for its full-screen mobile interface.

---

## 15. Safe-Area Insets

Interfaces that place controls against the physical edge of a mobile display may need safe-area handling.

Saito uses:

    env(safe-area-inset-top)
    env(safe-area-inset-right)
    env(safe-area-inset-bottom)
    env(safe-area-inset-left)

where appropriate.

Examples include:

- overlay close controls
- RedSquare bottom navigation
- mobile compose controls
- Store page padding
- chat footer controls

Safe-area handling is not applied globally to every element.

Use it where the UI actually touches an edge that may be obscured by device hardware or system UI.

---

## 16. Scrolling

Saito generally does not rely on the document body as the application's primary scrolling surface.

The shared base CSS fixes the body to the viewport:

    position: fixed;
    height: 100dvh;
    width: 100vw;
    overflow: hidden;

Scrolling is instead provided by application containers and component bodies.

This is important when building mobile layouts.

Do not assume:

    body {
        overflow-y: auto;
    }

is the correct Saito architecture.

Instead, determine which container owns the application's scrollable content.

Examples include:

- `.saito-container`
- overlay bodies
- Store's application container
- feed containers
- chat content regions

This makes fixed headers, bottom navigation, overlays, and application panels easier to control.

---

## 17. Touch and Pointer Interaction

There is no general Saito application-wide touch event layer for ordinary controls.

Ordinary UI continues to use normal click and DOM event handling.

Touch-specific behavior appears primarily where the interaction genuinely requires it.

Games are the main example.

Game boards can use:

- pointer events
- drag handling
- board panning
- scaling
- orientation changes

A mobile interface should not automatically introduce separate `touchstart`, `touchmove`, and `touchend` implementations for ordinary buttons or navigation.

Use normal interaction mechanisms unless the UI genuinely requires gesture-specific behavior.

---

## 18. Games Have a Different Responsive Model

Games should not be forced into the same responsive architecture as ordinary applications.

A normal application primarily needs to rearrange UI.

A game often needs to preserve a spatial environment.

For example:

- a game board has intrinsic dimensions
- pieces have coordinates
- cards may have fixed aspect ratios
- a HUD occupies a defined region
- the board may need to scale rather than reflow
- the player may need to pan or zoom
- orientation may fundamentally change the available playing area

This is why game code legitimately uses more JavaScript measurement than ordinary Saito applications.

---

## 19. Game Root and Scaling

Game pages use a distinct root:

    html.game

The game layout establishes a 12px root font size and adjusts the Saito spacing and typography variables accordingly.

This is necessary because much game UI was authored around a different rem scale.

The game root should therefore not be treated as an accidental duplicate of ordinary Saito page CSS.

It is a separate visual environment.

Games also have their own header dimensions and game-specific responsive CSS.

---

## 20. Game HUD Responsiveness

The game HUD layout is selected by `this.hud.mode` and CSS classes:

    hud-long
    hud-square

Games set a mode in the constructor (or leave the default long HUD). Optional mode cycling switches between those two layouts. Vertical HUD mode has been removed.

Do not treat the HUD as a pattern for classifying desktop / mobile portrait / mobile landscape in JavaScript. Prefer media queries for ordinary page layout.

---

## 21. Game Board Scaling

Game boards sometimes need actual geometric scaling.

For example, the game card system calculates a board ratio from:

    getBoundingClientRect()

and uses that ratio when positioning pieces.

The mobile game hammer similarly measures the viewport and applies scaling and panning to the game board.

This is not ordinary responsive page layout.

It is part of the game's coordinate system.

Game developers should therefore distinguish:

    responsive layout

from:

    game-world scaling

The first normally belongs to CSS.

The second may legitimately belong to JavaScript.

---

## 22. Game Orientation

Games make much greater use of orientation than ordinary applications.

Game CSS contains rules for combinations such as:

    max-width: 600px
    max-height: 600px
    orientation: portrait
    orientation: landscape

The reason is that the playable area can change substantially between portrait and landscape.

Ordinary applications should not automatically adopt orientation-specific layouts simply because games do.

Use orientation queries when orientation actually changes the application's information architecture or available working area.

---

## 23. Mobile Game Themes

Some games use `isMobileBrowser()` to choose between different visual implementations.

For example, Poker and Blackjack can select a flatter mobile theme instead of the desktop three-dimensional table.

This is a legitimate device-specific decision.

It is not a general responsive-layout pattern.

A desktop browser resized to a narrow window can remain on the desktop theme because the code is answering a different question:

> Is this running on a mobile browser?

rather than:

> Is the viewport narrow?

These concepts should remain separate.

---

## 24. Responsive Overlays in Games

Games have additional overlay rules beyond ordinary Saito overlays.

Game overlay CSS contains rules around:

- 800px
- 600px
- portrait/landscape
- available width
- available height

Some game overlays change their preferred dimension depending on orientation.

This is appropriate when the content itself is game-specific.

Do not assume that every game overlay should be replaced with the ordinary application overlay layout.

---

## 25. Store as Another Ordinary Application Pattern

Store provides a useful contrast to RedSquare.

Store generally does not replace its desktop interface with a separate mobile application state.

Instead it:

- tightens page padding
- changes spacing
- adapts overlays
- applies safe-area padding
- allows its content container to scroll

For example, Store changes its user rhythm at approximately 900px and changes overlay behavior around 600px.

This demonstrates that there is no requirement for every application to adopt RedSquare's mobile view-switching model.

The application's information architecture determines the appropriate implementation.

---

## 26. Responsive CSS Should Be Scoped

Prefer selectors that make ownership obvious.

For example:

    .redsquare .menu {
        ...
    }

or:

    .tweet {
        ...
    }

with responsive rules close to the component's normal declarations.

Avoid creating broad selectors that unintentionally affect unrelated modules.

This is particularly important in Saito because many applications can exist within the same runtime and can use shared Saito UI.

A module's responsive behavior should not accidentally alter another module's interface.

The module base stylesheet is the appropriate place for application-level integration and overrides.

Component styles should remain close to the components they own.

---

## 27. Saito CSS Variables and Responsive Themes

Saito applications should generally use existing Saito CSS variables where they represent meaningful design concepts.

For example:

    var(--saito-space-lg)
    var(--saito-space-xxl)

and other Saito variables can automatically participate in Saito themes.

This matters because Saito UI can be themed, including through application/NFT-based themes.

A module using Saito variables directly can therefore adapt naturally when the underlying Saito theme changes.

Do not create aliases merely to rename Saito variables:

    --my-module-large-space: var(--saito-space-lg);

unless the module concept genuinely differs from the Saito concept.

Responsive CSS should likewise avoid unnecessary abstraction layers.

---

## 28. Custom Properties for Responsive State

CSS custom properties are useful when JavaScript has measured something that CSS needs to consume.

Good examples include:

    --saito-overlay-viewport-height
    --redsquare-page-viewport-height
    --chat-viewport-height

These variables represent actual concepts.

They are not merely renamed versions of existing properties.

This is an important distinction.

Do not create a custom property such as:

    --my-module-mobile-width: 600px;

simply to avoid writing `600px`.

A custom property is useful when it represents meaningful configuration, theme state, component state, or a value supplied dynamically by JavaScript.

---

## 29. Responsive Typography

Saito's shared CSS changes the root font size at approximately 768px.

This affects ordinary rem-based sizing.

There are also more specialized compensations in components such as the header.

Games use a separate 12px root and adjust their token values accordingly.

Developers should therefore inspect the actual Saito CSS before introducing new typography breakpoints.

Do not assume that a framework-style scale such as:

    1200
    992
    768
    576

exists throughout Saito.

It does not.

Individual components may contain values that resemble conventional frontend breakpoints, but those values often belong only to that component.

---

## 30. Avoid Creating a Generic Responsive Abstraction

A common AI mistake would be to see several modules using:

    600px

and respond by creating:

    ResponsiveManager
    BreakpointService
    MobileLayoutManager
    ResponsiveController

or a centralized breakpoint registry.

That would add architecture without solving a demonstrated problem.

Saito's existing model is simpler:

- shared components own shared responsive behavior
- applications own application layout
- components own component layout
- games own game scaling

If several components eventually require a genuinely shared behavior, that behavior can be promoted into Saito's shared UI.

Do not create a framework merely because several CSS files contain similar media queries.

---

## 31. Avoid Using JavaScript for CSS Problems

Do not write:

    if (window.innerWidth < 600) {
        element.style.width = ...
        element.style.display = ...
        element.style.margin = ...
    }

when a media query can express the same behavior.

This creates several problems:

- layout logic becomes difficult to discover
- resize handling becomes necessary
- CSS and JavaScript can disagree
- component ownership becomes less clear
- other developers cannot understand the responsive behavior by reading the stylesheet

Prefer:

    @media (max-width: 600px) {
        ...
    }

when the behavior is purely presentational.

Use JavaScript only when the responsive state actually affects application behavior or when the browser exposes information that CSS cannot conveniently provide.

---

## 32. Avoid Using CSS for Application State

The opposite mistake is also possible.

If the application genuinely has different screens or rendering hosts, do not attempt to represent the entire application state using increasingly complicated selectors.

RedSquare's feed/chat/settings distinction is a good example.

The application knows which view the user is in.

JavaScript should manage that state.

CSS should determine how the selected view is presented.

---

## 33. Avoid Treating Every Existing Pattern as Canonical

The repository contains legacy CSS and transitional implementations.

Some examples include:

- older `100vh` rules
- unusual component-specific breakpoint sets
- duplicated 600px logic
- old pixel-based game layout rules
- JavaScript listeners whose effects have since become less important
- components with their own typography systems

Existing code is evidence of what Saito has needed to support, but not every existing implementation is a model for new code.

When modifying an existing component:

1. preserve behavior that is intentional
2. identify which rules are actually required
3. remove unnecessary duplication when safe
4. avoid expanding legacy patterns into new parts of the application

---

## 34. The 600px / 620px / 768px Distinction

One particularly important rule for AI agents is:

> Do not collapse Saito's recurring breakpoint values into a single generic "mobile breakpoint."

The three most important values have different responsibilities.

600px is commonly the narrow application layout boundary.

620px is primarily shared header and floating-control chrome.

768px is used for shared typography and full-screen overlay behavior.

Changing one does not imply that the others should change.

If a new requirement says "make this mobile," inspect the component and determine which existing behavior it belongs to.

---

## 35. When to Add a New Breakpoint

Before adding a breakpoint, ask:

1. What visual or interaction problem does the breakpoint solve?
2. Which component owns that problem?
3. Can CSS flexbox or grid solve it without another breakpoint?
4. Is the behavior already handled by shared Saito CSS?
5. Does the component actually need a different layout at that width?
6. Would an existing Saito breakpoint provide the required behavior?
7. Is the new value genuinely specific to the component?

Do not add a breakpoint merely because another framework commonly uses that width.

Saito has accumulated several component-specific breakpoints over time. New code should avoid increasing that fragmentation unnecessarily.

---

## 36. Responsive Development Should Follow Component Ownership

A practical development pattern is:

1. Establish the page's normal desktop structure.
2. Identify the major responsive transformation.
3. Put the page-level transformation in the application's base CSS.
4. Let each component handle its own internal transformation.
5. Use existing Saito shared UI behavior rather than duplicating it.
6. Add JavaScript only where responsive behavior changes application state or requires measurement.
7. Test the resulting interaction on narrow viewports and mobile devices.
8. Preserve the component boundaries while adapting the layout.

This is not a mandatory framework sequence.

It is a useful way to reason about where responsive behavior belongs.

---

## 37. AI Development Rules

When modifying or creating responsive Saito UI:

- Assume responsive behavior is primarily CSS unless there is a concrete reason otherwise.
- Inspect the component's existing CSS before adding responsive rules.
- Use the Saito shared UI's responsive behavior when using shared components.
- Treat the application base CSS as the owner of page-level layout.
- Treat component CSS as the owner of component-level layout.
- Keep selectors scoped to the component or application that owns them.
- Use existing Saito CSS variables when they represent the desired concept.
- Do not create CSS variable aliases merely to rename existing Saito variables.
- Do not create a generic responsive manager or breakpoint service.
- Do not use `isMobileBrowser()` as a substitute for a viewport breakpoint.
- Do not use JavaScript to reproduce a CSS media query.
- Use JavaScript when responsive behavior changes application state.
- Use `visualViewport` when the actual visible viewport matters.
- Use safe-area insets when controls touch device edges.
- Preserve Saito's container-based scrolling model.
- Treat games as a specialized responsive environment.
- Do not copy game board scaling techniques into ordinary applications.
- Do not assume that every recurring breakpoint is a global Saito breakpoint.
- Do not assume that existing legacy CSS is canonical.
- Inspect the actual Saito CSS before changing typography or spacing behavior.
- Preserve deliberate application-specific behavior.

---

## 38. Practical Decision Guide

When the requirement is:

**"The columns should collapse on a narrow screen."**

Use CSS in the application's base stylesheet.

**"The card should stack its internal elements on mobile."**

Use the card's own CSS.

**"The Saito overlay should become full-screen."**

Use `SaitoOverlay`; its shared CSS already handles this.

**"The user should switch from the feed to the chat screen."**

Use application state and JavaScript.

**"The keyboard is covering the bottom of the interface."**

Consider `visualViewport` and a CSS custom property.

**"The bottom navigation needs to avoid the iPhone safe area."**

Use the appropriate `env(safe-area-inset-bottom)` value.

**"The game board needs to shrink while preserving its coordinate system."**

Use game-specific measurement and scaling.

**"The UI should look different because the device is a phone."**

Determine whether this is actually a device-capability question. If so, `isMobileBrowser()` may be appropriate.

**"The UI should become one column below 600px."**

Use a media query unless the application needs JavaScript state associated with that transition.

**"Several modules use 600px, so let's create a global BreakpointManager."**

Do not do this without a demonstrated architectural need.

---

## 39. Reference Implementations

The following files are particularly useful when implementing responsive behavior.

### Shared Saito CSS

`node/web/saito/css-imports/saito-base.css`

Useful for:

- root typography
- page viewport
- body behavior
- global responsive foundations

`node/web/saito/css-imports/saito-page-layout.css`

Useful for:

- standard page layout
- understanding why page-level responsive collapse remains application-owned

`node/web/saito/css-imports/ui/saito-header.css`

Useful for:

- header responsiveness
- hamburger behavior
- mobile header sizing

`node/web/saito/css-imports/ui/saito-overlay.css`

Useful for:

- full-screen mobile overlays
- safe-area handling
- dynamic viewport behavior

`node/web/saito/css-imports/ui/saito-input.css`

Useful for:

- shared input behavior

`node/web/saito/css-imports/saito-buttons.css`

Useful for:

- shared mobile button sizing and wrapping

`node/web/saito/css-imports/saito-chat.css`

Useful for:

- full-screen mobile chat
- mobile viewport behavior

### RedSquare

`node/mods/redsquare/web/css/redsquare-base.css`

Useful for:

- application-level responsive layout
- page grid changes
- mobile safe-area handling
- visual viewport integration

`node/mods/redsquare/web/css/redsquare-menu.css`

Useful for:

- component-owned mobile navigation
- desktop sidebar to mobile bottom-bar transformation

`node/mods/redsquare/web/css/redsquare-tweet.css`

Useful for:

- component-local responsive behavior

`node/mods/redsquare/lib/main.js`

Useful for:

- mobile view state
- visual viewport handling
- component host changes

### Store

`node/mods/store/web/css/store-base.css`

Useful for:

- application-level responsive integration
- safe-area handling
- overlay customization
- an alternative to RedSquare's mobile view-switching model

### Games

`node/web/saito/css-imports/game-layout.css`

Useful for:

- game-specific root sizing
- game layout
- orientation-specific behavior

`node/lib/saito/ui/game-hud/game-hud.js`

Useful for:

- game viewport classification
- portrait/landscape HUD behavior

`node/lib/saito/ui/game-hammer-mobile/game-hammer-mobile.js`

Useful for:

- board panning and scaling

`node/lib/templates/gametemplate-src/gametemplate-cards.js`

Useful for:

- board-relative scaling and coordinate calculations

`node/lib/saito/browser.ts`

Useful for understanding:

- `isMobileBrowser()`
- the distinction between device detection and viewport detection

---

## 40. Final Principle

Saito responsive design is not a separate framework layered on top of the application architecture.

It is an extension of the existing ownership model.

Shared Saito components handle their own shared responsive behavior.

Applications handle their own page structure.

Components handle their own internal layout.

Games handle their own spatial scaling and specialized interaction.

CSS should do as much of the work as possible.

JavaScript should be introduced when the application needs actual state, measurement, or interaction information that CSS cannot provide.

The goal is not to make every Saito application respond identically to a phone.

The goal is to let each application remain structurally coherent while adapting its own interface to the available space and interaction environment.

For AI-generated code, the most important rule is therefore:

> Do not invent a generic responsive architecture for Saito. Find the owner of the responsive behavior, use CSS where CSS is sufficient, use Saito's existing shared behavior where it applies, and introduce JavaScript only when the application genuinely needs state or measurement that CSS cannot provide.
