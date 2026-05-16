# Landing And Dashboard Styling Map

Phase: Safe landing/dashboard redesign preparation, Phase 3.

This document is an ownership map for the current implementation. It does not authorize visual redesign, behavior refactors, CSS movement, or generated invitation changes.

## 1. Source Documents Used

- `docs/architecture/ARCHITECTURE_GUIDELINES.md`
- `docs/architecture/ARCHITECTURE_OVERVIEW.md`
- `docs/architecture/CSS_ARCHITECTURE_CONTRACT.md`
- `docs/architecture/CSS_INVENTORY.md`
- `docs/architecture/SYSTEM_FRAGILITY_MAP.md`

## 2. Implementation Files Inspected

- `src/pages/index.js`
- `src/pages/index.module.css`
- `src/components/landing/LandingFeatureDetails.jsx`
- `src/components/landing/LandingFeatureDetails.module.css`
- `src/components/landing/LandingFooter.jsx`
- `src/components/landing/LandingFooter.module.css`
- `src/components/landing/LandingHero.jsx`
- `src/components/landing/LandingHero.module.css`
- `src/components/landing/LandingHowItWorks.jsx`
- `src/components/landing/LandingHowItWorks.module.css`
- `src/components/landing/LandingPricing.jsx`
- `src/components/landing/LandingPricing.module.css`
- `src/components/landing/LandingShareSection.jsx`
- `src/components/landing/LandingShareSection.module.css`
- `src/components/landing/LandingTemplateCarouselPrimitives.jsx`
- `src/components/landing/LandingTemplateShowcase.jsx`
- `src/components/landing/LandingTemplateShowcase.module.css`
- `src/components/dashboard/home/DashboardLandingCarouselSections.jsx`
- `src/components/dashboard/home/DashboardPublicationSummarySection.jsx`
- `src/components/dashboard/home/DashboardPublicationSummarySection.module.css`
- `src/components/appHeader/AppHeader.jsx`
- `src/components/appHeader/AppHeader.module.css`
- `src/pages/dashboard.js`
- `src/domain/dashboard/pageShell.js`
- `src/components/DashboardLayout.jsx`
- `src/components/DashboardHeader.jsx`
- `src/components/editor/header/CanvasEditorHeader.jsx`
- `src/components/DashboardSidebar.jsx`
- `src/components/dashboard/home/*`
- `src/components/dashboard/dashboardStyleClasses.js`
- `src/components/templates/TemplateCardShell.jsx`
- `src/lib/components/LoginModal.js`
- `src/lib/components/RegisterModal.js`
- `src/lib/components/ProfileCompletionModal.js`
- `src/pages/_app.js`
- `src/pages/_document.js`
- `styles/globals.css`
- `styles/styles.css`
- `tailwind.config.js`

## 3. Facts And Assumptions

Facts:

- `src/pages/_app.js` imports both `styles/globals.css` and `styles/styles.css`, so both files apply to the landing and dashboard app routes.
- `src/pages/_document.js` loads Bootstrap CSS/JS globally from CDN and also loads several Google Font families globally.
- `tailwind.config.js` scans `./src/**/*.{js,ts,jsx,tsx}`, uses `tailwind-scrollbar-hide`, and currently has an empty `theme.extend`.
- `src/components/appHeader/AppHeader.module.css` is the scoped style owner for the shared landing/dashboard visual header.
- `src/components/landing/LandingFeatureDetails.module.css` is the scoped style owner for the shared landing/dashboard feature-details section.
- `src/components/landing/LandingFooter.module.css` is the scoped style owner for the shared landing/dashboard footer.
- `src/components/landing/LandingHero.module.css` is the scoped style owner for the shared landing/dashboard hero.
- `src/components/landing/LandingHowItWorks.module.css` is the scoped style owner for the shared landing/dashboard "como funciona" step-circle section.
- `src/components/landing/LandingPricing.module.css` is the scoped style owner for the shared landing/dashboard pricing section.
- `src/components/landing/LandingShareSection.module.css` is the scoped style owner for the shared landing/dashboard share section.
- `src/components/landing/LandingTemplateShowcase.module.css` owns the landing-style template carousel primitives now shared by the landing page and the dashboard home post-summary carousel block.
- `src/components/dashboard/home/DashboardPublicationSummarySection.module.css` is the scoped style owner for the dashboard latest-publication summary below the hero.
- `src/pages/index.module.css` is the scoped style owner for the current landing main offset and remaining landing section styles.
- Phase 2 introduced `src/components/dashboard/dashboardStyleClasses.js` with exact current class recipes only. It does not define new token values or a design system.
- `DashboardHeader.jsx` remains the fixed header runtime shell owner and renders `CanvasEditorHeader.jsx` for editor-mode header content when a canvas/editor session is active.
- `AppHeader.jsx` owns shared visual header content for public landing and authenticated non-editor dashboard chrome only. It does not own editor runtime data attributes, header height measurement, shell layout, or editor selection preservation contracts.
- `CanvasEditorHeader.jsx` owns editor-specific header content and actions only; it does not own header measurement, dashboard runtime data attributes, selection preservation attributes, or `--dashboard-header-height`.
- Phase 3 was documentation-only. The later safe header refactor extracted the shared landing/dashboard visual header while leaving editor runtime, preview/publish, and generated invitation systems frozen.
- The public invitation route `/i/{slug}` is not a Next route; `firebase.json` rewrites it to the publication delivery Function. App global CSS must not be treated as public invitation CSS.

Assumptions:

- `src/pages/index.js` is the active landing route surface for the current landing page.
- Auth modals are included in the landing redesign preparation because the landing page opens `LoginModal` and `RegisterModal`.
- Future redesign work targets app UI surfaces only: landing, dashboard home, and shared dashboard shell. Editor, preview, publish, template source CSS, and generated invitation artifacts stay frozen unless a documented dependency requires a coordinated change.

## 4. Route Ownership

