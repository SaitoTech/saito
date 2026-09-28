# Saito UI CSS Practices

This document describes how CSS should be written in Saito applications and shared Saito UI components.

Saito already has a design system. Applications should generally consume that design system rather than recreating it. At the same time, Saito is a permissionless application platform: modules are free to define their own visual identity and behavior when the application requires it.

The goal of these practices is therefore not to restrict what an application can look like.

The goal is to make applications that:

- work naturally with Saito's existing UI,
- remain compatible with other modules running in the same browser,
- can participate in Saito-wide themes,
- keep CSS localized and understandable,
- avoid unnecessary duplication,
- make component ownership obvious,
- remain easy for humans and AI to modify,
- and do not accumulate CSS abstractions merely because an AI believes every application needs its own design system.


## 1. Saito Already Has a Design System

Saito provides a shared visual language through its core CSS.

The design system includes things such as:

- typography
- colours
- spacing values
- buttons
- form controls
- borders
- radii
- cards
- overlays
- shell elements
- shared UI components
- global CSS variables

The core CSS is primarily found under:

    node/web/saito/css-imports/

and is compiled into:

    node/web/saito/saito.css

The source files are the files developers should modify.

The generated `saito.css` file should not be edited manually.


## 2. Applications Should Consume Saito Rather Than Recreate It

If Saito already provides a suitable variable, class, control, or visual behavior, use it.

For example:

    color: var(--saito-foreground);
    border-color: var(--saito-border);
    background: var(--saito-card);
    gap: var(--saito-space-md);

rather than creating:

    --my-foreground: var(--saito-foreground);
    --my-border: var(--saito-border);
    --my-card: var(--saito-card);
    --my-gap: var(--saito-space-md);

The second form adds an unnecessary abstraction layer.

It also makes the application less responsive to changes in the Saito design system.

The preferred relationship is:

    Saito design system
        ↓
    application consumes Saito

not:

    Saito design system
        ↓
    application copies Saito into its own design system
        ↓
    components consume the copy


## 3. Saito CSS Is Also a Theme Interface

Saito's CSS variables are deliberately designed so that applications can share the same visual language.

This has an important consequence.

A module that consumes:

    --saito-foreground
    --saito-background
    --saito-card
    --saito-primary
    --saito-border
    --saito-space-md
    --saito-radius

can potentially respond naturally when the Saito theme changes.

This is one reason not to replace Saito variables with module-specific aliases.

For example:

    color: var(--saito-foreground);

allows the application to participate in future Saito themes.

Whereas:

    --my-text: var(--saito-foreground);

adds another layer without providing additional meaning.

The objective is for applications that adopt Saito's visual language to remain visually coherent when the underlying Saito theme changes.


## 4. Applications Do Not Have to Include `saito.css`

Including Saito CSS is recommended, but it is not a universal requirement.

An application may have its own complete visual language.

However, applications commonly use Saito UI infrastructure such as:

- Saito Header
- Saito Sidebar
- slide-in menu
- wallet UI
- overlays
- shared Saito components
- shared game UI

When those components are used, including:

    /saito/saito.css

allows the shared components to receive their intended styling.

This is particularly important because Saito UI can appear as a result of user interaction even when it was not part of the application's initial screen.

For example, an application may use the Saito Header. A user may then open the wallet or slide-in menu. Those interfaces depend on Saito CSS.

Therefore, an ordinary application will generally want to include Saito CSS when it uses Saito UI.


## 5. Module CSS Can Override Saito CSS

Module CSS is allowed to override Saito CSS.

This is important.

The rule is not:

> Module CSS may never change typography, colours, borders, or other presentation.

The rule is:

> Saito provides the default visual language. A module may deliberately override it when the application's own interface requires something different.

For example, an application may deliberately have:

- a different title size,
- a different card treatment,
- a distinctive colour,
- a specialized border,
- a game-specific visual style,
- an application-specific control treatment.

That is legitimate.

The important question is whether the declaration represents a deliberate application requirement or merely recreates something Saito already provides.

If an application overrides a Saito base rule, put that override in the module's base CSS file.


## 6. Base CSS Is the Module's Integration Boundary

A module should normally have a base stylesheet such as:

    redsquare-base.css
    store-base.css
    poker-base.css

The base stylesheet is the appropriate place for rules that integrate the application with Saito's global page and UI environment.

Examples include:

- `#saito-container`
- page-level layout
- body/module classes
- header integration
- Saito shell positioning
- application-wide typography adjustments
- deliberate overrides of Saito CSS
- application-wide responsive behavior
- page-level layout changes

This provides a very useful boundary.

