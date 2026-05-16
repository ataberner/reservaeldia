# CSS INVENTORY

Phase: CSS Architecture Contract, Phase 2: Ownership Labels And Low-Risk Class Constants.

Scope:
- `styles/globals.css`
- `styles/styles.css`
- `src/components/appHeader/AppHeader.module.css`
- `src/components/landing/LandingFeatureDetails.module.css`
- `src/components/landing/LandingFooter.module.css`
- `src/components/landing/LandingHero.module.css`
- `src/components/landing/LandingHowItWorks.module.css`
- `src/components/landing/LandingPricing.module.css`
- `src/components/landing/LandingShareSection.module.css`
- `src/components/landing/LandingTemplateShowcase.module.css`
- `src/components/dashboard/home/DashboardPublicationSummarySection.module.css`
- `src/pages/index.module.css`
- `src/components/dashboard/dashboardStyleClasses.js`

This document is observational only. It does not authorize visual changes, CSS movement, deletion, or component refactors.

Brand colors, typography, gradient usage, accessibility guidance, and future token recommendations are documented in [DESIGN_SYSTEM.md](../design/DESIGN_SYSTEM.md). This inventory records current implementation ownership and drift against that kind of design-system source; it is not itself a design system.

## 1. Summary

The current CSS system has two app-level global files:
- `styles/globals.css`: Tailwind entry point plus editor compatibility, landing navbar compatibility, shared dashboard card hooks, and global keyframes.
- `styles/styles.css`: legacy global stylesheet containing base reset, legacy layout/sidebar rules, auth modal styles, Bootstrap overrides, landing page sections, inactive/unused section candidates, and route-specific selectors.
- `src/components/appHeader/AppHeader.module.css`: component-scoped visual header styles for the landing header and authenticated non-editor dashboard header.
- `src/components/landing/LandingFeatureDetails.module.css`: component-scoped shared landing/dashboard feature-details section styles.
- `src/components/landing/LandingFooter.module.css`: component-scoped shared landing/dashboard footer styles.
- `src/components/landing/LandingHero.module.css`: component-scoped shared landing/dashboard hero styles, including the current hero layout, white hero box, corner markers, title/subtitle typography, and hero CTA states.
- `src/components/landing/LandingHowItWorks.module.css`: component-scoped shared landing/dashboard "como funciona" step-circle section styles.
- `src/components/landing/LandingPricing.module.css`: component-scoped shared landing/dashboard pricing section styles.
- `src/components/landing/LandingShareSection.module.css`: component-scoped shared landing/dashboard share section styles.
- `src/components/landing/LandingTemplateShowcase.module.css`: component-scoped landing template carousel styles now reused by the dashboard home carousel block through `LandingTemplateCarouselPrimitives.jsx`.
- `src/components/dashboard/home/DashboardPublicationSummarySection.module.css`: component-scoped dashboard home publication summary styles. This owns the premium latest-publication summary below the shared hero and does not use global dashboard card hooks.
- `src/pages/index.module.css`: route-scoped landing main and remaining landing section styles.
- `src/components/dashboard/dashboardStyleClasses.js`: exact current Tailwind/class recipes shared by dashboard invitation cards and dashboard home error panels. It is not a design system and does not introduce new values.

Contract interpretation:
- `globals.css` can keep Tailwind, app base, true global compatibility, and intentionally shared hooks.
- `styles.css` is legacy compatibility only. New unrelated rules should not be added there.
- Existing landing/auth Bootstrap-dependent styles are tolerated until migrated. The landing header no longer uses Bootstrap navbar classes after the shared `AppHeader` extraction, and the shared landing/dashboard hero static styles now live in `src/components/landing/LandingHero.module.css`, but the remaining landing sections and auth modals still depend on Bootstrap/global CSS.
- Broad selectors, Bootstrap overrides, and generic class names are risk markers, not immediate deletion instructions.
- Phase 2 added owner/freeze comments only inside global CSS. Selectors and declarations were not rewritten.
- Phase 3 added the detailed current-value token inventory, manual visual baseline checklist, landing/auth boundary decisions, and redesign order to `docs/architecture/LANDING_DASHBOARD_STYLING_MAP.md`. No selector ownership or CSS file contents changed for Phase 3.

