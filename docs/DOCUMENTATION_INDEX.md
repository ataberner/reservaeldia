# Documentation Index

Status: Canonical Documentation Index.

This is the navigation and governance entry point for repository documentation.
It explains which documents are authoritative, which documents describe current
implementation, which documents are historical, and which documents should be
loaded for each subsystem before making changes.

When code and documentation disagree, current code is the source of truth. The
correct follow-up is to update the affected documentation and tests, not to
silently implement against stale prose.

## 1. Documentation Taxonomy

| Category | Purpose | Authority | Maintenance rule | New docs belong here when |
| --- | --- | --- | --- | --- |
| Contract | Defines invariants that multiple runtimes or modules must preserve. | Authoritative for future changes once verified against code. | Update in the same change as any behavior or schema contract change. Include testing anchors. | The behavior crosses editor, preview, publish, backend validation, public delivery, persistence, or shared runtime helpers. |
| Architecture/System | Explains subsystem boundaries, ownership, and high-level flow. | Authoritative for subsystem routing and ownership, but not always normative for low-level behavior. | Keep concise and link to focused contracts instead of duplicating them. | A subsystem needs a map of owners, flows, and integration points. |
| Current Implementation Map | Records how the implementation behaves today, including compatibility branches and known drift. | Authoritative as an implementation snapshot until code changes. | Date or note material revalidation; do not use as target-state planning. | The repo needs an observed map of complex current behavior. |
| Testing | Defines manual or fixture-based regression anchors. | Authoritative for verification scope, not for product architecture by itself. | Update when contracts, fixtures, parity boundaries, or manual regression surfaces change. | A behavior needs repeatable manual or automated verification guidance. |
| Audit | Identifies risks, fragility, or closure state. | Advisory unless another contract references it as a required risk map. | Keep findings grounded in current code and mark closure/audit scope clearly. | The repo needs a risk assessment, closure review, or drift report. |
| Historical | Preserves old plans, gap maps, RCA evidence, or completed phase records. | Not authoritative for new work unless explicitly referenced as context. | Mark historical/deprecated clearly and point to current replacements. | Context remains useful but the document should not guide implementation. |
| Migration | Describes a safe phased transition from current state to a target boundary. | Advisory unless tied to an approved implementation phase. | Keep current facts separate from future targets and do not authorize broad rewrites by itself. | A cleanup needs ordered steps, freeze rules, or migration constraints. |
| Design | Defines visual identity, typography, tokens, UX design rules, and styling intent. | Authoritative for app UI design decisions, scoped by CSS ownership contracts. | Update when design tokens, Figma interpretation, accessibility rules, or visual ownership changes. | A visual system or UI surface needs design guidance. |
| Operational | Supports debugging, diagnostics, production checks, or runbook-like workflows. | Operationally useful, not architectural authority unless linked by a contract. | Keep flags, traces, and commands current with code. | A recurring investigation or production check needs durable instructions. |
| Reference | Background reports, meeting briefs, or non-runtime explanatory docs. | Informational only. | Keep if useful; mark assumptions and avoid presenting it as current architecture. | The document helps product/design discussion but does not define implementation. |

## 2. Status Labels

Use status metadata on documents where authority could otherwise be ambiguous.

Recommended labels:

| Status | Meaning |
| --- | --- |
| `Status: Canonical Contract` | Normative contract for future implementation. |
| `Status: Canonical Architecture Reference` | Primary architecture or governance reference for a subsystem. |
| `Status: Current Implementation Map` | Observed implementation behavior; code wins if drift is found. |
| `Status: Current Implementation Inventory` | Observed inventory of files, selectors, values, or ownership. |
| `Status: Current Audit / Risk Map` | Risk or fragility analysis grounded in current code. |
| `Status: Testing Baseline` | Required or recommended regression baseline. |
| `Status: Historical / Deprecated` | Historical context only; not a planning authority. |
| `Status: Migration Reference` | Current facts plus future migration guidance. |
| `Status: Operational Diagnostic Evidence` | Debug evidence or runbook material. |

