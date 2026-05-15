# Reserva el Dia Design System

Status: documentation source of truth for product UI visual identity.

This document records the Figma brand style supplied for Reserva el Dia and maps it onto the current codebase ownership model. It does not change runtime behavior, create a token system, migrate CSS, or authorize visual changes by itself.

For CSS ownership rules, use this document together with:

- `docs/architecture/CSS_ARCHITECTURE_CONTRACT.md`
- `docs/architecture/CSS_INVENTORY.md`
- `docs/architecture/LANDING_DASHBOARD_STYLING_MAP.md`

## 1. Current State

Reserva el Dia did not have a formal design-system or brand/typography guide before this document.

Existing related documentation:

- `docs/architecture/CSS_ARCHITECTURE_CONTRACT.md` defines where CSS belongs and how to avoid unsafe style ownership.
- `docs/architecture/CSS_INVENTORY.md` inventories current CSS files, risky selectors, current repeated values, and ownership.
- `docs/architecture/LANDING_DASHBOARD_STYLING_MAP.md` maps landing, auth, dashboard, shared header, dashboard shell, and high-risk styling surfaces.
- `docs/reports/REUNION_ESTUDIO_DISENO_BRIEF.md` explicitly states that there is no unified formal design system yet.

Current implementation summary:

- App global CSS is imported from `src/pages/_app.js`: `styles/globals.css` and `styles/styles.css`.
- Bootstrap CSS and JS are loaded globally from `src/pages/_document.js`.
- Tailwind is enabled, but `tailwind.config.js` has an empty `theme.extend`; there are no Tailwind design tokens yet.
- The only CSS Module currently found is `src/components/appHeader/AppHeader.module.css`.
- `styles/styles.css` has legacy CSS custom properties such as `--primary-color: #d7b8e8` and `--secondary-color: #773dbe`; these are not the Figma brand tokens.
- Dashboard UI is mostly Tailwind utilities plus shared class constants in `src/components/dashboard/dashboardStyleClasses.js`.
- Landing/auth still mix Bootstrap classes, global CSS, app-owned selectors, and static inline styles.
- Editor, template, preview, publish, and public invitation CSS are separate high-risk surfaces and must not be treated as ordinary app UI CSS.

## 2. Brand Tokens

Use the supplied Figma brand style as the visual source of truth for product UI. These names are documentation token names only until a separate implementation phase creates runtime tokens.

| Token | Value | Usage |
| --- | --- | --- |
| `brand.primary` | `#692B9A` | Main brand accent, links on light backgrounds, focus accents, primary controls when not using the gradient. |
| `brand.gradient` | `linear-gradient(90deg, #692B9A 0%, #F39F5F 100%)` | High-emphasis brand moments such as hero text, primary marketing accents, and carefully selected CTA accents. |
| `brand.secondary` | `#020B0A` | Deep neutral/near-black brand anchor for dark surfaces or high-emphasis text when a brand-black is needed. |
| `brand.primaryContainer` | `#EFDBFF` | Soft primary container, selected states, light brand panels, subtle focus surfaces. |

Rules:

- Use `brand.primary` for normal links on light backgrounds.
- Use the gradient sparingly. It should signal brand emphasis, not replace every primary button or heading.
- Do not silently alias current legacy purples such as `#773dbe`, `#6f3bc0`, or `#d7b8e8` to the Figma tokens. A future migration must choose exact replacements intentionally.

## 3. Background Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `surface.white` | `#FFFFFF` | Cards, modals, primary content surfaces, public marketing sections that need a clean neutral surface. |
| `surface.lightGrey` | `#FBF7F9` | Neutral app/page background and soft section bands. |
| `surface.lightWarm` | `#FAF5ED` | Warm marketing or hospitality surfaces when the composition needs warmth. |
| `surface.lightPrimary` | `#FAF5FF` | Light brand-tinted sections, dashboard panels, selected/active low-emphasis surfaces. |

Rules:

- App pages should prefer section bands and max-width content containers over floating nested cards.
- Avoid hard-coded Figma frame distances as CSS layout values. Use responsive spacing, `clamp(...)`, Tailwind breakpoints, flex/grid, and max-width containers.
- Template/public invitation backgrounds are event/invitation content and should remain separate from app UI background tokens unless a specific product-chrome surface is being styled.

## 4. State Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `state.alert` | `#B3261E` | Errors, destructive actions, blocking validation. |
| `state.alertLight` | `#FFDADA` | Error backgrounds and low-emphasis alert containers. |
| `state.warning` | `#D4DB12` | Warning indicators. Check contrast before using as text or button fill. |
| `state.warningLight` | `#FFF1C2` | Warning backgrounds and low-emphasis warning containers. |
| `state.neutral` | `#262626` | Default neutral text and icons on light surfaces. |
| `state.neutralLight` | `#E5E5E5` | Borders, separators, disabled outlines, neutral low-emphasis backgrounds. |
| `state.success` | `#029B4A` | Success messages and positive status. |
| `state.successLight` | `#A4B56C` | Success-adjacent light surfaces. Check contrast before using with text. |

Rules:

- State colors must include accessible foreground/background pairings.
- Do not replace editor-generated invitation states or publish validation states without checking render contracts.
- Current app state colors use several red, amber, green, and slate values. Future migration must map them deliberately instead of doing broad search/replace.

## 5. Text Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `text.primaryOnLight` | `#262626` at `100%` opacity | Main text on light backgrounds. |
| `text.primaryOnDark` | `#FFFFFF` at `100%` opacity | Main text on dark backgrounds. |
| `text.secondaryOnLight` | `#262626` at `54%` opacity | Secondary text on light backgrounds. |
| `text.secondaryOnDark` | `#FFFFFF` at `70%` opacity | Secondary text on dark backgrounds. |
| `text.disabledOnLight` | `#262626` at `38%` opacity | Disabled text on light backgrounds. |
| `text.disabledOnDark` | `#FFFFFF` at `38%` opacity | Disabled text on dark backgrounds. |
| `text.link` | `#692B9A` | Links on light backgrounds. |
| `text.linkOnDark` | `#80C7FF` | Links on dark backgrounds. |

Implementation note:

- In CSS, opacity may be represented as `rgba(...)`, modern slash opacity syntax, or a Tailwind opacity modifier in a future tokenized Tailwind setup.
- Keep the text token and the semantic state separate. For example, an alert message should use an alert token, not just low-opacity neutral text.

## 6. Typography

### Font Families

| Font | Role |
| --- | --- |
| `DM Sans` | Primary UI and heading font. Use for headings, primary UI labels, CTA text, tags, and high-emphasis interface text. |
| `Source Sans 3` | Secondary/body-support font. Use for body copy, captions, dense helper text, and readable support text. |
| `Font Awesome Regular` | Icons only in the supplied Figma style. Do not use it as a text font. |

Current implementation notes:

- `_document.js` currently loads `DM Sans` weight `500` and `Source Sans 3` weight `400`, plus Montserrat, Poppins, Raleway, Playfair Display, Roboto, and Yellowtail.
- The Figma hierarchy requires `DM Sans` weights `400`, `500`, and `600`; the current Google Fonts link does not load every required `DM Sans` weight.
- Current app UI still uses Montserrat, Poppins, Roboto, Tailwind default font stacks, Yellowtail for the logo, and editor/template font catalogs. This is a mismatch to resolve in a future implementation phase.
- The current icon implementation uses `lucide-react`, `react-icons/fa`, and local Phosphor SVG assets. Font Awesome Regular is not the only icon source in code today.

### Letter-Spacing Convention

The repo has two conventions today:

- App CSS, inline styles, CSS Modules, and Tailwind arbitrary utilities must use explicit CSS units for non-zero `letter-spacing` values. Example: `letter-spacing: -1px` or `tracking-[0.08em]`.
- Editor text data stores `letterSpacing` as a number, and the editor DOM/Konva render paths interpret that number as px. This data convention must not be mixed with app UI typography tokens.

For this design-system table:

- Use `0` for zero tracking.
- If a Figma handoff value is confirmed as px, express the CSS value as px. Example: Figma `-1` becomes `letter-spacing: -1px`.
- If Figma exports a numeric value without a unit, do not convert it to `em`, `%`, or Tailwind `tracking-*` by guesswork. Confirm the unit first.
- Tailwind built-ins such as `tracking-tight` use `em` values and are not equivalent to the Figma numeric values unless a future token migration defines that conversion explicitly.

### Type Scale

| Style | CSS font-size / line-height | Family | Weight | Tracking |
| --- | --- | --- | --- | --- |
| Heading 1 | `40px / 44px` | `DM Sans` | Medium `500` | Figma `-1`; CSS `-1px` when unit is confirmed as px. |
| Heading 2 | `30px / 32px` | `DM Sans` | Medium `500` | `0` |
| Heading 3 | `22px / 23px` | `DM Sans` | Semibold `600` | `0` |
| Heading 4 | `16px / 23px` | `DM Sans` | Medium `500` | `0` |
| Body Large | `18px / 28px` | `DM Sans` | Regular `400` | `0` |
| Body | `16px / 24px` | `Source Sans 3` | Regular `400` | `0` |
| Caption Large | `16px / 19px` | `Source Sans 3` | Regular `400` | `0` |
| Caption | `14px / 17px` | `Source Sans 3` | Regular `400` | `0` |
| Infield | `14px / 24px` | `DM Sans` | Medium `500` | `0` |
| CTA Text | `12px / 20px` | `DM Sans` | Medium `500` | Figma `1`; CSS `1px` when unit is confirmed as px; uppercase. |
| Tags | `16px / 23px` | `DM Sans` | Medium `500` | Figma `1`; CSS `1px` when unit is confirmed as px; uppercase. |

Responsive rules:

- Do not scale font size directly with viewport width.
- Use responsive type variants only where the component needs a smaller mobile style for fit.
- Preserve readable minimum sizes. Body copy should generally stay at `16px` unless the surface is intentionally compact.
- Inside compact panels, sidebars, cards, and toolbars, avoid hero-sized text.

## 7. Buttons

Principles:

- Primary actions should use `brand.primary` or, for high-emphasis marketing CTAs, the brand gradient.
- Button text should follow the CTA text style where it is a formal CTA: `12px / 20px`, `DM Sans`, `500`, uppercase, tracking per the letter-spacing convention.
- Secondary actions should be quiet: white or transparent surface, neutral or primary border, `text.primaryOnLight`.
- Destructive actions should use `state.alert` and `state.alertLight`, not legacy red values introduced ad hoc.
- Disabled actions should use documented disabled text opacity and a visible but low-emphasis border/background.
- All buttons need visible `:focus-visible` states. Prefer a focus ring derived from `brand.primary` or `brand.primaryContainer`, with sufficient contrast.
- Avoid styling new product UI by relying on Bootstrap namespace classes such as `.btn-primary`, `.btn-outline-dark`, or `.btn`.

Current mismatch:

- Landing/auth use global Bootstrap button overrides and legacy purples.
- Dashboard uses Tailwind recipes with repeated arbitrary purples and gradients.
- Some static inline styles still exist in landing/auth and dashboard shell. These should be reduced only in a future scoped implementation phase.

## 8. Header And Navigation

Principles:

- `AppHeader.jsx` and `AppHeader.module.css` are the current shared visual header owner for landing and authenticated non-editor dashboard chrome.
- Header typography should move toward `DM Sans` for brand/action UI and `Source Sans 3` for readable nav/body-support labels where appropriate.
- Navigation labels should be concise, tappable, and mobile-safe.
- Desktop layout should use max-width containers and flexible side regions, not fixed Figma offsets.
- Mobile layout should keep touch targets at least 40px high/wide where possible and prevent text clipping.
- Do not move dashboard runtime responsibilities into `AppHeader`. `DashboardHeader.jsx` owns measured shell hooks and editor runtime contracts.

High-risk dashboard header hooks:

- `[data-dashboard-header="true"]`
- `[data-preserve-canvas-selection="true"]`
- `--dashboard-header-height`

These are runtime contracts, not ordinary style hooks.

## 9. Backgrounds And Sections

Principles:

- Use `surface.white`, `surface.lightGrey`, `surface.lightWarm`, and `surface.lightPrimary` as section families.
- Prefer full-width bands with constrained inner content for page sections.
- Use cards for repeated items, modals, and true framed tools. Avoid nested cards.
- Do not add broad global selectors such as `section`, `h2`, `p`, `.btn`, `.icon`, or `.modal-content` for new app UI.
- Background gradients should be intentional and sparse. The brand gradient is not a default page background.
- Use stable responsive dimensions for fixed-format UI such as cards, rails, controls, and previews so labels, hover states, loading text, and dynamic content do not resize the layout unexpectedly.

Current mismatch:

- `styles/styles.css` still has broad `section`, `h2, h3, p`, and `footer` selectors.
- Landing sections are route-owned in practice but physically live in global CSS and inline styles.
- Dashboard home uses component-local Tailwind with repeated arbitrary gradients, shadows, and rounded values.

## 10. CSS And Code Best Practices

### Global CSS

Allowed global CSS lives in `styles/globals.css` only when it is truly global, documented, and aligned with the CSS architecture contract:

- Tailwind directives.
- Base `html`/`body` rules once ownership is consolidated.
- Documented app-wide CSS custom properties.
- Cross-runtime compatibility hooks that cannot be scoped safely.
- Shared global hooks that are intentionally cross-component, such as the current dashboard card primitive.

`styles/styles.css` is legacy compatibility. Do not add unrelated new styles there.

### Component Styles

Use Tailwind utilities for normal app React UI when the style is local and readable.

Use CSS Modules when:

- A component needs complex selectors or pseudo-elements.
- A third-party widget needs a local wrapper.
- Local keyframes or multi-selector states would be unreadable in Tailwind.
- The component already owns a scoped module, as with `AppHeader.module.css`.

Use extracted class constants when a Tailwind recipe repeats inside one ownership boundary. `dashboardStyleClasses.js` is a current example, but it is not a token system.

### Inline Styles

Allowed:

- Runtime geometry and measured layout.
- Editor/canvas coordinates, transforms, dimensions, z-index, and user-authored visual data.
- Preview iframe scale/size and safe-area patches.
- CSS variables used to pass runtime values into scoped components.

Avoid:

- Static app chrome styles.
- Repeated static colors, typography, spacing, shadows, or borders.
- Cascade workarounds that should be solved with ownership.

### Duplicate Style Authorities

Before adding or changing styles, identify the owner:

- Product app global base.
- Landing route or landing component.
- Auth modal components.
- Dashboard home components.
- Dashboard shell runtime.
- Editor/canvas runtime.
- Template source CSS.
- Generated/public invitation artifact CSS.

Do not define the same visual concept in more than one authority. For example, do not add a new `primary` button recipe in global CSS while dashboard buttons use Tailwind and auth buttons use Bootstrap overrides.

### Introducing Runtime Tokens Later

There is no safe runtime token system yet. A future implementation phase may introduce one, but it must preserve behavior and avoid broad CSS churn.

Recommended future structure:

```txt
tailwind.config.js
  theme.extend.colors.brand.primary
  theme.extend.colors.brand.secondary
  theme.extend.colors.brand.primaryContainer
  theme.extend.colors.surface.white
  theme.extend.colors.surface.lightGrey
  theme.extend.colors.surface.lightWarm
  theme.extend.colors.surface.lightPrimary
  theme.extend.colors.state.alert
  theme.extend.colors.state.warning
  theme.extend.colors.state.success
  theme.extend.colors.text.primaryOnLight

styles/tokens.css
  :root {
    --brand-primary: #692B9A;
    --brand-gradient: linear-gradient(90deg, #692B9A 0%, #F39F5F 100%);
    ...
  }
```

Migration rules:

- Propose token migration separately from this documentation task.
- Preserve current output first, then map to Figma values in a visual implementation phase.
- Do not replace editor or generated invitation values unless the editor/render contract explicitly opts into the token.
- Keep template/event-design tokens separate from product app UI tokens unless a shared surface is explicitly defined.

## 11. Do Not Touch / High-Risk Surfaces

Do not modify these as part of design-system documentation or low-risk token planning:

- Editor selection, drag, inline editing, overlay geometry, canvas sizing, or window bridges.
- `DashboardHeader.jsx` runtime hooks, measured header height, and `--dashboard-header-height`.
- `DashboardSidebar.jsx` runtime geometry, `#sidebar-panel`, mobile toolbar geometry, and selection-preservation hooks.
- `DashboardLayout.jsx` scroll root and `[data-dashboard-scroll-root="true"]`.
- Preview/publish generators, prepared render payload helpers, validation helpers, or iframe runtime patches.
- Public invitation route `/i/{slug}` and generated `publicadas/{slug}/index.html` artifacts.
- Template source CSS and public/static invitation CSS unless the task is specifically about template source ownership.
- `styles/styles.css` body/html overflow, height, or global typography without landing, auth, dashboard, editor shell, modal, preview, and publish checks.
- `.dashboard-invitation-card*` unless every dashboard hero, draft card, publication card, and template card consumer is intentionally included.

## 12. Current Figma Mismatches To Resolve Later

Known mismatches between the supplied Figma style and current implementation:

- Primary brand: Figma uses `#692B9A`; current app UI repeats `#773dbe`, `#6f3bc0`, `#5f3596`, `#503d84`, and related purple values.
- Primary container: Figma uses `#EFDBFF`; current light purples include `#d7b8e8`, `#d7c5ff`, `#e6dbf8`, `#e7dcf8`, `#faf6ff`, and `#f4edff`.
- Secondary color: Figma uses `#020B0A`; current text/neutral values use `#333333`, Tailwind slate/gray, and `#262626` in newer header/hero work.
- Backgrounds: Figma defines `#FBF7F9`, `#FAF5ED`, and `#FAF5FF`; current surfaces mostly use white, slate/gray Tailwind values, `#faf6ff`, `#faf7ff`, `#f4edff`, `#f4f0fe`, and `#f8f7ff`.
- State colors: Figma alert/warning/success tokens do not match current red/amber/green palettes in auth and dashboard.
- Typography: Figma uses `DM Sans` and `Source Sans 3`; current global body ownership conflicts between Roboto and Montserrat, with Poppins in auth and Tailwind defaults in many dashboard components.
- Font loading: current Google Fonts link does not load all required `DM Sans` weights for the Figma hierarchy.
- Iconography: Figma says Font Awesome Regular for icons only, while the app currently uses `lucide-react`, `react-icons/fa`, and local Phosphor SVG assets.
- Gradient: the Figma brand gradient exists in the landing hero text, but dashboard/auth use other purple gradients.
- CSS systems: Bootstrap, Tailwind, CSS Modules, global CSS, inline styles, template CSS, and generated/public CSS are mixed. The CSS architecture contract defines how to reduce that safely.

## 13. Future Implementation Steps

Recommended order for a future visual implementation phase:

1. Confirm Figma letter-spacing units and font weight availability.
2. Update font loading to include required `DM Sans` weights only after testing layout impact.
3. Create runtime tokens in Tailwind and/or `styles/tokens.css` behind a focused migration plan.
4. Map current legacy purples, backgrounds, state colors, and text colors to the Figma tokens by surface, not by broad search/replace.
5. Start with landing route visual cleanup outside auth internals and outside public invitation rendering.
6. Move auth styles behind an auth-owned boundary before reducing Bootstrap overrides.
7. Formalize dashboard card/button/header tokens after confirming whether card families stay shared or split.
8. Keep dashboard shell/editor runtime hooks stable and test editor overlays before and after shell visual changes.
9. Leave generated invitation HTML/CSS, preview/publish render contracts, and template event styles out of app UI token migration unless separately scoped.