Assumption: `src/pages/index.js` is the active landing page surface for most landing selectors in `styles.css`.

## 2. Landing And Dashboard Ownership Snapshot

This section records the current landing/dashboard ownership map after Phase 2 comments and class-constant extraction. It is documentation only and does not authorize CSS movement or visual changes.

| Surface | Route/component owner | Current style owner | Notes |
| --- | --- | --- | --- |
| Landing route | `src/pages/index.js` plus shared landing components | `AppHeader.module.css` for the header; `LandingHero.module.css` for the shared hero; `LandingFeatureDetails.module.css` for the shared feature-details section; `LandingHowItWorks.module.css` for the shared step-circle section; `LandingPricing.module.css` for the shared pricing section; `LandingShareSection.module.css` for the shared share section; `LandingFooter.module.css` for the shared footer; `src/pages/index.module.css`, Bootstrap classes, `styles/styles.css`, and `styles/globals.css` for remaining sections | The landing header, hero, feature-details, how-it-works, pricing, share, and footer sections are extracted to shared visual components. Auth notice and modal entry remain in one page file. |
| Landing auth entry | `src/pages/index.js` plus `src/lib/components/LoginModal.js` and `src/lib/components/RegisterModal.js` | `styles/styles.css` auth section plus Bootstrap button/modal classes | Auth modal CSS mixes app-owned `auth-*` selectors with generic `.modal-content`, `.close-btn`, `.error`, and Bootstrap `.btn-*`. |
| Profile completion modal | `src/lib/components/ProfileCompletionModal.js` | Same auth/global CSS group in `styles/styles.css` | Uses the same modal/backdrop/auth selector family as login/register. |
| Dashboard route shell | `src/pages/dashboard.js` and `src/domain/dashboard/pageShell.js` | Tailwind in JSX plus shell runtime props | Owns view selection, layout props, editor mount state, preview modal mount, and checkout modal mount. |
| Shared dashboard layout | `src/components/DashboardLayout.jsx` | Tailwind in JSX plus inline measured layout styles | Owns `[data-dashboard-scroll-root="true"]` and main scroll/height behavior. |
| Shared app visual header | `src/components/appHeader/AppHeader.jsx` | `src/components/appHeader/AppHeader.module.css` | Visual-only owner for public landing and authenticated non-editor dashboard header content. Does not own editor runtime data attributes, shell measurement, or `--dashboard-header-height`. |
| Dashboard header shell | `src/components/DashboardHeader.jsx` | Tailwind in JSX for the fixed runtime shell plus runtime `--dashboard-header-height`; renders `AppHeader.module.css` header content in non-editor dashboard mode | Owns `[data-dashboard-header="true"]`, `[data-preserve-canvas-selection="true"]`, header measurement, and the editor-safe shell. Renders `CanvasEditorHeader.jsx` for editor-mode content and `AppHeader.jsx` for non-editor dashboard visual content. |
| Canvas editor header content | `src/components/editor/header/CanvasEditorHeader.jsx` | Tailwind in JSX plus file-local editor header class recipes | Owns editor-specific header content/actions only. Does not own header refs, runtime data attributes, height measurement, or `--dashboard-header-height`. |
| Dashboard sidebar | `src/components/DashboardSidebar.jsx` | Tailwind in JSX plus inline panel/mobile geometry styles | Owns `[data-dashboard-sidebar="true"]`, `#sidebar-panel`, and sidebar panel position/height. |
| Dashboard home | `src/components/dashboard/home/DashboardHomeView.jsx` and child components | `LandingHero.module.css` for the shared hero; `DashboardPublicationSummarySection.module.css` for the latest-publication summary; `LandingTemplateShowcase.module.css` through shared carousel primitives for the post-summary carousel block; `LandingHowItWorks.module.css` for the shared step-circle section; `LandingPricing.module.css` for the shared pricing section; `LandingFeatureDetails.module.css` for the shared feature-details section; `LandingShareSection.module.css` for the shared share section; `LandingFooter.module.css` for the shared footer | Composes shared hero, latest-publication summary, landing-style carousel block, shared how-it-works section, shared pricing section, shared feature-details section, shared share section, and shared footer. |
| Dashboard legacy cards/rails | `DashboardDraftRailSection.jsx`, `DashboardPublicationRailSection.jsx`, `DashboardTemplateRailSection.jsx`, `HorizontalRail.jsx`, `InfiniteTemplateRail.jsx`, `src/components/templates/TemplateCardShell.jsx` | Tailwind in JSX plus `.dashboard-invitation-card*` in `globals.css` | Legacy dashboard rail/card components remain available but are no longer used by dashboard home after the landing-style carousel replacement. |
| Dashboard shared class constants | `src/components/dashboard/dashboardStyleClasses.js` | Exact existing class strings | Phase 2 helper for repeated dashboard card/error recipes. It preserves current class values and is not a token/theme layer. |
| Global app CSS | `src/pages/_app.js` imports both global CSS files | `styles/globals.css` and `styles/styles.css` | Both files apply to all Next app routes, including landing and dashboard. |
| Global Bootstrap dependency | `src/pages/_document.js` | Bootstrap CSS/JS CDN | Bootstrap is global, not route-scoped. Landing/auth depend on it today. |
| Tailwind config | `tailwind.config.js` | Tailwind default theme plus `tailwind-scrollbar-hide` plugin | `theme.extend` is empty, so repeated app values are not tokenized yet. |

