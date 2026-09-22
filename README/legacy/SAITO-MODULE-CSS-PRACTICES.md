# Saito Module CSS Development Practices

Reusable instructions for writing and simplifying CSS in Saito application modules (e.g. RedSquare). Derived from architectural guidance used during the RedSquare CSS cleanup.

These rules apply to **module CSS** that sits on top of Saito. Saito is the design system; the module is an application that consumes it. These rules override any conflicting CSS or general development guidance elsewhere.

The same architectural principles extend to **shared UI components** under `lib/saito/ui/`. Modules must not recreate Saito. Shared components must not become miniature design systems either. Sections 11–16 document that layer.

---

## 1. Roles

**Saito owns appearance and shared UI.**

Saito already owns:

- typography
- colours
- spacing scales
- buttons
- forms
- avatars
- notification badges
- cards
- overlays
- global CSS variables
- common UI behaviour

**The module consumes those.**

It must not:

- recreate them
- rename them
- invent another abstraction layer on top of them

Unacceptable:

```css
--rs-layer-recessed: var(--saito-surface-color);
```

Correct:

```css
background: var(--saito-surface-color);
```

Rule of thumb: **If Saito already has a variable, use it directly.**

Do not invent aliases.  
Do not invent semantic design tokens.  
Do not create variables “for future flexibility.”

---

## 2. What module CSS is for

Module CSS exists almost entirely to **position components**.

It should primarily define:

- layout
- positioning
- orientation
- flex / grid
- visibility
- overflow
- gaps / alignment
- responsive behaviour
- relationships between components

It should **not** redefine appearance.

If a declaration affects typography, colour, radius, buttons, inputs, cards, shadows, hover colours, or form styling, it probably belongs in Saito, not the module.

Before adding any rule, ask:

1. Does this exist because the module needs a layout?
2. Or am I recreating something Saito already provides?

If Saito already provides it, delete the rule.

---

## 3. Component ownership

### One file, one component, one namespace

Each UI component owns:

- its HTML structure
- its CSS
- its descendants
- its presentation

Each CSS file owns exactly one component / namespace:

| File | Namespace |
|------|-----------|
| `…-manager.css` | `.manager` |
| `…-tweet.css` | `.tweet` |
| `…-profile.css` | `.profile` |

### Short descendant names

The namespace comes from the root. Descendants must **not** repeat the component name.

Good:

```css
.tweet .header
.tweet .footer
.tweet .controls
```

Bad:

```css
.tweet-header
.tweet-footer
.tweet-controls
```

HTML should match: `class="header"` inside `class="tweet"`, not `class="tweet-header"`.

### Parents own layout; children own themselves

- Manager decides **where** Tweets appear.
- Tweet decides **how** a Tweet is rendered.
- Sidebar decides **where** Profile appears.
- Profile decides **how** a Profile is rendered.

Buttons and inputs should never know where they live.  
Tweets should never know whether they sit inside Notifications or Profiles.

### Do not cross ownership boundaries

No component styles inside another component.

Bad:

```css
.manager .tweet .header
.manager .tweet .body
.sidebar .profile .body .text
```

Instead, the parent adds **state/modifier classes on the child’s root**. The child interprets those modifiers.

Good:

```css
.tweet.focused
.tweet.embedded
.tweet.chain-next
.tweet.chain-prev
```

If a selector nests several component names, it is probably violating ownership.

Prefer moving layout responsibility **upward**. Each component should be independently renderable.

### Base / integration CSS

Overrides of generic Saito styling (page shell, `#saito-container`, integration with `saito.css`) belong in a **base** stylesheet for the module — not scattered through component files.

---

## 4. Specificity

Prefer short selectors.

Prefer:

```css
.tweet
```

instead of:

```css
body.redsquare-body .manager .tweet
```

unless the longer selector is **genuinely required** to override Saito.

Rules:

- Every level of selector nesting must justify itself.
- Do not increase specificity merely to be safe.
- Increase specificity only when necessary to override an existing rule.
- Delete specificity that no longer serves a purpose.

Shared generic names (`.header`, `.body`, `.avatar`) may need a single parent scope (`.manager .header`). Unique class names should stand alone (`.tweet`, `.feed-status`).

---

## 5. Cascade, inheritance, and minimal declarations

Trust the cascade.  
Trust inheritance.  
Trust Saito.

Selectors should contain only the declarations that make that selector unique.

Bad (defensive defaults):

```css
.profile {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
```

Good (unless a removed declaration demonstrably fixes rendering):

```css
.profile {
  display: flex;
  flex-direction: column;
}
```

Minimal CSS is preferred over explicit CSS.  
Prefer inheritance over overriding.  
Prefer relying on Saito over recreating Saito.

Delete any declaration that merely restates Saito’s appearance or the browser/Saito reset.

---

## 6. CSS custom properties

### A custom property is not a local variable

Do **not** create variables simply to avoid repeating a literal.  
Do **not** create variables so modifier classes can assign different values.

Discouraged (variables as local mutable state):

```css
.tweet {
  --tweet-current-pad-x: 1.6rem;
  padding: var(--tweet-current-pad-y) var(--tweet-current-pad-x);
}

.tweet.embedded {
  --tweet-current-pad-x: 1.2rem;
}
```

