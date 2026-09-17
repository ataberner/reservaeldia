# Documentation Index

Status: Canonical Documentation Index.

This is the navigation and governance entry point for repository documentation.
It explains which documents are authoritative, which documents describe current
implementation, which documents are historical, and which documents should be
loaded for each subsystem before making changes.

Start with [AGENTS.md](../AGENTS.md) for task authorization, working procedure,
Definition of Done, and delivery evidence. This index owns documentary authority
and routing. The Prompt Builder is a consumer of these authorities, not a
requirement for working here or an independent source of authorization.

<a id="authority-and-conflicts"></a>

## 0. Authority And Conflicts

The original request and its restrictions authorize work; documents constrain
how authorized work is performed. Code demonstrates current implementation,
not automatically correct or intended behavior.

| Authority / evidence | How to use it |
| --- | --- |
| Current normative contracts and accepted decisions | Define expected obligations within their scope, including deliberate compatibility guarantees. A decision may precede implementation; keep that gap explicit. |
| Architecture standards, subsystem maps and data model | Guidelines define general standards; maps identify boundaries and owners. Normative data-model sections have contract authority; descriptive sections record implementation. Classify the relevant section, not just the filename. |
| Tests and testing baselines | Evidence and regression expectations interpreted against valid contracts. Passing tests do not legitimize a contract violation; obsolete expectations may require correction. |
| Current implementation | Evidence of what executable paths do, including defects, fallbacks and generated consumers. Trace callers and owners before inferring intent. |
| Comments, audits, RCA, proposals and historical records | Context or evidence with scope/date; not authority to override an accepted obligation. Risk findings guide verification and record open work. |

Within the same level, use the most specific canonical owner for the rule. For
example, Gallery mutation semantics belong to its editor contract, preset
semantics to its layout contract, and viewer behavior to its viewer contract.
Specificity does not silently repeal an incompatible accepted obligation.

When sources conflict:

1. Record the expected obligation and observed behavior, their sources, decision
   status, verification scope, and the affected consumers/tests.
2. Classify the discrepancy: implementation defect, stale descriptive documentation
   or test, deliberate contract change, or unresolved conflict between authorities.
3. A bug is corrected toward its valid contract when correction is authorized;
   do not rewrite a contract or test to excuse it. Stale documentation is corrected
   in its smallest owner when the expected behavior is established by evidence.
4. A deliberate change needs authorization for that contractual change. Two
   incompatible accepted authorities need explicit resolution in the responsible
   document, with rationale and replacement links; neither code nor recency nor
   specificity alone settles the conflict. Continue independent work meanwhile.

Without a focused document, investigate owners, consumers and tests and resolve
evidence-backed local details. Material permissions, data, business or compatibility
decisions must remain explicit questions until resolved; see the decision routes below.

## 1. Documentation Taxonomy

| Category | Purpose | Authority | Maintenance rule | New docs belong here when |
| --- | --- | --- | --- | --- |
| Contract | Defines invariants that multiple runtimes or modules must preserve. | Normative when current and accepted; code verification measures compliance, not acceptance. | Update for an authorized behavior or schema contract change; record pending implementation and testing anchors explicitly. | The behavior crosses editor, preview, publish, backend validation, public delivery, persistence, or shared runtime helpers. |
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
| `Status: Current Implementation Map` | Observed implementation behavior; revalidate against code without redefining normative obligations. |
| `Status: Current Implementation Inventory` | Observed inventory of files, selectors, values, or ownership. |
| `Status: Current Audit / Risk Map` | Risk or fragility analysis grounded in current code. |
| `Status: Testing Baseline` | Required or recommended regression baseline. |
| `Status: Historical / Deprecated` | Historical context only; not a planning authority. |
| `Status: Migration Reference` | Current facts plus future migration guidance. |
| `Status: Operational Diagnostic Evidence` | Debug evidence or runbook material. |

Do not add status labels mechanically to every document. Add them when the file is
likely to be used as an authority by humans or AI agents.

Document category is separate from decision and implementation status. For a
material decision, use these independent fields in its existing owner:

| Field | States and meaning |
| --- | --- |
| Decision status | `proposed`: under consideration; `accepted`: authorized normative choice with source/rationale; `replaced`: superseded with a replacement link; `rejected`: not adopted, retain rationale if useful. |
| Implementation / verification status | `pending`: not implemented or not checked (say which); `implemented`: present in code with anchors; `verified`: supported by named checks, results, date and environment. Partial coverage must name the remaining gap. |

