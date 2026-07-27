# Provider Data Model

Status: Canonical Contract.

Scope: provider persistence, deterministic identity, normalization,
eligibility, import progress, Storage paths, security boundaries, and the
single/mass enrichment pipeline with durable bounded execution. It does not
authorize an unreviewed mass apply, rules deploy, or profile publication.

Implementation anchors:

- `functions/src/providers/types.ts`
- `functions/src/providers/normalization.ts`
- `functions/src/providers/eligibility.ts`
- `functions/src/providers/mapper.ts`
- `functions/src/providers/review.ts`
- `functions/src/providers/validation.ts`
- `functions/src/providers/storagePaths.ts`
- `scripts/providers/providerInput.cjs`
- `scripts/providers/enrichProviders.cjs`
- `scripts/providers/providerEnrichmentPage.cjs`
- `scripts/providers/providerEnrichmentImages.cjs`
- `scripts/providers/README.md`

Code is the current executable truth. Update this contract and the focused
tests in `functions/providersStage1.test.mjs`,
`scripts/providersStage1.test.mjs`, `scripts/providersCsv.test.mjs`, and
`scripts/providersEnrichment.test.mjs`
whenever a provider contract changes.

## 1. Authority and boundaries

`proveedores/{proveedorId}` is the canonical provider document. Secured source
JSON and CSV files remain non-repository evidence for original values that are
rejected during normalization; they are not a second application database.
Storage is authoritative for image bytes. Firestore only stores stable
`storagePath` values, optional delivery URLs, and image metadata.

There is no provider client, public route, validation flow, claim flow, mass
scraper, or deployed enrichment backend. Import, seed, and single-provider
enrichment scripts are explicit operator tools, not automatically executed
Cloud Functions.

## 2. Collections

### `proveedores/{proveedorId}`

The definitive TypeScript shape is `Proveedor` in
`functions/src/providers/types.ts`. It contains exactly these root groups:

| Group | Purpose |
| --- | --- |
| `schemaVersion` | Provider document contract version. The required manual-review contract is version `2`. |
| `nombre`, `nombreNormalizado`, `slug` | Display and search identity. None is the document ID. |
| `categoriaPrincipalId`, `categoriaIds` | One optional primary category and a deduplicated category list. |
| `descripcion`, `descripcionCorta` | Empty after Stage 2; populated only by the future enrichment stage. |
| `contacto` | Original/safely normalized phone, source WhatsApp copied only when safely normalized, email set, and commercial website. |
| `redesSociales` | Known social networks plus typed `otras` entries for preserved values that require review. |
| `ubicacion` | International country/level1/level2/city model plus optional metropolitan classification and coordinates. |
| `imagenes` | Cover and gallery metadata. No bytes or Base64. |
| `estado`, `activo`, `visible` | Publication lifecycle gates. |
| `validacion` | Provider-data validation state; independent from ownership. |
| `propietario` | Profile-claim state; independent from validation. |
| `revisionManual` | Review gate and normalized reasons; independent from validation and ownership. |
| `fuente` | Import provenance, `categoriaOriginal`, and original provider-page identifiers. |
| `importacion` | Data progress, source-field discovery evidence, confirmed page processing, and bounded error state. |
| `creadoEn`, `actualizadoEn`, `publicadoEn` | Firestore timestamps. |

Provider timestamps have separate write/read contracts:

- `ProveedorEscritura` uses native `Date`;
- `ProveedorFirestore` uses the structural `FirestoreTimestampLike` returned
  when Firestore reads a stored timestamp;
- generic `Proveedor` accepts either for code that validates both boundaries.

The mapper has no Firebase SDK import. It creates one native `Date`, clones it,
and uses the same millisecond value for `fuente.importadoEn`, `creadoEn`, and
`actualizadoEn`. Firestore Admin serializes those `Date` values through the
same SDK instance that owns the client. The mapper leaves `publicadoEn`,
`validacion.validadoEn`, `propietario.reclamadoEn`,
`revisionManual.revisadaEn`, `importacion.ultimoIntentoEn`,
`importacion.completadaEn`, and every image `importadaEn` as `null` in Stage 2.