Preferred (explicit layouts):

```css
.tweet {
  padding: 1.2rem 1.6rem;
}

.tweet.embedded {
  padding: 1rem 1.2rem;
}
```

### When a custom property may exist

For each variable, ask:

1. Is this **overriding a variable defined by Saito**?
2. Is this **exposing configuration** that another component is expected to override?
3. Is this representing **browser or runtime state**?

If the answer to all three is “no”, remove the variable and use a literal.

Earlier formulation of the same idea:

1. Saito defines a variable that is incorrect for this context, and the module overrides it; **or**
2. A value is shared between multiple rules **and** changing it represents a meaningful module concept.

Otherwise use a literal.

Never create variables because they “might” become configurable or “look cleaner.”  
If a value is not overridden anywhere, it almost certainly should not be a variable.

**Modules must not invent their own variable system.**  
Inherit Saito variables where appropriate; otherwise use ordinary CSS declarations.

Unacceptable aliases (rename-only):

```css
--rs-layer-base
--rs-layer-raised
--rs-border
--rs-text
--rs-space-sm
```

Use the Saito variable directly.

---

## 7. Simplification over reorganization

The task is not to make CSS look more organized.  
The task is to make it **substantially smaller**.

Delete:

- unnecessary CSS
- redundant CSS
- duplicate CSS
- aliases
- unjustified variables
- useless specificity
- defensive resets
- unnecessary comments

Expect:

- fewer selectors
- fewer declarations
- fewer CSS variables
- fewer overrides
- fewer resets
- fewer comments
- fewer aliases

The ideal module stylesheet is surprisingly small.  
The objective is not clever CSS. The objective is **obvious CSS**.

**If removing a rule produces identical rendering, that rule should not exist.**

**If two implementations render identically, the one with fewer lines is the correct implementation.**

---

## 8. Visual and behavioural constraints

When refactoring or reducing CSS:

- Preserve rendered appearance (visually identical unless the task explicitly changes design).
- Do not redesign, “modernize,” or tweak spacing/colours/typography under the guise of cleanup.
- Do not break JavaScript that depends on class names, `querySelector` / `closest`, event delegation, data attributes, or DOM structure. Update JS when renaming classes; behaviour must remain identical.

Preserve deliberate visual identity. If a component intentionally looks different because that helps users understand its function, keep that difference. Do not force visual uniformity.

However, if the difference exists only because the component manually recreated font sizes, padding, button sizing, input sizing, border styling, or colours instead of inheriting Saito, treat that as technical debt and simplify it.

---

## 9. Working method

1. Assume every declaration is unnecessary until proven.
2. Prefer delete-then-add-back over incremental trimming when reducing large stylesheets.
3. Add back only the minimum declaration or specificity that fixes a proven regression.
4. Do not reorganize for its own sake while reducing.
5. Keep ownership boundaries clean while deleting.

Before keeping a rule, ask:

- Does this change layout/positioning the module uniquely needs?
- Does Saito already provide this?
- Does inheritance already provide this?
- Is this crossing a component boundary?
- Is this specificity only “to be safe”?
- Is this variable only a local rename or mutable local state?

If the answer fails those tests, delete it.

---

## 10. Quick checklist

- [ ] Using Saito tokens/classes directly (no module aliases)
- [ ] Layout/positioning only; appearance from Saito
- [ ] One CSS file → one component namespace
- [ ] Short descendants; no `component-part` prefixing
- [ ] Parents arrange; children render; no deep cross-component selectors
- [ ] Shortest selector that works; specificity only to beat Saito when required
- [ ] No defensive width/margin/box-sizing resets unless proven necessary
- [ ] No custom properties except Saito overrides / real shared config / runtime state
- [ ] Modifier layouts written as explicit declarations, not variable reassignment
- [ ] Fewer lines than before for the same rendering
- [ ] JS selectors and behaviour still correct

---

## 11. Shared UI components

Shared UI components (under `lib/saito/ui/` and their stylesheets in `web/saito/css-imports/`) sit between the Saito design system and application modules.

They should primarily define:

- structure
- layout
- positioning
- interaction
- lifecycle

They should **not** become miniature design systems.

### Layering

| Layer | Owns |
|-------|------|
| Design system (`saito-form-elements`, `saito-buttons`, `saito-base`, variables) | Typography, colours, buttons, inputs, textareas, borders, shadows, spacing tokens |
| Shared UI component | Layout, positioning, interaction, lifecycle, feature-specific arrangement |
| Module CSS | Application-specific layout; presentation only where the module intentionally departs from the standard design language |

### Example: SaitoOverlay

An overlay should own:

- backdrop
- positioning
- animation
- close-button placement
- panel sizing
- overlay lifecycle

It should **not** own:

- generic forms
- generic typography
- generic button styling
- generic input sizing
- textarea geometry

Those belong either in the Saito design system or in the component that uses the overlay.

Unacceptable (shared component recreating form controls):

```css
.saito-recovery > input.saito-input {
  height: 6rem;
  font-size: 2.3rem;
}
```

