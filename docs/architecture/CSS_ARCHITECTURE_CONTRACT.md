# CSS ARCHITECTURE CONTRACT

## 1. Purpose
This document defines where CSS belongs in the current Reserva el Dia codebase and how new styling decisions should be organized.

This is a structure and maintainability contract only. It does not define visual changes, brand changes, spacing changes, typography changes, or layout redesigns.

The contract is based on the current codebase:
- The Next app imports `styles/globals.css` and `styles/styles.css` from `src/pages/_app.js`.
- Tailwind is enabled through `styles/globals.css` and `tailwind.config.js`.
- Bootstrap CSS and JS are loaded globally from `src/pages/_document.js`.
- Most React UI is styled with Tailwind utility classes in `className`.
- Template and public invitation CSS also exists under `plantillas/` and `public/`.
- Editor/canvas surfaces use a mix of Tailwind classes, inline styles, generated styles, and runtime geometry.

## 2. Ownership Rules

### 2.1 `globals.css`
`styles/globals.css` is the global base layer. It should contain only styles that are intentionally app-wide or required before any component/page styling runs.

Allowed in `globals.css`:
- Tailwind directives: `@tailwind base`, `@tailwind components`, `@tailwind utilities`.
- True app-wide base rules for `html`, `body`, and root-level behavior.
- CSS custom properties that are intentionally global and documented.
- Global font loading only when the font is needed app-wide.
- Low-level browser normalization that cannot reasonably be scoped.
- Cross-app runtime compatibility fixes that must target generated DOM, canvas, or editor overlays.
- Global keyframes only when used by multiple independent domains.

Rules:
- Every non-base selector in `globals.css` must have an explicit reason to be global.
- Prefer app-owned prefixes for global component hooks, for example `dashboard-*`, `auth-*`, `editor-*`, `landing-*`, or `template-*`.
- Avoid broad selectors such as `section`, `h2`, `p`, `.btn`, `.icon`, `.error`, or `.modal-content` unless they are inside an intentional scoped wrapper.
- `!important` is allowed only for compatibility with third-party CSS, generated preview documents, or browser/runtime constraints that cannot be solved by ownership or ordering.

Current tolerated legacy content:
- `navbar-collapse` mobile behavior exists in `globals.css` because the landing page currently relies on Bootstrap-compatible class names.
- `dashboard-invitation-card` animation styles exist in `globals.css` and are shared by multiple dashboard card surfaces.
- Canvas and inline textarea compatibility rules exist in `globals.css`.
- Dashboard shell runtime hooks such as `[data-dashboard-header]`, `[data-dashboard-sidebar]`, `[data-dashboard-scroll-root]`, `#sidebar-panel`, and `--dashboard-header-height` are not general styling hooks. They are cross-component runtime contracts used by editor overlays, selection preservation, modal scroll locking, and toolbar positioning. They must remain stable unless every consumer is updated in the same change.

Migration direction:
- Move route-specific or component-specific rules out of `globals.css` when touching those surfaces for unrelated work.
- Keep shared dashboard card hooks only if they remain intentionally cross-component.

### 2.2 `styles.css`
`styles/styles.css` is currently a legacy global stylesheet. New code should not add unrelated app UI styles to this file.

Allowed in `styles.css` during migration:
- Existing legacy landing-page styles until the landing page is migrated to route-scoped or component-scoped styling.
- Existing auth modal styles until auth UI receives scoped ownership.
- Existing Bootstrap compatibility overrides until the Bootstrap dependency boundary is reduced.
- Temporary compatibility rules with a short comment explaining the owning surface and removal condition.

Not allowed in `styles.css` for new work:
- New dashboard component styles.
- New editor/canvas component styles, except temporary compatibility rules.
- New admin UI styles.
- New generated invitation/template styles.
- New generic selectors or Bootstrap class overrides.

Migration direction:
- Treat `styles.css` as a legacy compatibility file, not as a general stylesheet.
- Shrink it over time by moving rules into route/component/template ownership.
- Once empty or limited to documented compatibility, rename or replace it with a clearer legacy file name.

## 3. Tailwind Usage
Tailwind utility classes are the default styling mechanism for app React UI.