No timestamp is represented as a manual `{seconds, nanoseconds}` object or an
ISO string. The importer currently does not use `FieldValue.serverTimestamp()`.
If a future persistence operation needs it, the transform must be constructed
only in `importProviders.cjs` from that importer's
`firebase-admin/firestore` instance.

The Stage 2 initial lifecycle is:

```js
{
  estado: "importado",
  activo: true,
  visible: false,
  validacion: {
    estado: "no_validado",
    metodo: null,
    validadoEn: null,
    validadoPor: null
  },
  propietario: {
    reclamado: false,
    userId: null,
    reclamadoEn: null
  },
  revisionManual: {
    requerida: false,
    motivos: [],
    revisadaEn: null,
    revisadaPor: null,
    notas: null
  },
  importacion: {
    version: 1,
    datosImportados: true,
    descripcionImportada: false,
    portadaImportada: false,
    galeriaImportada: false,
    cantidadImagenes: 0,
    ultimoIntentoEn: null,
    ultimoError: null,
    completadaEn: null
  }
}
```

Provider enrichment adds three backward-compatible discovery fields inside
`importacion`: `descripcionEncontrada`, `portadaEncontrada`, and
`galeriaEncontrada`. Their absence means that an older or Stage 2 document has
not recorded that inspection evidence. After a successful page analysis each
field is an explicit boolean, including `false` when the source does not
publish that content. The corresponding `*Importada` fields continue to record
persisted import progress and are never reset merely because a later source
inspection does not expose the field.

Runtime validation rejects documents that do not preserve required groups,
states, timestamp types, ISO country-code shape, image metadata shape, the
manual-review reason allowlist/uniqueness invariant, or the invariant that a
visible provider must also be active and published. Timestamp validation
accepts valid native `Date` values before writes and structural Firestore
timestamps after reads. Discovery fields are optional for backward
compatibility and must be boolean whenever present.

### `categorias_proveedores/{categoriaId}`

This normalized category collection is appropriate because categories are
shared, ordered, independently activated records rather than free text.
`CategoriaProveedor` in `functions/src/providers/types.ts` defines the exact
shape. `validateCategoriaProveedor` and `assertValidCategoriaProveedor`
validate both native `Date` values before writes and Firestore `Timestamp`
values after reads.

`PROVIDER_CATEGORY_CATALOG` in `functions/src/providers/config.ts` is the
canonical reviewed deployment manifest. It contains 24 internal category
documents, including their public label, description, active state, stable
order, null icon, and null parent. `PROVIDER_CATEGORY_MAP` is derived from this
manifest plus the explicit `novios` alias, preventing drift between referenced
internal IDs and seedable documents.

The verified original source contains 28 categories. Twenty-two source rubrics
retain their same internal ID:

- `belleza-novias`
- `musica-bodas`
- `ambientacion`
- `catering`
- `tecnica-dj`
- `wedding-planner`
- `atelier-casa-de-novias`
- `barras-moviles`
- `salones-fiestas`
- `accesorios-novia`
- `alquiler-mobiliario`
- `tortas-de-boda`
- `quintas`
- `traslados`
- `estancias`
- `trajes-fiesta`
- `hoteles`
- `alianzas`
- `restaurantes`
- `trajes-madrina`
- `trajes-novio`
- `zapatos`

The contact CSV adds one separately confirmed source/internal category:

- `foto-video`

The catalog is materialized only by the independent
`scripts/providers/seedProviderCategories.cjs` operation. Provider importers
never create taxonomy. The seed defaults to a local-only dry-run, validates the
complete manifest before Firebase initialization, and requires explicit
matching project confirmation and credentials for apply.

Apply reads all 24 category IDs and selects only `categoriaPrincipalId` plus
`categoriaIds` from existing provider documents. It reports referenced IDs
covered by the manifest, references missing from the manifest, and manifest
categories unused by providers. It then classifies the category documents as:

- missing: safe `batch.create` candidates;
- compatible existing: exact schema, valid timestamps, and exact catalog
  values, so they are skipped;
- conflicts: any missing/extra field, invalid timestamp, or different
  `nombre`, `slug`, `descripcion`, `activa`, `orden`, `icono`, or
  `categoriaPadreId`.

Any conflict, malformed provider category reference, or referenced ID outside
the manifest aborts before a commit. A successful batch uses native `Date`
values for `creadoEn` and `actualizadoEn`; Firestore returns them as
`Timestamp`. Existing valid timestamps are preserved rather than compared to a
new run instant. Re-execution creates nothing and skips all compatible
documents.

