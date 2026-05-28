# Checkout Publication Lifecycle Contract

Status: Canonical Contract.

## Scope

This contract governs the production lifecycle for creating, paying, approving,
publishing, retrying, and exposing a public invitation.

It is authoritative for:

- checkout session creation and payment status handling
- public slug reservation and conflict recovery
- approved-payment publication execution
- final public URL creation
- post-payment UI state
- retry and recovery behavior
- public delivery through `/i/{slug}`

It does not own visual render internals, generated HTML compatibility, social
share image rendering internals, or CTA behavior. Those are owned by:

- [PREVIEW_SYSTEM_ANALYSIS.md](../architecture/PREVIEW_SYSTEM_ANALYSIS.md)
- [RENDER_COMPATIBILITY_MATRIX.md](RENDER_COMPATIBILITY_MATRIX.md)
- [PUBLISHED_SHARE_IMAGE_CONTRACT.md](PUBLISHED_SHARE_IMAGE_CONTRACT.md)
- [PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md](PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md)

Data shape details remain in [DATA_MODEL.md](../architecture/DATA_MODEL.md).
This document defines the lifecycle authority across those data shapes.

## Implementation Anchors

Frontend anchors:

- `src/components/payments/PublicationCheckoutModal.jsx`
- `src/domain/payments/publicationCheckoutState.js`
- `src/domain/dashboard/previewPipeline.js`
- `src/domain/dashboard/previewSession.js`
- `src/pages/dashboard.js`

Backend anchors:

- `functions/src/payments/publicationPayments.ts`
- `functions/src/payments/publicationCheckoutSessionFlow.ts`
- `functions/src/payments/publicationApprovedSessionFlow.ts`
- `functions/src/payments/publicationPublishExecution.ts`
- `functions/src/payments/publicationOperationPlanning.ts`
- `functions/src/payments/publicationOperationExecution.ts`
- `functions/src/payments/publicationSlugReservationFlow.ts`
- `functions/src/payments/publicationLifecycle.ts`
- `functions/src/payments/publishedShareImage.ts`
- `functions/src/payments/publishedShareImageRenderer.ts`
- `functions/src/index.ts`

## Authoritative Entities

`borradores`
: Editable source of truth for invitation render state. It owns `objetos`,
`secciones`, `rsvp`, `gifts`, and draft-side lifecycle mirrors such as
`slugPublico`, `publicationLifecycle`, `ultimaPublicacion`,
`ultimaOperacionPublicacion`, and `lastPaymentSessionId`. A draft does not prove
publication success.

`publication_checkout_sessions`
: Authoritative post-payment lifecycle record. After payment approval, this
document is the source of truth for whether publication is still processing,
retryable, conflicted, expired, rejected, or published. Key fields include
`uid`, `draftSlug`, `operation`, `publicSlug`, `status`, `expiresAt`,
`mpPaymentId`, `mpStatus`, `mpStatusDetail`, `publicUrl`, `receipt`,
`lastError`, `publishingStage`, `publishingStageDurationsMs`, `createdAt`, and
`updatedAt`.

`public_slug_reservations`
: Reservation record keyed by requested public slug. Current statuses are
`active`, `consumed`, `released`, and `expired`. Reservations prevent two live
checkout flows from claiming the same slug before payment settlement.

`publicadas`
: Active public publication metadata keyed by public slug. It stores lifecycle,
RSVP/gifts config, share metadata, icon usage, public URL metadata, and linkage
back to the draft. It must not store canonical render arrays as the public
delivery source.

`publicadas_historial`
: Finalized publication snapshots. Finalization writes history before deleting
the active public document/storage prefix and before updating the linked draft.

`publicadas/{slug}/index.html`
: Firebase Storage artifact served to public visitors. This is the final public
invitation HTML.

`publicadas/{slug}/share.jpg`
: Firebase Storage artifact used by generated Open Graph metadata and served
through `/i/{slug}/share.jpg` only when current `publicadas/{slug}.share`
metadata validates it as the generated share image for the requested version.

## Checkout Session Statuses

The current checkout session status union is:

- `awaiting_payment`
- `payment_processing`
- `payment_rejected`
- `payment_approved`
- `publishing`
- `published`
- `approved_slug_conflict`
- `expired`

There is no persisted checkout status named `cancelled`, `failed`, `retrying`,
or `publication_planned`. Mercado Pago `cancelled` maps to
`payment_rejected`. `awaiting_retry` is a return shape from
`retryPaidPublicationWithNewSlug`, not a stored checkout session status.

## Publication Progress Fields

Publication progress is additive metadata on
`publication_checkout_sessions/{sessionId}`. It must not replace or compete with
`status`.

`publishingStage`
: Current or last publish execution stage. Shape:

```ts
{
  key:
    | "preparing_invitation"
    | "validating_content"
    | "generating_public_html"
    | "generating_share_image"
    | "saving_publication"
    | "finalizing_publication",
  label: string,
  order: number,
  status: "running" | "completed" | "failed",
  startedAt?: Timestamp,
  completedAt?: Timestamp,
  failedAt?: Timestamp,
  updatedAt: Timestamp,
  durationMs?: number,
  errorCode?: string,
}
```

`publishingStageDurationsMs`
: Optional diagnostic map keyed by stage key. Values are elapsed milliseconds
measured by the backend process. These values are for diagnostics and UI
context, not billing, lifecycle authority, or retry decisions.

`publishingShareImageSubstage`
: Optional diagnostic field used only while `publishingStage.key` is
`generating_share_image`. Shape:

```ts
{
  key: string,
  label: string,
  status: "running" | "completed" | "failed",
  startedAt?: Timestamp,
  completedAt?: Timestamp,
  failedAt?: Timestamp,
  updatedAt: Timestamp,
  durationMs?: number,
  errorCode?: string,
}
```

Known current substage keys include `preparing_renderer_html`,
`preparing_renderer`, `resolving_chromium`, `launching_browser`,
`loading_html`, `waiting_document`, `waiting_fonts`,
`isolating_first_section`, `waiting_images`, `settling_layout`,
`capturing_screenshot`, `optimizing_image`, `saving_image`, and
`confirming_image`. These keys are diagnostic only and may expand as the same
renderer pipeline becomes more observable.

`publishingShareImageDiagnostics`
: Optional technical diagnostic map for the latest share-image substage. It may
include counters such as `htmlBytes`, `imageCount`, `lazyImageCount`,
`firstSectionImageCount`, `outsideFirstSectionImageCount`,
`ignoredImageCount`, `pendingFirstSectionImageHostsSample`,
`pendingFirstSectionImageUrlSample`, `failedImageHostsSample`,
`captureClipWidth`, `captureClipHeight`, `sectionRectWidth`,
`sectionRectHeight`, `documentScrollWidth`, `documentScrollHeight`,
`firstSectionNodeCount`, `fontStylesheetCount`, `externalHostCount`, memory
snapshots, `renderTimeoutMs`, `storagePath`, and `errorCode`. It must remain
small, Firestore-safe, and free of raw HTML or large URL lists.

Rules:

- Only the backend writes these fields.
- The frontend may display these fields but must not infer successful publish
  from them.
- `published` plus backend `publicUrl`/`receipt.publicUrl` remains the only
  success signal.
- `payment_approved` plus `lastError` is a retryable publish failure, not an
  indefinite processing state.
- Stage progress must come from real backend stage transitions, not client-side
  timers or fake percentage bars.
- Share-image substage and diagnostic fields are additive debugging metadata.
  They must not replace `status`, `lastError`, or the generated share-image
  fail-closed contract.

## Lifecycle State Machine

1. Draft created
   - `borradores/{draftSlug}` exists and carries editable render state.
   - Draft-side `publicationLifecycle.state` may be absent or `draft`.
   - No public publication success is implied.

2. Checkout started
   - `createPublicationCheckoutSession` validates draft ownership and runs
     backend publish preflight with `prepareRenderPayload(...)` and
     `validatePreparedRenderPayload(...)`.
   - For `operation: "new"`, the requested public slug is validated and
     reserved before the session is created.
   - The checkout session is written with `status: "awaiting_payment"` and an
     `expiresAt`.