| Route/surface | Owner | Styling sources | Notes |
| --- | --- | --- | --- |
| Landing `/` | `src/pages/index.js` plus shared landing components | `AppHeader.module.css` for the shared header; `LandingHero.module.css` for the shared hero; `LandingFeatureDetails.module.css` for the shared feature-details section; `LandingHowItWorks.module.css` for the shared step-circle section; `LandingPricing.module.css` for the shared pricing section; `LandingShareSection.module.css` for the shared share section; `LandingFooter.module.css` for the shared footer; `src/pages/index.module.css`, Bootstrap classes, `styles/styles.css`, and `styles/globals.css` for remaining sections | Header visual content is extracted to `AppHeader`. Hero visual content is extracted to `LandingHero`. The feature-details section is extracted to `LandingFeatureDetails`. The how-it-works section is extracted to `LandingHowItWorks`. The pricing section is extracted to `LandingPricing`. The share section is extracted to `LandingShareSection`. The footer is extracted to `LandingFooter`. Auth notice and modal entry remain in the route file. |
| Dashboard `/dashboard` | `src/pages/dashboard.js` plus `src/domain/dashboard/pageShell.js` | Tailwind classes in JSX, dashboard shell props, shared global dashboard card hook | The route coordinates dashboard home, editor mount, publications/trash/admin views, preview modal, and checkout modal. |
| Dashboard home | `src/components/dashboard/home/DashboardHomeView.jsx` and child components | `LandingHero.module.css` for the shared hero; `DashboardPublicationSummarySection.module.css` for the latest-publication summary; `LandingTemplateShowcase.module.css` through `LandingTemplateCarouselPrimitives.jsx` for the post-summary carousel block; `LandingHowItWorks.module.css` for the shared step-circle section; `LandingPricing.module.css` for the shared pricing section; `LandingFeatureDetails.module.css` for the shared feature-details section; `LandingShareSection.module.css` for the shared share section; `LandingFooter.module.css` for the shared footer | Owns placement of the shared hero, latest-publication summary, landing-style carousel sections, shared how-it-works section, shared pricing section, shared feature-details section, shared share section, and shared footer. |
| Shared dashboard shell | `DashboardLayout.jsx`, `DashboardHeader.jsx`, `AppHeader.jsx`, `CanvasEditorHeader.jsx`, `DashboardSidebar.jsx` | Tailwind shell classes, `AppHeader.module.css` for non-editor dashboard header visuals, measured inline layout styles, data attributes, `--dashboard-header-height` | This is both visual chrome and a runtime boundary for editor overlays, toolbar placement, selection preservation, and modal scroll locking. `DashboardHeader.jsx` owns the runtime shell; `AppHeader.jsx` owns non-editor dashboard header visuals; `CanvasEditorHeader.jsx` owns only editor header content. |
| Auth modals | `LoginModal.js`, `RegisterModal.js`, `ProfileCompletionModal.js` | `styles/styles.css`, Bootstrap button/modal classes, small inline styles | These modals use global `auth-*` styles plus generic `.modal-content`, `.close-btn`, `.error`, and Bootstrap `.btn-*`. |

## 5. Component Ownership

| Component/file | Current role | Styling ownership | Redesign note |
| --- | --- | --- | --- |
| `src/pages/index.js` | Landing page structure and auth modal triggers; passes public header configuration to `AppHeader` and renders shared landing sections | `LandingHero.module.css` for the shared hero; `LandingFeatureDetails.module.css` for the shared feature-details section; `LandingHowItWorks.module.css` for the shared step-circle section; `LandingPricing.module.css` for the shared pricing section; `LandingShareSection.module.css` for the shared share section; `LandingFooter.module.css` for the shared footer; `src/pages/index.module.css` for current main/remaining section styles; Bootstrap + global landing selectors for remaining sections | Header, hero, feature-details, how-it-works, pricing, share, and footer markup are no longer inline here. Remaining sections still need migration out of globals later. |
| `src/components/appHeader/AppHeader.jsx` | Shared visual header for public landing and authenticated non-editor dashboard chrome | `src/components/appHeader/AppHeader.module.css` | Visual-only owner. Does not own editor runtime attributes, header measurement, scroll roots, sidebar geometry, or preview/publish behavior. |
| `src/pages/dashboard.js` | Dashboard route orchestrator and view composition | Tailwind wrappers and state-dependent view containers | Avoid broad visual rewrites here; prefer child-component ownership later. |
| `src/domain/dashboard/pageShell.js` | Dashboard view/layout prop derivation | No direct CSS; controls shell props such as `modoSelector`, `ocultarSidebar`, and `lockMainScroll` | Behavior boundary. Do not change during visual cleanup unless preserving exact view behavior. |
| `DashboardLayout.jsx` | Fixed dashboard frame, main scroll root, child composition | Tailwind classes, inline main sizing, `[data-dashboard-scroll-root]` | Runtime-critical shell owner. |
| `DashboardHeader.jsx` | Fixed measured dashboard/editor header shell and editor header mounting point; passes non-editor dashboard header config to `AppHeader` | Tailwind shell classes and runtime header-height variable; non-editor visual content comes from `AppHeader.module.css` | Runtime-critical hook owner. Keeps `[data-dashboard-header]`, `[data-preserve-canvas-selection]`, header refs, and measured height ownership. |
| `CanvasEditorHeader.jsx` | Editor/canvas header visual content, editor action buttons, document name controls, mobile editor options sheet | Tailwind classes and file-local editor header class recipes | Editor header content owner only. Safe future redesign target as long as shell hooks and callbacks remain stable. |
| `DashboardSidebar.jsx` | Editor tool rail, mobile toolbar, sidebar panel | Tailwind classes, inline panel/mobile geometry, `[data-dashboard-sidebar]`, `#sidebar-panel` | Runtime-critical hook owner. |
| `src/components/landing/LandingHero.jsx` | Shared landing/dashboard hero CTA | `src/components/landing/LandingHero.module.css` plus legacy landing hook class names retained on DOM | Shared visual primitive for the landing hero and dashboard home hero placement. |
| `src/components/landing/LandingFeatureDetails.jsx` | Shared landing/dashboard feature-details section | `src/components/landing/LandingFeatureDetails.module.css` | Shared visual primitive rendered in the landing route and below dashboard home pricing. Dashboard opts into the split background variant that connects the lower half of the feature cards with the share section. |
| `src/components/landing/LandingFooter.jsx` | Shared landing/dashboard footer | `src/components/landing/LandingFooter.module.css` | Shared visual footer rendered in the landing route and at the bottom of dashboard home with route-local nav items. |
| `src/components/landing/LandingHowItWorks.jsx` | Shared landing/dashboard how-it-works step-circle section | `src/components/landing/LandingHowItWorks.module.css` | Shared visual primitive rendered in the landing route and below dashboard home carousels. |
| `src/components/landing/LandingPricing.jsx` | Shared landing/dashboard pricing section | `src/components/landing/LandingPricing.module.css` | Shared visual primitive rendered in the landing route and below the dashboard home how-it-works section. |
| `src/components/landing/LandingShareSection.jsx` | Shared landing/dashboard share section | `src/components/landing/LandingShareSection.module.css` | Shared visual primitive rendered in the landing route and below dashboard home feature-details. The CTA target is supplied by each surface. |
| `src/components/landing/LandingTemplateCarouselPrimitives.jsx` | Shared landing-style carousel rail/card/modal primitives | `src/components/landing/LandingTemplateShowcase.module.css` | Visual primitive reused by the landing template showcase and dashboard home carousel block. |
| `DashboardLandingCarouselSections.jsx` | Dashboard home post-summary carousel composition | `src/components/landing/LandingTemplateShowcase.module.css` through shared primitives plus dashboard error class constant | Maps dashboard publicadas, borradores, and template sections to landing-style rails without using `.dashboard-invitation-card*`. |
| `DashboardPublicationSummarySection.jsx` | Dashboard home summary for the latest active publication | `src/components/dashboard/home/DashboardPublicationSummarySection.module.css` | Scoped app UI owner. Avoids `.dashboard-invitation-card*`, global CSS, editor hooks, preview/publish, and generated invitation CSS. |
| `DashboardSectionShell.jsx` | Reusable dashboard section panel | Tailwind classes | Legacy dashboard panel primitive; no longer used by dashboard home post-summary carousels. |
| `HorizontalRail.jsx` / `InfiniteTemplateRail.jsx` | Horizontal scroll rails | Tailwind classes and wheel-to-horizontal behavior | Legacy dashboard home rails remain available but the current dashboard home carousel block uses landing carousel primitives. |
| `DashboardDraftRailSection.jsx` | Legacy draft cards rail | Tailwind classes plus `.dashboard-invitation-card*` | No longer used by dashboard home after the landing-style carousel replacement. |
| `DashboardPublicationRailSection.jsx` | Legacy publication cards rail | Tailwind classes plus `.dashboard-invitation-card*` | No longer used by dashboard home after the landing-style carousel replacement. |
| `DashboardTemplateRailSection.jsx` | Legacy template section composition | Tailwind classes and `TemplateCardShell` | No longer used by dashboard home after the landing-style carousel replacement. |
| `dashboardStyleClasses.js` | Exact shared dashboard class recipes | Existing class strings for dashboard invitation card shell/media/title and dashboard home error panel | Phase 2 helper only. Changing values is visual redesign work. |
| `TemplateCardShell.jsx` | Reusable template card shell | Tailwind classes plus `.dashboard-invitation-card*` | Shared card primitive candidate. |