The current provider project was populated before this seed authority existed.
Its category references therefore must be reconciled by the seed before any
additional provider apply. The foto/video importer also fails closed when its
required category is missing, inactive, or has a mismatched slug.

Two additional source decisions are definitive:

- `novios` maps to the existing internal `trajes-novio`; no `novios` internal
  category is created.
- `proveedores-integrales` maps to the new internal
  `proveedores-integrales` category.

Four container or aggregate source categories remain intentionally unassigned:

- `novias` produces `categoriaPrincipalId: null`, `categoriaIds: []`, and
  `categoria_contenedora_novias`.
- `experiencias-adicionales` produces `categoriaPrincipalId: null`,
  `categoriaIds: []`, and
  `categoria_contenedora_experiencias_adicionales`.
- `bodas-playa` and
  `recepciones-quintas-hoteles-estancias-playa` never create internal category
  documents. Eligible provider-detail records receive `categoria_ambigua`;
  navigation/aggregate pages are discarded by URL eligibility instead.

`getProviderCategoryDecision` distinguishes `confirmed`, `review_required`,
and genuinely `unreviewed` values. Unassigned categories remain `null`/`[]` on
mapped providers. The importer does not invent or remotely create category
documents. In a new project, the category seed must run before the first
provider import.

### Manual review

`revisionManual` is required on every version-2 provider:

```ts
type MotivoRevisionProveedor =
  | "posible_duplicado_nombre"
  | "categoria_contenedora_novias"
  | "categoria_contenedora_experiencias_adicionales"
  | "categoria_ambigua"
  | "sin_id_externo"
  | "ubicacion_incompleta"
  | "contacto_dudoso";
```

The Stage 1 mapper automatically assigns only decisions backed by the current
contract:

- the applicable category-container or category-ambiguity reason;
- `sin_id_externo` when the URL remains a valid deterministic identity but no
  technical external ID has sufficient evidence;
- `posible_duplicado_nombre` when the eligible record belongs to a normalized
  name group with more than one deterministic URL identity.

`ubicacion_incompleta` and `contacto_dudoso` remain valid future reasons but are
not inferred until explicit criteria exist. Reasons are ordered by the
allowlist and deduplicated. `requerida` is true exactly when `motivos` is
non-empty.

Duplicate-name grouping runs against the complete eligible source set before
limits or resume boundaries are applied. Every member receives the review
reason; no member is selected as primary and no record is merged, deleted,
overwritten, or demoted.

## 3. Identity and idempotency

`scripts/providers/providerInput.cjs` is an adapter boundary, not another
importer. JSON keeps its existing envelope. The `foto-video` CSV is parsed as
RFC 4180-style UTF-8 (optional BOM, quoted commas/newlines, and escaped quotes),
validated against its exact header set, assigned the forced confirmed category,
and adapted into the same `PortalProviderSourceFile` consumed by the analyzer,
mapper, preflight, resume logic, and persistence layer.

The CSV adapter sets `categoria: "foto-video"` and
`fuente_extraccion: "csv-contactos-foto-video"`. Mapping records
`archivoOrigen: "proveedores-contacto.csv"`. It never derives identity from the
file name, row number, or provider name.

The selected provider ID algorithm is:

1. Parse an absolute `http` or `https` source URL.
2. Reject credentials or an invalid hostname.
3. Lowercase the hostname and remove a leading `www.`.
4. Remove query, hash, and trailing slash while preserving the path and its
   case.
5. Compute SHA-256 over the normalized URL.
6. Use `pcar_` plus the first 24 lowercase hexadecimal characters:
   `pcar_{96-bit-hash}`.

The full normalized URL and any evidenced five-character external ID remain in
`fuente`; the hash is not a substitute for provenance. A normalized URL always
produces the same document ID, including when no external ID can be established.
Names and slugs never participate in identity, and equal names are never
merged.

The future importer uses create-or-skip semantics:

- absent deterministic ID: `batch.create`;
- existing ID with the same normalized source URL: skip;
- existing ID with a different/missing normalized source URL: abort as an
  identity collision;
- never update an existing provider during this initial importer.

