# Provider directory operations

Status: Operational Runbook.

Current-implementation snapshot revalidated: 2026-07-27.

This runbook covers local validation and the explicit operations for provider
data. It is not the schema contract, an architecture map, a test result, or a
record of remote deployment state. No real Firebase writes are performed
merely by building, testing, or running a default/local dry-run.

Read the contract first:
`docs/architecture/PROVIDER_DATA_MODEL.md`.

Labels used below:

- **[Current implementation]**: verified against the current scripts/tests;
- **[Compatibility]**: an older-document/state branch retained by code;
- **[Assumption]**: an external operational fact not provable from this repo;
- **[Pending]**: not implemented or still requires an external decision;
- **[Historical]**: context only, never present-tense implementation authority.

**[Historical] [Assumption]** Git history and prior operator notes say an
earlier provider import populated the target project before the category seed
became canonical. This repository cannot prove current remote documents,
whether the corrective category seed ran, or whether rules/indexes are
deployed. Every apply must re-establish those facts through its current
preflight and reviewed report.

## Safety invariants

- Keep real source JSON and CSV files outside the repository.
- Do not paste source rows, credentials, emails, phones, or addresses into
  tickets or logs.
- Import analysis, importer dry-run, and category-seed dry-run are local-only.
- Provider-enrichment dry-run is remote read-only: it reads the selected
  provider(s), discovers/checks the Storage bucket, downloads only their source
  pages and candidate images into automatically removed temporary directories,
  but performs no Storage upload or Firestore update.
- `importProviders.cjs` defaults to dry-run.
- Apply mode requires an explicit service-account file, `--project`, and the
  same value in `--confirm-project`.
- Mass enrichment apply additionally requires a durable `--resume-state`;
  one-provider apply may retain the compensating-rollback mode without it.
- The mapper emits native `Date` values and never imports Firebase Admin.
- Apply mode preflights every candidate through the same SDK/WriteBatch used
  for persistence before the first remote read or commit.
- Apply uses `create-or-skip`; it does not update existing provider documents
  or merge by name.
- Provider-category documents are created only by the independent idempotent
  seed. Provider importers never create taxonomy opportunistically.
- Rules, indexes, categories, and provider documents are separate operator
  actions. Nothing deploys automatically.
- The small importer resume marker is not the checksummed enrichment
  checkpoint. It has no backup or process lock and must never be shared by
  parallel import processes.
- Do not run category seed and provider import concurrently. Do not overlap
  mass enrichment with any importer, enricher, cleanup, or manual/admin process
  that can change providers or `proveedores/**` Storage objects. A
  one-provider enrichment must not overlap a mass run that includes that ID.
- A dry-run taken while another process mutates the same scope is only
  transient evidence and must not be promoted to an apply approval.

On Windows with a PowerShell execution policy that blocks `npm.ps1`, use
`npm.cmd` in place of `npm`.

## Official operation map

Use only the command block in the linked section; similar-looking ad hoc
commands are not additional authorities.
For copy-friendly abbreviated templates, use the non-canonical
[`SNIPPETS.md`](SNIPPETS.md) and return here before any remote apply.