If a module needs to change a Saito-wide rule, the change should be visible in one predictable place.

For example:

    Saito CSS
        ↓
    module base CSS
        ↓
    module components

This makes changes to foundational styling conspicuous.

It also makes it easier to review an application for changes that might affect its interaction with Saito's shared UI.


## 7. Why Base CSS Matters

A rule such as:

    body.redsquare-body p {
        font-size: inherit;
    }

is fundamentally different from:

    .tweet .body {
        display: grid;
    }

The first changes how the application integrates with Saito's global typography.

The second describes the internal structure of a Tweet.

The first belongs in the base stylesheet.

The second belongs in the Tweet stylesheet.

This distinction makes the architecture visible.

If an AI needs to override a Saito-wide rule, it should have a predictable place to look and a predictable place to put the change.


## 8. Component CSS Should Be Organized Around UI Components

The preferred organization is:

    one component
        ↓
    one root namespace
        ↓
    one component CSS file

For example:

    redsquare-tweet.css
        .tweet

    redsquare-manager.css
        .manager

    redsquare-profile.css
        .profile

The exact filename depends on the module.

The important principle is semantic ownership.

If a developer wants to understand Tweet styling, the Tweet CSS should be the obvious place to look.

If there is a Tweet JavaScript object, the relationship should be easy to discover:

    tweet.js
    tweet.template.js
    redsquare-tweet.css

or, where the component is part of a larger manager:

    redsquare-manager.js
    redsquare-manager.template.js
    redsquare-manager.css


## 9. Give Components a Distinctive Root

A component should normally have a distinctive root class.

For example:

    .tweet
    .manager
    .profile
    .listing-detail
    .purchase
    .store

The root identifies the component.

Its descendants can then use short semantic names:

    .tweet .header
    .tweet .body
    .tweet .footer
    .tweet .controls

rather than:

    .tweet .tweet-header
    .tweet .tweet-body
    .tweet .tweet-footer
    .tweet .tweet-controls

The root already establishes the namespace.

Repeating the component name in every descendant is unnecessary.


## 10. Short Descendant Names Reinforce UI Hierarchy

Short descendant names are not merely a CSS convenience.

They make the visual and semantic hierarchy of the UI visible in the code.

For example:

    .tweet
        .header
        .body
        .footer

tells a developer that Header, Body, and Footer are parts of Tweet.

Similarly:

    .manager
        .header
        .content
        .status

tells a developer that those elements belong to Manager.

The component root is therefore doing architectural work.

It tells the developer:

> These elements belong to this component.

This is especially useful for AI because the semantic ownership boundary is encoded directly in the DOM and CSS.


## 11. The Component Root Should Be the Closest Semantic Owner

If CSS concerns Tweet, look first in Tweet's CSS.

If there is no Tweet CSS because Tweet is rendered as part of another component, look in the CSS associated with the component that actually owns that UI.

The important rule is:

> Put a declaration in the CSS file whose component most closely corresponds to what the declaration describes.

Do not put Tweet internals into Manager CSS merely because Manager happens to render Tweets.

Do not put Profile internals into Sidebar CSS merely because Sidebar contains Profile.


## 12. Parents Arrange Children; Children Style Themselves

A parent component normally controls where its children appear.

For example:

    Manager
        decides where Tweets are placed

while:

    Tweet
        decides how a Tweet is internally arranged

Similarly:

    Sidebar
        decides where Profile appears

while:

    Profile
        decides how Profile is rendered

This means Manager CSS can contain:

    .manager {
        display: flex;
        flex-direction: column;
        gap: var(--saito-space-md);
    }

But Manager CSS should not normally contain:

    .manager .tweet .header {
        ...
    }

because that makes Manager responsible for the internals of Tweet.


## 13. Do Not Cross Component Ownership Boundaries

Avoid selectors such as:

    .manager .tweet .header
    .manager .tweet .body
    .sidebar .profile .body .text

These selectors make one component responsible for another component's internals.

This creates fragile coupling.

If Tweet changes its internal structure, Manager CSS must change.

Instead, the parent can communicate context through a state or presentation class on the child's root.

For example:

    .tweet.focused
    .tweet.embedded
    .tweet.chain-next
    .tweet.chain-prev

The Tweet component then interprets those states in its own CSS.

This keeps the knowledge of Tweet's internal structure inside Tweet.


## 14. Parent Context Should Be Expressed on the Child Root

Suppose a Tweet needs a different layout when embedded.

Prefer:

    <article class="tweet embedded">

with:

    .tweet.embedded {
        ...
    }

rather than:

    .profile .manager .tweet .body {
        ...
    }

The parent can establish the context.

The child owns the interpretation.