This makes reruns idempotent and protects later descriptions and image metadata
from a Stage 2 rerun.

An authorized apply writes a separate sanitized existing-match report. Each
entry contains only provider ID, source index, URL path, and match reason. It
contains no contact or full-address data. Matching normalized URLs are skipped;
different URLs for the same ID still abort before overwrite.

Before the first remote read or commit in `--apply`, every candidate passes two
local checks:

1. the provider runtime contract;
2. serialization through `WriteBatch.create` owned by the exact Firestore SDK
   instance initialized by the importer, without calling `commit`.

The preflight prepares all candidate batches first. A foreign SDK `Timestamp`
or other unsupported object aborts with provider ID, source index, field path,
and incompatible type plus `batchCommitted: false` and `remoteWrites: 0`.

## 4. Normalization

### Source URL

The URL helper validates protocol and hostname, removes query/hash/trailing
slash, preserves the remaining path, and extracts the source category and last
slug. Invalid URLs return `null`.

A final five-character alphanumeric token is treated as an external technical
ID only when all of these signals exist:

1. the path has at least a category and final detail segment;
2. the final segment has a non-empty slug before the token;
3. the final segment is not in the explicit regional/navigation taxonomy;
4. the token has a technical shape (contains a digit or is an opaque
   consonant-only token), or the preceding slug exactly matches the normalized
   provider name supplied by the source record.

This allows evidenced mixed, all-letter, and all-digit IDs without assuming
that every five-character word is technical. Words such as `aires`, `norte`,
`oeste`, `negro`, `pampa`, `fuego`, and a generic `playa` suffix remain `null`
without stronger record evidence. Absence of an external ID is not a discard
reason: the normalized URL hash remains the document identity.

### Emails

Email input is split on `|`, comma, or semicolon, lowercased, and deduplicated.
`tu@email.com`, empty tokens, and syntactically invalid tokens are discarded.
The first valid email becomes `contacto.email`; the rest become
`emailsAlternativos`. A placeholder never invalidates another valid token from
the same record.

The sanitized analysis distinguishes records with a valid primary email, no
input email, no valid email, placeholders, syntactically invalid values,
multiple valid emails, and a valid email plus a secondary placeholder. It also
reports discarded token totals by reason. Discarded values are not repaired or
copied into Firestore; their raw evidence remains only in the secured source
file.

### Phones

`telefonoOriginal` preserves the trimmed input. Explicit E.164-like numbers
with `+` are normalized only when they contain 8–15 digits. An Argentine
10-digit national number is normalized with `+54` only when `pais` is `AR`.
For spreadsheet exports, exactly one leading Excel apostrophe is removed from
the normalization input but retained in `telefonoOriginal`; no other quote or
character is repaired.
Local numbers from other/unknown countries, values with letters, and ambiguous
trunk formats remain unnormalized. The source field is contractually the
provider's WhatsApp number, so a safely normalized value is copied unchanged to
both `contacto.telefonoNormalizado` and `contacto.whatsapp`.
`contacto.telefonoOriginal` is always retained for traceability. When safe
normalization is not possible, both normalized fields are `null`; no mobile
prefix, country code, or missing digit is inferred. Runtime validation requires
imported WhatsApp and normalized-phone values to match and requires either a
valid E.164 value or `null`.

### Website and social URLs

Known Instagram, Facebook, TikTok, YouTube, Pinterest, LinkedIn, and Linktree
URLs go to their dedicated fields. A normal HTTP(S) commercial site goes to
`contacto.sitioWeb`. Image extensions, portal media, Canva, Google searches,
shorteners/other doubtful hosts, and invalid original values are preserved in
`redesSociales.otras` with a review type. The original trimmed string is stored;
no synthetic URL is generated.

### Location

Country codes accept only the ISO 3166-1 alpha-2 shape. The current trusted
mapping includes all Argentina level-1 ISO 3166-2 codes and documented aliases
such as `Provincia de Buenos Aires`, `Capital Federal`, and `CABA`. Unknown
international level-1 values keep their original name and leave code/type
`null`.

A final unambiguous street number is separated from `calle`. The full original
address is preserved. Addresses equal only to the country code/name are not
promoted to `direccionCompleta`. In particular, CSV `direccion: "AR"` remains
in `direccionOriginal` while complete address, street, number, city, and
territorial levels stay `null` when no other reliable input exists.