Do not add status labels mechanically to every document. Add them when the file is
likely to be used as an authority by humans or AI agents.

## 3. Canonical Source-Of-Truth Set

| Area | Canonical docs | Role |
| --- | --- | --- |
| Product and system architecture | [ARCHITECTURE_GUIDELINES.md](architecture/ARCHITECTURE_GUIDELINES.md), [ARCHITECTURE_OVERVIEW.md](architecture/ARCHITECTURE_OVERVIEW.md) | Product/architecture rules and whole-system map. |
| Data and persistence | [DATA_MODEL.md](architecture/DATA_MODEL.md) | Canonical draft/publication/render-state data model. |
| Editor subsystem | [EDITOR_SYSTEM.md](architecture/EDITOR_SYSTEM.md), [INTERACTION_CONTRACT.md](architecture/INTERACTION_CONTRACT.md), [INTERACTION_SYSTEM_CURRENT_STATE.md](architecture/INTERACTION_SYSTEM_CURRENT_STATE.md) | Editor boundary, normative interaction rules, and current implementation map. |
| Preview/publish/render | [PREVIEW_SYSTEM_ANALYSIS.md](architecture/PREVIEW_SYSTEM_ANALYSIS.md), [RENDER_COMPATIBILITY_MATRIX.md](contracts/RENDER_COMPATIBILITY_MATRIX.md) | Preview authority model and cross-runtime render compatibility. |
| Checkout/publication lifecycle | [CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md](contracts/CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md) | Checkout, payment approval, slug reservation, publish execution, retry, and public delivery lifecycle. |
| Public interactivity | [PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md](contracts/PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md) | Functional CTA behavior across preview and publish. |
| Share image | [PUBLISHED_SHARE_IMAGE_CONTRACT.md](contracts/PUBLISHED_SHARE_IMAGE_CONTRACT.md) | Published `share.jpg` and Open Graph contract. |
| SEO and AEO route policy | [SEO_ROUTE_INVENTORY.md](architecture/SEO_ROUTE_INVENTORY.md), [AEO_ROUTE_INVENTORY.md](architecture/AEO_ROUTE_INVENTORY.md) | Crawlability, indexability, sitemap inclusion, metadata policy, answer-engine semantics, and structured-data policy by public route. |
| Image roles and decorations | [IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md](contracts/IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md) | Image role conversion, section backgrounds, free decorations, and edge decorations. |
| Gallery | [GALLERY_SYSTEM_CONTRACT.md](contracts/GALLERY_SYSTEM_CONTRACT.md), [GALLERY_EDITOR_CONTRACT.md](contracts/GALLERY_EDITOR_CONTRACT.md), [GALLERY_LAYOUT_PRESETS_CONTRACT.md](contracts/GALLERY_LAYOUT_PRESETS_CONTRACT.md), [GALLERY_VIEWER_RENDER_CONTRACT.md](contracts/GALLERY_VIEWER_RENDER_CONTRACT.md) | Gallery invariants, editor/sidebar behavior, preset model, and generated viewer behavior. |
| Grouping | [GROUP_RENDER_MODEL.md](architecture/GROUP_RENDER_MODEL.md) | Preserved `tipo: "grupo"` render model. |
| CSS and design | [DESIGN_SYSTEM.md](design/DESIGN_SYSTEM.md), [CSS_ARCHITECTURE_CONTRACT.md](architecture/CSS_ARCHITECTURE_CONTRACT.md), [CSS_INVENTORY.md](architecture/CSS_INVENTORY.md), [LANDING_DASHBOARD_STYLING_MAP.md](architecture/LANDING_DASHBOARD_STYLING_MAP.md) | Visual identity, CSS ownership, current inventory, and landing/dashboard/auth styling map. |
| Risk map | [SYSTEM_FRAGILITY_MAP.md](architecture/SYSTEM_FRAGILITY_MAP.md) | Current cross-system fragility and risk register. |
| Regression anchors | [EDITOR_REGRESSION_CHECKLIST.md](testing/EDITOR_REGRESSION_CHECKLIST.md), [PREVIEW_PUBLISH_VISUAL_BASELINE.md](testing/PREVIEW_PUBLISH_VISUAL_BASELINE.md) | Manual editor checks and preview/publish visual baseline. |

