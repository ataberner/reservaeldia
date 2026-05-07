# CSS INVENTORY

Phase: CSS Architecture Contract, Phase 1: Inventory And Labels.

Scope:
- `styles/globals.css`
- `styles/styles.css`

This document is observational only. It does not authorize visual changes, CSS movement, deletion, or component refactors.

## 1. Summary

The current CSS system has two app-level global files:
- `styles/globals.css`: Tailwind entry point plus editor compatibility, landing navbar compatibility, shared dashboard card hooks, and global keyframes.
- `styles/styles.css`: legacy global stylesheet containing base reset, legacy layout/sidebar rules, auth modal styles, Bootstrap overrides, landing page sections, inactive/unused section candidates, and route-specific selectors.

Contract interpretation:
- `globals.css` can keep Tailwind, app base, true global compatibility, and intentionally shared hooks.
- `styles.css` is legacy compatibility only. New unrelated rules should not be added there.
- Existing landing/auth Bootstrap-dependent styles are tolerated until migrated.
- Broad selectors, Bootstrap overrides, and generic class names are risk markers, not immediate deletion instructions.

Assumption: `src/pages/index.js` is the active landing page surface for most landing selectors in `styles.css`.

## 2. Current CSS Ownership Map

### 2.1 `styles/globals.css`

| Lines | Section | Owner/domain | Contract status | Disposition | Risk notes |
| --- | --- | --- | --- | --- | --- |
| 1-3 | Tailwind directives | base | Allowed | Stay | Required Tailwind entry point. |
| 5 | Google Fonts `@import` for Roboto | base / editor | Allowed only if truly app-wide | Investigate | Duplicates font loading already present in `_document.js`; also interacts with later `body` font rules. |
| 8-10 | `canvas` font family | editor | Allowed exception | Stay for now | Broad element selector and `!important`; allowed as editor/canvas compatibility if still required. |
| 13-20 | absolute-positioned textarea normalization | editor | Allowed exception | Stay for now | Attribute selector targets generated inline editor DOM; broad-ish but runtime-specific. |
| 27-102 | `.navbar-collapse`, `.navbar-nav`, `.nav-link`, `.btn`, `slideUp`, `.animate-slideUp` | landing / Bootstrap compatibility | Allowed current exception | Move later | Bootstrap class namespace, `991px`, `!important`, and route-specific behavior in globals. |
| 110-115 | `body` reset and Roboto | base | Partially allowed | Investigate | Conflicts with `styles.css` `html, body` Montserrat rule. Base ownership should be singular. |
| 117-172 | `.dashboard-invitation-card*` shared card behavior | dashboard | Allowed current exception | Stay or formalize later | Shared dashboard hook is app-owned and prefixed; currently used by dashboard rails and template cards. |
| 175-179 | global `@keyframes spin` | unknown / base compatibility | Unclear | Investigate | Global keyframe name collides with Tailwind's animation concept; no direct app-owned `animation: spin` usage found in CSS inventory pass. |
| 181-190 | global `@keyframes fadeInScale` | editor | Tolerated current use | Move later | Used by editor/toolbar inline styles; better future home is editor-scoped/shared animation ownership. |

### 2.2 `styles/styles.css`