## 6. CSS Ownership

### Route-Owned Styles

Current route-owned styling is incomplete:

- Landing header styles are owned by `src/components/appHeader/AppHeader.module.css`; shared landing/dashboard hero styles are owned by `src/components/landing/LandingHero.module.css`; shared feature-details styles are owned by `src/components/landing/LandingFeatureDetails.module.css`; shared how-it-works styles are owned by `src/components/landing/LandingHowItWorks.module.css`; shared pricing styles are owned by `src/components/landing/LandingPricing.module.css`; shared share-section styles are owned by `src/components/landing/LandingShareSection.module.css`; shared footer styles are owned by `src/components/landing/LandingFooter.module.css`; current landing main/remaining section static styles are owned by `src/pages/index.module.css`; the remaining landing route styles are functionally route-owned by `src/pages/index.js`, but still physically live in app-global CSS.
- Dashboard home styles are split between shared landing primitives and focused dashboard modules: hero via `LandingHero.module.css`, latest-publication summary via `DashboardPublicationSummarySection.module.css`, post-summary carousels via `LandingTemplateShowcase.module.css` through `LandingTemplateCarouselPrimitives.jsx`, how-it-works via `LandingHowItWorks.module.css`, pricing via `LandingPricing.module.css`, feature-details via `LandingFeatureDetails.module.css`, share via `LandingShareSection.module.css`, and footer via `LandingFooter.module.css`.
- Dashboard shell styles are component-owned Tailwind/inline runtime geometry plus runtime selectors consumed by editor/modal systems.
- The authenticated non-editor dashboard header visual content is owned by `AppHeader.module.css`; the fixed shell, height measurement, and runtime attributes remain in `DashboardHeader.jsx`.

### App-Global Styles

`styles/globals.css` currently owns:

- Tailwind directives.
- Roboto font import and body base rule.
- Editor/canvas compatibility selectors: `canvas` and `textarea[style*="position: absolute"]`.
- Legacy landing/Bootstrap navbar compatibility: `.navbar-collapse`, `.navbar-nav`, `.nav-link`, `.navbar-collapse .btn`, and `slideUp`. The shared `AppHeader` no longer uses these hooks.
- Dashboard shared card hook: `.dashboard-invitation-card`, `.dashboard-invitation-card__media`, `.dashboard-invitation-card__overlay`, `.dashboard-invitation-card__title`, `.dashboard-invitation-card__action`.
- Global keyframes: `spin` and `fadeInScale`.

`styles/styles.css` currently owns:

- Legacy reset and `html, body` sizing/overflow/typography.
- Legacy dashboard/sidebar candidates: `.layout`, `.sidebar`, `.main`, `.main-card`.
- Auth modal/global modal styles.
- Legacy landing navbar selectors, hero, invitation examples, features, how-it-works, CTA, footer, and inactive/commented landing section candidates. The shared `AppHeader` does not use the legacy `.navbar*` hooks.
- Broad element selectors such as `section`, `h2, h3, p`, and `footer`.

### Legacy CSS

Legacy CSS means current global CSS that remains for compatibility but should not receive unrelated new styles:

- `styles/styles.css` as a whole.
- Bootstrap namespace overrides in both global CSS files.
- Generic selectors such as `.step`, `.icon`, `.error`, `.close-btn`, `.layout`, `.sidebar`, `.main`, `.main-card`, `.price`, `.premium`, `.highlight`, and `.gallery-item`.
- Inactive/commented landing section CSS such as pricing/testimonial/contact candidates.

### Reusable UI Primitives

Current reusable primitives are informal:

- `AppHeader.jsx` plus `AppHeader.module.css` is the shared visual primitive for landing and authenticated non-editor dashboard headers.
- `.dashboard-invitation-card*` is a global reusable dashboard card primitive.
- `src/components/dashboard/dashboardStyleClasses.js` centralizes exact current class strings for the shared dashboard card shell, card media, card title, and dashboard home error panel.
- `DashboardSectionShell.jsx` is a reusable dashboard section shell.
- `TemplateCardShell.jsx` is a reusable template card shell used by dashboard template rails.
- Header/sidebar button class constants inside `CanvasEditorHeader.jsx`, `DashboardHeader.jsx`, and `DashboardSidebar.jsx` are file-local reusable recipes.