### 2.1 Runtime-Critical Dashboard Hooks

These hooks are not ordinary CSS selectors. They are current runtime contracts between dashboard shell code, editor overlays, modals, and toolbar positioning.

| Hook | Current owner | Current consumers | Why it is critical |
| --- | --- | --- | --- |
| `[data-dashboard-header="true"]` | `DashboardHeader.jsx` | `src/components/editor/overlays/useOptionButtonPosition.js` | Used to measure/avoid the fixed dashboard header when positioning editor option controls. Removing or moving it can place editor overlays under the header. |
| `[data-dashboard-sidebar="true"]` | `DashboardSidebar.jsx` | `selectionPreservationPolicy.js`, `MenuOpcionesElemento.jsx` | Used to preserve canvas selection when interacting with sidebar UI and to calculate menu/sidebar collision offsets. |
| `[data-dashboard-scroll-root="true"]` | `DashboardLayout.jsx` | `ConfirmDeleteItemModal.jsx` | Modal code locks/restores the dashboard scroll root. Changing it can leave dashboard scrolling disabled or allow background scroll during destructive-confirm modals. |
| `#sidebar-panel` | `DashboardSidebar.jsx` | `selectionPreservationPolicy.js`, `FloatingTextToolbarView.jsx` | Used as a selection-preserving target and as a sidebar panel geometry source for floating text toolbar placement. |
| `--dashboard-header-height` | `DashboardHeader.jsx`, consumed by `DashboardLayout.jsx`, `DashboardSidebar.jsx`, editor overlay code | Layout, sidebar, and editor overlay positioning | Header height is measured at runtime and propagated through a CSS variable. Changing it without updating consumers can break main area sizing, sidebar height, and overlay offsets. |
| `.dashboard-invitation-card` and children | `styles/globals.css` | Draft cards, publication cards, template card shell | Shared hover/transform/media/title/action behavior. Changing it affects multiple dashboard card surfaces at once. |

### 2.2 Body And Scroll Ownership

- `styles/styles.css` owns legacy `html, body` width, height, overflow-x, typography, text alignment, and scroll behavior.
- `styles/globals.css` also defines `body` margin, font family, background, and color.
- `DashboardLayout.jsx` owns the dashboard app scroll root through its `main` element and `[data-dashboard-scroll-root="true"]`.
- `ConfirmDeleteItemModal.jsx` temporarily changes scroll/touch behavior on the dashboard scroll root.
- Editor and preview systems use additional runtime geometry/scroll boundaries. Body-level overflow changes can therefore affect landing scroll, dashboard scroll, modals, and editor overlays.

## 3. Current CSS Ownership Map

### 3.0 `src/components/appHeader/AppHeader.module.css`

| Section | Owner/domain | Contract status | Disposition | Risk notes |
| --- | --- | --- | --- | --- |
| `.root`, placement, variant, logo, nav, action, mobile menu, and account menu classes | shared landing/dashboard visual header | Allowed scoped component owner | Stay | Visual-only. Must not receive editor runtime data attributes, measured shell logic, or dashboard layout responsibilities. |