This produces a clean relationship:

    parent
        says what context the child is in

    child
        decides what that context means internally


## 15. Components Should Remain Independently Renderable

A useful consequence of this architecture is that a component should be able to render independently.

Tweet should not need to know whether it is inside:

    RedSquare
    Notifications
    Profile
    Search
    another application

in order to understand its own internal layout.

Likewise, Profile should not need to know which Sidebar contains it.

This reduces coupling and makes components reusable in different application contexts.


## 16. Selector Specificity Should Be Minimal

Prefer the shortest selector that correctly expresses ownership.

For example:

    .tweet

is preferable to:

    body.redsquare-body .manager .tweet

when `.tweet` is sufficient.

A longer selector is justified when it solves a real problem, such as overriding a Saito rule.

It should not be added merely to be safe.

Every additional level of specificity creates another dependency that future CSS must understand.


## 17. Specificity Is Sometimes Necessary

Saito applications exist inside a shared browser environment.

Sometimes an application genuinely needs to override Saito CSS.

In that situation, additional specificity may be appropriate.

For example:

    body.redsquare-body #saito-header {
        ...
    }

may be necessary because the module is deliberately changing the Saito header in the RedSquare context.

This is different from writing:

    body.redsquare-body .manager .tweet .header {
        ...
    }

when `.tweet .header` would already be sufficient.

The rule is:

> Use additional specificity to solve an actual cascade problem, not as defensive programming.


## 18. Do Not Increase Specificity "Just in Case"

Avoid:

    body.redsquare-body .manager .tweet .header .title

when:

    .tweet .title

or:

    .tweet .header

would work.

Avoid adding:

    html
    body
    module-root
    parent
    component
    descendant

to every selector.

Deep selectors make CSS harder to override and harder for AI to reason about.


## 19. Trust the Cascade and Inheritance

Saito already provides a base CSS environment.

For example, Saito's base CSS establishes:

- box sizing
- default margins and padding
- body typography
- heading typography
- base colours
- shared variables

Do not repeat these declarations automatically.

If Saito already establishes:

    box-sizing: border-box;

there is normally no reason for every component to repeat:

    box-sizing: border-box;

Likewise, do not add:

    margin: 0;
    padding: 0;
    width: 100%;

to every component simply because those declarations are familiar defensive CSS.


## 20. Add Declarations Because They Do Something

A component may legitimately need:

    width: 100%;

or:

    min-width: 0;

or:

    box-sizing: border-box;

if removing the declaration demonstrably changes its behavior.

For example, `min-width: 0` can be necessary for a flex child that otherwise refuses to shrink.

That is a real layout requirement.

The problem is not the declaration itself.

The problem is adding it without understanding why it is necessary.


## 21. Minimal CSS Means Fewer Unnecessary Rules

The objective of CSS simplification is not merely to reorganize existing declarations into prettier files.

The objective is to remove unnecessary CSS.

Prefer:

    fewer selectors
    fewer declarations
    fewer overrides
    fewer variables
    fewer aliases
    fewer resets
    fewer special cases

Do not preserve a declaration merely because it has always existed.

At the same time, do not delete a declaration merely because it looks redundant.

First determine what behavior it provides.


## 22. Delete, Then Add Back What Is Actually Necessary

When cleaning a large stylesheet, a useful approach is:

    identify the component
        ↓
    remove unnecessary CSS
        ↓
    inspect the result
        ↓
    restore only what is actually required

This is often more effective than trying to reason about every historical declaration individually.

The important constraint is to preserve the intended visual result unless the task explicitly asks for a design change.


## 23. Do Not "Modernize" During CSS Cleanup

CSS cleanup is not an excuse to redesign the application.

Do not change:

    font sizes
    colours
    spacing
    visual hierarchy
    component appearance

merely because another design would look more modern.

If the task is simplification, simplify.

If the task is redesign, redesign.

Keep those objectives separate.


## 24. Custom Properties Should Represent Real Concepts

Saito provides the application's primary CSS variable system.

Modules may also define custom properties when the variable represents a real application concept.

Legitimate examples include:

    --store-user-rhythm

when a layout value is deliberately shared and changed at a breakpoint.

Games may have variables such as:

    --conquest-continent-...

when they represent genuine game-specific theme configuration.

A component may also use a custom property for runtime state when JavaScript needs to communicate a value to CSS.

For example, an overlay can expose viewport measurements through CSS variables.


## 25. Do Not Create Variables Merely to Avoid Repeating a Literal

Avoid:

    .tweet {
        --tweet-padding: 1.6rem;
        padding: var(--tweet-padding);
    }

if nothing else needs to override or consume `--tweet-padding`.