Future cleanup should formalize these without changing output first.

## 7. Global Hooks And Runtime-Critical Selectors

These hooks must remain stable during landing/dashboard cleanup unless every consumer is updated and tested in the same change.

| Hook | Owner | Current consumers | Breakage risk |
| --- | --- | --- | --- |
| `[data-dashboard-header="true"]` | `DashboardHeader.jsx` | `src/components/editor/overlays/useOptionButtonPosition.js` | Editor option controls use the header node and height to avoid the fixed header. Removing or changing it can place overlays under chrome. |
| `[data-dashboard-sidebar="true"]` | `DashboardSidebar.jsx` | `selectionPreservationPolicy.js`, `MenuOpcionesElemento.jsx` | Sidebar interactions preserve canvas selection and element menus calculate sidebar collision offsets from it. |
| `[data-dashboard-scroll-root="true"]` | `DashboardLayout.jsx` | `ConfirmDeleteItemModal.jsx` | Delete-confirm modal locks and restores dashboard scroll/touch behavior on this root. |
| `#sidebar-panel` | `DashboardSidebar.jsx` | `selectionPreservationPolicy.js`, `FloatingTextToolbarView.jsx` | Floating text toolbar and selection preservation use the panel as a geometry/preserve target. |
| `--dashboard-header-height` | `DashboardHeader.jsx` writes it; `DashboardLayout.jsx`, `DashboardSidebar.jsx`, and editor overlay code read it | Shell layout, sidebar panel sizing, floating toolbar top offset, option button positioning | Incorrect values can break main content height, sidebar height, and editor toolbar positions. |
| `[data-preserve-canvas-selection="true"]` | Dashboard header and several editor/color/tool UI components | `selectionPreservationPolicy.js` | Clicks inside these UI islands must not clear canvas selection. |
| `.dashboard-invitation-card*` | `styles/globals.css` | Draft cards, publication cards, template card shell | Shared card motion/media/title/action styles; visual edits are cross-surface. |

## 8. Bootstrap Dependencies

Bootstrap is loaded globally from `src/pages/_document.js`, not scoped to the landing route.

Current Bootstrap-dependent surfaces:

- Remaining landing layout sections: `container`, `container-fluid`, `row`, `col-*`, `text-center`, `img-fluid`, `w-100`, `d-flex`, spacing utilities, and grid classes. The extracted `AppHeader` no longer uses Bootstrap navbar classes.
- Legacy navbar CSS remains in global styles as a removal risk until unused Bootstrap/header compatibility is verified.
- Landing/auth buttons: `btn`, `btn-primary`, `btn-outline-dark`, `btn-link`, `w-100`, `mt-2`, `position-relative`.
- Auth modal styling: `modal-content` is targeted globally in `styles/styles.css`.

Risk:

- Any global override of Bootstrap class names can affect landing, auth modals, and any future app component that accidentally uses Bootstrap names.
- Bootstrap CSS is loaded before app globals, but isolation currently depends on import/order and selector specificity, not route ownership.

## 9. Tailwind Ownership

Tailwind currently owns most dashboard React UI:

- Dashboard route wrappers and startup/loading states in `src/pages/dashboard.js`.
- Dashboard layout/header/sidebar class strings and local class constants.
- Canvas editor header content class strings in `src/components/editor/header/CanvasEditorHeader.jsx`; runtime header shell classes remain in `DashboardHeader.jsx`.
- Dashboard home hero, section shells, rails, cards, error/empty states, badges, and buttons.
- Template card shell used by dashboard template rails.

Tailwind does not currently provide app tokens:

- `tailwind.config.js` has an empty `theme.extend`.
- Repeated colors, shadows, rounded values, and gradients are encoded as utility strings and arbitrary values in components.

Phase 2 cleanup should preserve exact current values before introducing any visual redesign.

## 10. Inline-Style Exceptions

Current inline styles observed:

- Shared landing/dashboard hero static styles live in `src/components/landing/LandingHero.module.css`; shared feature-details, how-it-works, pricing, share, and footer section styles live in `LandingFeatureDetails.module.css`, `LandingHowItWorks.module.css`, `LandingPricing.module.css`, `LandingShareSection.module.css`, and `LandingFooter.module.css`; remaining landing main/section styles live in `src/pages/index.module.css` or legacy app-global CSS.
- Auth modals use small static inline styles for Google button spinner placement and simple spacing.
- `DashboardLayout.jsx` uses inline styles for measured main area margin/height/top/overflow/touch behavior.
- `DashboardHeader.jsx` writes `--dashboard-header-height` on the document root and uses static inline avatar background color.
- `DashboardSidebar.jsx` uses inline styles for z-index/safe-area padding, mobile toolbar mask behavior, and panel top/height/overflow.

Contract interpretation:

- Dashboard shell measured geometry is an allowed runtime exception.
- Static landing/auth/header inline styles are cleanup candidates, but moving them is not Phase 2 work.
- Do not add new static app chrome inline styles during redesign preparation.

## 11. Forbidden Touch Points During Redesign Prep

Do not change these during landing/dashboard visual preparation without a separate coordinated plan:

- Editor runtime files, selection model, drag/inline editing behavior, or window bridge contracts.
- Preview/publish generators, prepared render payload helpers, validation helpers, and generated invitation HTML/CSS.
- Template source CSS and public/static invitation CSS, except to document source/artifact relationships.
- `[data-dashboard-header]`, `[data-dashboard-sidebar]`, `[data-dashboard-scroll-root]`, `#sidebar-panel`, `[data-preserve-canvas-selection]`, and `--dashboard-header-height`.
- Body/html overflow, root height, dashboard scroll root locking, or modal scroll locking without manual editor/modal checks.
- Global Bootstrap class overrides such as `.btn-primary`, `.navbar-*`, `.modal-content`, `.container`, `.row`, `.col-*`, `.d-flex`.
- `.dashboard-invitation-card*` unless the change is intended to affect all documented dashboard card/template-card consumers.

## 12. Redesign-Safe Zones

Safe means lower-risk ownership for a future phased redesign, not safe to change without review.