An accepted decision can be documented before implementation. Do not label an
unexecuted check as verified or infer deployed behavior from local inspection.
Existing status wording need not be relabeled in bulk. When ambiguity matters,
clarify the relevant section rather than declaring the whole document accepted
or verified. Separate HECHO (checked fact), DECLARACIÓN (documented claim),
DECISIÓN, HIPÓTESIS, PENDIENTE and CONTRADICCIÓN when evidence could be confused.

## 3. Canonical Source-Of-Truth Set

| Area | Canonical docs | Role |
| --- | --- | --- |
| Operational entry | [AGENTS.md](../AGENTS.md) | Authorization, pre-change procedure, Definition of Done, and final evidence. This index owns documentary hierarchy and maintenance. |
| Procedures by task type | [CHANGE_WORKFLOW.md](operations/CHANGE_WORKFLOW.md) | Focused preparation, sequence, evidence and decision boundaries for seven types of work; subordinate to the original request and AGENTS.md. |
| Isolated local development and verification | [DEVELOPMENT_WORKFLOW.md](operations/DEVELOPMENT_WORKFLOW.md), [5A historical evidence](testing/LOCAL_VERIFICATION_5A.md), [5B Functions lint evidence](testing/FUNCTIONS_LINT_5B.md), [5C shared-copy/watch evidence](testing/SHARED_CONTRACTS_5C.md) | Phase 4A launcher, 5A reproducible preparation/integrated gate, mandatory Functions lint from 5B and shared-contract checks/watch from 5C; prerequisites, destinations, synthetic fixtures, evidence and cleanup. CI preparation/static checks are distinct from remote execution. Does not define Rules or Q1 policy. |
| Security and access | [SECURITY_CONTRACT.md](contracts/SECURITY_CONTRACT.md), [Rules baseline 4B1](testing/SECURITY_RULES_BASELINE_4B1.md), [4B2A comparison](testing/SECURITY_RULES_4B2A.md), [4B2B countdown evidence](testing/SECURITY_RULES_4B2B.md) | Traced matrix separates accepted obligations, observed permissions and proposed Q1 policy. Q1 remains in the risk map. 4B2A corrects selected ownership/backend writes; 4B2B protects countdown A4 with effective demo evidence. Remaining permissions, blocked handlers and remote application are not certified. |
| Product and system architecture | [ARCHITECTURE_GUIDELINES.md](architecture/ARCHITECTURE_GUIDELINES.md), [ARCHITECTURE_OVERVIEW.md](architecture/ARCHITECTURE_OVERVIEW.md) | Product/architecture rules and whole-system map. |
| Data and persistence | [DATA_MODEL.md](architecture/DATA_MODEL.md), [PROVIDER_DATA_MODEL.md](architecture/PROVIDER_DATA_MODEL.md) | Canonical draft/publication/render-state data model and the provider persistence, import, image-enrichment, and durable-resume contract. |
| Editor subsystem | [EDITOR_SYSTEM.md](architecture/EDITOR_SYSTEM.md), [INTERACTION_CONTRACT.md](architecture/INTERACTION_CONTRACT.md), [INTERACTION_SYSTEM_CURRENT_STATE.md](architecture/INTERACTION_SYSTEM_CURRENT_STATE.md) | Editor boundary, normative interaction rules, and current implementation map. |
| Assistant / Designer AI | [AI_ASSISTANT_CONVERSATION_CONTRACT.md](contracts/AI_ASSISTANT_CONVERSATION_CONTRACT.md), [DESIGNER_AI_CAPABILITY_CONTRACT.md](contracts/DESIGNER_AI_CAPABILITY_CONTRACT.md), [AI_ASSISTANT_SYSTEM.md](architecture/AI_ASSISTANT_SYSTEM.md), [GUIDED_TOUR_SYSTEM.md](architecture/GUIDED_TOUR_SYSTEM.md) | Conversation policy, executable capability boundary, technical owner map, and the independent Assistant Guided Tour implementation map. |
| Preview/publish/render | [PREVIEW_SYSTEM_ANALYSIS.md](architecture/PREVIEW_SYSTEM_ANALYSIS.md), [RENDER_COMPATIBILITY_MATRIX.md](contracts/RENDER_COMPATIBILITY_MATRIX.md) | Preview authority model and cross-runtime render compatibility. |
| Checkout/publication lifecycle | [CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md](contracts/CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md) | Checkout, payment approval, slug reservation, publish execution, retry, and public delivery lifecycle. |
| Public interactivity | [PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md](contracts/PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md) | Functional CTA behavior across preview and publish. |
| Regalos | [GIFTS_SYSTEM_CONTRACT.md](contracts/GIFTS_SYSTEM_CONTRACT.md), [DATA_MODEL.md](architecture/DATA_MODEL.md), [PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md](contracts/PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md) | Functional entry point for Gifts, persisted shape, visibility/completitud, editor controls, and CTA/modal integration. |
| Event details and locations | [DATA_MODEL.md](architecture/DATA_MODEL.md), [EDITOR_SYSTEM.md](architecture/EDITOR_SYSTEM.md), [RENDER_COMPATIBILITY_MATRIX.md](contracts/RENDER_COMPATIBILITY_MATRIX.md) | Ceremony/Party fields and persisted manual/Google location shape, editor owner boundary, and preview/publish map compatibility. Designer AI accessibility remains owned by its capability contract. |
| Share image | [PUBLISHED_SHARE_IMAGE_CONTRACT.md](contracts/PUBLISHED_SHARE_IMAGE_CONTRACT.md) | Published `share.jpg` and Open Graph contract. |
| SEO and AEO route policy | [SEO_ROUTE_INVENTORY.md](architecture/SEO_ROUTE_INVENTORY.md), [AEO_ROUTE_INVENTORY.md](architecture/AEO_ROUTE_INVENTORY.md) | Crawlability, indexability, sitemap inclusion, metadata policy, answer-engine semantics, and structured-data policy by public route. |
| Image roles and decorations | [IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md](contracts/IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md) | Image role conversion, section backgrounds, free decorations, and edge decorations. |
| Gallery | [GALLERY_SYSTEM_CONTRACT.md](contracts/GALLERY_SYSTEM_CONTRACT.md), [GALLERY_EDITOR_CONTRACT.md](contracts/GALLERY_EDITOR_CONTRACT.md), [GALLERY_LAYOUT_PRESETS_CONTRACT.md](contracts/GALLERY_LAYOUT_PRESETS_CONTRACT.md), [GALLERY_VIEWER_RENDER_CONTRACT.md](contracts/GALLERY_VIEWER_RENDER_CONTRACT.md) | Gallery invariants, editor/sidebar behavior, preset model, and generated viewer behavior. |
| Grouping | [GROUP_RENDER_MODEL.md](architecture/GROUP_RENDER_MODEL.md) | Preserved `tipo: "grupo"` render model. |
| CSS and design | [DESIGN_SYSTEM.md](design/DESIGN_SYSTEM.md), [CSS_ARCHITECTURE_CONTRACT.md](architecture/CSS_ARCHITECTURE_CONTRACT.md), [CSS_INVENTORY.md](architecture/CSS_INVENTORY.md), [LANDING_DASHBOARD_STYLING_MAP.md](architecture/LANDING_DASHBOARD_STYLING_MAP.md) | Visual identity, CSS ownership, current inventory, and landing/dashboard/auth styling map. |
| Risk map | [SYSTEM_FRAGILITY_MAP.md](architecture/SYSTEM_FRAGILITY_MAP.md) | Current cross-system fragility and risk register. |
| Regression anchors | [EDITOR_REGRESSION_CHECKLIST.md](testing/EDITOR_REGRESSION_CHECKLIST.md), [PREVIEW_PUBLISH_VISUAL_BASELINE.md](testing/PREVIEW_PUBLISH_VISUAL_BASELINE.md) | Manual editor checks and preview/publish visual baseline. |
| Countdown protection/observability | [COUNTDOWN_PHASE_0_RUNBOOK.md](operations/COUNTDOWN_PHASE_0_RUNBOOK.md) | Read-only inventory, backup/restore safety, sanitized telemetry, frozen-clock baseline, and rollout flags. |
| Countdown preset administration | [COUNTDOWN_PRESET_BUILDER.md](architecture/COUNTDOWN_PRESET_BUILDER.md), [DATA_MODEL.md](architecture/DATA_MODEL.md) | Current builder ownership, local state, preview simulation, read-only history, duplication, and persisted preset authority. |