Missing detailed location is reported as a quality metric but does not by
itself make a provider ineligible.

Stage 1 does not infer `nivel2`, coordinates, GBA, or a metropolitan subregion.
GBA remains an additional future classification and never replaces province,
municipality/partido, or city.

## 5. Eligibility

`evaluateProviderEligibility` always returns every applicable discard reason.
Its stable reason codes are:

- `invalid_url`
- `unexpected_origin`
- `duplicate_url`
- `navigation_or_region_page`
- `category_page`
- `missing_name`
- `portal_record`
- `insufficient_data`

Known regional/provincial final slugs are explicitly rejected both at the root
and inside the observed `/{categoria}/{region}` structure. Any other
single-segment portal path is treated as category/navigation rather than a
provider detail. Generic portal identity/domain variants and generic portal
contact data are rejected. A record also needs a name and at least one useful
contact, address, or schema signal. Duplicate handling keeps only the first
occurrence by source order and records every later discard.

Repeated normalized names across different deterministic URL identities are
calculated after eligibility filtering and persisted as
`revisionManual.motivos: ["posible_duplicado_nombre"]` on every member.
Repeated external IDs remain an operational conflict signal. Neither condition
causes an automatic merge.

Original category values remain in `fuente.categoriaOriginal`, the secured
source, and the local report. The source category also continues to determine
the explicit mapping decision. A container or ambiguous category alone never
makes a provider ineligible.

## 6. Images and Storage

Stable paths are:

```text
proveedores/{proveedorId}/portada/portada-original.{ext}
proveedores/{proveedorId}/galeria/{imagenId}.{ext}
```

The helpers accept only provider/image IDs without path separators and these
extensions: JPG, JPEG, PNG, WEBP, GIF, AVIF. They return a path only; they do
not assume a bucket or fabricate a download URL.

### Provider enrichment pipeline v2

`scripts/providers/enrichProviders.cjs` keeps one extraction and persistence
pipeline for both an explicit single provider and a bounded mass scope. Mass
orchestration can select the whole collection or one category, but every worker
still obtains a page only from that provider's canonical
`fuente.urlOriginal`, verifies that URL identity produces the requested
document ID, and rejects source or page redirects outside the authorized
portal host.

Page discovery is evidence-based and ordered:

1. use an explicit complete structured gallery list when the page publishes
   one;
2. parse valid JSON-LD scripts;
3. parse valid embedded JSON scripts such as `application/json` and
   `__NEXT_DATA__`;
4. inspect lazy/data attributes, lightbox links, and semantic
   description/gallery/cover HTML;
5. inspect Open Graph;
6. inspect remaining supported metadata.

The extractor records only selected literal text and image URLs in memory. It
does not use AI, generate attribution phrases, summarize, persist HTML, or keep
page snapshots. An explicit literal short description is used when present;
otherwise `descripcionCorta` equals the complete extracted description.

Remote page and image requests permit only public HTTP(S) hosts, revalidate
every redirect, and use byte/time/redirect limits. Selected image bytes must
match one of the existing provider MIME types, remain within
`PROVIDER_IMAGE_MAX_BYTES`, and expose valid dimensions through Sharp.
SHA-256 over downloaded bytes removes duplicates before persistence.

For the portal's current provider template,
`script[type="application/json"][data-gallery-all-images]` is the gallery
authority used by the site's own lightbox. Its array length and any rendered
counter must agree before the source is considered complete. Each item retains
source order. Explicit original/full URLs take priority; for WordPress uploads,
the extractor can derive the stable original identity by removing only a
terminal generated `-WIDTHxHEIGHT` suffix. It attempts that original and then
the declared lightbox variants. URL identity deduplicates thumbnail/original
variants, while SHA-256 remains authoritative for identical bytes.

Images are downloaded sequentially into a unique OS temporary directory and
that directory is removed on every success/failure path. Image IDs are
deterministic from byte hashes. Storage paths are built only by the provider
path helpers. The authenticated Firebase `adminSdkConfig` endpoint supplies
the actual bucket name; it is not derived from the project ID. Uploads use a
zero-generation precondition, so an existing object is never overwritten.
Firestore keeps `storagePath`, source URL, dimensions, MIME, format, byte size,
order, and import timestamp; `url` remains `null`.

