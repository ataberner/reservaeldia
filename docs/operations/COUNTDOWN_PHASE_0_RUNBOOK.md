# Countdown Phase 0 Runbook

Status: Operational Diagnostic Evidence.

This runbook covers the protection and observability infrastructure that must
exist before countdown behavior, compatibility, or rendering is changed. It
does not authorize a migration or a restore.

Code remains the source of truth. The shared Phase 0 authority is
`shared/countdownPhase0Contract.cjs`; the ESM wrapper and the synchronized
Functions copies expose that same contract to the browser and backend without
creating parallel schemas.

## Scope And Safety

Phase 0 adds:

- a read-only production inventory;
- a restorable local backup format;
- aggregate, non-personal countdown telemetry;
- deterministic visual captures with a frozen clock;
- four independent feature-flag definitions, all disabled by default.

It deliberately does not change:

- countdown builder controls or persistence;
- countdown render output;
- temporal or expiration semantics;
- legacy read compatibility;
- preset publication behavior.

Runtime reports and backups are written below
`artifacts/countdown-phase0/runtime/`, which is ignored by Git. They may contain
full Firestore documents and published artifacts and must be handled as
production backups, not committed as test fixtures.

## Authentication And Target

The inventory and backup commands use Firebase Admin application-default
credentials. The target project is resolved from `--project`,
`GCLOUD_PROJECT`, `GOOGLE_CLOUD_PROJECT`, or `.firebaserc`, in that order. The
Storage bucket is resolved from `--bucket`, `FIREBASE_STORAGE_BUCKET`, or the
current production default.

Always verify the resolved project and bucket printed in the output. These
commands can incur Firestore and Storage read costs.

## Read-Only Inventory

Run:

```bash
npm run countdowns:inventory
```

Optional parameters:

```bash
node scripts/countdownPhase0.cjs inventory \
  --project reservaeldia-7a440 \
  --bucket reservaeldia-7a440.firebasestorage.app \
  --output artifacts/countdown-phase0/runtime/inventory.json
```

The implementation only performs Firestore `get` operations and Storage
metadata/download/list operations. It does not call Firestore writes, Storage
uploads, deletes, metadata updates, or callable mutation endpoints.

The report covers:

- every `countdownPresets` root and `versions` child;
- active versions, root drafts, draft version markers, and published versions;
- root/version `migrationSource`, schema and render-contract metadata;
- legacy preset properties;
- every countdown reachable through `borradores` and `plantillas`, including
  children of `grupo` objects;
- `countdownSchemaVersion`, `presetVersion`, preset references, legacy temporal
  aliases, legacy render branches, and frame references;
- active and historical publication documents connected to countdown drafts;
- countdown roots detected in published `index.html` artifacts;
- all objects below `assets/countdown/`;
- missing preset, version, and asset references detected by the scan.

The generated report has `readOnly: true`. It contains document paths and
preset identifiers for diagnosis, but does not duplicate complete documents.

## Backup, Verification, And Restore

Create a backup immediately before a future migration:

```bash
npm run countdowns:backup
```

The archive contains:

- every countdown preset root and immutable version;
- each draft or template document that contains a countdown;
- the publication documents connected to those countdowns;
- every Storage asset below `assets/countdown/`;
- complete published artifact prefixes whose `index.html` contains countdowns;
- Firestore typed values, document read/update/create metadata, Storage
  metadata, source generations, byte sizes, and SHA-256 hashes;
- the read-only inventory captured from the same source scan.

Files are content-addressed inside the archive. `manifest.json` is protected by
a SHA-256 checksum and records the exact project and bucket.

Verify an archive without network or writes:

```bash
npm run countdowns:backup:verify -- --archive <archive-directory>
```

Build a restore plan:

```bash
npm run countdowns:restore:plan -- --archive <archive-directory>
```

Restore is a dry-run unless both `--apply` and the exact
`--confirm-project <project-id>` are supplied. It refuses existing documents or
assets unless `--overwrite` is also explicitly supplied. Restore paths are
allowlisted to the countdown-related Firestore collections and to
`assets/countdown/` or `publicadas/` in Storage.

An authorized restore has this shape:

```bash
node scripts/countdownPhase0.cjs restore \
  --archive <archive-directory> \
  --apply \
  --confirm-project <exact-project-id>
```