Use Tailwind classes when:
- Styling local React UI in `src/pages`, `src/components`, or `src/lib/components`.
- The style is static or selected from a small set of state variants.
- The style is layout, spacing, typography, border, color, shadow, responsive behavior, or interaction state expressible with utilities.
- The class list is readable at the component boundary.

Use extracted class constants when:
- A long utility list is reused in a file.
- Multiple branches share the same base class and differ by state.
- The component already follows this pattern, for example dashboard card/header class constants.

Use shared component primitives or helper constants when:
- The same Tailwind class recipe appears across multiple files.
- The class expresses a reusable product concept, such as a dashboard card shell, admin panel shell, toolbar button, or modal action row.

Rules:
- Prefer Tailwind theme tokens once they exist instead of arbitrary values.
- Arbitrary values are allowed for current compatibility, exact editor geometry, existing colors, exact shadows, or values that do not yet have tokens.
- Do not introduce new design tokens implicitly through one-off arbitrary values when an existing token or local constant can represent the value.
- Responsive Tailwind prefixes should align with the breakpoint ownership rules in this contract.

## 4. CSS Modules And Scoped CSS
CSS Modules or other scoped CSS should be used when utility classes are not the best fit.

Use CSS Modules or scoped CSS when:
- A component has complex pseudo-element styling.
- A component needs multi-selector state relationships that would be unreadable in Tailwind.
- A third-party widget needs a local wrapper and scoped descendant selectors.
- Animation/keyframe definitions are component-specific.
- Styling depends on semantic class hooks that should not leak globally.

Rules:
- CSS Modules should be colocated with the component that owns them.
- CSS Module selectors must be local by default.
- Any `:global(...)` usage must be documented inline with why the target cannot be local.
- Scoped CSS should not redefine global Bootstrap classes directly.
- Component-specific keyframes should live with the component or in the component's module.

Current state:
- The repo currently has no `*.module.css` files. Introducing CSS Modules is a migration step, not a current convention.

Assumption:
- Next.js CSS Modules support is available because this is a Next.js app. No separate dependency is expected for basic `.module.css` usage.

## 5. Bootstrap Boundary
Bootstrap is currently loaded globally and used by the landing/auth surfaces through classes such as `navbar`, `container`, `row`, `col-*`, `d-flex`, `py-*`, `btn`, `btn-primary`, `btn-outline-dark`, and `modal-content`.

Contract:
- App-owned UI must avoid using Bootstrap class names as styling ownership names.
- Bootstrap classes may remain where they are already part of current markup.
- New app-owned components should use Tailwind, app-owned class names, or scoped CSS instead of Bootstrap class names.
- Do not add new global rules targeting `.btn-*`, `.modal-*`, `.navbar-*`, `.container`, `.row`, `.col-*`, `.d-flex`, or Bootstrap spacing classes.
- If Bootstrap must be used for compatibility, wrap the surface in an explicit owner boundary and document it as Bootstrap-dependent.

Allowed current exception:
- Landing and auth markup currently use Bootstrap classes and global overrides. This is legacy-compatible until migrated.

Migration direction:
- Replace app-owned Bootstrap overrides with app-owned class names.
- Keep Bootstrap usage isolated to surfaces that intentionally depend on Bootstrap.
- Avoid styling a custom component by relying on Bootstrap's class namespace.

### 5.1 Landing And Dashboard Styling Boundary
The current landing and dashboard surfaces are intentionally different styling domains:

- Landing route ownership starts at `src/pages/index.js`. The active markup uses Bootstrap classes, route-specific global selectors in `styles/styles.css`, landing/navbar compatibility rules in `styles/globals.css`, and static inline hero styles.
- Auth modal ownership starts in `src/lib/components/LoginModal.js`, `src/lib/components/RegisterModal.js`, and `src/lib/components/ProfileCompletionModal.js`. The active styles live in `styles/styles.css` and mix app-owned `auth-*` selectors with Bootstrap button/modal classes.
- Dashboard route ownership starts at `src/pages/dashboard.js` and `src/domain/dashboard/pageShell.js`. Most visible dashboard UI uses Tailwind classes inside React components.
- Dashboard home ownership starts in `src/components/dashboard/home/`. Card and rail components use Tailwind plus the shared global `.dashboard-invitation-card` hook.
- Shared dashboard shell ownership starts in `src/components/DashboardLayout.jsx`, `src/components/DashboardHeader.jsx`, and `src/components/DashboardSidebar.jsx`. These files own dashboard chrome layout and runtime shell hooks.