| Lines | Section | Owner/domain | Contract status | Disposition | Risk notes |
| --- | --- | --- | --- | --- | --- |
| 2-17 | reset: `*`, `html, body` | base | Not ideal in `styles.css`; tolerated legacy | Move later / investigate | Broad selectors, duplicate body ownership, sets global typography and text alignment. |
| 20-101 | `.layout`, `.hamburger`, `.sidebar`, `.main`, `.main-card` | unused candidate / legacy dashboard | Not allowed for new work | Investigate | No exact active className usage found for these hooks; generic names collide with dashboard/editor concepts. |
| 108-153 | `.tipo-selector-*`, `.tipo-btn` | unused candidate / legacy component | Not allowed for new work | Investigate | No exact active className usage found in `src`; generic component CSS in global legacy file. |
| 159-184 | `.plantilla-card` | unused candidate / legacy template card | Not allowed for new work | Investigate | Current template card UI uses Tailwind and `dashboard-invitation-card`; no exact active className usage found. |
| 190-204 | `:root` color variables | base / tokens | Tolerated legacy | Move later | Token ownership belongs in global token layer or Tailwind config; current variables are only in legacy global file. |
| 209-710 | auth modal and auth transition styles | auth / Bootstrap compatibility | Allowed current exception | Move later | Mixes app-owned `auth-*` with Bootstrap `.modal-content`, `.btn-*`, `.close-btn`, `.error`; includes `!important` on `.auth-input-error`. |
| 717-819 | navbar and session buttons | landing / Bootstrap compatibility | Allowed current exception | Move later | Overrides Bootstrap `.navbar`, `.navbar-brand`, `.navbar-nav`, `.navbar-toggler`, `.navbar .container`, `.navbar .d-flex`. |
| 822-867 | `.hero` and `.hero-content` | landing | Tolerated legacy | Move later | Route-specific landing styles in global file; partially duplicated by inline style on landing hero. |
| 872-910 | `.btn-primary` | landing / auth / Bootstrap compatibility | Allowed current exception | Move later | Global Bootstrap override; `!important` active/focus rules; affects auth buttons and landing buttons. |
| 917-969 | `#invitaciones` and mobile functionality tweaks | landing / Bootstrap compatibility | Tolerated legacy | Move later | Route-specific IDs; descendant Bootstrap utility selectors `.d-flex`, `.text-center`; hardcoded `576px`. |
| 975-1035 | `.funcionalidades`, `.funcionalidad`, `.funcionalidades-grid` | landing | Tolerated legacy | Move later | Active landing section; route-specific global classes. `.funcionalidades-grid` has no exact active use found. |
| 1042-1110 | `.how-it-works`, `.steps-container`, `.step`, `.icon` | landing | Tolerated legacy | Move later | Active landing section; `.step` and `.icon` are generic global class names. |
| 1116-1209 | testimonials and `fadeIn` | unused candidate / landing | Not allowed for new work | Investigate | No active testimonials markup found in current `src/pages/index.js`; generic `.testimonial` and global `fadeIn`. |
| 1212-1321 | pricing plans | unused candidate / landing | Not allowed for new work | Investigate | Referenced only inside commented JSX in `src/pages/index.js`; generic `.price`, `.premium`, `.highlight`. |
| 1326-1352 | `.icon-img`, responsive hero/btn/gallery-item | mixed landing / unused candidate | Tolerated legacy | Investigate / move later | `.gallery-item` and `.icon-img` have no exact active use found; `768px` and `500px` breakpoints. |
| 1360-1365 | broad `section` and `h2, h3, p` | landing/base leakage | Not allowed for new work | Move later / investigate impact | Broad element selectors affect any page loaded with global CSS. |
| 1368-1449 | contact section | unused candidate / landing | Not allowed for new work | Investigate | No active contact markup found in `src/pages/index.js`; route-specific global classes. |
| 1454-1531 | `footer`, footer links/social responsive rules | landing | Tolerated legacy | Move later | Active footer uses generic `footer` and `footer p`; link/social classes appear unused. |
| 1538-1574 | `#crear-invitacion` and `.btn-success` descendant | landing / Bootstrap compatibility | Tolerated legacy | Move later / investigate | Active section ID exists; `.btn-success` descendant appears unused because current button uses `.btn-primary`. |

## 3. Risky Selectors List

### 3.1 Broad element selectors

| Selector | File | Lines | Risk |
| --- | --- | --- | --- |
| `canvas` | `globals.css` | 8-10 | Global element rule with `!important`; allowed only as editor compatibility. |
| `textarea[style*="position: absolute"]` | `globals.css` | 13-20 | Runtime-specific but still global attribute targeting. |
| `body` | `globals.css` | 110-115 | Competes with `styles.css` `html, body`. |
| `*` | `styles.css` | 3-7 | Universal reset outside the intended base owner. |
| `html, body` | `styles.css` | 10-17 | Global typography, sizing, overflow, text alignment, and scroll behavior. |
| `section` | `styles.css` | 1360-1363 | Applies landing-like spacing to all sections globally. |
| `h2, h3, p` | `styles.css` | 1364-1365 | Applies text shadow globally to headings and paragraphs. |
| `footer`, `footer p` | `styles.css` | 1457-1479 | Affects all footers globally. |

### 3.2 Bootstrap overrides and Bootstrap namespace dependencies

| Selector group | File | Lines | Risk |
| --- | --- | --- | --- |
| `.navbar-collapse`, `.navbar-nav`, `.nav-link`, `.navbar-collapse .btn` | `globals.css` | 27-102 | Landing behavior depends on Bootstrap class names and global order. |
| `.modal-content`, `.btn-outline-dark`, `.btn-google` | `styles.css` | 228-282 | Auth UI styles Bootstrap/global modal/button names. |
| `.auth-modal .btn-outline-dark` | `styles.css` | 499-508 | Scoped to auth but still overrides Bootstrap button namespace. |
| `.navbar`, `.navbar-brand`, `.navbar .container`, `.navbar-nav .nav-link`, `.navbar-toggler`, `.navbar.fixed-top` | `styles.css` | 721-768 | Global Bootstrap navbar override. |
| `.navbar .d-flex` | `styles.css` | 812-818 | Bootstrap utility descendant override. |
| `.btn-primary` | `styles.css` | 875-905 | Global Bootstrap primary button override used by landing and auth. |
| `#crear-invitacion .btn-success` | `styles.css` | 1559-1574 | Bootstrap button descendant; appears inactive in current markup. |