Use:

    .tweet {
        padding: 1.6rem;
    }

The variable has added no semantic value.

Likewise, do not create:

    --tweet-current-pad-x
    --tweet-current-pad-y
    --tweet-border-size

merely because the values occur in one component.


## 26. Do Not Create Module Copies of Saito Variables

Avoid:

    --rs-text: var(--saito-foreground);
    --rs-border: var(--saito-border);
    --rs-space-sm: var(--saito-space-sm);

These are aliases, not meaningful application concepts.

Use the Saito variable directly.

This also ensures that applications naturally participate in Saito themes.


## 27. Module Variables Can Be Legitimate

The prohibition is not against all module variables.

A module variable is appropriate when it represents a real concept.

For example:

    --store-user-rhythm

is meaningful if several Store layouts depend on that rhythm and the value intentionally changes at a breakpoint.

Likewise, a game may define:

    --conquest-continent-primary

if it is part of the game's actual theming system.

The test is:

> Does this variable represent a meaningful application concept, configuration point, theme value, or runtime value?

If not, use an ordinary CSS declaration.


## 28. Use the Actual Saito CSS as the Source of Truth

Do not assume that Saito variables follow a perfectly uniform naming scheme.

For example, Saito currently has variables such as:

    --saito-space-xs
    --saito-space-sm
    --saito-space-md
    --saito-space-lg
    --saito-space-xl
    --saito-space-xxl

and typography variables such as:

    --font-size-large
    --font-size-medium
    --font-size-tiny

The typography variables do not all use the `--saito-` prefix.

An AI should inspect the actual current Saito CSS before introducing or assuming a variable.

Do not invent:

    --font-size-small

merely because a conventional design system would normally have one.

Likewise, do not assume that every variable mentioned in an old application still exists.

The live Saito CSS is the authority.


## 29. Typography Defaults Should Usually Be Inherited

Saito establishes default typography.

Applications should generally allow those defaults to flow into their components.

Do not define:

    font-family

on every component.

Do not assign a new font size to every element.

Do not create a module-wide typography system simply because the application contains text.

Instead, ask:

> Is this element supposed to use the Saito default?

If yes, do nothing.

A component may define its own typography when the typography is intrinsic to the component.

For example:

    title
    price
    metadata
    game score
    specialized label

may reasonably have deliberate sizes.

The principle is not "never set font-size."

The principle is:

> Do not redefine typography unnecessarily.


## 30. Application-Wide Typography Overrides Belong in Base CSS

If an application deliberately establishes a different typography scale, that belongs in the module's base CSS.

For example, RedSquare's base CSS adjusts the page's typography because its feed and Saito shell require a particular relationship between the root font size and application content.

That is an application-wide integration decision.

It does not belong scattered across:

    tweet.css
    manager.css
    profile.css
    menu.css

The base stylesheet provides a visible place to understand that the application has deliberately changed the global typography environment.


## 31. Component-Specific Typography Belongs to the Component

If a Tweet's metadata needs a particular size, that can belong in Tweet CSS.

If a Store listing's price needs a particular size, that can belong in Listing CSS.

If a game score needs a particular size, that can belong in the game component.

The important distinction is:

    application-wide typography
        → base CSS

    component-specific typography
        → component CSS

    generic Saito typography
        → Saito CSS


## 32. Do Not Over-Define Spacing

Saito provides a spacing scale.

Use it where it represents the application's shared rhythm:

    gap: var(--saito-space-md);

But component-specific spacing can be an ordinary CSS value.

For example:

    padding: 1.2rem 1.6rem;

may be perfectly appropriate if it is intrinsic to that component.

Do not create:

    --tweet-padding-small
    --tweet-padding-medium
    --tweet-padding-large

unless those values represent a real reusable concept in the application.


## 33. Colours Should Normally Use Saito Variables

When an application wants the standard Saito visual language, use:

    var(--saito-background)
    var(--saito-foreground)
    var(--saito-card)
    var(--saito-primary)
    var(--saito-secondary)
    var(--saito-muted)
    var(--saito-muted-foreground)
    var(--saito-accent)
    var(--saito-destructive)
    var(--saito-border)
    var(--saito-ring)

This allows the application to participate in Saito themes.

Do not create a private colour palette merely by renaming these variables.


## 34. Deliberate Application Identity Is Allowed

An application may deliberately depart from the Saito visual language.

For example:

    poker felt
    game board colours
    faction colours
    parchment panels
    specialized map themes
    application-specific branding

These are legitimate because they communicate something intrinsic to the application.

A game in particular may require a substantially different visual language from a social application.

The goal is not to make every Saito application look identical.