Contract:
- Redesign work must not treat app-global CSS as the owner of new landing or dashboard visuals.
- Landing cleanup may reduce Bootstrap dependency later, but current Bootstrap behavior must be preserved until an explicit migration phase changes it.
- Dashboard redesign work must preserve shell runtime hooks and measured layout variables until editor/modal consumers are migrated with tests.
- `.dashboard-invitation-card` is a reusable dashboard UI primitive in the current implementation, not a landing hook and not a template/public invitation hook.

Detailed landing/dashboard ownership is documented in [LANDING_DASHBOARD_STYLING_MAP.md](LANDING_DASHBOARD_STYLING_MAP.md).

## 6. Template CSS Source Of Truth
Template CSS is different from app UI CSS. It represents invitation/template rendering, not dashboard/admin application UI.

Contract:
- Authored template CSS belongs under `plantillas/{templateId}/` or a future explicit template-source directory.
- Generated or copied public CSS belongs under `public/` or storage output paths and is treated as an artifact unless explicitly marked as authored source.
- `plantillas/{templateId}/index.html` and CSS should be internally consistent during local development.
- Remote Firebase-hosted CSS links inside local template source are compatibility-only and must not become the only source of truth.
- Identical template CSS copies must have a documented source and destination relationship.

Current risk:
- `plantillas/boda-clasica/css-boda-clasica.css` and `public/para-diseño/style.css` appear to be duplicate authored/generated copies. Older references may omit the accent as `para-diseno`, but the current checked-in folder is `public/para-diseño`.
- `plantillas/boda-clasica/index.html` links to a Firebase Storage CSS URL instead of the local CSS file.

Assumption:
- `plantillas/` is intended to represent authored or source template material, while `public/` contains served examples or generated/static artifacts. If this is wrong, this contract should be updated before any migration.

Migration direction:
- Define one template source root.
- Add a generation/copy step for public artifacts instead of manually maintaining duplicate CSS.
- Keep template CSS independent from app global CSS.

## 7. Generated And Public Invitation CSS
Generated/public invitation CSS is delivery artifact CSS. It should be treated differently from source CSS.

Contract:
- CSS emitted for published invitations is an artifact of the publish/render pipeline.
- Generated CSS should not be edited manually as the canonical fix for app or template styling.
- Fixes should happen in the generator, template source, or shared render contract, then regenerate artifacts.
- Public invitation CSS may contain broad selectors because it runs inside an isolated invitation document, not inside the dashboard app.
- Public invitation CSS must not rely on `styles/globals.css` or `styles/styles.css`.
- Generated artifact paths should be documented by the pipeline that writes them.

Allowed exceptions:
- Static demo files under `public/` may remain hand-maintained while they are not part of the active publish pipeline.
- Emergency production artifact corrections may be made outside this contract only when separately documented with the source follow-up required.

Assumption:
- Published invitations are ultimately served as stored HTML/CSS artifacts through backend/publication delivery, not as live Next-rendered React pages.

## 8. Inline Styles In Editor And Canvas
Inline styles are allowed in editor/canvas code when they represent runtime geometry, measured values, or user-authored visual data.

Allowed inline styles:
- Canvas/editor geometry: `top`, `left`, `width`, `height`, transforms, scale, viewport offsets, z-index, and measured dimensions.
- User-authored values from editor state, such as object color, font family, dynamic background, gradient, border, shadow, or crop state.
- CSS variables used to pass runtime numbers into a scoped component.
- Preview iframe or generated document runtime patches.
- Performance-sensitive canvas/Konva overlay positioning.
- Dashboard shell measured geometry, including `DashboardLayout` main sizing, `DashboardSidebar` mobile/desktop panel sizing, and the `--dashboard-header-height` bridge maintained by `DashboardHeader`.