## 4. Implementation Maps vs Normative Contracts

Normative contracts define rules future work must preserve:

- [INTERACTION_CONTRACT.md](architecture/INTERACTION_CONTRACT.md)
- [DATA_MODEL.md](architecture/DATA_MODEL.md)
- [CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md](contracts/CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md)
- [RENDER_COMPATIBILITY_MATRIX.md](contracts/RENDER_COMPATIBILITY_MATRIX.md)
- [IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md](contracts/IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md)
- [PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md](contracts/PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md)
- [PUBLISHED_SHARE_IMAGE_CONTRACT.md](contracts/PUBLISHED_SHARE_IMAGE_CONTRACT.md)
- [GROUP_RENDER_MODEL.md](architecture/GROUP_RENDER_MODEL.md)
- Gallery focused contracts under `docs/contracts/GALLERY_*`
- [CSS_ARCHITECTURE_CONTRACT.md](architecture/CSS_ARCHITECTURE_CONTRACT.md)

Current implementation maps describe observed behavior and known compatibility paths:

- [ARCHITECTURE_OVERVIEW.md](architecture/ARCHITECTURE_OVERVIEW.md)
- [EDITOR_SYSTEM.md](architecture/EDITOR_SYSTEM.md)
- [INTERACTION_SYSTEM_CURRENT_STATE.md](architecture/INTERACTION_SYSTEM_CURRENT_STATE.md)
- [PREVIEW_SYSTEM_ANALYSIS.md](architecture/PREVIEW_SYSTEM_ANALYSIS.md)
- [CSS_INVENTORY.md](architecture/CSS_INVENTORY.md)
- [LANDING_DASHBOARD_STYLING_MAP.md](architecture/LANDING_DASHBOARD_STYLING_MAP.md)

Audits and historical records must not be treated as current contracts:

- [SYSTEM_FRAGILITY_MAP.md](architecture/SYSTEM_FRAGILITY_MAP.md) is a current risk map.
- [INTERACTION_CONTRACT_GAP_MAP_AND_EXECUTION_PLAN.md](architecture/INTERACTION_CONTRACT_GAP_MAP_AND_EXECUTION_PLAN.md) is historical/deprecated.
- [INTERACTION_FINAL_CLOSURE_AUDIT.md](architecture/INTERACTION_FINAL_CLOSURE_AUDIT.md) is historical closure context.
- [inline-focus-rca-evidence.md](debug/inline-focus-rca-evidence.md) is operational diagnostic evidence.
- [REUNION_ESTUDIO_DISENO_BRIEF.md](reports/REUNION_ESTUDIO_DISENO_BRIEF.md) is a design/product reference brief.

## 5. Reading Order By Subsystem

### Core Architecture

1. [ARCHITECTURE_GUIDELINES.md](architecture/ARCHITECTURE_GUIDELINES.md)
2. [ARCHITECTURE_OVERVIEW.md](architecture/ARCHITECTURE_OVERVIEW.md)
3. [DATA_MODEL.md](architecture/DATA_MODEL.md)
4. [SYSTEM_FRAGILITY_MAP.md](architecture/SYSTEM_FRAGILITY_MAP.md) when assessing risk.

### Editor System

1. [EDITOR_SYSTEM.md](architecture/EDITOR_SYSTEM.md)
2. [INTERACTION_CONTRACT.md](architecture/INTERACTION_CONTRACT.md)
3. [INTERACTION_SYSTEM_CURRENT_STATE.md](architecture/INTERACTION_SYSTEM_CURRENT_STATE.md)
4. [DATA_MODEL.md](architecture/DATA_MODEL.md)
5. [EDITOR_REGRESSION_CHECKLIST.md](testing/EDITOR_REGRESSION_CHECKLIST.md)