### 3.1 `src/components/landing/LandingHero.module.css`

| Section | Owner/domain | Contract status | Disposition | Risk notes |
| --- | --- | --- | --- | --- |
| `.hero`, `.heroContent`, `.heroTitle`, `.heroSubtitle`, `.heroTitleGradient`, `.heroCorner*`, `.heroCta` | shared landing/dashboard hero | Allowed scoped component owner | Stay | Preserves the current landing hero output and allows dashboard home to reuse the same visual primitive. Keeps legacy global `hero`, `hero-content`, `hero-corner*`, `landing-hero-title-gradient`, and `landing-hero-cta` hooks on the DOM for compatibility during gradual migration. |

### 3.1.1 `src/pages/index.module.css`

| Section | Owner/domain | Contract status | Disposition | Risk notes |
| --- | --- | --- | --- | --- |
| `.main` and landing section classes below the shared landing components | landing route sections | Allowed route-scoped owner | Stay | Hero styles moved to `LandingHero.module.css`; feature-details styles moved to `LandingFeatureDetails.module.css`; how-it-works styles moved to `LandingHowItWorks.module.css`; pricing styles moved to `LandingPricing.module.css`; share styles moved to `LandingShareSection.module.css`; footer styles moved to `LandingFooter.module.css`; remaining landing sections still coexist with legacy global landing selectors during gradual migration. |

### 3.1.1.1 `src/components/landing/LandingFooter.module.css`

| Section | Owner/domain | Contract status | Disposition | Risk notes |
| --- | --- | --- | --- | --- |
| `.landingFooter*` | shared landing/dashboard footer | Allowed scoped component owner | Stay | Shared visual footer rendered on the landing route and at the bottom of dashboard home. Dashboard supplies route-local footer links while preserving the same visual treatment. |

### 3.1.1.2 `src/components/landing/LandingFeatureDetails.module.css`

| Section | Owner/domain | Contract status | Disposition | Risk notes |
| --- | --- | --- | --- | --- |
| `.featureDetails*`, `.featureCard*` | shared landing/dashboard feature-details section | Allowed scoped component owner | Stay | Shared visual primitive rendered on the landing route and below dashboard home pricing. Dashboard can opt into `.featureDetailsShareBlend` so the share-section background begins halfway through the feature images. Uses the landing feature images from `/assets/img/landing-funcionalidades/`. |

### 3.1.1.3 `src/components/landing/LandingPricing.module.css`

| Section | Owner/domain | Contract status | Disposition | Risk notes |
| --- | --- | --- | --- | --- |
| `.pricing*` | shared landing/dashboard pricing section | Allowed scoped component owner | Stay | Shared visual primitive rendered on the landing route and below dashboard home how-it-works. It is separate from legacy global `.pricing` plan selectors in `styles/styles.css`. |

### 3.1.1.4 `src/components/landing/LandingShareSection.module.css`

| Section | Owner/domain | Contract status | Disposition | Risk notes |
| --- | --- | --- | --- | --- |
| `.share*` | shared landing/dashboard share section | Allowed scoped component owner | Stay | Shared visual primitive rendered on the landing route and below dashboard home feature-details. Uses the landing share mockup asset and accepts a CTA target from each surface. |

### 3.1.2 `src/components/dashboard/home/DashboardPublicationSummarySection.module.css`

| Section | Owner/domain | Contract status | Disposition | Risk notes |
| --- | --- | --- | --- | --- |
| `.dashboardPublicationSummary*` | dashboard home latest-publication summary | Allowed scoped component owner | Stay | Local premium summary below the dashboard hero. It intentionally avoids `.dashboard-invitation-card*` because that hook is shared by rails/cards. |

### 3.2 `styles/globals.css`