3. Slug reserved
   - `public_slug_reservations/{slug}` is written with `status: "active"`,
     `uid`, `draftSlug`, `sessionId`, and `expiresAt`.
   - `operation: "update"` reuses the active linked public slug and does not
     create a new reservation.

4. Payment pending
   - Before a Mercado Pago result, the session remains `awaiting_payment`.
   - Mercado Pago in-process results write `status: "payment_processing"` plus
     `mpPaymentId`, `mpStatus`, and `mpStatusDetail`.

5. Payment approved
   - Mercado Pago `approved`, or zero-amount auto approval, writes
     `status: "payment_approved"`.
   - Approval alone is not publication success.

6. Publication executing
   - `publicationApprovedSessionFlow.ts` attempts to claim the approved session.
   - The persisted execution marker is `status: "publishing"`.
   - While `status: "publishing"`, the backend may persist
     `publishingStage` as an additive progress/debug field. This field is
     descriptive only; it does not create a second lifecycle state machine.
   - `publicationOperationPlanning.ts` shapes in-memory plans for session,
     reservation, publication, draft, history, and artifact effects. There is no
     separate persisted "planned" checkout status.

7. Published
   - Successful execution writes the checkout session to `status: "published"`
     with backend `publicUrl` and `receipt`.
   - For new publication, the slug reservation is marked `consumed`.
   - `publicadas/{slug}` and the linked draft are updated after the required
     Storage artifacts and generated share metadata are ready.

8. Retryable publication failure
- A non-conflict publish execution failure keeps the paid session retryable
  by writing `status: "payment_approved"` with `lastError`.
- If the failure happened after a reported publish stage started, the backend
  should leave `publishingStage.status: "failed"` on the stage that failed so
  the UI can explain where the retryable failure occurred.
- If the failure happened inside generated share-image work, the backend should
  leave `publishingShareImageSubstage` and `publishingShareImageDiagnostics`
  with the latest known substep so support can tell whether the failure was
  Chromium startup, HTML load, font readiness, image readiness, screenshot,
  Sharp normalization, Storage upload, or confirmation.
   - A slug conflict writes `status: "approved_slug_conflict"` and releases the
     reservation for the conflicted slug.

9. Terminal payment/session outcomes
   - `payment_rejected` is written for Mercado Pago rejected or cancelled
     payments.
   - `expired` is written when a non-terminal session passes `expiresAt`; new
     publication reservations are marked `expired`.
   - `published`, `payment_rejected`, `approved_slug_conflict`, and `expired`
     are terminal for automatic session expiration.

## Source Of Truth Rules

- After payment approval, `publication_checkout_sessions/{sessionId}` is the
  authoritative lifecycle source for the checkout/publication attempt.
- Publication success must come from backend state: `sessionStatus`/`status`
  `published` plus a backend `publicUrl` or `receipt.publicUrl`.
- Mercado Pago approval alone is not publication success.
- Draft metadata such as `slugPublico` or `publicationLifecycle.state` is not
  publication success.
- `publicadas/{slug}` metadata alone is not enough for public success when the
  required Storage artifacts or public URL are missing.
- Parent dashboard/preview state reflects backend publication truth. It must not
  create a second publication authority.
- The legacy `publicarInvitacion` callable still requires an approved
  `paymentSessionId` and delegates through `publishWithApprovedPaymentSession`;
  it is not a payment bypass.

## Slug Reservation Contract

For `operation: "new"`:

- Slug availability checks `publicadas/{slug}` first.
- If the active publication is expired, availability may finalize it before
  returning available.
- Active, unexpired publications make the slug unavailable.
- Existing active reservations make the slug unavailable unless they belong to
  the same `uid` and `draftSlug`, or are expired/non-active.
- Reservation is transactional against the publication document and reservation
  document.
- The reservation stores `slug`, `uid`, `draftSlug`, `sessionId`, `status:
  "active"`, `expiresAt`, `createdAt`, and `updatedAt`.

Reservation status transitions:

- successful new publication: `active` -> `consumed`
- Mercado Pago preference creation failure: `active` -> `released`
- approved slug conflict: `active` -> `released`
- retry with a new slug: old slug is released and new slug is reserved
- expired checkout session: `active` -> `expired`
- finalized active publication: reservation is released as part of finalization