| Zone | Why lower risk | Required guardrail |
| --- | --- | --- |
| Landing route markup inside `src/pages/index.js` | It is route-local JSX | First isolate ownership from global Bootstrap/broad selectors; preserve current behavior until redesign phase. |
| Dashboard home child components | They are mostly component-local Tailwind | Preserve data loading states, rail behavior, and shared card hook until formalized. |
| Canvas editor header content | It is isolated in `src/components/editor/header/CanvasEditorHeader.jsx` | Preserve callbacks, mobile sheet behavior, document-name behavior, and the `DashboardHeader.jsx` runtime shell hooks. |
| `DashboardSectionShell.jsx` | Focused reusable dashboard UI wrapper | Keep visual output identical during Phase 2 extraction/token work. |
| `TemplateCardShell.jsx` | Focused reusable card shell | Coordinate with `.dashboard-invitation-card` consumers. |
| Header/sidebar local class constants | Repeated recipes are local to files | Preserve runtime hooks and geometry variables. |

## 13. Global Leakage

Selectors currently leaking globally into unrelated app surfaces:

- `*`, `html, body`, `body`
- `section`
- `h2, h3, p`
- `footer`, `footer p`
- `.btn-primary`
- `.modal-content`
- `.navbar`, `.navbar-brand`, `.navbar-nav .nav-link`, `.navbar-toggler`, `.navbar .container`, `.navbar .d-flex`
- `.layout`, `.sidebar`, `.main`, `.main-card`
- `.close-btn`, `.error`
- `.step`, `.icon`
- `.testimonial`, `.price`, `.premium`, `.highlight`, `.not-included`
- `.gallery-item`, `.icon-img`

These selectors are not immediate deletion targets. They are migration risks because they are app-wide today.

## 14. Dependency Graph: Dashboard Shell And Editor Systems

```text
DashboardHeader.jsx
  -> writes --dashboard-header-height
  -> exposes [data-dashboard-header="true"]
  -> exposes [data-preserve-canvas-selection="true"]
  -> renders AppHeader.jsx for non-editor dashboard visual content
  -> renders CanvasEditorHeader.jsx for editor-mode header content
  -> consumed by DashboardLayout.jsx, DashboardSidebar.jsx, useOptionButtonPosition.js,
     FloatingTextToolbarView.jsx, and selection preservation policy

AppHeader.jsx
  -> owns shared landing/dashboard visual header content
  -> uses AppHeader.module.css
  -> does not expose editor runtime hooks or measure shell height

CanvasEditorHeader.jsx
  -> owns editor-specific header visual content/actions only
  -> receives callbacks and state from DashboardHeader.jsx
  -> does not write --dashboard-header-height or expose dashboard shell hooks

DashboardLayout.jsx
  -> reads --dashboard-header-height for main sizing
  -> exposes [data-dashboard-scroll-root="true"]
  -> consumed by ConfirmDeleteItemModal.jsx for scroll/touch locking

DashboardSidebar.jsx
  -> reads --dashboard-header-height for shell/panel sizing
  -> exposes [data-dashboard-sidebar="true"]
  -> exposes #sidebar-panel
  -> consumed by selectionPreservationPolicy.js, MenuOpcionesElemento.jsx,
     and FloatingTextToolbarView.jsx

selectionPreservationPolicy.js
  -> treats [data-preserve-canvas-selection="true"], [data-dashboard-sidebar="true"],
     and #sidebar-panel as UI islands that should not clear canvas selection

Editor overlay/toolbar code
  -> measures dashboard header/sidebar/panel hooks to position option menus and text toolbars
```

## 15. Current Value Inventory

This is an inventory of current repeated values only. It does not create new brand tokens and does not authorize visual changes. Future token names may be introduced later, but the first migration step must preserve these exact values.

### 15.1 Colors And Backgrounds

| Value | Current use | Current owner/status |
| --- | --- | --- |
| `#773dbe` | `--secondary-color`, landing register/primary button color, dashboard avatar fallback, dashboard controls | Existing app purple value; no Tailwind token owner. |
| `#6f3bc0` | Dashboard focus rings, card action text, spinner top border, section eyebrow text, template rail badges | Existing dashboard accent; repeated as Tailwind arbitrary value. |
| `#5f3596` | Dashboard sidebar labels and sidebar hover text | Existing dashboard sidebar accent. |
| `#503d84`, `#3e2e6c`, `#4b2990` | Landing/auth/session button and legacy dashboard candidates | Legacy global CSS values in `styles/styles.css`. |
| `#d7b8e8`, `#d8c3f5`, `#d8ccea`, `#d9c5f6`, `#ddd2f5`, `#dfcff8`, `#e0d9fb`, `#e6dbf8`, `#e7dcf8`, `#ede4fb`, `#eadff8` | Landing primary color, dashboard focus/border/sheet/sidebar values | Existing light-purple family; not normalized. |
| `#faf6ff`, `#faf7ff`, `#faf9ff`, `#f4edff`, `#f4f0fe`, `#f4f8ff`, `#f7f2ff`, `#f8f7ff`, `#f8f9fa`, `#f9fafc` | Dashboard and auth soft backgrounds, legacy app base background | Mixed landing/auth/dashboard values. |
| `#ffffff`, `#333333`, `#3a2a60`, `#0f172a`, `#334155`, `#344054`, `#475467`, `#64748b`, `#667085` | Landing text/background, auth text, dashboard text | Mixed legacy CSS and Tailwind semantic colors. |
| `#b42318`, `#b91c1c`, `#fef3f2`, `#fecdd3`, `#dc2626`, `#ef4444`, `#fef2f2`, `#991b1b` | Auth and dashboard error states | Existing error palette; no shared app token yet. |
| `#ecfdf3`, `#166534`, `#bbf7d0`, `#fffbeb`, `#92400e`, `#fde68a`, `#f59e0b` | Auth success/warning and dashboard status states | Existing semantic status values. |
| `linear-gradient(to bottom, rgba(215, 184, 232, 0.8), rgba(255, 255, 255, 1))` | Legacy `--background-gradient` | Legacy landing/auth CSS variable. |
| `linear-gradient(155deg, #ffffff 0%, #faf9ff 100%)` | Auth modal background | Auth-owned future token candidate. |
| `linear-gradient(145deg, #6f5ba8 0%, #7f64b3 100%)` | Auth primary action | Auth-owned future token candidate. |
| Dashboard arbitrary gradients such as `from-[#8a57cf] via-[#773dbe] to-[#6433b0]`, `from-[#faf7ff] to-[#f4edff]`, and `from-white via-[#faf6ff] to-[#f4f8ff]` | Dashboard hero, sidebar, and `CanvasEditorHeader.jsx` mobile sheet | Dashboard-owned future token candidates; keep exact during cleanup. |