### 3.3 Generic global class names

| Selector | File | Lines | Risk |
| --- | --- | --- | --- |
| `.layout`, `.sidebar`, `.main`, `.main-card` | `styles.css` | 21-101 | Generic names and likely legacy/unused. |
| `.close-btn`, `.error` | `styles.css` | 246-259 | Generic names used by auth; can collide outside auth. |
| `.step`, `.icon` | `styles.css` | 1069-1100 | Generic names used by landing "how it works"; collision risk. |
| `.testimonial`, `.price`, `.premium`, `.highlight`, `.not-included` | `styles.css` | 1142-1299 | Generic names, mostly inactive/commented landing sections. |
| `.gallery-item`, `.icon-img` | `styles.css` | 1327-1352 | Generic or unclear usage; no exact active use found. |

### 3.4 `!important`

| Rule | File | Lines | Contract status |
| --- | --- | --- | --- |
| `canvas { font-family: ... !important; }` | `globals.css` | 8-10 | Allowed only as editor compatibility. |
| `.navbar-nav .nav-link` mobile color | `globals.css` | 81-93 | Tolerated current Bootstrap compatibility; move later. |
| `.auth-input-error` border color | `styles.css` | 380-381 | Auth-specific but should be solved by ownership later. |
| `.btn-primary:focus`, `.btn-primary:active` | `styles.css` | 899-905 | Bootstrap override; tolerated current compatibility only. |

### 3.5 Route-specific selectors in global CSS

| Selector group | File | Lines | Risk |
| --- | --- | --- | --- |
| `#invitaciones` | `styles.css` | 917-952 | Landing route-specific CSS in global file. |
| `#funcionalidades .funcionalidad*` | `styles.css` | 955-969 | Landing route-specific responsive overrides. |
| `#crear-invitacion` | `styles.css` | 1538-1574 | Landing route-specific CSS in global file. |
| `.hero`, `.funcionalidades`, `.how-it-works`, `.contacto`, `.pricing`, `.testimonials` | `styles.css` | 823-1449 | Landing-section CSS in global file. |

## 4. Candidate Sections To Migrate Later

Priority follows the CSS Architecture Contract cleanup order.

1. Auth modal styles: `styles.css` 209-710.
   - Move toward an auth-owned boundary or scoped CSS.
   - Replace Bootstrap class-name ownership with app-owned auth selectors.

2. Landing Bootstrap and section styles: `styles.css` 717-1574 plus `globals.css` 27-102.
   - Move toward landing-owned CSS or Tailwind/component ownership.
   - Keep Bootstrap compatibility documented while markup still uses Bootstrap classes.

3. Base/reset ownership: `globals.css` 5 and 110-115, `styles.css` 2-17.
   - Establish one base owner for body/font/reset behavior.
   - Preserve current values during migration.

4. Dashboard shared card hook: `globals.css` 117-172.
   - Either keep as a documented shared dashboard primitive or move to explicit dashboard shared style ownership.

5. Editor animation/compatibility hooks: `globals.css` 8-20 and 181-190.
   - Keep runtime compatibility.
   - Move `fadeInScale` to editor/shared scoped ownership if consumers remain editor-only.

6. Legacy unused candidates in `styles.css`.
   - Investigate before deleting:
     - 20-101 layout/sidebar/main-card rules.
     - 108-184 tipo-selector and plantilla-card rules.
     - 1116-1209 testimonials.
     - 1212-1321 pricing.
     - 1326-1352 icon-img/gallery-item.
     - 1368-1449 contact section.
     - 1559-1574 `#crear-invitacion .btn-success`.

7. Global token variables: `styles.css` 190-204.
   - Move to a token owner after token strategy is established.
   - Preserve exact values.

## 5. Investigation Notes

- `styles.css` contains several selectors with no exact active `className` match in the inspected `src` files. This inventory marks them as unused candidates only, not unused facts.
- The pricing section appears in commented JSX in `src/pages/index.js`; its CSS should not be removed without confirming whether the commented section is intentionally retained.
- `globals.css` defines global `@keyframes spin`; app code uses Tailwind `animate-spin` frequently, but this inventory did not find direct app-owned `animation: spin` usage.
- `fadeInScale` is referenced by editor toolbar inline styles, so it is not an unused candidate.
- `dashboard-invitation-card` hooks are active and shared by dashboard home rails and template card shells.
- The active landing footer uses a bare `footer`, so footer rules are active but too broad for long-term ownership.