Add focused contracts when the editor change touches those surfaces:

- image roles/decorations: [IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md](contracts/IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md)
- grouping: [GROUP_RENDER_MODEL.md](architecture/GROUP_RENDER_MODEL.md)
- Gallery: [GALLERY_SYSTEM_CONTRACT.md](contracts/GALLERY_SYSTEM_CONTRACT.md) and [GALLERY_EDITOR_CONTRACT.md](contracts/GALLERY_EDITOR_CONTRACT.md)
- preview/publish output: [PREVIEW_SYSTEM_ANALYSIS.md](architecture/PREVIEW_SYSTEM_ANALYSIS.md) and [RENDER_COMPATIBILITY_MATRIX.md](contracts/RENDER_COMPATIBILITY_MATRIX.md)

### Preview And Publish Pipeline

1. [PREVIEW_SYSTEM_ANALYSIS.md](architecture/PREVIEW_SYSTEM_ANALYSIS.md)
2. [RENDER_COMPATIBILITY_MATRIX.md](contracts/RENDER_COMPATIBILITY_MATRIX.md)
3. [DATA_MODEL.md](architecture/DATA_MODEL.md)
4. [PREVIEW_PUBLISH_VISUAL_BASELINE.md](testing/PREVIEW_PUBLISH_VISUAL_BASELINE.md)

Add focused contracts:

- share image / Open Graph: [PUBLISHED_SHARE_IMAGE_CONTRACT.md](contracts/PUBLISHED_SHARE_IMAGE_CONTRACT.md)
- checkout/payment/public URL lifecycle: [CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md](contracts/CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md)
- functional CTAs: [PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md](contracts/PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md)
- Gallery viewer: [GALLERY_VIEWER_RENDER_CONTRACT.md](contracts/GALLERY_VIEWER_RENDER_CONTRACT.md)
- grouping: [GROUP_RENDER_MODEL.md](architecture/GROUP_RENDER_MODEL.md)
- image roles/decorations: [IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md](contracts/IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md)

### Data Model

1. [DATA_MODEL.md](architecture/DATA_MODEL.md)
2. [ARCHITECTURE_OVERVIEW.md](architecture/ARCHITECTURE_OVERVIEW.md)
3. [RENDER_COMPATIBILITY_MATRIX.md](contracts/RENDER_COMPATIBILITY_MATRIX.md)

Use focused contracts for object-family details instead of duplicating schema
rules in `DATA_MODEL.md`.

### Gallery Subsystem

1. [GALLERY_SYSTEM_CONTRACT.md](contracts/GALLERY_SYSTEM_CONTRACT.md)
2. [GALLERY_EDITOR_CONTRACT.md](contracts/GALLERY_EDITOR_CONTRACT.md) for editor/sidebar mutations.
3. [GALLERY_LAYOUT_PRESETS_CONTRACT.md](contracts/GALLERY_LAYOUT_PRESETS_CONTRACT.md) for preset availability and layout semantics.
4. [GALLERY_VIEWER_RENDER_CONTRACT.md](contracts/GALLERY_VIEWER_RENDER_CONTRACT.md) for generated HTML and public viewer behavior.
5. [DATA_MODEL.md](architecture/DATA_MODEL.md), [EDITOR_SYSTEM.md](architecture/EDITOR_SYSTEM.md), and [RENDER_COMPATIBILITY_MATRIX.md](contracts/RENDER_COMPATIBILITY_MATRIX.md) for integration boundaries.

### Mobile And Reflow