Not allowed inline styles:
- Static app chrome styling that could be a Tailwind class or scoped CSS rule.
- Repeated static button/card/modal styling.
- New one-off colors, spacing, shadows, or font values unrelated to user-authored/editor runtime state.
- Workarounds for cascade conflicts that should be solved by ownership.

Rules:
- Inline styles in editor/canvas should be data-driven or measurement-driven.
- If an inline style becomes static across render paths, move it to Tailwind, a class constant, or scoped CSS.
- If an inline style must override generated content, document the runtime boundary.

## 9. Breakpoint And Responsive Ownership
The project currently mixes Tailwind breakpoints with hardcoded CSS media queries and Bootstrap-era breakpoints.

Contract:
- Tailwind breakpoints own React app UI responsiveness by default.
- CSS media queries are allowed for global base behavior, scoped CSS modules, third-party compatibility, and cases Tailwind cannot express cleanly.
- Bootstrap breakpoints may remain only in Bootstrap-dependent legacy surfaces.
- Hardcoded breakpoint values should be named or documented when introduced outside Tailwind.

Current breakpoint sources:
- Tailwind default prefixes such as `sm`, `md`, `lg`, and `xl` are widely used in app UI.
- `991px` exists for Bootstrap/navbar compatibility.
- `768px`, `576px`, `500px`, and height-based queries exist in legacy global CSS.
- Editor/canvas also uses viewport, safe-area, and measured layout values.

Rules:
- New dashboard/admin/editor React UI should prefer Tailwind responsive prefixes.
- New scoped CSS should reference documented breakpoint tokens once available.
- Do not add new unrelated hardcoded breakpoints to `styles.css`.
- Height-based queries are allowed for modal/editor fit constraints when documented.

Migration direction:
- Add breakpoint tokens to Tailwind config or a documented CSS token file.
- Map legacy `991px` to a named Bootstrap compatibility breakpoint if it remains necessary.

## 10. Tokens And Consistency
This contract does not change colors, fonts, spacing, shadows, or layout. It only defines where such values should live.

Contract:
- Repeated values should migrate toward named tokens.
- Tailwind `theme.extend` or a dedicated CSS token file should become the source for app UI tokens.
- Template tokens should remain separate from app UI tokens unless intentionally shared.
- Generated invitation tokens should be derived from template/editor data or generator defaults.

Current risk:
- Values are repeated across global CSS, Tailwind arbitrary values, inline styles, and generated/template CSS.
- `tailwind.config.js` currently has an empty `theme.extend`, so repeated app concepts are not codified there.

Assumption:
- Token migration should preserve current values exactly unless a separate design task authorizes visual changes.

## 11. Forbidden Patterns
Do not introduce:
- New global selectors for app components without a domain prefix.
- New global overrides of Bootstrap classes for app-owned UI.
- New unrelated rules in `styles/styles.css`.
- New broad element rules such as `section`, `h2`, `p`, `button`, `input`, or `footer` outside a base layer or explicit wrapper.
- New CSS that depends on import order as its primary isolation strategy.
- New duplicate template CSS copies without documenting source and artifact.
- Manual edits to generated/public invitation CSS as the canonical source fix.
- Static app UI styles as inline styles when Tailwind or scoped CSS is sufficient.
- New `!important` rules without a compatibility reason.
- Route-specific styles in `globals.css`.

## 12. Allowed Exceptions
Allowed exceptions must be narrow and documented.

Allowed:
- Current legacy Bootstrap-dependent landing/auth styles until migrated.
- Current `dashboard-invitation-card` global hook while shared by multiple dashboard card components.
- Current editor/canvas inline styles for runtime geometry and user-authored render data.
- Preview/publication iframe CSS injection when isolating generated documents or preserving preview parity.
- `!important` inside generated preview/runtime patches when needed to isolate iframe scroll and viewport behavior.
- Public invitation CSS broad selectors when the CSS runs inside isolated invitation HTML.
- Temporary migration wrappers, if they include an owner and removal condition.