## 35. Games Are a Specialized CSS Environment

Game applications are still Saito modules, but their visual requirements are different.

Games may legitimately define:

    board colours
    felt
    parchment
    faction colours
    map themes
    specialized cards
    player areas
    game-specific controls

Game CSS is commonly scoped under a game root such as:

    .game.poker

Shared game infrastructure can provide common structures such as:

    GameHud
    player boxes
    card fans
    overlays
    game layout

The individual game then owns its board and game-specific visual identity.


## 36. Do Not Force Game Visuals Into the Saito Design System

A poker table should not be redesigned as a generic Saito card simply because Saito provides cards.

A strategy game's board should not be forced into the same visual language as a social feed.

Use Saito styling for genuinely shared UI.

Use game CSS for game identity.

This distinction is important because games often have stronger visual requirements than ordinary application modules.


## 37. Shared Saito UI Is Different From Module CSS

Shared UI under:

    node/web/saito/css-imports/ui/

sits between the Saito design system and application modules.

Examples include:

    SaitoOverlay
    SaitoHeader
    SaitoSidebar
    SaitoProfile
    SaitoNFT
    shared game UI

Shared components should provide reusable structure and behavior without becoming miniature design systems.

A shared component may define:

    layout
    positioning
    component-specific interaction
    lifecycle
    intrinsic visual structure

But it should generally consume the Saito design system for generic:

    typography
    buttons
    inputs
    form controls
    common colours
    spacing conventions


## 38. Shared Components May Have Intrinsic Presentation

The distinction is between generic and intrinsic presentation.

Intrinsic presentation is presentation that exists because of what the component actually is.

Examples:

    overlay backdrop
    overlay panel positioning
    calendar grid
    cropper handles
    media tile arrangement
    transaction-monitor status stack
    game HUD layout

Generic presentation is presentation that could apply to many unrelated components.

Examples:

    standard button padding
    standard input border
    generic body typography
    generic Saito colour
    generic form spacing

Intrinsic presentation belongs to the component.

Generic presentation belongs to the Saito design system.


## 39. Do Not Turn Shared Components Into Miniature Design Systems

Avoid a shared component defining:

    its own font system
    its own button system
    its own input system
    its own colour palette
    its own spacing scale
    its own border system

unless that visual system is genuinely intrinsic to the component.

For example, a shared overlay should normally provide:

    backdrop
    panel
    position
    size
    close behavior

while its contents use Saito controls.


## 40. Application CSS May Style Saito Components in Context

A module can legitimately adjust how a shared Saito component integrates into its page.

For example:

    .saito-overlay:has(> .listing-detail) {
        ...
    }

can be appropriate when Store needs its overlay to accommodate a particular Store panel.

Likewise, a module may adjust the placement of the Saito Header in its page.

The important distinction is between:

    contextual integration

and:

    rewriting the shared component itself.

If the module is simply positioning the shared component in its own application, that belongs in module base/integration CSS.


## 41. CSS Files Should Be Isolated by Component

The repository organizes CSS into files partly because those boundaries may become useful architectural boundaries in the future.

A component may eventually be promoted from:

    module-specific UI

to:

    shared Saito UI

If its CSS is already isolated, this migration is much easier.

For example:

    redsquare-tweet.css

can potentially evolve independently from:

    redsquare-manager.css

because Tweet's styling is already localized.

This is another reason to avoid putting all application CSS into one enormous file.


## 42. Do Not Edit Generated CSS

Module source CSS normally lives under:

    mods/<module>/web/css/

and is compiled into:

    mods/<module>/web/style.css

Saito source CSS lives under:

    node/web/saito/css-imports/

and is compiled into:

    node/web/saito/saito.css

The generated files are regenerated automatically when the software is compiled.

Therefore:

> Edit the source CSS, not the generated CSS.

Do not manually edit:

    web/style.css

or:

    saito.css

Those files are outputs.

A manual change will be lost when the software is compiled again.


## 43. CSS Source Files Should Be Discoverable

The source file organization should make it easy to find CSS by semantic responsibility.

For example:

    redsquare-base.css
    redsquare-manager.css
    redsquare-tweet.css
    redsquare-profile.css

allows a developer to predict where a change belongs.

Likewise:

    store-base.css
    store-main.css
    store-teaser.css
    store-listing-detail.css

communicates the application's UI structure.

The exact naming convention may differ between modules, especially older modules and games.

The important principle is semantic discoverability.


## 44. CSS and JavaScript Are Coupled Through the DOM

CSS class names are not necessarily cosmetic.

JavaScript may use:

    querySelector()
    closest()
    classList
    event delegation
    data attributes

to interact with the same DOM.