1. [PREVIEW_SYSTEM_ANALYSIS.md](architecture/PREVIEW_SYSTEM_ANALYSIS.md)
2. [RENDER_COMPATIBILITY_MATRIX.md](contracts/RENDER_COMPATIBILITY_MATRIX.md)
3. [PREVIEW_PUBLISH_VISUAL_BASELINE.md](testing/PREVIEW_PUBLISH_VISUAL_BASELINE.md)
4. [DATA_MODEL.md](architecture/DATA_MODEL.md)

Use mobile parity tests such as `shared/previewPublishMobileGeometryParity.test.mjs`
as code-level anchors.

### Grouping

1. [GROUP_RENDER_MODEL.md](architecture/GROUP_RENDER_MODEL.md)
2. [DATA_MODEL.md](architecture/DATA_MODEL.md)
3. [RENDER_COMPATIBILITY_MATRIX.md](contracts/RENDER_COMPATIBILITY_MATRIX.md)
4. [PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md](contracts/PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md) when grouped CTAs are involved.

### Edge Decorations And Image Roles

1. [IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md](contracts/IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md)
2. [DATA_MODEL.md](architecture/DATA_MODEL.md)
3. [EDITOR_SYSTEM.md](architecture/EDITOR_SYSTEM.md)
4. [RENDER_COMPATIBILITY_MATRIX.md](contracts/RENDER_COMPATIBILITY_MATRIX.md)
5. [PREVIEW_PUBLISH_VISUAL_BASELINE.md](testing/PREVIEW_PUBLISH_VISUAL_BASELINE.md)

### Share Image Pipeline

1. [PUBLISHED_SHARE_IMAGE_CONTRACT.md](contracts/PUBLISHED_SHARE_IMAGE_CONTRACT.md)
2. [RENDER_COMPATIBILITY_MATRIX.md](contracts/RENDER_COMPATIBILITY_MATRIX.md)
3. [ARCHITECTURE_OVERVIEW.md](architecture/ARCHITECTURE_OVERVIEW.md)
4. [DATA_MODEL.md](architecture/DATA_MODEL.md)

Code-level anchors include `functions/src/payments/publishedShareImage.ts`,
`functions/src/payments/publishedShareImageRenderer.ts`, and
`functions/src/payments/publicationPublishExecution.ts`.

### SEO And Public Indexing

1. [SEO_ROUTE_INVENTORY.md](architecture/SEO_ROUTE_INVENTORY.md)
2. [AEO_ROUTE_INVENTORY.md](architecture/AEO_ROUTE_INVENTORY.md) when answer engines, structured data, extractable content, or AI crawler behavior are involved.
3. [ARCHITECTURE_OVERVIEW.md](architecture/ARCHITECTURE_OVERVIEW.md)
4. [PUBLISHED_SHARE_IMAGE_CONTRACT.md](contracts/PUBLISHED_SHARE_IMAGE_CONTRACT.md)
5. [CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md](contracts/CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md) when public invitation delivery is involved.

### CSS And Design System

1. [DESIGN_SYSTEM.md](design/DESIGN_SYSTEM.md)
2. [CSS_ARCHITECTURE_CONTRACT.md](architecture/CSS_ARCHITECTURE_CONTRACT.md)
3. [CSS_INVENTORY.md](architecture/CSS_INVENTORY.md)
4. [LANDING_DASHBOARD_STYLING_MAP.md](architecture/LANDING_DASHBOARD_STYLING_MAP.md)

Use [REUNION_ESTUDIO_DISENO_BRIEF.md](reports/REUNION_ESTUDIO_DISENO_BRIEF.md)
as a reference brief only, not as implementation authority.

### Checkout And Publication Lifecycle

1. [CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md](contracts/CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md)
2. [ARCHITECTURE_OVERVIEW.md](architecture/ARCHITECTURE_OVERVIEW.md)
3. [DATA_MODEL.md](architecture/DATA_MODEL.md)
4. [SYSTEM_FRAGILITY_MAP.md](architecture/SYSTEM_FRAGILITY_MAP.md)
5. [PUBLISHED_SHARE_IMAGE_CONTRACT.md](contracts/PUBLISHED_SHARE_IMAGE_CONTRACT.md) when publication success depends on final share metadata.