All read-only validation finishes before the first upload:

- provider exists and passes `assertValidProveedor`;
- source URL and deterministic identity match;
- Firestore and the discovered Storage bucket are accessible;
- the source page downloaded and parsed successfully;
- every discovered image candidate has valid bytes, MIME, dimensions,
  duplicate identity, and path;
- every planned destination object is absent;
- the final merged provider document passes runtime validation.

Apply uploads sequentially, removes temporary files, then uses a Firestore
transaction to re-read the provider and reject a concurrent change to
description, images, or import progress. The transaction always updates
`importacion` and `actualizadoEn`; it includes `descripcion` /
`descripcionCorta` or `imagenes` only when a new valid value was found and
fully prepared. Name, categories, contact, location, review, lifecycle, and
visibility fields are untouched.

Firestore and Storage do not offer a shared transaction. The one-provider mode
without durable state uses compensating rollback: a Storage failure deletes
objects previously created by that execution, and a Firestore failure deletes
all objects created by that execution. Pre-existing objects are never deleted.
A rollback failure is surfaced in the sanitized report for operator
intervention. Mass/durable mode uses reconciliation instead, as defined below.

An empty gallery is a valid discovered result and sets
`galeriaImportada: true`. If no gallery is present, an existing Firestore
gallery is preserved and no empty replacement is written; a provider that had
no gallery remains without one. Missing description, cover, gallery, or all
three is a successful source result. The absent content field is not written,
existing content is never cleared, and the matching `*Encontrada` field is
`false`.

A successful final update sets accurate persisted/imported flags, all three
discovery booleans, `cantidadImagenes`, `ultimoIntentoEn`,
`ultimoError: null`, `completadaEn`, and `actualizadoEn`. `completadaEn` means
that the page downloaded, parsed, and reconciled successfully; it does not
mean that every optional content type existed. Only technical failures such as
unrecovered HTTP/timeouts, unreadable/parser failures, discovered-image
download or validation failures, Storage/Firestore failures, state
inconsistency, or unreconciled interruption produce an enrichment error.
Failed operations do not make a separate Firestore error write because partial
writes are forbidden; the sanitized local report is the failure authority.

`galeriaImportada: true` has a strict completeness meaning: the source gallery
was inspected in full and every expected unique item was persisted or matched
to an existing valid Storage reference. Finding a non-empty subset is
insufficient. If the declared total does not match, an entry is invalid, an
image fails validation, or an existing reused object is missing,
`gallery_incomplete` is reported locally, `galleryComplete` remains false, and
the run performs no remote write.

Without `--force`, a provider with `importacion.completadaEn` is skipped before
page download. Fully populated legacy documents retain a compatibility skip
when their three prior completion signals are present. `--force` permits
reanalysis but does not permit overwriting an existing description, cover,
gallery object, or Storage path. A forced inspection that finds no content
updates only import evidence/timestamps and preserves all existing content.

`--complete-gallery` explicitly repairs one partial gallery. It never changes
an existing description or cover, contact, categories, lifecycle, review, or
visibility. If the provider has never been enriched, missing description and
cover are populated only when the source provides valid values while the
gallery is inspected completely; their absence remains successful.
Existing gallery objects are matched by canonical media identity or hash ID;
only missing deterministic paths are uploaded. Firestore's ordered
`imagenes.galeria` array is replaced only after complete validation and upload.
Objects no longer present in the authority are removed from the Firestore array
but are not deleted from Storage. A failed Firestore transaction rolls back
only objects created by that execution, preserving the prior document.
Re-execution against an already matching source is write-free.

The safety bound `--max-gallery-images` defaults to 100 and is configurable
from 1 to 500. Reports expose expected, detected, downloaded, valid, existing,
added, uploaded, discarded, complete, and extraction-source gallery evidence.
`--debug-local` is dry-run-only and may temporarily retain source HTML plus a
sanitized structured URL list under Git-ignored
`artifacts/providers/runtime/debug-{providerId}/`; operators must remove the
raw HTML after diagnosis because the source page can include contact data.

### Durable mass orchestration contract