| Lines | Section | Owner/domain | Contract status | Disposition | Risk notes |
| --- | --- | --- | --- | --- | --- |
| 1-3 | Tailwind directives | base | Allowed | Stay | Required Tailwind entry point. |
| 5 | Google Fonts `@import` for Roboto | base / editor | Allowed only if truly app-wide | Investigate | Duplicates font loading already present in `_document.js`; also interacts with later `body` font rules. |
| 12-17 | `canvas` font family | editor | Allowed exception | Stay for now | Broad element selector and `!important`; allowed as editor/canvas compatibility if still required. |
| 20-29 | absolute-positioned textarea normalization | editor | Allowed exception | Stay for now | Attribute selector targets generated inline editor DOM; broad-ish but runtime-specific. |
| 35-113 | `.navbar-collapse`, `.navbar-nav`, `.nav-link`, `.btn`, `slideUp`, `.animate-slideUp` | legacy landing / Bootstrap compatibility | Remaining legacy exception | Move later | The extracted landing header no longer uses these navbar hooks. They remain global risk until old Bootstrap/header compatibility is safely removed or proven unused. |
| 121-129 | `body` reset and Roboto | base | Partially allowed | Investigate | Conflicts with `styles.css` `html, body` Montserrat rule. Base ownership should be singular. |
| 132-190 | `.dashboard-invitation-card*` shared card behavior | dashboard | Allowed current exception | Stay or formalize later | Shared dashboard hook is app-owned and prefixed; currently used by legacy dashboard rails and template card shells. The dashboard home post-summary carousel block now uses landing carousel primitives instead. |
| 193-199 | global `@keyframes spin` | unknown / base compatibility | Unclear | Investigate | Global keyframe name collides with Tailwind's animation concept; no direct app-owned `animation: spin` usage found in CSS inventory pass. |
| 201-210 | global `@keyframes fadeInScale` | editor | Tolerated current use | Move later | Used by editor/toolbar inline styles; better future home is editor-scoped/shared animation ownership. |

### 3.3 `styles/styles.css`

| Lines | Section | Owner/domain | Contract status | Disposition | Risk notes |
| --- | --- | --- | --- | --- | --- |
| 1-26 | reset: `*`, `html, body` | base | Not ideal in `styles.css`; tolerated legacy | Move later / investigate | Broad selectors, duplicate body ownership, sets global typography and text alignment. |
| 29-114 | `.layout`, `.hamburger`, `.sidebar`, `.main`, `.main-card` | unused candidate / legacy dashboard | Not allowed for new work | Investigate | No exact active className usage found for these hooks; generic names collide with dashboard/editor concepts. |
| 118-165 | `.tipo-selector-*`, `.tipo-btn` | unused candidate / legacy component | Not allowed for new work | Investigate | No exact active className usage found in `src`; generic component CSS in global legacy file. |
| 171-200 | `.plantilla-card` | unused candidate / legacy template card | Not allowed for new work | Investigate | Current template card UI uses Tailwind and `dashboard-invitation-card`; no exact active className usage found. |
| 207-225 | `:root` color variables | base / tokens | Tolerated legacy | Move later | Token ownership belongs in global token layer or Tailwind config; current variables are only in legacy global file. |
| 230-733 | auth modal and auth transition styles | auth / Bootstrap compatibility | Allowed current exception | Move later | Mixes app-owned `auth-*` with Bootstrap `.modal-content`, `.btn-*`, `.close-btn`, `.error`; includes `!important` on `.auth-input-error`. |
| 740-842 | navbar and session buttons | legacy landing / Bootstrap compatibility | Remaining legacy exception | Move later | Overrides Bootstrap `.navbar`, `.navbar-brand`, `.navbar-nav`, `.navbar-toggler`, `.navbar .container`, `.navbar .d-flex`. The new shared header does not use these classes. |
| 846-895 | `.hero` and `.hero-content` | landing legacy compatibility | Tolerated legacy | Move later | Route-specific landing styles in global file; current shared hero output is owned by `src/components/landing/LandingHero.module.css` while legacy hooks remain on the DOM for compatibility. |
| 900-935 | `.btn-primary` | landing / auth / Bootstrap compatibility | Allowed current exception | Move later | Global Bootstrap override; `!important` active/focus rules; affects auth buttons and landing buttons. |
| 943-1001 | `#invitaciones` and mobile functionality tweaks | landing / Bootstrap compatibility | Tolerated legacy | Move later | Route-specific IDs; descendant Bootstrap utility selectors `.d-flex`, `.text-center`; hardcoded `576px`. |
| 1005-1069 | `.funcionalidades`, `.funcionalidad`, `.funcionalidades-grid` | landing | Tolerated legacy | Move later | Active landing section; route-specific global classes. `.funcionalidades-grid` has no exact active use found. |
| 1073-1145 | `.how-it-works`, `.steps-container`, `.step`, `.icon` | landing legacy | Tolerated legacy | Move later | The active shared section is now styled by `LandingHowItWorks.module.css`; these legacy global hooks remain migration/removal candidates. `.step` and `.icon` are generic global class names. |
| 1149-1239 | testimonials and `fadeIn` | unused candidate / landing | Not allowed for new work | Investigate | No active testimonials markup found in current `src/pages/index.js`; generic `.testimonial` and global `fadeIn`. |
| 1247-1359 | pricing plans | unused candidate / landing | Not allowed for new work | Investigate | The active landing/dashboard pricing section is now styled by `LandingPricing.module.css`; these legacy global pricing-plan selectors are separate inactive candidates with generic `.price`, `.premium`, and `.highlight` hooks. |
| 1364-1392 | `.icon-img`, responsive hero/btn/gallery-item | mixed landing / unused candidate | Tolerated legacy | Investigate / move later | `.gallery-item` and `.icon-img` have no exact active use found; `768px` and `500px` breakpoints. |
| 1397-1405 | broad `section` and `h2, h3, p` | landing/base leakage | Not allowed for new work | Move later / investigate impact | Broad element selectors affect any page loaded with global CSS. |
| 1409-1491 | contact section | unused candidate / landing | Not allowed for new work | Investigate | No active contact markup found in `src/pages/index.js`; route-specific global classes. |
| 1496-1575 | `footer`, footer links/social responsive rules | landing | Tolerated legacy | Move later | Active footer uses generic `footer` and `footer p`; link/social classes appear unused. |
| 1582-1620 | `#crear-invitacion` and `.btn-success` descendant | landing / Bootstrap compatibility | Tolerated legacy | Move later / investigate | Active section ID exists; `.btn-success` descendant appears unused because current button uses `.btn-primary`. |