For example:

    .tweet
    .tool.like
    .back
    .feed-status

may be used by JavaScript.

Similarly:

    data-id

may contain a transaction signature used to recover the underlying application object.

Therefore, an AI should not rename CSS classes casually.


## 45. Before Renaming a Class, Search the JavaScript

Before changing:

    .tweet

to:

    .post

search for:

    querySelector('.tweet')
    closest('.tweet')
    classList.contains('tweet')
    event delegation
    template output
    CSS selectors passed to browser helpers

Do the same for IDs and data attributes.

If a class is used by JavaScript, update the JavaScript together with the CSS and HTML.

A visual refactor that silently breaks event handling is not a successful CSS refactor.


## 46. Data Attributes Are Often Behavioral Identifiers

Classes can identify both:

    presentation

and:

    behavior

while data attributes often identify the underlying object.

For example:

    data-id="transaction-signature"

may identify the Saito transaction associated with a rendered object.

Do not replace such identifiers merely because they do not appear to have styling significance.

They may be part of the application's event architecture.


## 47. Responsive Behavior Should Normally Be CSS

For ordinary applications, responsive layout should generally be handled through CSS.

Use:

    @media

for:

    columns
    stacking
    visibility
    spacing
    widths
    typography
    layout
    navigation changes

Do not write JavaScript merely to reproduce a media query.


## 48. JavaScript Is Appropriate When Runtime Measurement Is Actually Required

JavaScript may be appropriate when CSS alone cannot express the behavior.

Examples include:

    measuring the available game viewport
    responding to visual viewport changes
    changing a game HUD according to actual dimensions
    synchronizing runtime state with CSS variables

The important distinction is:

    CSS
        layout based on CSS concepts

    JavaScript
        runtime behavior requiring application state or measurement


## 49. Do Not Invent a Global Breakpoint System

Saito applications do not require every module to use the same set of breakpoints.

Existing applications have different needs.

RedSquare, Store, overlays, and games may use different breakpoints because their layouts differ.

An AI should inspect the relevant application CSS before inventing a breakpoint.

Do not introduce a new global breakpoint scale merely because one would look cleaner.


## 50. Use the Component's CSS for Its Responsive Layout

If a Tweet changes layout at a particular width, that belongs in Tweet CSS.

If Store's main layout changes, that belongs in Store main/base CSS.

If the entire application shell changes, that belongs in the module base CSS.

This follows the same ownership rule as ordinary layout:

    application shell
        → base CSS

    component layout
        → component CSS

    shared Saito UI
        → shared Saito CSS


## 51. Avoid Generic Global Selectors

A module should avoid styling generic selectors such as:

    .header
    .body
    .title
    .content

without an appropriate component root or page context.

A rule such as:

    .tweet .header

is understandable because Tweet owns it.

A rule such as:

    .header {
        ...
    }

may unintentionally affect unrelated UI.

Use the component root to establish the CSS namespace.


## 52. A Root Namespace Is Better Than Excessive Prefixing

There are two ways to prevent collisions:

    .tweet-header
    .tweet-body
    .tweet-footer

or:

    .tweet
        .header
        .body
        .footer

Prefer the second pattern for component internals.

The root provides the namespace.

This keeps HTML and CSS readable and makes the component hierarchy obvious.


## 53. Legacy Code Does Not Define the Preferred Pattern

The Saito repository contains multiple generations of CSS.

Some applications:

- predate the current conventions,
- use more heavily prefixed selectors,
- use larger global stylesheets,
- contain duplicated controls,
- use older game-specific naming,
- or contain CSS that is still loaded for compatibility.

An AI should not infer that every existing pattern is recommended simply because it exists.


## 54. RedSquare Is a Useful Reference Implementation

RedSquare's cleaned CSS is particularly useful for understanding the preferred ordinary-application direction.

Important patterns include:

    redsquare-base.css
    redsquare-manager.css
    redsquare-tweet.css
    redsquare-profile.css

with roots such as:

    .manager
    .tweet
    .profile

and descendants such as:

    .header
    .body
    .footer
    .controls

RedSquare also uses Saito variables directly rather than creating a second RedSquare design-token layer.


## 55. Store Demonstrates Legitimate Complexity and Remaining Debt

Store is useful for a different reason.

It demonstrates that real applications may need:

    application-specific typography
    specialized layouts
    responsive values
    contextual control changes

It also contains examples of CSS that could be simplified.

An AI should therefore not copy every Store rule as best practice.

Instead, ask which declarations represent:

    genuine Store requirements

and which represent:

    duplication of Saito styling

This distinction is more important than mechanically copying the repository's existing syntax.