Mass apply requires an explicit local resume path. The state has schema version
1 and enrichment script version `2.1.0`. Version `2.0.0` states are
intentionally incompatible because they used the former content-required
confirmation semantics; they must be preserved for audit and explicitly
migrated or replaced with a reviewed new state path. The state records:

- project, category/filter, sorted candidate-ID SHA-256 and count;
- provider contract schema version, enrichment script version and extractor
  SHA-256;
- output-affecting options (`force`, complete-gallery mode and gallery limit);
- run timestamps/status, current and last-confirmed IDs;
- terminal processed IDs and per-provider phase/status/attempts;
- uploaded object evidence: deterministic path, image ID, content SHA-256,
  byte count and execution ID;
- completed/partial/error/skipped/recovered counts and byte/write totals;
- a checksum over the complete state excluding the checksum property.

The compatible per-provider state transitions are:

```text
pending (implicit)
  -> processing
  -> storage_complete
  -> firestore_updated
  -> confirmed

processing/storage_complete -> partial | recoverable_error
processing                 -> definitive_error | skipped | already_complete
firestore_updated          -> recovered (after remote reconciliation)
```

`confirmed` is written only after all required Storage objects exist, the
Firestore transaction succeeded, and the local confirmed checkpoint itself was
flushed and atomically installed. State writes are serialized across workers.
Each write flushes a temporary file, rotates the valid primary to
`*.backup.json`, renames the temporary file to the primary path, and syncs the
directory where the operating system supports it. A canonical checksum detects
valid JSON that was truncated or edited.

At startup a corrupt primary is quarantined and restored only from a valid
backup. Invalid primary + backup, checksum mismatch without a recovery source,
changed project/candidate set/options/contract/extractor, or an unsupported
state version aborts. Existing state is never silently discarded.

The sibling lock is created with exclusive filesystem semantics and stores a
PID, run ID, timestamp, scope hash and credential-redacted command. A live lock
always aborts a second process. A stale lock requires both
`--recover-stale-lock` and `--confirm-stale-lock=PID`; it is archived before
the replacement lock is acquired.

SIGINT, SIGTERM, uncaught exceptions and unhandled rejections stop new worker
assignments and new remote operations, checkpoint current phases, allow an
already safe commit boundary to finish, remove temporary directories, close
Admin clients, and exit non-zero when interrupted/fatal. A five-second
periodic checkpoint is only an additional safeguard: upload, Storage-complete,
Firestore-updated and confirmed transitions are persisted per provider and do
not wait for a batch.

Cross-service failures use idempotent reconciliation, not a false distributed
transaction:

1. Storage complete + Firestore failure: retain and record new objects; retry
   verifies their metadata/hash and never uploads them again.
2. Firestore processed (`importacion.completadaEn` present) + local checkpoint
   failure: compare the saved pre-attempt enrichment fingerprint with
   Firestore and mark the document recovered, even when the source contained no
   enrichable fields.
3. Partial Storage: retain verified objects as partial evidence; retry reuses
   only exact execution/provider/image/path/hash/size matches.
4. Local confirmed + remote incomplete/missing: report an inconsistency and
   abort rather than assuming success.

Unrecognized objects at a deterministic destination remain hard conflicts.
Mass recovery never overwrites or deletes existing objects, manual
descriptions, images or non-enrichment provider fields. `--limit` bounds new
IDs attempted in one invocation; previously partial/recoverable IDs are retried
first and do not consume that fresh limit. Concurrency defaults to 2 and is
bounded at 8.

Dry-run never writes the apply resume state. An optional `--dry-run-state`
provides separate durability, while Storage and Firestore writes remain zero.
The request controller enforces one shared delay, bounded timeouts/retries,
`Retry-After`, optional 429 pauses, and a circuit breaker after repeated
429/5xx responses.

Prepared Storage rules limit create/update to administrators, 15 MiB, the
corresponding MIME types, and the exact cover/gallery path shapes. Deletes are
administrator-only. Reads require an administrator or a linked provider that
is published, active, and visible.

## 7. Security and public projection decision

Public clients cannot write provider documents, categories, or provider
images. Backend Admin SDK writes bypass client rules; authorized admin clients
must pass the runtime/rules shape checks.