## 4. Risky Selectors List

### 4.1 Broad element selectors

| Selector | File | Lines | Risk |
| --- | --- | --- | --- |
| `canvas` | `globals.css` | 15-17 | Global element rule with `!important`; allowed only as editor compatibility. |
| `textarea[style*="position: absolute"]` | `globals.css` | 22-29 | Runtime-specific but still global attribute targeting. |
| `body` | `globals.css` | 125-129 | Competes with `styles.css` `html, body`. |
| `*` | `styles.css` | 9-13 | Universal reset outside the intended base owner. |
| `html, body` | `styles.css` | 19-26 | Global typography, sizing, overflow, text alignment, and scroll behavior. |
| `section` | `styles.css` | 1400-1403 | Applies landing-like spacing to all sections globally. |
| `h2, h3, p` | `styles.css` | 1404-1405 | Applies text shadow globally to headings and paragraphs. |
| `footer`, `footer p` | `styles.css` | 1500-1520 | Affects all footers globally. |

### 4.2 Bootstrap overrides and Bootstrap namespace dependencies

| Selector group | File | Lines | Risk |
| --- | --- | --- | --- |
| `.navbar-collapse`, `.navbar-nav`, `.nav-link`, `.navbar-collapse .btn` | `globals.css` | 39-113 | Legacy Bootstrap header compatibility remains global even though `AppHeader` no longer uses these class names. |
| `.modal-content`, `.btn-outline-dark`, `.btn-google` | `styles.css` | 234-288 | Auth UI styles Bootstrap/global modal/button names. |
| `.auth-modal .btn-outline-dark` | `styles.css` | 505-514 | Scoped to auth but still overrides Bootstrap button namespace. |
| `.navbar`, `.navbar-brand`, `.navbar .container`, `.navbar-nav .nav-link`, `.navbar-toggler`, `.navbar.fixed-top` | `styles.css` | 744-794 | Global legacy Bootstrap navbar override; not used by the extracted `AppHeader`. |
| `.navbar .d-flex` | `styles.css` | 833-839 | Legacy Bootstrap utility descendant override; not used by the extracted `AppHeader`. |
| `.btn-primary` | `styles.css` | 904-934 | Global Bootstrap primary button override used by landing and auth. |
| `#crear-invitacion .btn-success` | `styles.css` | 1603-1618 | Bootstrap button descendant; appears inactive in current markup. |