For `operation: "update"`:

- The backend resolves the existing active linked slug from the draft/publication
  linkage.
- The user does not choose a new slug in normal update checkout.

Must never happen:

- silently publish under a different slug selected only by the frontend
- publish under a slug different from the approved session `publicSlug`
- consume or release a reservation whose `sessionId` does not match the session
- treat a stale reservation owned by another draft/user as safe to override

## Publication Execution Contract

Approved-session publication execution is backend-owned:

1. The backend reads and owns the approved checkout session.
2. It claims execution by moving a compatible status to `publishing`.
3. It re-reads the draft and validates ownership.
4. It validates the requested public slug against the checkout session.
5. It handles expired existing publications before publish/update gating.
6. It rejects cross-owner slug reuse, duplicate new-publication slugs, missing
   update publications, trashed update publications, and update attempts linked
   to another draft.
7. It rebuilds the prepared render payload and re-runs publish validation.
8. It generates base published HTML through
   `generateHtmlFromPreparedRenderPayload(...)`.
9. It generates, uploads, and confirms `publicadas/{slug}/share.jpg` through
   the share-image contract.
10. It injects final Open Graph metadata using the generated share metadata.
11. It writes `publicadas/{slug}/index.html`.
12. It writes `publicadas/{slug}` metadata and linked draft publication mirrors.
13. It records first-publication analytics after successful writes where
    applicable.

Share-image generation is part of successful publish execution. A new
publish/republish must fail closed if the generated share image cannot be
created and confirmed as required by
[PUBLISHED_SHARE_IMAGE_CONTRACT.md](PUBLISHED_SHARE_IMAGE_CONTRACT.md).

For update publishes, execution backs up existing `index.html` and `share.jpg`
and attempts restore/delete cleanup if the new publish attempt fails after
artifact writes begin.

## Retry And Recovery Contract

`approved_slug_conflict`
: The payment is approved, but the selected public slug can no longer be used.
The session remains paid and recoverable through
`retryPaidPublicationWithNewSlug`.

`retryPaidPublicationWithNewSlug`
: Requires session status `approved_slug_conflict`. It validates and reserves a
new slug, releases the old session-linked reservation, writes the session back
to `payment_approved`, clears `lastError`, and immediately attempts approved
session finalization again.

Retryable non-conflict failures
: Publish errors after payment approval write the session back to
`payment_approved` with `lastError`. A backend retry may call approved-session
settlement again. Frontend-only retries must not bypass this backend lifecycle.

Terminal failures
: `payment_rejected` and `expired` are terminal for the current checkout
session. A user-facing retry for those states starts a new checkout session.

Idempotency expectations:

- Mercado Pago payment creation uses `publication-{sessionId}` as idempotency
  key.
- Repeated settlement of an already `published` session returns the persisted
  `publicUrl` and `receipt` without republishing.
- A session already in `publishing` is not claimed again by the same planning
  rule; callers receive the current session result instead of duplicating work.
- Retrying an approved slug conflict is backend-controlled and must either
  publish with the newly reserved slug or return an awaiting-retry response.

## Frontend/UI Contract

`PublicationCheckoutModal` must interpret backend/session state as follows:

- `published`: terminal success only when a backend `publicUrl` or
  `receipt.publicUrl` is available. The modal preserves receipt state and
  notifies the parent dashboard with the backend URL and slug.
- `approved_slug_conflict`: paid but unresolved. The modal must show the
  conflict recovery flow and call `retryPaidPublicationWithNewSlug` with a new
  validated slug.
- `payment_processing` or `payment_approved`: processing state. The modal may
  poll `getPublicationCheckoutStatus`.
- `payment_approved` with `lastError`: paid but publish failed in a retryable
  way. The modal must not keep showing indefinite processing; it should show the
  failed `publishingStage` when present and avoid exposing raw renderer/debug
  codes as primary user copy.
- `publishing`: backend execution has claimed the paid session. The modal must
  continue treating the attempt as processing and must not show success until
  backend status becomes `published` with a final URL.