Correct:

```css
/* No overlay rule. The field uses input.saito-input from the design system. */
```

### Example: feature layout vs control chrome

A transaction monitor may define how its status stack, spinner, and actions are arranged. That layout is the component’s job.

It should not redefine what a primary button looks like, or invent a second body font size for ordinary supporting text. Use Saito buttons and type.

### Example: calendar or media controls

A calendar grid, cropper handles, or video-tile arrangement can be intrinsic to that component. Generic input border radius, button padding, and heading scale are not.

Rule of thumb: **shared components define structure. They do not recreate generic controls.**

---

## 12. Intrinsic vs generic presentation

Before adding CSS, ask:

**Is this presentation intrinsic to this component?**

| Example | Intrinsic? |
|---------|------------|
| Overlay backdrop | Yes |
| Overlay input height | No |
| Calendar grid | Yes |
| Generic button padding | No |
| Transaction monitor layout | Yes |
| Generic typography | No |
| Avatar cropper handles | Yes |
| Input border radius | No |
| Close-button placement on an overlay | Yes |
| Secondary button hover colour | No |

**Intrinsic presentation** belongs with the component. It exists because of what the component *is*.

**Generic presentation** belongs with the design system. It exists because Saito already defines how controls and type look everywhere.

If a rule could apply equally to any dialog, form, or button in the application, it is almost certainly generic — and should not live inside a shared component stylesheet.

Deliberate visual identity is allowed when it helps users understand function. Accidental divergence caused by re-implementing Saito controls is not.

---

## 13. Avoid parallel design systems

A shared component must not introduce its own parallel visual language.

Bad:

```css
.my-shared-widget {
  font-size: 2.3rem;
  color: #eee;
}

.my-shared-widget input {
  height: 6rem;
  padding: 1.4rem;
  border-radius: 0.8rem;
}

.my-shared-widget .action {
  padding: 1rem 2rem;
  background: #dd4708;
}
```

This creates a second set of typography, inputs, spacing, and colours beside the application design system. Identical controls then look different depending on which “system” they happened to inherit.

Preferred:

```css
.my-shared-widget {
  display: flex;
  flex-direction: column;
  gap: var(--saito-space-md);
}

.my-shared-widget .actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--saito-space-sm);
}
```

Markup uses `saito-input`, `saito-button-primary`, and ordinary cascade for type. The shared component only describes arrangement unique to itself.

Competing visual languages are an architectural failure mode, not a stylistic preference.

---

## 14. Inheritance before overrides

When implementing or simplifying a shared UI component, follow this order:

1. **Use browser defaults** where the reset already leaves the right behaviour.
2. **Inherit Saito** — tokens, form elements, buttons, base typography.
3. **Add component layout** — flex/grid, positioning, lifecycle, intrinsic arrangement.
4. **Only then** add component-specific presentation that is truly intrinsic.

Do not start from a blank visual slate and rebuild Saito inside the component.

Unacceptable:

```css
.saito-overlay-form-text {
  font-size: 2rem;
  line-height: 3rem;
}
```

when ordinary body text from Saito already expresses supporting copy.

Preferred:

```css
/* Supporting copy inherits body type. No component rule required. */
```

Overrides must justify themselves. “This dialog felt clearer with larger type” is a product decision about deliberate identity. “This dialog grew its own form kit years ago” is technical debt.

---

## 15. Deleting CSS

Section 7 already requires fewer lines and obvious CSS. When simplifying shared or module stylesheets, strengthen that with a sharper question.

Do **not** ask:

> What CSS should I move?

Ask:

> What CSS should no longer exist?

Prefer **deleting** an obsolete abstraction layer over **migrating** it into another file.

Moving a parallel form system from a shared overlay stylesheet into a new “overlay-forms.css” preserves the architectural mistake under a cleaner name. Removing the parallel system so controls inherit `saito-form-elements` and `saito-buttons` eliminates the mistake.

Good outcomes:

- selectors removed
- declarations removed
- classes unused and deleted
- inheritance restored
- no new design-token aliases
- no new intermediate stylesheet that merely relocates debt

If two approaches yield the same appearance, the one that deletes more CSS is preferred.

---

## 16. Shared component review checklist

Use this when adding or cleaning shared UI CSS:

- [ ] Component owns structure, layout, positioning, interaction, lifecycle
- [ ] Does not recreate generic controls (inputs, textareas, buttons)
- [ ] Does not redefine typography already provided by Saito
- [ ] Does not redefine button sizing or geometry
- [ ] Does not redefine input / textarea sizing or geometry
- [ ] Does not redefine colours / borders / shadows already available from Saito
- [ ] Each rule is layout, intrinsic presentation, or a proven override
- [ ] Presentation that remains is intrinsic (passes the Section 12 test)
- [ ] No parallel mini design system (typography + forms + buttons + spacing of its own)
- [ ] Inheritance tried before overrides
- [ ] Could this CSS simply be deleted?
- [ ] Prefer deletion over moving the same rules elsewhere
- [ ] Deliberate visual identity preserved; accidental divergence removed
- [ ] JS selectors and behaviour still correct