### 4.3 Generic global class names

| Selector | File | Lines | Risk |
| --- | --- | --- | --- |
| `.layout`, `.sidebar`, `.main`, `.main-card` | `styles.css` | 33-114 | Generic names and likely legacy/unused. |
| `.close-btn`, `.error` | `styles.css` | 252-265 | Generic names used by auth; can collide outside auth. |
| `.step`, `.icon` | `styles.css` | 1104-1135 | Generic names used by landing "how it works"; collision risk. |
| `.testimonial`, `.price`, `.premium`, `.highlight`, `.not-included` | `styles.css` | 1178-1335 | Generic names, mostly inactive/commented landing sections. |
| `.gallery-item`, `.icon-img` | `styles.css` | 1364-1392 | Generic or unclear usage; no exact active use found. |

### 4.4 `!important`

| Rule | File | Lines | Contract status |
| --- | --- | --- | --- |
| `canvas { font-family: ... !important; }` | `globals.css` | 15-17 | Allowed only as editor compatibility. |
| `.navbar-nav .nav-link` mobile color | `globals.css` | 93-105 | Tolerated current Bootstrap compatibility; move later. |
| `.auth-input-error` border color | `styles.css` | 386-387 | Auth-specific but should be solved by ownership later. |
| `.btn-primary:focus`, `.btn-primary:active` | `styles.css` | 929-935 | Bootstrap override; tolerated current compatibility only. |

### 4.5 Route-specific selectors in global CSS

| Selector group | File | Lines | Risk |
| --- | --- | --- | --- |
| `#invitaciones` | `styles.css` | 947-982 | Landing route-specific CSS in global file. |
| `#funcionalidades .funcionalidad*` | `styles.css` | 985-1001 | Landing route-specific responsive overrides. |
| `#crear-invitacion` | `styles.css` | 1582-1620 | Landing route-specific CSS in global file. |
| `.hero`, `.funcionalidades`, `.how-it-works`, `.contacto`, `.pricing`, `.testimonials` | `styles.css` | 850-1491 | Landing-section CSS in global file. |

### 4.6 Runtime-Critical Hooks That Must Not Be Treated As Styling-Only

| Hook | Owner | Risk |
| --- | --- | --- |
| `[data-dashboard-header="true"]` | `DashboardHeader.jsx` | Used by editor overlay positioning; visual header refactors can break overlay placement. |
| `[data-dashboard-sidebar="true"]` | `DashboardSidebar.jsx` | Used by selection preservation and element option menu placement. |
| `[data-dashboard-scroll-root="true"]` | `DashboardLayout.jsx` | Used by modal scroll locking. |
| `#sidebar-panel` | `DashboardSidebar.jsx` | Used by selection preservation and floating text toolbar geometry. |
| `--dashboard-header-height` | `DashboardHeader.jsx` plus shell consumers | Used by layout, sidebar, and editor overlay offsets. |
| `.dashboard-invitation-card` | `globals.css` plus dashboard card components | Shared dashboard primitive; not safe to modify as a one-off card style. |

## 5. Candidate Sections To Migrate Later

Priority follows the CSS Architecture Contract cleanup order.

1. Auth modal styles: `styles.css` 230-733.
   - Move toward an auth-owned boundary or scoped CSS.
   - Replace Bootstrap class-name ownership with app-owned auth selectors.

2. Landing Bootstrap and section styles: `styles.css` 740-1620 plus `globals.css` 35-113.
   - Move toward landing-owned CSS or Tailwind/component ownership.
   - Keep Bootstrap compatibility documented while markup still uses Bootstrap classes.

3. Base/reset ownership: `globals.css` 5 and 121-129, `styles.css` 1-26.
   - Establish one base owner for body/font/reset behavior.
   - Preserve current values during migration.

4. Dashboard shared card hook: `globals.css` 132-190.
   - Exact repeated class strings now live in `src/components/dashboard/dashboardStyleClasses.js`.
   - Either keep as a documented shared dashboard primitive or move to explicit dashboard shared style ownership.

5. Editor animation/compatibility hooks: `globals.css` 12-29 and 201-210.
   - Keep runtime compatibility.
   - Move `fadeInScale` to editor/shared scoped ownership if consumers remain editor-only.