- `payment_rejected`: failure state for the current payment attempt.
- `expired`: failure state for the current session.
- `awaiting_payment`: normal pre-payment state.

The modal initialization must be keyed to modal visibility plus checkout context
(`draftSlug` and `operation`). Parent publication sync must not reset a visible
terminal success receipt back into the slug/payment form.

Frontend code must not infer success from:

- draft state
- preview state
- Mercado Pago approval alone
- slug availability alone
- `slugPublico` or `urlPublicaVistaPrevia` props alone

`publicUrl` returned at the top level should be preferred. `receipt.publicUrl`
is the fallback used by the domain helper when top-level `publicUrl` is absent.

## Public Delivery Contract

The public invitation is served from the Storage artifact:

```txt
publicadas/{slug}/index.html
```

Public visitors hit `/i/{slug}`. Firebase Hosting rewrites to
`verInvitacionPublicada`, which:

1. normalizes the slug
2. reads `publicadas/{slug}`
3. resolves lifecycle through `resolvePublicationLifecycleSnapshotFromData`
4. rejects missing, inaccessible, trashed, finalized, or expired publications
5. finalizes expired publications on access when needed
6. reads `publicadas/{slug}/index.html`
7. returns HTML only if the artifact exists

Share image delivery uses `/i/{slug}/share.jpg?v={share.version}` and must
validate both current lifecycle access and current generated share metadata
before reading `publicadas/{slug}/share.jpg`.

`publicadas/{slug}.urlPublica`, checkout `publicUrl`, and receipt `publicUrl`
must point to the public route form:

```txt
https://reservaeldia.com.ar/i/{slug}
```

## Testing Anchors

Automated anchors:

- `src/domain/payments/publicationCheckoutState.test.mjs`
- `functions/publicationCheckoutSessionFlow.test.mjs`
- `functions/publicationApprovedSessionFlow.test.mjs`
- `functions/publicationOperationPlanning.test.mjs`
- `functions/publicationOperationExecution.test.mjs`
- `functions/publicationSlugReservationFlow.test.mjs`
- `functions/publicationPaymentReads.test.mjs`
- `functions/publicationPaymentEdge.test.mjs`
- `functions/publicationPublishExecution.test.mjs`
- `functions/publicationPublishValidation.test.mjs`
- `functions/publicationLifecycle.test.mjs`
- `functions/publicationFinalizationFlow.test.mjs`
- `functions/publicationWritePreparation.test.mjs`

Required manual checks for production release:

- checkout happy path for `operation: "new"`
- checkout happy path for `operation: "update"`
- zero-amount discount auto-approval path
- Mercado Pago approved but publish failed, followed by backend retry
- approved slug conflict followed by retry with a new slug
- expired checkout session releases/expires a new-publication reservation
- rejected/cancelled payment shows failure without publishing
- public `/i/{slug}` serves only after `published` backend success and artifact
  existence
- `/i/{slug}/share.jpg?v=...` serves only the current generated share image

## Anti-Patterns

Future agents must not:

- infer publish success from Mercado Pago approval alone
- duplicate checkout/session authority in the dashboard
- bypass backend prepared validation
- write `publicadas` metadata as successful before required artifacts are valid
- treat share-image fallback metadata as successful new publish output
- mutate draft state to simulate publication success
- publish under a conflicting slug without backend-controlled resolution
- add frontend-only retries that bypass backend lifecycle rules
- treat `awaiting_retry` as a stored checkout session status
- introduce a second slug conflict resolver outside
  `retryPaidPublicationWithNewSlug`
- serve public HTML directly from draft state
- reuse stale `share` metadata for a new successful publish

## Known Implementation Notes

- The request-facing payment shell remains concentrated in
  `publicationPayments.ts`, while deeper planning/execution logic is extracted
  into focused helpers.
- The code currently has `publicationSlugReservationFlow.ts` and
  `publicationLifecycle.ts`; there are no files named
  `publicationSlugReservations.ts` or `publicationStatus.ts`.
- Checkout status `cancelled` is not persisted; Mercado Pago `cancelled` maps
  to `payment_rejected`.
- Publication planning is a helper phase, not a persisted checkout status.