The prepared Firestore rule allows a whole provider document to be read only
when `estado == "publicado"`, `activo == true`, and `visible == true`.
Firestore Rules cannot hide `fuente`, `importacion`, validation actor IDs, or
other individual fields. Therefore setting any provider visible is blocked
operationally until product/security decides one of:

1. the complete canonical document is intentionally public; or
2. a backend read endpoint returns an explicit public-field whitelist.

Option 2 is preferred if provenance, import errors, or validation/claim actor
IDs are internal. Stage 1 does not create a duplicate public collection or a
public endpoint because no public provider surface exists yet. If a projection
is introduced, it must be derived from `proveedores` and must never become a
parallel authority.

## 8. Concrete queries and indexes

The only added composite indexes correspond to concrete ordered client reads:

```js
query(
  collection(db, "proveedores"),
  where("estado", "==", "publicado"),
  where("activo", "==", true),
  where("visible", "==", true),
  orderBy("nombreNormalizado", "asc")
);

query(
  collection(db, "categorias_proveedores"),
  where("activa", "==", true),
  orderBy("orden", "asc")
);
```

Prepared backend batch queries use automatic single-field indexes and document
ID pagination:

- provider not yet inspected by enrichment:
  `where("importacion.completadaEn", "==", null)`;
- source inspection records description/cover/gallery presence through
  `descripcionEncontrada`, `portadaEncontrada`, and `galeriaEncontrada`;
- `descripcionImportada`, `portadaImportada`, and `galeriaImportada` remain
  persisted-stage signals, but `false` description/cover values are not errors
  once `completadaEn` is present;
- review:
  `where("estado", "==", "pendiente_revision")`;
- manual review:
  `where("revisionManual.requerida", "==", true)`;
- errors:
  `where("importacion.ultimoError", ">", "").orderBy("importacion.ultimoError")`.

The future backend must page by document ID and apply any additional Stage 3
eligibility gates after each page. No Stage 3 composite indexes are added before
those jobs exist and their actual query plans are tested.

## 9. Privacy

Source JSON and CSV files must remain outside public repositories and
access-controlled.
Local reports contain counts, source record indexes, deterministic provider IDs,
reason codes, category names, URL paths/slugs, normalized business names, and
city/province fields required for duplicate review. They intentionally exclude
raw email, telephone, and full address values. The discard summary keeps
discarded-record count, reason-occurrence count, and records with multiple
reasons separate. The report also includes manual-review counts per normalized
reason and final internal-category distribution.

Dry-run reports add 5–10 deterministic representative `sampleDocuments`
selected from the complete eligible set. Contact values are reduced to
presence/count booleans, location is limited to city/level1/country/metropolitan
classification, WhatsApp is represented only by presence/equality booleans,
and image URLs are reduced to presence booleans. No raw email, phone, street,
full address, credentials, or review error text is emitted.
Repository-local runtime reports and dry-run state live under the Git-ignored
`artifacts/providers/runtime/`; durable apply state should normally live in an
access-controlled path such as `C:\private\providers`.

Single-provider enrichment reports add only provider ID, visited source URL,
description presence/length/source type, gallery completeness counts, image
counts, byte counts, stable Storage paths, write/rollback state, errors, and
stage timings. They do not include extracted description text, image source
URLs, HTML, provider contact, or full-address fields. The only exception is the
explicit dry-run-only debug artifact described above; it is ignored by Git and
must be deleted after use. Temporary image files are always outside the
repository and are removed before a successful Firestore commit.

Mass enrichment adds a credential-redacted run ID/scope/resume command,
per-provider phase/timings/retries/results, checkpoint/recovery evidence,
aggregate service writes/bytes and sanitized errors. Persistent JSONL logs
apply key-based redaction to credentials, contacts, addresses, HTML and
buffers. They never contain description text. State, reports and logs are
operational artifacts rather than Firestore authorities; repository-local
runtime paths are Git-ignored and the recommended durable state location is
access-controlled storage outside the repository.

The local emulator tests use the importer's own SDK. The import test commits
one mapped provider, reads it back and verifies native `Date` values return as
Firestore `Timestamp`. The enrichment recovery test uses Firestore and Storage
demo emulators, confirms one of three synthetic providers, kills the child
process without cleanup, resumes through the stale lock, and proves no lost
confirmation, duplicate Storage path, inconsistent final document/state or
temporary directory. They never target a real project.