6. Legacy unused candidates in `styles.css`.
   - Investigate before deleting:
     - 29-114 layout/sidebar/main-card rules.
     - 118-200 tipo-selector and plantilla-card rules.
     - 1149-1239 testimonials.
     - 1247-1359 pricing.
     - 1364-1392 icon-img/gallery-item.
     - 1409-1491 contact section.
     - 1603-1618 `#crear-invitacion .btn-success`.

7. Global token variables: `styles.css` 207-225.
   - Move to a token owner after token strategy is established.
   - Preserve exact values.

## 6. Investigation Notes

- `styles.css` contains several selectors with no exact active `className` match in the inspected `src` files. This inventory marks them as unused candidates only, not unused facts.
- The active pricing section is the shared `LandingPricing.jsx` / `LandingPricing.module.css` component. Legacy global pricing-plan CSS in `styles/styles.css` remains an inactive cleanup candidate and should be removed only after confirming no archived/commented surface still depends on it.
- `globals.css` defines global `@keyframes spin`; app code uses Tailwind `animate-spin` frequently, but this inventory did not find direct app-owned `animation: spin` usage.
- `fadeInScale` is referenced by editor toolbar inline styles, so it is not an unused candidate.
- `dashboard-invitation-card` hooks are active and shared by dashboard home rails and template card shells.
- The active landing footer uses a bare `footer`, so footer rules are active but too broad for long-term ownership.
- `src/components/appHeader/AppHeader.module.css` and `src/components/landing/LandingHero.module.css` are shared app UI CSS Modules recorded in this inventory.
- Editor header content is isolated in `src/components/editor/header/CanvasEditorHeader.jsx`; `DashboardHeader.jsx` remains the runtime shell owner for header hooks and measured height.
- `src/components/appHeader/AppHeader.jsx` is now the shared visual header owner for landing and authenticated non-editor dashboard chrome. `DashboardHeader.jsx` still owns the fixed measured shell and editor runtime hooks.
- `CSS_ARCHITECTURE_CONTRACT.md` previously referenced `public/para-diseno/style.css`; the checked-in path found during this pass is `public/para-diseño/style.css`.
- Dashboard shell hooks are used by editor and modal code outside the shell components, so the shell should be considered a runtime boundary, not just a visual layout component.
- Phase 2 added comments in `styles/globals.css`, `styles/styles.css`, `DashboardLayout.jsx`, `DashboardHeader.jsx`, and `DashboardSidebar.jsx` to label owner/runtime-sensitive areas without changing selectors or declarations.
- Phase 2 introduced `src/components/dashboard/dashboardStyleClasses.js` for exact repeated class strings used by dashboard cards and dashboard home error panels.

## 7. Docs Vs Implementation Drift

| Area | Documented state | Current implementation read | Phase 2 disposition |
| --- | --- | --- | --- |
| `.dashboard-invitation-card` usage | Shared by dashboard card surfaces | Used by dashboard rails and `TemplateCardShell.jsx` | Keep it documented as a dashboard shared primitive across rails and template cards. |
| Template/public duplicate path | Contract mentioned `public/para-diseno/style.css` | Checked-in folder is `public/para-diseño/style.css` | Use the actual path when documenting current files; note ASCII-only references as legacy shorthand. |
| Static inline styles | Contract discourages static app chrome inline styles | Landing/shared hero static styles have moved to `src/components/landing/LandingHero.module.css`; auth modals have small static inline spinner/spacing styles; dashboard header has static avatar color inline style | Auth/dashboard inline exceptions remain future cleanup candidates. |
| Dashboard shell styling | Dashboard is described as Tailwind-heavy | Shell also exposes runtime hooks and inline measured geometry consumed outside the shell | Treat shell hooks and `--dashboard-header-height` as runtime contracts. |
| Body/font ownership | Contract flags duplicate base/body ownership | `_document.js` loads multiple fonts; `globals.css` imports Roboto and sets body Roboto; `styles.css` sets `html, body` Montserrat | Preserve current behavior until a base typography owner is chosen. |
| Repeated dashboard class recipes | Contract recommends extracted constants for reused utility recipes | `dashboardStyleClasses.js` now holds exact current card/media/title/error-panel class strings | Phase 2 cleanup only; values are not tokens and were not changed. |