## 4. Implementation Maps vs Normative Contracts

Normative contracts define rules future work must preserve:

- [INTERACTION_CONTRACT.md](architecture/INTERACTION_CONTRACT.md)
- [DATA_MODEL.md](architecture/DATA_MODEL.md)
- [AI_ASSISTANT_CONVERSATION_CONTRACT.md](contracts/AI_ASSISTANT_CONVERSATION_CONTRACT.md)
- [DESIGNER_AI_CAPABILITY_CONTRACT.md](contracts/DESIGNER_AI_CAPABILITY_CONTRACT.md)
- [CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md](contracts/CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md)
- [RENDER_COMPATIBILITY_MATRIX.md](contracts/RENDER_COMPATIBILITY_MATRIX.md)
- [IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md](contracts/IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md)
- [PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md](contracts/PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md)
- [GIFTS_SYSTEM_CONTRACT.md](contracts/GIFTS_SYSTEM_CONTRACT.md)
- [PUBLISHED_SHARE_IMAGE_CONTRACT.md](contracts/PUBLISHED_SHARE_IMAGE_CONTRACT.md)
- [GROUP_RENDER_MODEL.md](architecture/GROUP_RENDER_MODEL.md)
- Gallery focused contracts under `docs/contracts/GALLERY_*`
- [CSS_ARCHITECTURE_CONTRACT.md](architecture/CSS_ARCHITECTURE_CONTRACT.md)