## 56. Games Demonstrate a Different Visual Language

Games are another legitimate exception.

Poker and strategy games may define:

    board appearance
    felt
    faction colours
    parchment
    map themes
    specialized panels
    game-specific typography

That is not necessarily a failure to consume Saito.

The game is an application with a visual identity appropriate to its domain.

Shared Saito/game infrastructure should still be reused where appropriate, particularly for common shell and HUD functionality.


## 57. Do Not Create CSS Abstractions Without a Real Need

Avoid automatically creating:

    design tokens
    utility classes
    CSS mixins
    component factories
    styling services
    theme wrappers
    generated class systems

because an AI believes CSS should be abstracted.

Saito already provides a design system.

Module CSS should remain concrete and understandable.

If two components happen to have:

    padding: 1rem;

that does not automatically justify:

    --shared-component-padding

or:

    .standard-padding

Use abstractions when they represent a real application concept or when the existing Saito architecture already provides the abstraction.


## 58. Prefer Obvious CSS Over Clever CSS

The ideal module stylesheet is not the most sophisticated stylesheet.

It is the stylesheet where a developer can look at a rule and immediately understand:

    what it affects
    why it exists
    which component owns it

For example:

    .tweet {
        display: grid;
        grid-template-columns: 4rem 1fr;
    }

is obvious.

A chain of variables, utility classes, mixins, and nested selectors that eventually produces the same layout is harder to review and harder for AI to modify.


## 59. CSS Should Reflect the UI Hierarchy

The UI architecture and CSS architecture should reinforce one another.

If the UI is:

    Main
        Header
        Sidebar
        TweetManager
            Tweet

then CSS should make those boundaries visible.

For example:

    .manager
        manager layout

    .tweet
        tweet layout

The CSS should not flatten all of those responsibilities into:

    .main .sidebar .manager .tweet .body ...

The visual hierarchy should be reflected in the code hierarchy.


## 60. A Component's CSS Should Not Need to Know Its Parent

A component should generally be able to define its internal structure without knowing whether it is inside:

    Main
    Sidebar
    Profile
    Store
    Search

If a component needs a different presentation in a different context, communicate that context through an explicit state or modifier on its root.

For example:

    .tweet.embedded

rather than:

    .profile .feed .tweet .body


## 61. CSS Cleanup Should Preserve Behavior

When reducing CSS:

- preserve DOM structure unless the task requires changing it,
- preserve JavaScript selectors,
- preserve data attributes,
- preserve event behavior,
- preserve intended visual identity,
- preserve responsive behavior.

CSS cleanup is successful when unnecessary code disappears without unintended behavior changing.


## 62. If a Rule Is Removed, Know What Replaced It

Before deleting a declaration, determine whether the resulting behavior comes from:

    Saito CSS
    browser default
    inheritance
    another component rule
    another module rule

If nothing replaces it and the UI changes, the declaration was not redundant.

This is particularly important when working with Saito because the design system is already providing substantial base styling.


## 63. If Two Rules Render the Same Result, Prefer the Simpler One

Suppose both:

    .tweet {
        box-sizing: border-box;
    }

and:

    /* no declaration */

produce the same result because Saito already sets `box-sizing`.

The second is preferable.

Likewise, if:

    color: var(--saito-foreground);

is inherited correctly, do not repeat it on every descendant.


## 64. Do Not Preserve Historical CSS Merely Because It Exists

A repository may contain:

    old resets
    duplicate variables
    obsolete selectors
    compatibility rules
    old component names
    unused declarations

The existence of a declaration is not evidence that it is necessary.

Investigate before preserving it.

At the same time, historical code may contain subtle compatibility behavior.

Do not remove it blindly.

The right question is:

> What behavior does this rule provide today?


## 65. CSS Review Questions for AI

Before adding CSS, ask:

    Does Saito already provide this?

    Does inheritance already provide this?

    Is this component-specific?

    Is this application-wide?

    Does this belong in base CSS?

    Does this belong in the component CSS?

    Is this a genuine visual identity decision?

    Is this merely duplicating a Saito control?

    Is this selector crossing an ownership boundary?

    Is this specificity actually necessary?

    Is this variable a real concept?

    Would a literal be clearer?

    Does JavaScript depend on this class?

    Does this need JavaScript, or can CSS handle it?


## 66. CSS Review Questions for Cleanup

Before keeping an existing rule, ask:

    What changes if I remove it?

    Does Saito already provide the same declaration?

    Does inheritance already provide the same result?

    Is this rule an old workaround?

    Is this rule overriding Saito deliberately?

    Is the override documented or obvious?

    Does the rule belong in base CSS?

    Is this component styling another component's internals?

    Is this variable actually necessary?

    Is this selector more specific than necessary?