### 15.2 Radius, Shadows, Motion, And Borders

| Value | Current use | Current owner/status |
| --- | --- | --- |
| `4px`, `8px`, `10px`, `11px`, `12px`, `14px`, `16px`, `30px`, `50%`, `999px` | Legacy auth, landing buttons/cards, legacy sections, auth pills/spinners | Legacy global CSS values. |
| `rounded-2xl`, `rounded-[16px]`, `rounded-[18px]`, `rounded-[24px]`, `rounded-[28px]`, `rounded-[30px]` | Dashboard cards, buttons, header sheets, section shells, loaders | Dashboard Tailwind values; not normalized. |
| `0 2px 8px rgba(0, 0, 0, 0.06)`, `0 4px 10px rgba(0, 0, 0, 0.2)`, `0 6px 15px rgba(0, 0, 0, 0.3)`, `0 8px 24px rgba(0, 0, 0, 0.1)` | Landing navbar/buttons and legacy cards | Legacy global CSS shadows. |
| `0 28px 60px rgba(15, 23, 42, 0.18)`, `0 18px 44px rgba(15, 23, 42, 0.14)` | Auth modal and auth transition card | Auth-owned future token candidates. |
| `shadow-[0_2px_8px_rgba(15,23,42,0.06)]` | Shared dashboard invitation card class recipe | Current exact card recipe in `dashboardStyleClasses.js`. |
| `shadow-[0_18px_45px_rgba(15,23,42,0.06)]`, `shadow-[0_18px_44px_rgba(111,59,192,0.1)]`, `shadow-[0_10px_24px_rgba(95,53,150,0.08)]`, `shadow-[0_12px_20px_rgba(119,61,190,0.22)]` | Dashboard home sections, hero, sidebar, CTA | Dashboard current-value token candidates. |
| `--dashboard-card-duration: 160ms`, `--dashboard-card-easing: cubic-bezier(0.22, 1, 0.36, 1)` | Shared dashboard card hover/active transitions | Current global dashboard primitive values. |
| `--dashboard-card-shadow-hover: 0 0 0 2px #ffffff, 0 0 0 4px #6f3bc0, 0 8px 20px rgba(0, 0, 0, 0.08)` | Dashboard card hover state | Runtime-visible card primitive value; do not change in preparation. |
| `--dashboard-card-shadow-active: 0 0 0 1px #ffffff, 0 0 0 3px #6f3bc0, 0 6px 14px rgba(0, 0, 0, 0.07)` | Dashboard card active state | Runtime-visible card primitive value; do not change in preparation. |

### 15.3 Spacing, Dimensions, Breakpoints, And Scroll

| Value | Current use | Current owner/status |
| --- | --- | --- |
| `100vh`, `100dvh`, `min(94dvh, 860px)`, `height: 100%`, `overflow-x: hidden` | Landing hero, auth modal, global body/html ownership | Body/html and modal scroll changes are high risk. |
| `80px 20px`, `40px 20px`, `12px 40px`, `10px 22px` | Legacy landing sections/buttons | Legacy landing global CSS values. |
| `max-w-7xl`, `space-y-8`, `px-4`, `pb-10`, `pt-4`, `sm:px-6`, `lg:px-8` | Dashboard home page wrapper | Dashboard home route/component values. |
| `p-5 sm:p-6`, `mt-5`, `gap-4` | Dashboard section shell and rails | Dashboard component-owned values. |
| `w-[220px] sm:w-[236px] lg:w-[248px]` | Draft card and default template rail width | Current dashboard rail card width recipe. |
| `w-[240px] sm:w-[256px] lg:w-[270px]` | Publication card width | Current dashboard publication rail width recipe. |
| `w-[220px] sm:w-[236px] lg:w-[248px] xl:w-[258px]` | Infinite template rail item width | Current template rail width recipe. |
| `991px` | Legacy Bootstrap navbar breakpoint | Bootstrap compatibility breakpoint in global CSS. |
| `768px` | Dashboard mobile/editor breakpoint constants in `DashboardHeader.jsx` and `DashboardSidebar.jsx` | Runtime/dashboard shell breakpoint; align with tests before changing. |
| `576px`, `500px`, `760px` | Legacy CSS and auth modal responsive/height queries | Legacy global CSS values. |
| `--dashboard-header-height` with fallback `52px` | Dashboard shell layout, sidebar height, editor overlay offsets | Runtime CSS variable, not a design token. Must remain stable. |
| `MOBILE_BAR_HEIGHT_PX = 96`, `MOBILE_PANEL_GUTTER_PX = 8`, `MOBILE_PANEL_BOTTOM_EXTRA_PX = 2`, `MOBILE_SCROLL_FADE_WIDTH_PX = 92` | Dashboard sidebar mobile toolbar/panel geometry | Runtime-sensitive constants in `DashboardSidebar.jsx`; do not change during redesign prep. |
| Mobile sidebar panel `height: min(52vh, 440px)` and desktop panel `width: 18rem` | `#sidebar-panel` geometry | Editor toolbar and selection preservation depend on this panel geometry. |
| Dashboard main `height: calc(100vh - var(--dashboard-header-height, 52px))` | `DashboardLayout.jsx` main scroll root | Runtime shell value. |

### 15.4 Typography And Font Ownership

| Value | Current use | Current owner/status |
| --- | --- | --- |
| Bootstrap CDN plus Google Fonts in `_document.js`: Montserrat, Poppins, Raleway, Playfair Display, Roboto | Global page font availability | Global dependency; not route-scoped. |
| `styles/globals.css` `@import` for Roboto | App base/body font | Duplicates `_document.js`; investigate before changing. |
| `styles/globals.css` `body { font-family: 'Roboto', sans-serif; }` | App base body font | Conflicts with `styles/styles.css` body font ownership. |
| `styles/styles.css` `html, body { font-family: 'Montserrat', sans-serif; text-align: center; }` | Legacy landing/body base | Global leak into all Next routes. |
| Auth modal `font-family: "Poppins", "Segoe UI", sans-serif` on headings | Auth modal headings | Auth-owned future token candidate. |
| Dashboard Tailwind text utilities such as `text-[11px]`, `text-sm`, `text-2xl`, `tracking-[0.18em]`, `tracking-[0.08em]` | Dashboard home/shell typography | Dashboard component-owned utilities; no Tailwind font token layer yet. |

### 15.5 Z-Index And Runtime-Sensitive Layers