## 13. Current Risks
- Global cascade conflicts between Tailwind base, Bootstrap, `globals.css`, and `styles.css`.
- `body` and base typography are defined in more than one place.
- `html, body` overflow and height are owned by legacy global CSS, while dashboard/editor surfaces also rely on local scroll roots and runtime shell sizing. Changes to body overflow can alter landing scroll, dashboard scroll, editor overlays, and modal locking.
- Generic global class names can collide with future app or template styles.
- Bootstrap class names are used as app styling hooks.
- Dashboard shell data attributes and `#sidebar-panel` are consumed by editor and modal code, so purely visual shell changes can cause runtime regressions.
- `.dashboard-invitation-card` is shared by dashboard hero, draft cards, publication cards, and template cards, so changing it is broader than changing one card.
- Template CSS has duplicate copies and unclear source/artifact ownership.
- Public/generated CSS can be mistaken for source CSS.
- Breakpoints are split between Tailwind defaults, Bootstrap compatibility values, and hardcoded media queries.
- Repeated colors, spacing, shadows, and font values are not represented as code-level tokens.
- Inline style usage is necessary in the editor but not clearly distinguished from static app UI styling.

## 14. Priority Order For Cleanup
1. Freeze `styles.css` as legacy compatibility: no new unrelated rules.
2. Maintain the landing/dashboard ownership map before visual redesign work starts.
3. Define app UI token ownership in Tailwind config or a dedicated token file, preserving existing values.
4. Move auth modal styles from global Bootstrap selectors to app-owned scoped classes.
5. Move landing page styles out of global Bootstrap overrides into route-owned or component-owned styling.
6. Keep or replace `dashboard-invitation-card` with an explicit shared dashboard card primitive.
7. Introduce CSS Modules only for components that need scoped selectors, pseudo-elements, or local keyframes.
8. Define the template CSS source root and artifact generation/copy process.
9. Remove duplicate template/public CSS copies once source/artifact ownership is established.
10. Document and centralize breakpoint names, including Bootstrap compatibility breakpoints.
11. Audit remaining `!important`, broad selectors, and inline static styles after ownership boundaries are in place.

## 15. Safe Phased Migration Plan

### Phase 0: Contract Freeze
- Add this document.
- Do not change CSS behavior.
- Treat `styles.css` as legacy compatibility.
- Require new style work to declare its owner: global, Tailwind component, scoped CSS, template source, generated artifact, or editor runtime.

### Phase 1: Inventory And Labels
- Label existing global CSS sections by owner: base, landing, auth, dashboard shared, editor compatibility, Bootstrap compatibility.
- Identify selectors that are unused or route-specific.
- Record duplicate template/public CSS source relationships.
- Keep `LANDING_DASHBOARD_STYLING_MAP.md` aligned with landing, dashboard, auth, dashboard card, and shell/runtime ownership.
- Preserve `[data-dashboard-header]`, `[data-dashboard-sidebar]`, `[data-dashboard-scroll-root]`, `#sidebar-panel`, `--dashboard-header-height`, and `.dashboard-invitation-card` unless all documented consumers are updated together.
- No visual changes.

### Phase 2: Token Codification
- Add existing repeated values to Tailwind `theme.extend` or a CSS token file.
- Preserve exact current values.
- Replace only low-risk repeated utility/arbitrary values when touching nearby code.
- Keep template tokens separate unless deliberately shared.

### Phase 3: App UI Isolation
- Stop adding Bootstrap class overrides.
- For touched components, move static component styles to Tailwind constants or CSS Modules.
- Replace app-owned styling hooks that use Bootstrap names with app-owned class names.
- Keep legacy class names only where markup still depends on Bootstrap behavior.

### Phase 4: Global CSS Reduction
- Move auth styles from global selectors into an auth-owned boundary.
- Move landing styles into a landing-owned boundary.
- Remove unused legacy dashboard/sidebar styles if verified unused.
- Keep only base, compatibility, and intentionally shared global hooks in global files.

### Phase 5: Template Source Cleanup
- Establish template source root and generated artifact destinations.
- Replace remote CSS links in local template sources when local source is expected.
- Generate/copy public artifacts from source instead of editing duplicates.
- Document exceptions for static demos.

### Phase 6: Enforcement
- Add lint/check rules for forbidden global selectors, duplicate selectors, `!important`, and new rules in legacy files.
- Add PR checklist items for CSS ownership.
- Periodically audit generated/public CSS to ensure fixes land in source or generator code.
