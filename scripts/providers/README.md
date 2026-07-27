# Provider import operations

Status: Operational Runbook.

This runbook covers local validation and the explicit operations for provider
data. The historical provider import has already populated the target project;
the category seed described below is a separate corrective deployment step.
No real Firebase writes are performed merely by building, testing, or running
its default dry-run.

Read the contract first:
`docs/architecture/PROVIDER_DATA_MODEL.md`.

## Safety invariants

- Keep real source JSON and CSV files outside the repository.
- Do not paste source rows, credentials, emails, phones, or addresses into
  tickets or logs.
- Analysis and dry-run are local-only.
- `importProviders.cjs` defaults to dry-run.
- Apply mode requires an explicit service-account file, `--project`, and the
  same value in `--confirm-project`.
- The mapper emits native `Date` values and never imports Firebase Admin.
- Apply mode preflights every candidate through the same SDK/WriteBatch used
  for persistence before the first remote read or commit.
- Apply uses `create-or-skip`; it does not update existing provider documents
  or merge by name.
- Provider-category documents are created only by the independent idempotent
  seed. Provider importers never create taxonomy opportunistically.
- Rules, indexes, categories, and provider documents are separate operator
  actions. Nothing deploys automatically.

On Windows with a PowerShell execution policy that blocks `npm.ps1`, use
`npm.cmd` in place of `npm`.

## Stage 1: local validation

Build the existing Functions TypeScript project:

```bash
npm --prefix functions run build
```

Run the focused tests:

```bash
node --test functions/providersStage1.test.mjs scripts/providersStage1.test.mjs scripts/providersCsv.test.mjs
```

Validate actual Firestore serialization in a disposable local emulator:

```bash
firebase emulators:exec --only firestore --project demo-reservaeldia-providers "node --test scripts/providersFirestoreEmulator.test.mjs"
```

The emulator test commits and deletes one document only in the emulator. It
asserts that mapped native `Date` fields are accepted and read back as
Firestore `Timestamp` values from the importer's SDK.

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

The future protected apply command is:

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

In a new environment, seed this catalog before importing any provider. In the
current environment, where providers already exist, run the authorized seed
before the foto/video CSV apply; its reference verification must reconcile all
category IDs already stored on those providers without modifying them.

## Review gate before Stage 2

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

## Future Stage 2: small real sample

These commands are documentation only. They require approved access and have
not been executed.

Use a service account dedicated to the import window. Do not place it in the
repository. Build first, then execute a 10-document sample:

```bash
npm --prefix functions run build
node scripts/providers/importProviders.cjs --apply --input="C:\private\providers.json" --limit=10 --batch-size=10 --project="EXPECTED_PROJECT_ID" --confirm-project="EXPECTED_PROJECT_ID" --credentials="C:\private\provider-import-service-account.json" --resume-state="C:\private\provider-import-state.json"
```

Future foto/video CSV pilot, only after the category-document and review gates:

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

To deliberately verify idempotency against the original pilot after its main
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

## Future Stage 2: full import and resume

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

## Rules and indexes: manual future commands

Review diffs and validate locally first. When an approved project and operator
exist, the intended deployment command is:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage --project "EXPECTED_PROJECT_ID"
```

This command was not run in Stage 1. The operator must verify the exact Firebase
CLI target before approval.

## Future Stage 3 checklist

- build a separate bounded enrichment job; do not add crawling to the Stage 2
  importer;
- respect the origin site's terms, rate limits, robots policy, and legal/privacy
  review;
- page only providers still missing the relevant progress flag;
- record `ultimoIntentoEn` and a bounded/sanitized `ultimoError`;
- import description without overwriting reviewed manual content;
- fetch images with content-type, size, dimensions, and format validation;
- reject redirects or downloads outside the approved host policy;
- generate a deterministic `imagenId`;
- upload bytes only to the provider Storage paths;
- persist `storagePath` first and a real URL only after Storage returns one;
- never put Base64 or image bytes in Firestore;
- make cover/gallery progress independently resumable;
- set `cantidadImagenes` from successfully persisted image metadata;
- do not calculate GBA without a reviewed authoritative geographic source;
- never change `visible` or `estado` to published as an enrichment side effect;
- verify public projection/privacy policy before any profile publication.

## Open decisions and risks

- The verified source contains 28 categories. Twenty-two retain their source
  ID, `novios` maps to `trajes-novio`, `proveedores-integrales` is retained,
  and four container/aggregate categories intentionally remain unassigned.
- External IDs are optional evidence. Regional five-letter suffixes must remain
  `null`; deterministic document identity continues to use the normalized URL.
- Cross-URL name duplicates are marked on every member for manual review; name
  equality is never sufficient to merge or choose a primary record.
- Direct public Firestore reads expose the full canonical document. Decide on a
  backend whitelist before any provider becomes visible if internal fields must
  remain private.
- Phone normalization intentionally leaves ambiguous formats untouched; a
  reviewed phone library may be justified later, but Stage 1 adds no dependency.
- GBA and level-2 geography require an authoritative dataset.
- The current application retains broad compatibility fallbacks for unrelated
  authenticated Firestore and Storage paths. Provider routes are explicitly
  excluded, but a broader security migration remains outside this task.