| Operation | Official recipe |
| --- | --- |
| Analyze / import dry-run | [Local validation and focused test baseline](#local-validation-and-focused-test-baseline) |
| Category dry-run / apply | [Operational provider-category catalog](#operational-provider-category-catalog) |
| Provider import sample / full apply | [Provider import: protected small apply](#provider-import-protected-small-apply) and [full apply and resume](#provider-import-full-apply-and-resume) |
| One-provider enrichment dry-run / apply | [One-provider dry-run](#one-provider-dry-run) and [One-provider apply](#one-provider-apply) |
| Mass enrichment dry-run / bounded apply / normal resume | [Blocks, stopping, and resuming](#blocks-stopping-and-resuming) |
| Controlled interruption | Press Ctrl+C once and follow the wait/checkpoint procedure in [Blocks, stopping, and resuming](#blocks-stopping-and-resuming). |
| Corrupt-primary recovery | Repeat the normal resume command in [Atomic checkpoints and recovery](#atomic-checkpoints-and-recovery); a valid backup is selected automatically. |
| Stale-lock recovery | Use both recovery flags and the recorded dead PID in [Lock and parallel-process safety](#lock-and-parallel-process-safety). |
| Unit / Emulator validation | [Local validation and focused test baseline](#local-validation-and-focused-test-baseline) and [Recovery validation](#recovery-validation) |

### Current CLI surface

Unknown arguments fail closed in every tool.

| Tool | Current options |
| --- | --- |
| `analyzeProviderJson.cjs` | Required `--input`; optional `--input-format=json\|csv`, CSV-only `--category=foto-video`, `--out`, and positive `--sample-limit` (default 25). |
| `importProviders.cjs` | Defaults to `--dry-run`; accepts the same input/format/category boundary plus `--report`, `--resume-state`, `--batch-size` (default 200, maximum 400), positive `--limit` (default unlimited), non-negative `--start-index` (default 0), and positive `--sample-limit` (default 25). Apply additionally requires matching `--project` / `--confirm-project` and `--credentials`. |
| `seedProviderCategories.cjs` | Defaults to `--dry-run`; accepts `--report`. Apply additionally requires matching project confirmation and credentials. |
| `enrichProviders.cjs` | Defaults to remote-read-only `--dry-run`; scope is one `--provider-id`, one `--category`, or the whole collection. It accepts `--limit`, `--concurrency`, `--request-delay-ms`, `--max-retries`, `--timeout-ms`, `--stop-after-errors`, `--max-gallery-images`, `--force`, `--complete-gallery`, `--pause-on-429`, `--report`, and `--log`. Durable apply uses `--resume-state`; dry-run durability uses the separate `--dry-run-state`. `--debug-local` is dry-run-only. Stale lock recovery requires both `--recover-stale-lock` and `--confirm-stale-lock=PID`. Project confirmation and credentials are required even in enrichment dry-run because it performs authenticated remote reads. |

## Local validation and focused test baseline

Build the existing Functions TypeScript project:

```bash
npm --prefix functions run build
```

Run the focused tests:

```bash
node --test functions/providersStage1.test.mjs scripts/providersStage1.test.mjs scripts/providersCsv.test.mjs scripts/providersCategorySeed.test.mjs
```

This unit baseline covers the exact model, normalization, eligibility,
deterministic IDs and Storage paths, JSON/CSV adapters, sanitized analysis,
create-or-skip planning/preflight, category manifest/seed, rule-route
isolation, and provider/category invariants.

Validate actual provider and category Firestore serialization in one disposable
local emulator:

```bash
firebase emulators:exec --only firestore --project demo-reservaeldia-providers "node --test scripts/providersFirestoreEmulator.test.mjs scripts/providersCategorySeedFirestoreEmulator.test.mjs"
```

Those emulator tests commit and delete one provider and one category only in
the emulator. They assert that mapped native `Date` fields are accepted and
read back as Firestore `Timestamp` values from the owning Admin SDK.

The enrichment unit and Firestore+Storage emulator baselines are in
[Recovery validation](#recovery-validation).
**[Pending]** These integration tests use Admin SDK clients and therefore
bypass Firebase Rules. There is currently no rules-unit-testing emulator suite
for provider allow/deny cases; section
[Rules and indexes](#rules-and-indexes-manual-deployment-boundary) records that
gap.

Analyze a private local JSON:

```bash
npm run providers:analyze -- --input="C:\private\providers.json"
```

Optionally choose the report path:

```bash
npm run providers:analyze -- --input="C:\private\providers.json" --out="artifacts/providers/runtime/review.json"
```

The version 3 report contains:

- discarded record count, reason occurrences, and multi-reason record count as
  separate metrics;
- duplicate URL groups plus possible cross-URL duplicate names and external-ID
  conflicts calculated only among eligible candidates, with eligible counts
  split by presence/absence of evidenced external ID;
- a complete source-category frequency table with `confirmed`,
  `review_required`, or `unreviewed` decisions plus the final internal-category
  distribution;
- email counts for valid primary, absent input, no valid email, placeholder,
  syntactically invalid, multiple valid, valid-plus-placeholder, and discarded
  token totals;
- website classifications and non-normalized phone counts;
- a review section with source index, deterministic ID, normalized business
  name, original category, URL path, slug, external ID, city, province, and
  review reason, including eligible records whose external ID remains
  intentionally unknown;
- total providers requiring manual review and counts for every allowed
  `revisionManual.motivos` value, with reason occurrences and providers having
  multiple reasons reported separately.
- dry-run `sampleDocuments` containing 5–10 representative mapped providers.
  Selection considers the complete eligible file even when `--limit` is
  smaller, so it can include normal, categorized, uncategorized, duplicate,
  container-category, missing-external-ID, and multi-reason examples when they
  exist.

It never includes raw emails, phones, or full addresses. A placeholder is a
discarded email token, not evidence that another valid email or the provider
record is invalid. Sample documents expose email/phone presence booleans only,
including whether WhatsApp is present and matches the normalized phone, five
non-sensitive location fields, and image metadata without image URLs. They
never expose the three phone values themselves.

Run the importer planner without Firebase:

```bash
npm run providers:import:dry -- --input="C:\private\providers.json"
```

Plan only a small eligible sample:

```bash
npm run providers:import:dry -- --input="C:\private\providers.json" --limit=10
```

### Foto/video contact CSV adapter

`scripts/providers/providerInput.cjs` adapts the contact CSV into the same
`PortalProviderSourceFile` used by the JSON workflow. It accepts UTF-8 with an
optional BOM and fails closed on missing, duplicate, or unexpected headers.
CSV is autodetected by extension, but production commands should keep the
format explicit:

```bash
node scripts/providers/importProviders.cjs --dry-run --input="C:\private\providers\proveedores-foto-video.csv" --input-format=csv --category=foto-video --limit=10
```

Full local dry-run:

```bash
node scripts/providers/importProviders.cjs --dry-run --input="C:\private\providers\proveedores-foto-video.csv" --input-format=csv --category=foto-video
```

The adapter forces only the confirmed `foto-video` category and records
`archivoOrigen: "proveedores-contacto.csv"` plus
`fuenteExtraccionOriginal: "csv-contactos-foto-video"`. It does not create a
second identity or importer. URL normalization and the existing SHA-256
document ID remain authoritative.

Exactly one leading spreadsheet apostrophe is retained in
`telefonoOriginal` but removed before normalization. The report counts removed
apostrophes, empty phones, non-normalized non-empty phones, missing websites,
website classifications, and records without usable location. `direccion:
"AR"` is traceable but does not become a complete address.

Expected console evidence includes:

```json
{
  "mode": "dry_run_local_only",
  "firebaseInitialized": false,
  "remoteReads": 0,
  "remoteWrites": 0
}
```

Apply preflight failure evidence is structured as:

```json
{
  "mode": "apply_preflight_failed",
  "fieldPath": "fuente.importadoEn",
  "incompatibleType": "Timestamp",
  "batchCommitted": false,
  "remoteWrites": 0
}
```

## Operational provider-category catalog

`functions/src/providers/config.ts` owns the reviewed 24-document deployment
manifest exported as `PROVIDER_CATEGORY_CATALOG`. The source-category map is
derived from this catalog plus the explicit `novios` to `trajes-novio` alias,
so there is no second list of internal category IDs.

The catalog intentionally excludes:

- `novios` as a document because it is an alias;
- `novias` and `experiencias-adicionales` because they are containers;
- `bodas-playa` and
  `recepciones-quintas-hoteles-estancias-playa` because they are aggregate or
  ambiguous source navigation.

Run the local dry-run after compiling the domain:

```bash
npm --prefix functions run build
node scripts/providers/seedProviderCategories.cjs --dry-run
```

Or use the package shortcut:

```bash
npm run providers:categories:seed:dry
```

Dry-run is the default. It validates the count, IDs, slug/document-ID equality,
names, unique orders, excluded IDs, runtime document shape, native `Date`
timestamps, and parity with the internal category mappings. It writes an
ignored local report under `artifacts/providers/runtime/` and must show:

```json
{
  "mode": "dry_run_local_only",
  "planned": 24,
  "firebaseInitialized": false,
  "remoteReads": 0,
  "remoteWrites": 0,
  "batchCommitted": false
}
```

**[Current implementation]** The protected category apply command is:

```bash
npm --prefix functions run build
node scripts/providers/seedProviderCategories.cjs --apply --project="EXPECTED_PROJECT_ID" --confirm-project="EXPECTED_PROJECT_ID" --credentials="C:\private\provider-category-seed-service-account.json"
```

Apply performs these operations in order:

1. Validate the complete local manifest before initializing Firebase.
2. Require explicit matching project arguments and an explicit service-account
   path.
3. Read the 24 category document IDs.
4. Read only `categoriaPrincipalId` and `categoriaIds` from existing provider
   documents to verify referential coverage.
5. Classify categories as missing, compatible, or conflicting.
6. Abort before preparing or committing writes if an existing document differs,
   a provider references an ID outside the manifest, or a provider contains an
   invalid category-reference value.
7. Prepare one `create`-only batch with native `Date` values for missing
   documents.
8. Commit that batch only after the complete preflight succeeds.

Compatibility requires the exact category schema, valid timestamps, and exact
values for `nombre`, `slug`, `descripcion`, `activa`, `orden`, `icono`, and
`categoriaPadreId`. Existing valid creation/update timestamps are preserved;
their historical instants are not replaced. Extra fields, missing fields, or a
different managed value are conflicts. The seed never overwrites or silently
updates an existing document.

The report contains planned documents, missing IDs, compatible existing IDs,
conflicts by field name, created/skipped IDs, reference coverage, project ID,
remote read/write counts, and commit state. It never contains credentials or
provider contact/location data. A second successful run must report all
documents as skipped, zero writes, and no committed batch.

In a new environment, seed this catalog before importing any provider.
**[Historical] [Assumption]** Prior notes say the current target contains
providers created before this seed. Before another provider/CSV apply, run and
review the seed preflight against that exact target; its reference verification
must reconcile every stored category ID without modifying provider documents.

## Review gate before any provider import apply

Do not proceed with any additional provider apply until all items are
satisfied:

- confirm the intended Firebase project ID and backup/rollback owner;
- review every discard reason count and a bounded sample;
- investigate unexpected origins, malformed URLs, and every
  regional/navigation discard;
- confirm the final source-category decisions: `novios` to `trajes-novio`,
  `proveedores-integrales` retained, two container categories unassigned, and
  two aggregate categories unassigned;
- dry-run, review, and explicitly apply the idempotent
  `seedProviderCategories.cjs` operation so every referenced internal category
  exists;
- verify `categorias_proveedores/foto-video` exists and conforms to
  `CategoriaProveedor` before any CSV apply; the importer checks existence,
  `activa: true`, and `slug: "foto-video"` and aborts with zero writes if the
  category is missing or incompatible;
- review possible cross-URL/name duplicates without merging automatically;
- reconcile every manual-review reason count and confirm that every member of
  each duplicate-name group is marked;
- confirm source-file custody, retention, and access;
- test Firestore and Storage rules in an emulator;
- review the full-document public-read decision in the provider contract;
- deploy rules and the two reviewed indexes in a separate approved change
  window;
- ensure every imported provider will remain `estado: "importado"` and
  `visible: false`.

## Provider import: protected small apply

**[Current implementation]** These commands exercise the implemented guarded
importer. **[Pending]** They still require an approved target, credential,
change window, reviewed dry-run and recovery owner. This repository does not
authorize or prove execution against any remote project.

Use a service account dedicated to the import window. Do not place it in the
repository. Build first, then execute a 10-document sample:

```bash
npm --prefix functions run build
node scripts/providers/importProviders.cjs --apply --input="C:\private\providers.json" --limit=10 --batch-size=10 --project="EXPECTED_PROJECT_ID" --confirm-project="EXPECTED_PROJECT_ID" --credentials="C:\private\provider-import-service-account.json" --resume-state="C:\private\provider-import-state.json"
```

Foto/video CSV sample, only after the category-document and review gates:

```bash
node scripts/providers/importProviders.cjs --apply --input="C:\private\providers\proveedores-foto-video.csv" --input-format=csv --category=foto-video --limit=10 --batch-size=10 --project="EXPECTED_PROJECT_ID" --confirm-project="EXPECTED_PROJECT_ID" --credentials="C:\private\provider-import-service-account.json" --resume-state="C:\private\provider-import-foto-video-state.json"
```

An authorized apply also writes a separate sanitized
`existing-provider-matches-*.json` report under
`artifacts/providers/runtime/`. It contains provider ID, source index, URL path,
and match reason only. Same-URL IDs are skipped; a different normalized URL for
the same ID aborts as a possible collision.

Manual verification after the sample:

- exactly the expected number of new deterministic IDs exists;
- documents pass the runtime model and have `schemaVersion: 2`;
- `fuente.importadoEn`, `creadoEn`, and `actualizadoEn` were native `Date`
  values before persistence and are Firestore `Timestamp` values after read;
- `fuente.urlOriginalNormalizada` matches each deterministic ID;
- all documents are imported, active, and not visible;
- validation is `no_validado` and ownership is not claimed;
- `revisionManual.requerida` and its deduplicated reasons match the approved
  analysis report;
- placeholders and invalid emails were discarded without hiding valid emails
  from the same record;
- normalized phones are defensible for their country context, and every safely
  normalized source phone is copied unchanged to `contacto.whatsapp`;
- ambiguous or empty source phones keep `contacto.whatsapp: null` and no prefix
  is invented;
- container/ambiguous categories are `null`/`[]`, while `novios` and
  `proveedores-integrales` use their definitive mappings;
- no image bytes, Base64, bucket name, or fabricated download URL exists;
- re-evaluating the same sample with a fresh review-state path reports existing
  documents skipped and creates zero duplicates.

If the sample is wrong, stop. Because the importer never updates existing
documents, remediation is an explicit reviewed cleanup/migration, not an
automatic overwrite.

### `--limit`, idempotency, and resume state

A dry-run never writes a resume-state file. Repeating the same dry-run with
`--limit=10` and no pre-existing state therefore plans the same first ten
eligible candidates.

Apply mode is different: it writes the state path after each committed or
fully-skipped block. When `--resume-state` is omitted, a deterministic default
under `artifacts/providers/runtime/` is derived from the source SHA-256. When
an explicit state path is supplied, repeat the exact same command and path to
continue after `lastSourceIndex`. It does not revisit the first ten.

**[Current implementation limitation]** This import marker is installed with a
temporary-file rename but has no fsync, checksum, rotating backup, lock, stale
lock recovery, or per-provider phase. The reader verifies input SHA-256 and
`lastSourceIndex`; apply also rejects a persisted different project. It does
not enforce the marker's `stateVersion`, totals, or source file name. Never
confuse it with `providerEnrichmentState.cjs`, hand-edit it, or use the same
path from two processes.

To deliberately verify idempotency against the original sample after its main
state has advanced, use a new, non-existing review-state path:

```bash
node scripts/providers/importProviders.cjs --apply --input="C:\private\providers.json" --limit=10 --batch-size=10 --project="EXPECTED_PROJECT_ID" --confirm-project="EXPECTED_PROJECT_ID" --credentials="C:\private\provider-import-service-account.json" --resume-state="C:\private\provider-import-recheck-state.json"
```

Those deterministic IDs are read, reported as `existingSkipped`, and never
updated. A mismatched normalized source URL for an existing ID aborts.

### Import by fixed blocks without repeats or gaps

Choose one protected state path and repeat this exact command for every block:

```bash
node scripts/providers/importProviders.cjs --apply --input="C:\private\providers.json" --limit=10 --batch-size=10 --project="EXPECTED_PROJECT_ID" --confirm-project="EXPECTED_PROJECT_ID" --credentials="C:\private\provider-import-service-account.json" --resume-state="C:\private\provider-import-state.json"
```

Do not change the input bytes, state path, or project between blocks. The state
is bound to the source SHA-256 and project. `lastSourceIndex + 1` becomes the
next lower bound; ineligible and duplicate-URL records are intentionally
skipped by the same complete-file eligibility plan. If a commit succeeds but
the local state write is interrupted, rerunning may evaluate that block again,
but deterministic create-or-skip behavior prevents overwrites and duplicates.

## Provider import: full apply and resume

After the sample gate passes, run without `--limit`:

```bash
node scripts/providers/importProviders.cjs --apply --input="C:\private\providers.json" --batch-size=200 --project="EXPECTED_PROJECT_ID" --confirm-project="EXPECTED_PROJECT_ID" --credentials="C:\private\provider-import-service-account.json" --resume-state="C:\private\provider-import-state.json"
```

Resume with the exact same input file and state path:

```bash
node scripts/providers/importProviders.cjs --apply --input="C:\private\providers.json" --batch-size=200 --project="EXPECTED_PROJECT_ID" --confirm-project="EXPECTED_PROJECT_ID" --credentials="C:\private\provider-import-service-account.json" --resume-state="C:\private\provider-import-state.json"
```

The state file is bound to the SHA-256 of the source file. A changed input file
fails closed. If a batch committed but the local state write did not complete,
rerunning safely skips the matching existing IDs.

Full verification:

- reconcile created + existing-skipped against eligible dry-run count;
- reconcile discarded count and reason distribution;
- confirm there are no duplicate `fuente.urlOriginalNormalizada` values;
- sample every category and location normalization branch;
- query pending description, cover, gallery, review, and import error states;
- confirm there are zero visible imported providers;
- retain the sanitized report and state file in controlled operational storage;
- remove/rotate the temporary importer credential according to policy.

## Single-provider enrichment

`scripts/providers/enrichProviders.cjs` is the enrichment-stage operator tool.
Without a durable state argument it retains the original one-provider mode.
With a mass scope it adds bounded category/all-provider selection, concurrency,
durable per-provider checkpoints, reconciliation, locking, progress output,
and resumption while reusing the same extraction, Storage, Firestore, runtime
validation, and idempotency pipeline.

Supporting modules isolate page discovery and image validation:

- `providerEnrichmentPage.cjs` first looks for an explicit complete-gallery
  authority, then parses JSON-LD, embedded JSON, lazy/data attributes,
  lightbox links, visible semantic HTML, Open Graph, and other metadata;
- `providerEnrichmentImages.cjs` applies public-host checks, bounded downloads,
  MIME signature checks, the existing 15 MiB limit, Sharp dimension validation,
  SHA-256 duplicate detection, and temporary-file cleanup.

The script never generates, rewrites, or summarizes provider copy. It stores
the selected literal full description. A separately published short
description is preserved literally; when none exists, `descripcionCorta`
reuses the complete source description rather than synthesizing a summary.

The authenticated Firebase `adminSdkConfig` endpoint supplies the project's
actual default Storage bucket. The script does not derive a bucket name from a
project-name convention and does not generate download URLs. Firestore image
metadata stores the stable `storagePath` with `url: null`.

Image IDs are `portada_` / `img_` plus the first 20 hex characters of the
downloaded-byte SHA-256. Storage uploads use CRC32C validation,
`ifGenerationMatch: 0`, immutable one-year cache control, MIME `contentType`,
and custom `providerId`, `imageId`, `executionId`, and full `hashSha256`.
Firestore additionally keeps final source URL, alt text, order, dimensions,
MIME, normalized format, byte count, and import timestamp; it never stores
bytes or a Firebase token.

### One-provider dry-run

Dry-run performs the complete remote-read and download preflight but has zero
uploads and zero Firestore writes:

```bash
npm --prefix functions run build
node scripts/providers/enrichProviders.cjs --dry-run --provider-id="pcar_HEX24" --project="reservaeldia-7a440" --confirm-project="reservaeldia-7a440" --credentials="C:\private\firebase\reservaeldia-7a440-firebase-adminsdk.json"
```

It verifies:

- exact project confirmation and explicit credentials;
- deterministic provider-ID shape and identity agreement with
  `fuente.urlOriginal`;
- provider existence and runtime compatibility;
- source and final page URL remain on the authorized portal;
- Firestore and Storage are accessible;
- the page downloads and parses successfully;
- all images actually discovered pass MIME, size, dimensions, and duplicate
  checks;
- every deterministic destination path is valid and absent from Storage;
- the final merged provider document passes runtime validation.

Description, cover, and gallery are optional source content. A valid readable
page with none of them is still `dry_run_ready`; absence is reported with
`descriptionFound: false`, `coverFound: false`, zero gallery counts, and
`error: null`. Only technical failures make the result `failed`.

No HTML, page snapshot, Base64, raw email, phone, or address is retained.
Downloaded image files live only in an OS temporary directory and are removed
on success and failure.

An explicit diagnostic exception is available only in dry-run:

```bash
node scripts/providers/enrichProviders.cjs --dry-run --debug-local --complete-gallery --provider-id="pcar_HEX24" --project="reservaeldia-7a440" --confirm-project="reservaeldia-7a440" --credentials="C:\private\firebase\reservaeldia-7a440-firebase-adminsdk.json"
```

It writes the fetched HTML and a sanitized gallery-authority URL list below
ignored `artifacts/providers/runtime/debug-{providerId}/`. Raw HTML may contain
source-page contact data and must be deleted after diagnosis. `--debug-local`
is rejected with `--apply`.

### Completing a partial gallery

`galeriaImportada: true` means that the complete authoritative gallery was
inspected, every unique source item was either safely reused or validated, and
the deterministic ordered gallery was persisted. It never means merely that
one or more gallery images were found.

Use `--complete-gallery` to inspect an already enriched provider and rebuild
only its Firestore gallery metadata from the complete authority:

```bash
node scripts/providers/enrichProviders.cjs --dry-run --complete-gallery --max-gallery-images=100 --provider-id="pcar_HEX24" --project="reservaeldia-7a440" --confirm-project="reservaeldia-7a440" --credentials="C:\private\firebase\reservaeldia-7a440-firebase-adminsdk.json"
```

The extractor prefers a full structured list such as
`script[type="application/json"][data-gallery-all-images]`. It preserves source
order, prefers a declared original URL, and treats WordPress `-WIDTHxHEIGHT`
thumbnail variants as the same stable media identity. If an original is not
available or exceeds the safety limit, the declared lightbox variants are
tried in order. Content SHA-256 remains the final duplicate authority.

Existing gallery objects are matched by stable source identity or their
hash-derived image ID. Matching objects are reused, missing objects alone are
planned, and previous objects absent from the new authority are not deleted.
Firestore is updated only after every expected unique image resolves to an
existing or newly validated object. A missing item, mismatched declared total,
invalid source entry, or failed validation produces `gallery_incomplete`,
leaves `galleryComplete: false`, and performs no write.

When the completely inspected source declares no gallery,
`galleryExpectedCount` and `galleryDetectedCount` are zero and
`galleryComplete` is true. This never replaces an existing Firestore gallery
with `[]`; no gallery field update is emitted solely because the source has no
images.

`--max-gallery-images` defaults to 100 and accepts 1–500. It is a safety bound,
not a three-image product limit.

### One-provider apply

Run apply only after reviewing the dry-run report for the same exact provider:

```bash
node scripts/providers/enrichProviders.cjs --apply --provider-id="pcar_HEX24" --project="reservaeldia-7a440" --confirm-project="reservaeldia-7a440" --credentials="C:\private\firebase\reservaeldia-7a440-firebase-adminsdk.json"
```

Apply is ordered as:

1. Complete every read-only preflight and build the final validated document.
2. Upload missing deterministic objects sequentially with
   `ifGenerationMatch: 0`, which prevents overwrites.
3. Remove temporary files.
4. In a Firestore transaction, re-read the provider, verify that its
   enrichment fields have not changed, update `importacion` and
   `actualizadoEn`, and include `descripcion`, `descripcionCorta`, or
   `imagenes` only for newly found valid content.

Firestore and Storage cannot participate in one atomic transaction. The
one-provider command therefore uses compensation: any Storage failure removes
objects already created by that run, and any Firestore failure removes all
objects uploaded by that run. It never deletes pre-existing objects. Rollback
results are explicit in the local report. Mass mode uses the durable
reconciliation policy documented below instead, because deleting confirmed
partial progress would make multi-day recovery less reliable.

Because failed preflight or enrichment must not write partial state, failures
are recorded only in the sanitized local report. `importacion.ultimoError`
is set to `null` only in the successful final update; the tool does not perform
a separate failure-status write. On success it sets the persisted-stage flags,
the optional source-discovery booleans, image count, attempt/completion dates,
and `actualizadoEn`. The discovery fields are
`descripcionEncontrada`, `portadaEncontrada`, and `galeriaEncontrada`; they are
false when the inspected source lacks that optional content.

A provider with `importacion.completadaEn` is already processed and is skipped
before downloading its page. `--force` allows reanalysis, but it does not
authorize overwriting an existing description, cover, gallery object, or
Storage path. Existing content is preserved; if the source lacks a field, that
field is not included in the Firestore update.

`--complete-gallery` is the narrower exception for a previously partial
gallery. It preserves description and cover, never overwrites or deletes a
Storage object, reuses valid gallery objects, uploads only missing paths, and
atomically replaces the Firestore `imagenes.galeria` array after all uploads
succeed. A Firestore failure compensates only the new uploads, leaving the
previous document and Storage objects intact. Repeating the operation against
an already matching authority performs no upload or Firestore update.

Reports are written under ignored `artifacts/providers/runtime/` and contain
provider ID, visited page URL, stage timings, description presence/length and
source type, discovered/validated/uploaded image counts, downloaded/uploaded
bytes, planned/uploaded Storage paths, Firestore update state, rollback state,
and sanitized errors.

Gallery reports additionally expose `galleryExpectedCount`,
`galleryDetectedCount`, `galleryDownloadedCount`, `galleryValidCount`,
`galleryUploadedCount`, `galleryExistingCount`, `galleryAddedCount`,
`galleryDiscardedCount`, `galleryComplete`, per-reason discards, and
`extractionSource`.

When `--complete-gallery` is used on a provider that has never been enriched,
missing description and cover are populated only when the source provides
valid values; their absence remains successful. Existing description and cover
remain protected and are never overwritten.

## Durable mass enrichment

Mass mode is an orchestration layer around `enrichSingleProvider`; it is not a
second extractor or persistence implementation. It reads the deterministic
candidate ID set, binds that set and all output-affecting options to a SHA-256
scope, then runs at most `--concurrency` independent providers. The default
concurrency is 2 and is never increased automatically.

An apply that does not specify one `--provider-id` requires
`--resume-state`. A one-provider apply may omit it and retain compensating
rollback. Supplying `--resume-state` with one provider opts that provider into
the same durable coordinator and reconciliation behavior as mass mode.

The durable state schema is:

```json
{
  "version": 1,
  "scriptVersion": "2.1.0",
  "checksumSha256": "...",
  "inputScope": {
    "projectId": "reservaeldia-7a440",
    "category": null,
    "providerIdsHash": "...",
    "providerCount": 3194,
    "force": false,
    "completeGallery": true,
    "maxGalleryImages": 100,
    "contractSchemaVersion": 2,
    "scriptVersion": "2.1.0",
    "extractorSha256": "..."
  },
  "inputScopeHash": "...",
  "startedAt": "...",
  "updatedAt": "...",
  "status": "running",
  "lastConfirmedProviderId": "pcar_...",
  "processedProviderIds": ["pcar_..."],
  "currentProviderId": null,
  "currentProviderIds": [],
  "completedCount": 120,
  "partialCount": 4,
  "errorCount": 3,
  "skippedCount": 12,
  "recoveredCount": 1,
  "providerStates": {
    "pcar_...": {
      "status": "confirmed",
      "phase": "confirmed",
      "executionId": "...",
      "attempts": 1,
      "uploadedObjects": [],
      "confirmedAt": "..."
    }
  },
  "totals": {
    "bytesDownloaded": 0,
    "bytesUploaded": 0,
    "firestoreWrites": 0,
    "storageWrites": 0,
    "attempts": 0
  },
  "lastCheckpoint": {
    "reason": "provider_pcar_..._confirmed",
    "savedAt": "..."
  }
}
```

The state does not persist a `candidateProviderIds` array. On every run it
re-reads and sorts Firestore IDs, then requires `providerIdsHash` and
`providerCount` to match the persisted scope. It stores only IDs that matter
to progress: attempted entries under `providerStates`, terminal
`processedProviderIds`, `currentProviderIds`, and `lastConfirmedProviderId`.

Per-provider statuses are `pending`, `processing`, `storage_complete`,
`firestore_updated`, `confirmed`, `partial`, `recoverable_error`,
`definitive_error`, `skipped`, `already_complete`, and `recovered`. Pending is
implicit until the first attempt. A provider becomes `confirmed` only after
Storage is complete, the Firestore transaction succeeded, and the confirmed
checkpoint was durably persisted.

The no-content-success policy is enrichment script version `2.1.0`.
**[Compatibility]** A durable
state created by `2.0.0` is intentionally incompatible because its confirmed
semantics required content. Preserve the old state for audit and use an
explicitly reviewed migration or a new state path; the command never continues
silently with the changed contract. **[Pending]** No automated `2.0.0` to
`2.1.0` state migration command exists.

### Atomic checkpoints and recovery

The state path `provider-enrichment-state.json` has siblings:

- `provider-enrichment-state.tmp`: newly serialized state;
- `provider-enrichment-state.backup.json`: the prior valid checkpoint;
- `provider-enrichment-state.lock`: the active process lock;
- `provider-enrichment-state.corrupt-TIMESTAMP.json`: a quarantined invalid
  primary file, only when automatic backup recovery was required.

Every checkpoint serializes a canonical checksum, writes and flushes the
temporary file, rotates the valid primary to backup, atomically renames the
temporary file to primary, and syncs the directory where supported. Updates
from concurrent workers pass through one serialized state queue.

Checkpoints occur when a provider starts, changes stage, uploads or reuses an
object, completes Storage, updates Firestore, becomes confirmed/fails/skips,
on SIGINT/SIGTERM/fatal runtime events, every five seconds, and before final
shutdown. The last checkpoint before each provider confirmation remains in the
backup.

At startup the primary JSON, schema version, checksum, scope hash, project,
candidate set, contract version, extractor hash, and relevant options are
validated. A corrupt/truncated primary is automatically quarantined and
recovered from a valid backup. If both are invalid, or the scope/version
changed, execution aborts and never silently starts from zero.

The exact recovery command for a corrupt primary is the normal resume command;
the loader reports `recoveredFromBackup: true`:

```powershell
node .\scripts\providers\enrichProviders.cjs `
  --apply `
  --limit=100 `
  --concurrency=2 `
  --complete-gallery `
  --max-gallery-images=100 `
  --project=reservaeldia-7a440 `
  --confirm-project=reservaeldia-7a440 `
  "--credentials=C:\private\firebase\reservaeldia-7a440-firebase-adminsdk.json" `
  "--resume-state=C:\private\providers\provider-enrichment-state.json" `
  "--report=artifacts\providers\runtime\provider-enrichment-apply.json"
```

Do not delete or hand-edit an incompatible state. Preserve it for audit and
perform an explicitly reviewed state migration or start a new state path for a
new scope.

### Lock and parallel-process safety

The lock is created atomically and records version, PID, time, run ID, scope
hash, and a credential-redacted command. An active PID blocks a second process.
An abandoned lock also blocks by default. After verifying in Task Manager that
the recorded PID is no longer alive, recover it explicitly:

```powershell
node .\scripts\providers\enrichProviders.cjs `
  --apply `
  --limit=100 `
  --concurrency=2 `
  --project=reservaeldia-7a440 `
  --confirm-project=reservaeldia-7a440 `
  "--credentials=C:\private\firebase\reservaeldia-7a440-firebase-adminsdk.json" `
  "--resume-state=C:\private\providers\provider-enrichment-state.json" `
  --recover-stale-lock `
  --confirm-stale-lock=RECORDED_PID
```

The stale lock is archived before the new lock is created. A normal shutdown
removes only a lock owned by the current run. Do not run another importer,
enricher, admin script, or manual process that changes provider documents or
their Storage paths while mass enrichment is active.

### Cross-service failure policy

Mass mode does not claim a distributed transaction:

- if all needed Storage objects exist but Firestore fails, it records their
  path, SHA-256, bytes, image ID, and provider execution ID, leaves them in
  place, and retries the Firestore phase later;
- if Firestore commits but the confirmed checkpoint fails, the next run
  recognizes `importacion.completadaEn`, compares the saved pre-attempt
  enrichment fingerprint with Firestore, and marks the provider `recovered`
  without processing it again, including a provider with no source content;
- if only some images upload, the provider remains `partial`; on retry each
  object must match deterministic path, provider ID, image ID, SHA-256, byte
  count, and execution metadata before it is reused;
- if local state says confirmed but Firestore is missing/incomplete, the run
  reports `confirmed_remote_inconsistent` and aborts rather than assuming
  success;
- pre-existing manual description, images, contact, categories, review state,
  lifecycle, and visibility are never overwritten.

Storage uses `ifGenerationMatch: 0`, hash-derived image IDs, and deterministic
paths, so an unrecognized existing object is a conflict rather than an
overwrite. No existing object is deleted by mass recovery.

**[Current implementation limitation]** Startup reconciliation for local
`confirmed` / `recovered` entries re-reads Firestore and checks processing
completion, but it does not enumerate or re-hash every referenced Storage
object. Storage is checked when preflighting retained references and when
matching partial-upload metadata during retry. **[Pending]** A full
post-confirmation Firestore/Storage audit is a separate tool/test that does not
exist yet.

### Blocks, stopping, and resuming

`--limit` is the maximum number of previously unattempted providers selected in
that invocation. Recoverable/partial work already present in the same state is
retried first and does not consume that fresh-provider limit. Terminal provider
IDs are never assigned again. Therefore a second command with the same state
continues instead of repeating the first block.

Dry-run of 10, with optional durable state separate from apply:

```powershell
node .\scripts\providers\enrichProviders.cjs `
  --dry-run `
  --limit=10 `
  --concurrency=2 `
  --complete-gallery `
  --project=reservaeldia-7a440 `
  --confirm-project=reservaeldia-7a440 `
  "--credentials=C:\private\firebase\reservaeldia-7a440-firebase-adminsdk.json" `
  "--dry-run-state=C:\private\providers\provider-enrichment-dry-run-state.json" `
  "--report=artifacts\providers\runtime\provider-enrichment-dry-run.json"
```

Dry-run never accepts an apply `--resume-state` as its state authority, never
uploads, never updates Firestore, and reports zero writes.

Apply blocks differ only by `--limit`:

```powershell
# 10
node .\scripts\providers\enrichProviders.cjs --apply --limit=10 --concurrency=2 --complete-gallery --max-gallery-images=100 --project=reservaeldia-7a440 --confirm-project=reservaeldia-7a440 "--credentials=C:\private\firebase\reservaeldia-7a440-firebase-adminsdk.json" "--resume-state=C:\private\providers\provider-enrichment-state.json" "--report=artifacts\providers\runtime\provider-enrichment-apply.json"

# 100
node .\scripts\providers\enrichProviders.cjs --apply --limit=100 --concurrency=2 --complete-gallery --max-gallery-images=100 --project=reservaeldia-7a440 --confirm-project=reservaeldia-7a440 "--credentials=C:\private\firebase\reservaeldia-7a440-firebase-adminsdk.json" "--resume-state=C:\private\providers\provider-enrichment-state.json" "--report=artifacts\providers\runtime\provider-enrichment-apply.json"

# 500
node .\scripts\providers\enrichProviders.cjs --apply --limit=500 --concurrency=2 --complete-gallery --max-gallery-images=100 --project=reservaeldia-7a440 --confirm-project=reservaeldia-7a440 "--credentials=C:\private\firebase\reservaeldia-7a440-firebase-adminsdk.json" "--resume-state=C:\private\providers\provider-enrichment-state.json" "--report=artifacts\providers\runtime\provider-enrichment-apply.json"
```

Use the same command and state path to resume. To stop, press Ctrl+C once and
wait for the active provider(s) to reach a safe boundary, checkpoint, remove
temporary files, close Firebase clients, print the last confirmed/current IDs
and resume command, and exit non-zero. Do not close the terminal immediately
after Ctrl+C.

For a long run, open a dedicated PowerShell window and execute the reviewed
command there:

```powershell
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location 'C:\Reservaeldia'; <PASTE_REVIEWED_ENRICHMENT_COMMAND>"
```

The request controls default to `--request-delay-ms=500`,
`--max-retries=3`, `--timeout-ms=30000`, `--stop-after-errors=10`, and
`--concurrency=2`. Enforced ranges are delay 0–60000 ms, retries 0–10,
timeout 1000–300000 ms, stop-after-errors 1–1000, concurrency 1–8, limit
1–10000, and gallery limit 1–500. Retryable network/timeouts and 429/5xx
responses use exponential backoff and honor `Retry-After` up to 60 seconds.
`--pause-on-429` additionally moves that pause into the global shared request
controller. Five recent 429/5xx responses open a global circuit pause for at
least 60 seconds. The identifiable User-Agent does not evade CAPTCHA or origin
protections.

### Dashboard, logs, and reports

An interactive terminal refreshes one dashboard at most once per second. It
shows the most recently updated active worker's ID/name/stage, total-scope
progress, completed/partial/error/skipped/
recovered counts, last confirmation/checkpoint, current/average/median time,
estimated (continuously adjusted) ETA, providers/hour, byte totals, and
Firestore/Storage writes. With concurrency greater than one,
`currentProviderIds` in the checkpoint is the complete in-flight authority;
the dashboard has only one latest-worker slot. Non-interactive terminals emit
one bounded line per provider.

The detailed JSONL log defaults next to the report or can be selected with
`--log`. Each provider records its source URL, stage, timings, description
presence, cover/gallery counts, bytes, retries, sanitized errors, and result.
Credential arguments, raw emails, phones, addresses, HTML, buffers, and
description text are redacted or omitted. Reports/logs below
`artifacts/providers/runtime/` are ignored by Git; resume state should normally
remain under `C:\private\providers`.

The final report includes run/project/scope, start/end/reason, aggregate
counts, recoveries, bytes, remote and service writes, per-provider sanitized
results/errors, state/log/report paths, and a credential-redacted resume
command template. ETA is explicitly an estimate derived from the most recent 20
provider durations.

**[Current implementation limitation]** The generated resume command does not
include a custom `--log` path and, more importantly, omits `--provider-id`.
It is directly reusable for all-provider/category mass scopes. If a single
provider opted into durable mode with `--resume-state`, copy the original
reviewed command and keep its `--provider-id`; using the generated command
unchanged would select a different scope and fail the state-hash check.

### Recovery validation

Run focused tests:

```powershell
npm.cmd run providers:enrich:test
```

Run the controlled Firestore + Storage emulator interruption test:

```powershell
npm.cmd run providers:enrich:test:emulator
```

The emulator test seeds three synthetic providers in a demo project, confirms
one, exits the child process abruptly with code 77, resumes through the stale
lock with the same state, completes the rest, and verifies zero duplicate
Storage paths, zero lost confirmations, coherent Firestore/state, and no
temporary directories. It never uses real credentials or a real project.

## Rules and indexes: manual deployment boundary

Review diffs and validate locally first. When an approved project and operator
exist, the intended deployment command is:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage --project "EXPECTED_PROJECT_ID"
```

**[Assumption]** Repository state cannot prove whether this deployment command
has run in any remote project. The operator must verify the exact Firebase CLI
target before approval.

**[Pending]** The current tests inspect provider rule isolation as source text,
but do not run authenticated/unauthenticated allow/deny cases through
`@firebase/rules-unit-testing`. Add and review those Firestore/Storage Rules
emulator cases before using the rules as independently verified public
delivery.

## Implemented enrichment gates and pending rollout work

**[Current implementation]** The enrichment CLI already:

- selects existing Firestore IDs for all/category scope and skips processed
  providers after their individual read unless `--force` or
  `--complete-gallery` applies;
- preserves manual description/images and all non-enrichment provider fields;
- validates remote host/redirects, payload size, content type, byte signature,
  dimensions and format;
- uses hash-derived image IDs, deterministic Storage paths, generation-zero
  uploads and Firestore metadata without Base64;
- checkpoints image uploads and provider phases in durable mode;
- records successful processing timestamps/counts without changing
  `visible`, `activo`, or `estado`.

**[Pending]** Operational/product work outside the implemented CLI:

- approve terms/robots/legal/privacy and rate-limit policy before a mass run;
- review a bounded dry-run and small durable apply before increasing `--limit`;
- add a full post-confirmation Firestore/Storage audit if permanent byte
  reconciliation is required;
- enforce/test the portal allowlist before each page redirect request; current
  code applies public-address SSRF checks to every hop but rejects an
  off-origin public redirect only after fetching its final response;
- add Rules emulator allow/deny coverage and establish actual deployment state;
- decide the public-field projection before any provider becomes visible;
- define authoritative GBA/level-2 geography before deriving it;
- define criteria before automatically assigning `ubicacion_incompleta` or
  `contacto_dudoso`.

## Open decisions, compatibility, and risks

- The verified source contains 28 categories. Twenty-two retain their source
  ID, `novios` maps to `trajes-novio`, `proveedores-integrales` is retained,
  and four container/aggregate categories intentionally remain unassigned.
- External IDs are optional evidence. Regional five-letter suffixes must remain
  `null`; deterministic document identity continues to use the normalized URL.
- Cross-URL name duplicates are marked on every member for manual review; name
  equality is never sufficient to merge or choose a primary record.
- **[Pending]** Direct public Firestore reads expose the full canonical document. Decide on a
  backend whitelist before any provider becomes visible if internal fields must
  remain private.
- Phone normalization intentionally leaves ambiguous formats untouched; a
  reviewed phone library may be justified later, but the current mapper adds no
  dependency.
- **[Pending]** GBA and level-2 geography require an authoritative dataset.
- **[Compatibility]** The current application retains broad fallbacks for unrelated
  authenticated Firestore and Storage paths. Provider routes are explicitly
  excluded, but a broader security migration remains outside this task.