| Value | Current use | Current owner/status |
| --- | --- | --- |
| `z-index: 9999` | Auth `.modal-backdrop` | Global modal layer; can affect app overlays if changed. |
| `z-index: 11000` | Auth transition overlay | Auth/login redirect flow overlay. |
| `z-index: 1000` | Landing `AppHeader` and legacy `.navbar.fixed-top` | Current fixed header layer plus Bootstrap-era legacy layer. |
| `z-index: 2000` | Mobile `.navbar-collapse.show` in `globals.css` | Legacy landing mobile menu layer; not used by `AppHeader`. |
| `z-50` and inline `style={{ zIndex: 45 }}` | Dashboard header/sidebar shell | Runtime shell layering; editor overlays rely on consistent geometry and stacking. |
| `z-40`, `z-[60]` | Sidebar panel and panel close control | `#sidebar-panel` layer; used by editor toolbar and selection preservation. |

Phase 2 helper constants:

- `DASHBOARD_INVITATION_CARD_CLASS`
- `DASHBOARD_INVITATION_CARD_MEDIA_CLASS`
- `DASHBOARD_INVITATION_CARD_TITLE_CLASS`
- `DASHBOARD_HOME_ERROR_PANEL_CLASS`

These constants preserve exact class strings. They are not Tailwind theme tokens, not a design system, and not permission to change values.

## 16. Phase 3 Styling Boundary Decisions

### 16.1 Landing Boundary

Current landing route-specific styles are partially physically global:

- Route structure and behavior live in `src/pages/index.js`.
- Legacy landing navbar/section CSS lives primarily in `styles/styles.css`.
- Legacy landing mobile navbar compatibility also lives in `styles/globals.css`, but the extracted `AppHeader` does not use those hooks.
- The hero background/layout/color now lives in `src/components/landing/LandingHero.module.css`.
- Bootstrap classes such as `container`, `row`, `col-*`, `d-flex`, `btn`, and `btn-primary` are still active in the landing markup outside the extracted header.

Future target boundary:

- Landing visual styles should become landing-owned before the visual redesign changes values.
- The target owner should start from the landing route and future landing components, not from app-global selectors.
- Bootstrap-compatible class names may remain during the first landing redesign step, but new app-owned landing styles should use explicit landing-owned hooks or component-local Tailwind.
- Do not move or delete the current global landing selectors until screenshots confirm an equivalent current-output baseline.

Assumption:

- A future landing refactor may split `src/pages/index.js` into landing components, but that split is not required before the first visual redesign if the CSS ownership boundary is documented and guarded.

### 16.2 Auth Modal Boundary

Auth modal styles should become auth-owned and separate from landing. They should not be treated as landing-owned even though the landing page opens `LoginModal` and `RegisterModal`.

Reasons:

- `LoginModal.js`, `RegisterModal.js`, and `ProfileCompletionModal.js` are reusable auth UI, not landing content sections.
- Auth styles mix app-owned `auth-*` selectors with generic `.modal-content`, `.close-btn`, `.error`, `.btn-outline-dark`, `.btn-google`, and Bootstrap button behavior.
- Global modal and body/scroll behavior can interact with dashboard modals and editor overlays.
- Bootstrap is still required for current auth markup/classes, so Bootstrap reduction should happen after an auth-owned wrapper or scoped selector boundary exists.

Future target boundary:

- Keep current auth output unchanged during preparation.
- First isolate auth styles conceptually around the existing `auth-*` class family and modal components.
- Later move generic `.modal-content`, `.close-btn`, and `.error` ownership behind auth-owned selectors before reducing Bootstrap dependency.
- Do not refactor auth modal code or Bootstrap behavior during landing/dashboard visual preparation unless a dedicated auth phase is scheduled.

### 16.3 Body/HTML Overflow Boundary

`styles/styles.css` currently owns `html, body` height, width, `overflow-x: hidden`, `text-align: center`, Montserrat typography, and smooth scrolling. `styles/globals.css` also owns `body` margin, padding, box sizing, Roboto typography, background, and color.

This is a global leak and a runtime risk. Any change can alter:

- Landing scroll and fixed `AppHeader` behavior.
- Auth modal backdrop scroll.
- Dashboard main scroll root behavior.
- Editor overlay measurements.
- Delete-confirm modal scroll locking through `[data-dashboard-scroll-root="true"]`.
- Preview/publish modal behavior if body scroll or viewport assumptions shift.

Future cleanup must consolidate base ownership only after manual landing, auth, dashboard, editor shell, and modal checks.

## 17. Dashboard Card Primitive Plan

Current audit:

- `.dashboard-invitation-card` and child hooks live in `styles/globals.css`.
- `dashboardStyleClasses.js` centralizes the exact shared shell/media/title/error class recipes introduced in Phase 2.
- Legacy dashboard rail components and `TemplateCardShell.jsx` use the shared constants; dashboard home post-summary carousels now use landing carousel primitives instead.
- The dashboard home hero now uses the shared `LandingHero` primitive and no longer consumes `.dashboard-invitation-card` as a hero shell variant.
- `TemplateCardShell.jsx` is also used outside the dashboard home rail path, including template/admin surfaces that render template cards.

Decision:

- Treat `.dashboard-invitation-card` as a formal shared dashboard/app card primitive for the next cleanup and first visual redesign steps.
- Do not replace it with component-owned Tailwind classes before the redesign baseline exists.
- Do not rename the class or child hooks unless every documented consumer is updated and the dashboard home, template rail, and admin/template card surfaces are checked together.

Safest future path:

1. Keep `.dashboard-invitation-card*` stable through baseline capture and first visual redesign planning.
2. If the redesign changes all dashboard/template cards together, update the primitive intentionally in one small change.
3. If the redesign needs different card families, first split consumers by owner while preserving exact current output, then redesign each family.
4. Keep generated/public invitation CSS out of this primitive. It is app UI only.

## 18. Migration Priorities And Future Redesign Order

Phase 1: documentation and ownership mapping only.

- Keep this document and `CSS_INVENTORY.md` aligned with current implementation.
- This historical phase did not redesign UI, move CSS, or introduce CSS Modules.
- Capture screenshot/manual-check anchors before cleanup.

Phase 2: low-risk organization without visual change.

- Freeze `styles/styles.css` for unrelated additions.
- Label global CSS sections by owner. Phase 2 added owner/freeze comments without selector or declaration rewrites.
- Extract repeated Tailwind recipes only where output stays identical. Phase 2 centralized exact dashboard card/error recipes in `dashboardStyleClasses.js`.
- Preserve all shell runtime hooks and body/scroll behavior.