## 67. AI Implementation Rules

When creating CSS for a new Saito application:

1. Inspect Saito's current CSS first.

2. Determine which Saito design-system variables and classes already solve the problem.

3. Decide whether the application will include Saito CSS.

4. If it uses Saito UI, normally include Saito CSS.

5. Create the module's base stylesheet for page-level and Saito integration.

6. Put component CSS into isolated component files.

7. Give each component a distinctive root class.

8. Use short semantic descendant names.

9. Let parents arrange children.

10. Let components style their own internals.

11. Use modifier classes on component roots to communicate context.

12. Keep selectors as short as possible.

13. Use additional specificity only when it solves a real cascade problem.

14. Use Saito variables directly.

15. Create module variables only for meaningful application concepts, configuration, theme values, or runtime state.

16. Do not create aliases for Saito variables.

17. Do not recreate Saito buttons, forms, typography, spacing, or colours unnecessarily.

18. Allow deliberate application-specific visual identity.

19. Use CSS for ordinary responsive layout.

20. Use JavaScript for runtime measurement or behavior when CSS is insufficient.

21. Never manually edit generated CSS.

22. Before renaming a class, search JavaScript for dependencies on it.

23. Keep CSS ownership aligned with UI ownership.

24. Keep CSS obvious rather than clever.


## 68. AI Rules for Existing Applications

When modifying an existing Saito application:

1. Find the module's base CSS.

2. Find the component CSS associated with the affected UI.

3. Inspect Saito CSS before adding an override.

4. Determine whether the existing rule is deliberate application identity or inherited technical debt.

5. Do not copy an older application's CSS pattern automatically.

6. Check whether JavaScript uses the affected class or selector.

7. Preserve transaction/data identifiers.

8. Preserve component ownership.

9. Prefer changing the smallest responsible CSS file.

10. If an application-wide Saito rule must change, put the override in base CSS.

11. If a component's internal presentation must change, put the rule in that component's CSS.

12. If the rule is generic and Saito should own it, consider whether the correct change belongs in Saito rather than the module.

13. Do not create a module design system merely because the existing CSS is inconsistent.

14. Remove unnecessary CSS when the task is cleanup, but preserve deliberate visual identity.


## 69. AI Rules for Shared Saito UI

When modifying shared Saito UI:

1. Determine whether the rule is generic or intrinsic.

2. Generic appearance belongs in the Saito design system.

3. Intrinsic component layout belongs in the component.

4. Do not recreate generic buttons.

5. Do not recreate generic inputs.

6. Do not recreate generic typography.

7. Do not create a parallel spacing system.

8. Use Saito variables directly.

9. Keep the component's CSS isolated.

10. Remember that applications may consume the component from many contexts.

11. Avoid making application-specific assumptions inside shared components.

12. Preserve the shared component's ability to participate in Saito themes.


## 70. AI Rules for Games

When modifying game CSS:

1. Identify the game root.

2. Keep game-specific visual identity inside the game CSS.

3. Reuse shared Saito/game infrastructure where appropriate.

4. Do not force board presentation into generic Saito card styling.

5. Keep game components independently understandable.

6. Use CSS for ordinary responsive game layout.

7. Use JavaScript when the game genuinely needs runtime viewport measurement.

8. Do not assume ordinary application CSS conventions completely describe game CSS.


## 71. AI Rules for Generated Stylesheets

Never make permanent edits directly to:

    node/web/saito/saito.css

or:

    mods/<module>/web/style.css

These files are generated.

Modify:

    node/web/saito/css-imports/*.css

or:

    mods/<module>/web/css/*.css

and then allow the normal compilation process to regenerate the output.


## 72. Final Principle

The goal of Saito CSS is not to make every application visually identical.

The goal is to provide a shared foundation that applications can consume, extend, and deliberately depart from without creating unnecessary architectural problems.

The preferred relationship is:

    Saito design system
        ↓
    module base / integration CSS
        ↓
    UI component CSS
        ↓
    component DOM

with:

    parent components
        arrange children

    child components
        own their internals

    Saito
        provides shared visual language

    applications
        provide application-specific identity

    games
        may provide substantially different visual languages

The most important rule for AI-assisted development is:

> Use Saito where Saito already solves the problem. Put application-specific styling in the component or module that actually owns it. Keep component boundaries visible in the CSS. Put Saito-wide overrides in base CSS. Do not create another design system unless the application genuinely needs one.

Good Saito CSS should be easy to locate, easy to understand, easy to theme, and easy to change without forcing an AI or human developer to understand unrelated parts of the application.