Do not use `--overwrite` until the dry-run plan has been reviewed and the
incident owner has approved replacement of every existing target. A restore
uploads assets first and writes full Firestore documents second; rollback for a
failed restoration is another verified archive or the provider-level backup.

## Telemetry Contract

The event name is `countdown_observability_v1`.

Browser surfaces send aggregate parameters through the existing Google
Analytics `gtag`/`dataLayer` runtime when it is available. Backend preview and
publication preparation write the same sanitized event contract to structured
Cloud Logging. The event records:

- renderer and event type;
- countdown count;
- counts grouped by `countdownSchemaVersion` and `presetVersion`;
- count of objects that used the frozen legacy branch;
- counts grouped by legacy alias and `migrationSource`;
- counts of preset and frame references;
- the four feature-flag states;
- sanitized error code and asset kind for render/asset failures.

It never records user ids, slugs, preset ids, invitation ids, target dates,
asset URLs, free-form error messages, or countdown content. In development, the
latest sanitized browser events are inspectable at
`window.__COUNTDOWN_TELEMETRY_V1`.

Backend events can be located in Cloud Logging with the message
`countdown_observability_v1` and filtered by structured fields such as
`jsonPayload.renderer`, `jsonPayload.legacyBranchCount`, or
`jsonPayload.errorCode`.

## Feature Flags

All flags are independent and default to `false`:

| Capability | Server environment | Browser/build environment |
| --- | --- | --- |
| New renderer | `COUNTDOWN_NEW_RENDERER_ENABLED` | `NEXT_PUBLIC_COUNTDOWN_NEW_RENDERER_ENABLED` |
| New lifecycle | `COUNTDOWN_NEW_LIFECYCLE_ENABLED` | `NEXT_PUBLIC_COUNTDOWN_NEW_LIFECYCLE_ENABLED` |
| New catalog | `COUNTDOWN_NEW_CATALOG_ENABLED` | `NEXT_PUBLIC_COUNTDOWN_NEW_CATALOG_ENABLED` |
| New temporal system | `COUNTDOWN_NEW_TEMPORAL_SYSTEM_ENABLED` | `NEXT_PUBLIC_COUNTDOWN_NEW_TEMPORAL_SYSTEM_ENABLED` |

Accepted true values are `1`, `true`, `on`, `yes`, and `enabled`; accepted false
values are `0`, `false`, `off`, `no`, and `disabled`.

During Phase 0 the flags expose rollout state to the future owning modules and
to telemetry, but intentionally do not redirect traffic: those new
implementations do not exist yet. A future phase must use these shared flags at
the existing authority boundary, not add a second flag resolver.

## Deterministic Countdown Visual Baseline

The countdown-specific baseline uses actual current components and the current
HTML generator. It freezes time at `2030-06-15T12:00:00.000Z` and captures:

- Builder;
- Canvas;
- Preview HTML;
- Publication HTML;
- Publication mobile.

Each surface is captured in four states:

- days remaining;
- hours remaining;
- seconds remaining;
- expired.

The fixture authority is `shared/countdownVisualBaselineFixtures.mjs`. Committed
images and their checksums live in
`artifacts/countdown-phase0/baseline/manifest.json`.

Validate the committed baseline:

```bash
npm run countdowns:baseline:check
```

Update it only when an intentional, reviewed render change has been approved:

```bash
npm run countdowns:baseline:update
```

The development-only harness is available at
`/admin/countdown-presets/?countdownBaseline=1&state=days`. It bypasses the
admin shell only when `NODE_ENV=development`; no production route or permission
behavior is changed.

The check compares exact PNG hashes first. When Chromium differs only in
subpixel rasterization, it accepts at most a 2/255 channel delta across no more
than 0.01% of channels and reports every tolerated capture. Different
dimensions or any larger visual delta still fail. The committed manifest/hash
test independently protects artifact integrity.

## Phase 0 Acceptance Check

Before starting a countdown migration:

1. Generate and review a fresh inventory.
2. Generate a backup from the same production target.
3. Verify the archive offline.
4. Run the restore dry-run and review collisions.
5. Confirm telemetry is receiving render summaries and has no personal fields.
6. Run the deterministic baseline check.
7. Confirm all four flags are off in production unless a later rollout has an
   explicit owner and rollback plan.