Current implementation maps describe observed behavior and known compatibility paths:

- [ARCHITECTURE_OVERVIEW.md](architecture/ARCHITECTURE_OVERVIEW.md)
- [EDITOR_SYSTEM.md](architecture/EDITOR_SYSTEM.md)
- [AI_ASSISTANT_SYSTEM.md](architecture/AI_ASSISTANT_SYSTEM.md)
- [GUIDED_TOUR_SYSTEM.md](architecture/GUIDED_TOUR_SYSTEM.md)
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

These routes are selectors, not mandatory whole-document reading lists. Start
with the affected subsystem and expand only when its actual flow reaches another
boundary. Consult Architecture Guidelines for code changes and use maps/tests
to trace the concrete owners; do not load every adjacent domain preemptively.

For task-specific preparation and evidence, select [investigation](operations/CHANGE_WORKFLOW.md#investigar),
[bug fix](operations/CHANGE_WORKFLOW.md#corregir), [implementation](operations/CHANGE_WORKFLOW.md#implementar),
[refactor](operations/CHANGE_WORKFLOW.md#refactorizar), [performance](operations/CHANGE_WORKFLOW.md#rendimiento),
[review/audit](operations/CHANGE_WORKFLOW.md#revisar), or [documentation/tests](operations/CHANGE_WORKFLOW.md#documentar-tests).
This selection adds no permissions and does not replace the subsystem route.

### Permissions, Environments And Operational Risk

1. [ARCHITECTURE_GUIDELINES.md](architecture/ARCHITECTURE_GUIDELINES.md), Data & Backend Principles, for the existing ownership obligations.
   Use [SECURITY_CONTRACT.md](contracts/SECURITY_CONTRACT.md#access-matrix) for resource/actor/channel mapping and its explicitly proposed Q1 analysis; use the historical [4B1 baseline](testing/SECURITY_RULES_BASELINE_4B1.md), [4B2A comparison](testing/SECURITY_RULES_4B2A.md) and [4B2B countdown evidence](testing/SECURITY_RULES_4B2B.md) for executed evidence, not policy acceptance.
2. [SYSTEM_FRAGILITY_MAP.md](architecture/SYSTEM_FRAGILITY_MAP.md#operational-readiness), F10–F15 and the linked open decision, for local evidence, priorities and closure conditions. Before running development/emulator checks, use [DEVELOPMENT_WORKFLOW.md](operations/DEVELOPMENT_WORKFLOW.md) for the isolated 4A path.
3. The affected domain contract from this index; inspect `firestore.rules`, `storage.rules`, `src/firebase.js`, `functions/src/auth/adminAuth.ts`, and the actual caller as applicable.
4. For countdown protection/restore, [COUNTDOWN_PHASE_0_RUNBOOK.md](operations/COUNTDOWN_PHASE_0_RUNBOOK.md); for provider operations, [PROVIDER_DATA_MODEL.md](architecture/PROVIDER_DATA_MODEL.md) and [provider runbook](../scripts/providers/README.md).

These references do not constitute a complete security contract or an isolated
environment procedure. The risk register records those technical gaps; do not
assume a command is safe because its name contains `dev`, `emulators` or `dry-run`.

### Decisions And Missing Authority

- Cross-system choices: [architectural decision register](architecture/ARCHITECTURE_OVERVIEW.md#architectural-decisions) distinguishes current accepted obligations, implementation evidence and unrecorded historical alternatives; detailed decisions remain in their specific contracts.
- Conversational product choices: [AI_ASSISTANT_CONVERSATION_CONTRACT.md](contracts/AI_ASSISTANT_CONVERSATION_CONTRACT.md), section 2, keeps accepted choices and pending style questions together. Capability decisions belong to [DESIGNER_AI_CAPABILITY_CONTRACT.md](contracts/DESIGNER_AI_CAPABILITY_CONTRACT.md).
- Role policy unresolved across Rules/backend: [Q1 in the risk register](architecture/SYSTEM_FRAGILITY_MAP.md#open-operational-decisions) holds the question, alternatives, missing information and dependent change until an explicit policy is accepted.
- For other domains, search their canonical contract/map first. Record a necessary open question there with alternatives, missing evidence and the change it blocks; do not turn an ordinary bug or implementation task into a product decision.

### Core Architecture

1. [ARCHITECTURE_GUIDELINES.md](architecture/ARCHITECTURE_GUIDELINES.md)
2. [ARCHITECTURE_OVERVIEW.md](architecture/ARCHITECTURE_OVERVIEW.md)
3. [DATA_MODEL.md](architecture/DATA_MODEL.md)
4. [SYSTEM_FRAGILITY_MAP.md](architecture/SYSTEM_FRAGILITY_MAP.md) when assessing risk.

For code quality, use the [practical standards and tooling limits](architecture/ARCHITECTURE_GUIDELINES.md#code-quality-standards).
For actual ownership, start at [current boundaries](architecture/ARCHITECTURE_OVERVIEW.md#current-boundaries);
for shared consumers, use the [source/adapter/copy map](architecture/ARCHITECTURE_OVERVIEW.md#shared-contract-copies).
These maps distinguish current implementation/debt from standards for future changes.

### Editor System

1. [EDITOR_SYSTEM.md](architecture/EDITOR_SYSTEM.md)
2. [INTERACTION_CONTRACT.md](architecture/INTERACTION_CONTRACT.md)
3. [INTERACTION_SYSTEM_CURRENT_STATE.md](architecture/INTERACTION_SYSTEM_CURRENT_STATE.md)
4. [DATA_MODEL.md](architecture/DATA_MODEL.md)
5. [EDITOR_REGRESSION_CHECKLIST.md](testing/EDITOR_REGRESSION_CHECKLIST.md)

Add focused contracts when the editor change touches those surfaces:

- Assistant/guided tour: [GUIDED_TOUR_SYSTEM.md](architecture/GUIDED_TOUR_SYSTEM.md) as a current implementation map, plus `src/domain/editor/assistantGuidedTour.test.mjs` and `src/domain/editor/assistantSubsteps.test.mjs` as code-level anchors
- Designer AI: use the dedicated reading order below; add [GUIDED_TOUR_SYSTEM.md](architecture/GUIDED_TOUR_SYSTEM.md) only when preserving explicit tour isolation
- image roles/decorations: [IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md](contracts/IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md)
- grouping: [GROUP_RENDER_MODEL.md](architecture/GROUP_RENDER_MODEL.md)
- Gallery: [GALLERY_SYSTEM_CONTRACT.md](contracts/GALLERY_SYSTEM_CONTRACT.md) and [GALLERY_EDITOR_CONTRACT.md](contracts/GALLERY_EDITOR_CONTRACT.md)
- Regalos: [GIFTS_SYSTEM_CONTRACT.md](contracts/GIFTS_SYSTEM_CONTRACT.md)
- preview/publish output: [PREVIEW_SYSTEM_ANALYSIS.md](architecture/PREVIEW_SYSTEM_ANALYSIS.md) and [RENDER_COMPATIBILITY_MATRIX.md](contracts/RENDER_COMPATIBILITY_MATRIX.md)

### Designer AI

1. [AI_ASSISTANT_SYSTEM.md](architecture/AI_ASSISTANT_SYSTEM.md) for owners, flow, trust boundaries, sessions, persistence, streaming/cancellation, security, and current gaps.
2. [DESIGNER_AI_CAPABILITY_CONTRACT.md](contracts/DESIGNER_AI_CAPABILITY_CONTRACT.md) for actions, controls, required information, validation, completitud, and limits.
3. [AI_ASSISTANT_CONVERSATION_CONTRACT.md](contracts/AI_ASSISTANT_CONVERSATION_CONTRACT.md) for response behavior, approved language/personality/treatment rules, and the style decisions that remain pending.
4. Load the canonical product document for every affected domain; for Regalos use [GIFTS_SYSTEM_CONTRACT.md](contracts/GIFTS_SYSTEM_CONTRACT.md), for Gallery use its focused contracts, for portada use the image-placement contract, and for event/Dress Code use [DATA_MODEL.md](architecture/DATA_MODEL.md). Do not treat the assistant docs as a copy of product knowledge.
5. [GUIDED_TOUR_SYSTEM.md](architecture/GUIDED_TOUR_SYSTEM.md) when changes touch Assistant isolation, sidebar mounting, or shared controls.
6. [EDITOR_REGRESSION_CHECKLIST.md](testing/EDITOR_REGRESSION_CHECKLIST.md) and the code-level tests listed in the three documents above.

There is no `AI_ASSISTANT_RESPONSE_EVALUATION.md` yet. Create it only after a
versioned case matrix, reproducible graders, model/config identity, thresholds,
and result-recording workflow exist. Until then, durable examples belong to the
conversation contract and executable/manual checks remain with their owners.

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

For `gifts`, continue with
[GIFTS_SYSTEM_CONTRACT.md](contracts/GIFTS_SYSTEM_CONTRACT.md) for functional
semantics and with
[PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md](contracts/PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md)
when CTA/modal behavior is involved.

For the provider database, continue with
[PROVIDER_DATA_MODEL.md](architecture/PROVIDER_DATA_MODEL.md) and the operational
runbook at `scripts/providers/README.md`. The provider contract is independent
from invitation render-state contracts.

For the countdown administrative builder, continue with
[COUNTDOWN_PRESET_BUILDER.md](architecture/COUNTDOWN_PRESET_BUILDER.md) and the
Phase 0 operational runbook.

### Gallery Subsystem

1. [GALLERY_SYSTEM_CONTRACT.md](contracts/GALLERY_SYSTEM_CONTRACT.md)
2. [GALLERY_EDITOR_CONTRACT.md](contracts/GALLERY_EDITOR_CONTRACT.md) for editor/sidebar mutations.
3. [GALLERY_LAYOUT_PRESETS_CONTRACT.md](contracts/GALLERY_LAYOUT_PRESETS_CONTRACT.md) for preset availability and layout semantics.
4. [GALLERY_VIEWER_RENDER_CONTRACT.md](contracts/GALLERY_VIEWER_RENDER_CONTRACT.md) for generated HTML and public viewer behavior.
5. Add [DATA_MODEL.md](architecture/DATA_MODEL.md) for persistence, [EDITOR_SYSTEM.md](architecture/EDITOR_SYSTEM.md) for general editor ownership, or [RENDER_COMPATIBILITY_MATRIX.md](contracts/RENDER_COMPATIBILITY_MATRIX.md) for output only when the change reaches that boundary.

For a local Gallery mutation, start with the system/editor contracts,
`src/domain/gallery/galleryMutations.js`, `src/domain/gallery/sidebarModel.js`
and their tests. General interaction docs are needed if selection/drag/overlay
ownership is reached; Assistant, checkout and countdown docs are not default context.

### Editor Runtime, Persistence And Dashboard Capture

- Hydration, autosave, flush and bridges: [EDITOR_SYSTEM.md](architecture/EDITOR_SYSTEM.md) and the persistence/runtime sections of [ARCHITECTURE_OVERVIEW.md](architecture/ARCHITECTURE_OVERVIEW.md); start at `src/components/editor/persistence/editorSessionPersistence.js`, `src/components/editor/persistence/draftWriteCoordinator.js`, `src/lib/editorBridgeContracts.js`, `src/domain/drafts/criticalFlush.js` and `src/domain/drafts/flushGate.js` as applicable.
- Dashboard thumbnails/clean canvas export: the clean-image checks in [EDITOR_REGRESSION_CHECKLIST.md](testing/EDITOR_REGRESSION_CHECKLIST.md), `src/utils/dashboardCanvasExport.js`, `src/utils/guardarThumbnail.js` and `src/utils/dashboardCanvasExport.test.mjs`. Add the preview or share-image contract only if that distinct artifact is affected.

### Regalos

1. [GIFTS_SYSTEM_CONTRACT.md](contracts/GIFTS_SYSTEM_CONTRACT.md) for domain semantics, methods, visibility, completeness and owner routing.
2. [DATA_MODEL.md](architecture/DATA_MODEL.md) for the exact root `gifts` shape and persistence.
3. [PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md](contracts/PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md) for `regalo-boton`, modal readiness and preview/publish behavior.
4. [DESIGNER_AI_CAPABILITY_CONTRACT.md](contracts/DESIGNER_AI_CAPABILITY_CONTRACT.md) only when changing the portion accessible to Diseñador AI.

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

For countdown inventory, backup/restore, telemetry, feature flags, and the
frozen-clock visual baseline, use
[COUNTDOWN_PHASE_0_RUNBOOK.md](operations/COUNTDOWN_PHASE_0_RUNBOOK.md).

<a id="verification-entry-points"></a>

### Verification Entry Points And Command Effects

Choose checks from the affected contract and inspect their imports/setup before
running them. The 5C shared-copy/watch and integrated entries were revalidated on
2026-09-12; the 4A/5A local entries retain their 2026-09-11 baseline; other
definitions retain the 2026-09-10 inspection baseline. Recheck the current
scripts before use. This list is navigation, not permission to operate services.

| Entry | Actual effect / limitation |
| --- | --- |
| `node --test <verified-test-path>` | Runs selected Node tests. Inspect the chosen file for build, filesystem, network or emulator setup; the runner name alone promises no isolation. Root and Functions packages currently have no general `test` script. |
| `npm --prefix functions run build` | Synchronizes mapped shared copies, compiles TypeScript into `functions/lib/`, then checks all mapped targets. Reports prior differences; this is a write operation. |
| `npm --prefix functions run build:watch` | Observes mapped canonical sources and Functions src/tsconfig in its own tree; serial sync/compile/check, explicit errors/readiness, bounded compiler and owned cleanup. Does not propagate original-tree edits into prepared copies or reload live Functions modules. [5C effects and restarts](operations/DEVELOPMENT_WORKFLOW.md#shared-contracts-5c). |
| `npm --prefix functions run contracts:check`, `contracts:check:built` | Read-only byte comparisons from the single map. Input check permits absent compiled output; built check requires all destinations. Missing/unreadable/different files fail with concrete paths and hashes. Neither command repairs copies. |
| `npm --prefix functions run contracts:sync`, `test:contracts` | Sync explicitly writes only differing mapped copies and records prior state. Tests use a disposable copy and the existing isolation/process supervisor to exercise watch, negative cases and real consumption; selected synthetic evidence is retained. |
| `npm run build` | Captures retained static assets, runs Next build/export according to configuration, finalizes retained assets and verifies the static release; writes build/history artifacts. It does not replace domain tests or Rules checks. |
| `npm run dev`, `npm run dev:functions`, `npm run dev:emulators`, `npm run dev:reset`, `npm run emulators` | Start a new isolated demo session, build in a working-tree source copy, connect all four emulators and block unreviewed handlers. See [Development Workflow](operations/DEVELOPMENT_WORKFLOW.md) for destinations, generated files and limits. |
| `npm run local:prepare` | Public-network preparation in a disposable current-source copy: three lockfiles, pinned local CLI, emulator JARs and Puppeteer Chrome; empty personal/npm config, no production credentials. Does not alter the original dependency trees. Prints the prepared workspace; repeat after source changes. [Preparation](operations/DEVELOPMENT_WORKFLOW.md#verification-5a). |
| `npm run verify:local` | Canonical 5A/5B/5C gate from the prepared workspace: prerequisites, input-copy check before sync, mandatory Functions lint with visible warnings, tooling/static CI checks, sync/watch behavior tests, configuration once, temporary sync/Functions compilation and built-copy check before consumers, backend/blocked-transport compatibility, Rules/countdown, synthetic SDK/callable/browser integration and offline/no-fallback check. Sequential shared resources; fresh Rules/hashes, explicit stage reports, deadlines and owned-process cleanup. No frontend lint, production Next build, all-domain coverage, Q1 acceptance or remote verification. |
| `npm --prefix functions run lint` | Same Functions script used by the integrated gate. Discovers TS/TSX/JS/CJS/MJS application sources, scripts, config and tests; excludes compiled output and exact mapped generated copies, linting their canonical sources instead. Zero errors required; warnings and source/configuration hashes remain in the report. [Coverage and diagnosis](operations/DEVELOPMENT_WORKFLOW.md#functions-lint-5b). |
| `npm run local:check`, `npm run test:local:unit`, `npm run test:local` | Individual prerequisite, configuration and synthetic integration checks remain available. `test:local` includes unit checks; do not repeat them before the integrated gate. These individual entries do not evaluate Rules authorization. |
| `npm run test:local:rules` | Dedicated Rules suite (4B1/4B2A/4B2B), reused by `verify:local` and therefore by Hosting's prerequisite CI job. Client allow/deny, synthetic fixtures, separate backend-helper characterization and pending Q1 probes; existing countdown behavior/static/mixed checks. Acceptance/characterization assertion failures return nonzero. See [runbook](operations/DEVELOPMENT_WORKFLOW.md#rules-4b1). |
| `npm run test:local:negative` | Opt-in demonstration in another disposable copy: stale input contract, new valid TypeScript with a lint error, deliberate cross-owner acceptance regression, canonical nonzero exit, synthetic dependent stage blocked, interruption, missing CLI/invalid destination and owned cleanup. `-- --contracts-only` selects only the 5C stale-copy control. Never mutates original sources or runs Hosting; requires the same prepared tools. [5A historical evidence](testing/LOCAL_VERIFICATION_5A.md), [5B evidence](testing/FUNCTIONS_LINT_5B.md), [5C evidence](testing/SHARED_CONTRACTS_5C.md). |
| Migration, inventory, baseline and deploy entries in [package.json](../package.json) / [Functions package](../functions/package.json) | Effects vary: even dry runs may read real data and generate reports or compile code. Inspect the implementation and applicable runbook; deployment and migration require their own authorization. |

Documentation-only work normally needs diff, reference and authority checks;
application builds or broad runtime suites are not automatically required.
Report actual execution and omissions under the Definition of Done in AGENTS.md.

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

- Consult this index before selecting context. Search for an existing authority
  before creating a document; update the smallest owner of the durable rule.
- Keep one canonical owner per rule. AGENTS.md owns the global procedure,
  CHANGE_WORKFLOW.md owns task-specific preparation/evidence, this index owns
  navigation/governance, Architecture Guidelines owns general standards,
  subsystem contracts/maps own their obligations/knowledge, and the fragility map
  owns current risks and closure conditions. Link rather than copy those rules.
- Update docs selectively when durable behavior, authority, schema, lifecycle,
  compatibility, operation, verification guidance or a reference changes. A bug
  fixed toward an unchanged contract or an internal refactor/formatting change
  needs no normative rewrite; correct a map or anchor only if it became stale.
- An authorized implementation that changes a contract must update that contract
  and its affected consumers/tests/references in the same change. A separately
  accepted design decision may be documented first with implementation pending.
- Follow section 0 before resolving drift. Do not synchronize prose/tests to a
  defect or erase an unresolved contradiction between accepted authorities.
- Update this index when paths, routing, authority, status, reading order or
  replacements change, not automatically for every implementation modification.
- Retain useful history clearly marked as historical, replaced or rejected, with
  a current replacement when one exists. Do not promote old plans by inference.
- Verify modified links, file paths, symbols and command definitions. Do not link
  to future documents as if they exist. New durable docs need status, scope,
  authority and a maintenance trigger; do not create empty or parallel rule sets.