Phase 3: prepare for future visual redesign.

- Define the future landing-owned styling boundary.
- Define auth modals as a separate auth-owned styling boundary.
- Treat `.dashboard-invitation-card` as a formal shared dashboard/app card primitive for now.
- Inventory current exact values before changing colors, spacing, shadows, typography, radii, shell dimensions, or z-index layers.

Recommended visual redesign order:

| Step | Scope | Why this order | Rollback point |
| --- | --- | --- | --- |
| 1 | Capture manual visual baseline for all anchors in section 19 | Establishes current output before any visual change | Revert only documentation if checklist is wrong; no code affected. |
| 2 | Landing content sections, excluding auth modal internals and public invitation routes | Lowest editor/runtime risk and route-local JSX owner is clear | Revert landing route/styles for section-only changes. |
| 3 | Landing header/menu after Bootstrap dependency is mapped per selector | The extracted header is scoped, but legacy Bootstrap navbar globals remain until removed | Revert header/menu changes independently from content sections. |
| 4 | Auth modal visual pass | Auth should be separated from landing and checked against Bootstrap/modal scroll behavior | Revert auth-owned selectors/components without touching landing content. |
| 5 | Dashboard legacy card primitive and non-home card consumers | Card primitive is still shared outside the new home carousel path, so redesign it intentionally after deciding shared vs split card families | Revert `.dashboard-invitation-card*` and `dashboardStyleClasses.js` changes together. |
| 6 | Dashboard home post-summary carousel sections | Home now uses shared landing carousel primitives and is lower risk than shell chrome | Revert `DashboardLandingCarouselSections.jsx` and carousel primitive consumers without touching shell hooks. |
| 7 | Dashboard header/sidebar and canvas editor header visual pass | Highest app-UI risk because hooks feed editor overlays, modals, and selection preservation | Revert shell files as a unit and rerun editor/page-shell checks. Keep editor header content changes in `CanvasEditorHeader.jsx` unless shell hooks are intentionally coordinated. |
| 8 | Bootstrap reduction | Only after landing/auth have app-owned style hooks | Revert Bootstrap-reduction phase without touching dashboard/editor. |
| 9 | Global CSS reduction | Only after landing/auth/dashboard owners no longer depend on broad globals | Revert by CSS section; avoid mixed global cleanup commits. |

Do not start with dashboard shell chrome. It has the strongest coupling to editor overlay geometry, toolbar positioning, selection preservation, and modal scroll locking.

## 19. Manual Visual Baseline Checklist

Do not generate screenshots automatically for this phase unless existing repo tooling already supports it. The current baseline is a manual screenshot/checklist contract for future redesign work.

Required manual anchors before and after future visual changes:

- Landing desktop: fixed header, logo sizing, desktop menu links, hero background, hero copy, primary CTA, invitation preview section, functionality grid, how-it-works steps, pricing section, share section, final CTA, footer.
- Landing mobile: header closed state, header opened state, menu button behavior, hero height, CTA visibility, section spacing, image scaling, footer.
- Landing header/menu: desktop fixed behavior, mobile AppHeader drawer, auth buttons, anchor links closing the menu.
- Auth modal login state: modal backdrop, modal card, fields, error state, Google button, close button, switch-to-register link, auth transition overlay.
- Auth modal register state: modal backdrop/card, fields, validation errors, Google button, close button, switch-to-login link.
- Dashboard home loading state: startup loader, shell spacing, centered loader card.
- Dashboard home empty state: hero, empty draft/publication/template states, CTA visibility.
- Dashboard home populated state: hero, latest-publication summary, landing-style draft/publication/template carousel block, shared how-it-works section, shared pricing section, shared feature-details section, shared share section, shared footer, template collections anchor, horizontal overflow/fades.
- Dashboard draft carousel: card width, thumbnail media fit, title truncation, `Abrir borrador` and `Eliminar` text actions, hover/focus states.
- Dashboard publication carousel: publicada card width, thumbnail media fit, `Ver respuestas` and `Vista previa` text actions.
- Dashboard template carousel: landing-style card width across breakpoints, preview modal, `Usar plantilla` and `Vista previa` text actions.
- Dashboard header/sidebar desktop: fixed header height, dashboard-home user menu, desktop sidebar rail, sidebar panel open/close, main content top/left offsets.
- Dashboard header/sidebar mobile: dashboard-home user menu behavior, bottom toolbar, sidebar panel height `min(52vh, 440px)`, safe-area padding, horizontal toolbar overflow mask.
- Canvas editor header desktop/mobile: document title control, preview button, editor options sheet, account/logout section, mobile truncation, and current visual class output.
- Editor shell inside dashboard: canvas area sizing, option button placement, text toolbar placement, selection preservation when clicking header/sidebar/panel, delete-confirm modal scroll locking.
- Preview modal desktop/mobile: draft preview opens, viewport mode changes, publish actions remain visible when allowed, modal scroll does not corrupt dashboard scroll root.
- Publish checkout modal: checkout modal opens from preview/dashboard, slug/payment form, terminal success state, parent dashboard publication sync does not reset the receipt.
- Public invitation sanity check: open one known `/i/{slug}` route and confirm it is served from the generated/public artifact path, not from app global CSS.

Future automated anchors:

- `npm run build`
- `node --test src/domain/dashboard/pageShell.test.mjs`
- `node --test src/components/editor/canvasEditor/selectionPreservationPolicy.test.mjs`
- `node --test src/components/preview/previewFrameRuntime.test.mjs`
- `node --test shared/previewPublishParity.test.mjs`
- `node --test shared/previewPublishVisualBaseline.test.mjs`
- `node --test shared/previewPublishMobileGeometryParity.test.mjs`
- `node --test functions/renderContractCompatibility.test.mjs`

## 20. Future Cleanup Strategy

1. Preserve current behavior and visual output during all cleanup.
2. Choose ownership before moving styles.
3. Reduce global CSS by surface, not by selector popularity.
4. Keep Bootstrap-dependent landing/auth styles documented until the markup no longer relies on Bootstrap behavior.
5. Treat dashboard shell hooks as runtime contracts, not styling conveniences.
6. Tokenize current values before any redesign changes values.
7. Keep generated/public invitation CSS separate from app UI CSS.
8. Use manual visual baseline screenshots and editor shell checks as gates for CSS cleanup.
9. Keep rollback units small: landing content, landing header, auth modal, dashboard card primitive, dashboard home, dashboard shell, Bootstrap reduction, global CSS reduction.