Current code-level anchors include `src/components/payments/PublicationCheckoutModal.jsx`,
`src/domain/payments/publicationCheckoutState.js`,
`functions/src/payments/publicationPayments.ts`, and
`functions/src/payments/publicationPublishExecution.ts`.

### Testing And Regression Anchors

Start with:

- [EDITOR_REGRESSION_CHECKLIST.md](testing/EDITOR_REGRESSION_CHECKLIST.md)
- [PREVIEW_PUBLISH_VISUAL_BASELINE.md](testing/PREVIEW_PUBLISH_VISUAL_BASELINE.md)

Then use subsystem tests named in the relevant contracts, especially:

- `shared/previewPublishParity.test.mjs`
- `shared/previewPublishMobileGeometryParity.test.mjs`
- `functions/renderContractCompatibility.test.mjs`
- `functions/publicationPublishValidation.test.mjs`
- `functions/publicationPublishExecution.test.mjs`
- `src/domain/gallery/galleryMutations.test.mjs`
- `src/domain/gallery/galleryLayoutPresets.test.mjs`

## 6. Historical Docs

Historical docs are preserved for context but must not be used as current
implementation authority.

| Doc | Current role | Canonical replacement |
| --- | --- | --- |
| [INTERACTION_CONTRACT_GAP_MAP_AND_EXECUTION_PLAN.md](architecture/INTERACTION_CONTRACT_GAP_MAP_AND_EXECUTION_PLAN.md) | Historical/deprecated interaction execution plan. | [INTERACTION_CONTRACT.md](architecture/INTERACTION_CONTRACT.md), [INTERACTION_SYSTEM_CURRENT_STATE.md](architecture/INTERACTION_SYSTEM_CURRENT_STATE.md), [INTERACTION_FINAL_CLOSURE_AUDIT.md](architecture/INTERACTION_FINAL_CLOSURE_AUDIT.md). |
| [INTERACTION_FINAL_CLOSURE_AUDIT.md](architecture/INTERACTION_FINAL_CLOSURE_AUDIT.md) | Historical closure audit and validation-gap record. | [INTERACTION_CONTRACT.md](architecture/INTERACTION_CONTRACT.md), [INTERACTION_SYSTEM_CURRENT_STATE.md](architecture/INTERACTION_SYSTEM_CURRENT_STATE.md). |
| [inline-focus-rca-evidence.md](debug/inline-focus-rca-evidence.md) | Operational RCA evidence for inline focus diagnostics. | [INTERACTION_SYSTEM_CURRENT_STATE.md](architecture/INTERACTION_SYSTEM_CURRENT_STATE.md) for architecture; code for current instrumentation. |
| [REUNION_ESTUDIO_DISENO_BRIEF.md](reports/REUNION_ESTUDIO_DISENO_BRIEF.md) | Product/design meeting brief. | [DESIGN_SYSTEM.md](design/DESIGN_SYSTEM.md) and CSS architecture docs for implementation. |

If old `*_TARGET.md`, `*_GAPS.md`, or narrow duplicate interaction docs reappear,
mark them historical/deprecated unless they are explicitly promoted through this
index and reconciled with current code.

## 7. Maintenance Rules

- Add this index to the first-read set for broad documentation, architecture,
  audit, or AI-agent routing work.
- Prefer one canonical owner per rule. Architecture docs should link to contracts
  rather than copy detailed contract text.
- When a contract changes, update the contract, affected architecture references,
  and focused tests/checklists in the same change.
- When implementation drifts from documentation, label the finding explicitly and
  update the smallest authoritative doc that owns the rule.
- Keep historical docs if they explain why the system is shaped this way, but mark
  them historical/deprecated and link to the current replacement.
- New docs should state their status, scope, authority, and maintenance trigger at
  the top when they may be mistaken for an authoritative contract.
