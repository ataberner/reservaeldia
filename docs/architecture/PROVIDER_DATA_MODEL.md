# Provider Data Model

Status: Canonical Contract.

Scope: Stage 1 of the Reserva el Día provider database. This contract defines
the future Firestore documents, deterministic identity, local normalization,
eligibility, import progress, Storage paths, and security boundaries. It does
not authorize a real import, image download, source-site crawl, rules deploy, or
profile publication.

Implementation anchors:

- `functions/src/providers/types.ts`
- `functions/src/providers/normalization.ts`
- `functions/src/providers/eligibility.ts`
- `functions/src/providers/mapper.ts`
- `functions/src/providers/review.ts`
- `functions/src/providers/validation.ts`
- `functions/src/providers/storagePaths.ts`
- `scripts/providers/providerInput.cjs`
- `scripts/providers/README.md`

Code is the current executable truth. Update this contract and the focused
tests in `functions/providersStage1.test.mjs`,
`scripts/providersStage1.test.mjs`, and `scripts/providersCsv.test.mjs`
whenever a provider contract changes.

## 1. Authority and boundaries

`proveedores/{proveedorId}` is the canonical provider document. Secured source
JSON and CSV files remain non-repository evidence for original values that are
rejected during normalization; they are not a second application database.
Storage is authoritative for image bytes. Firestore only stores stable
`storagePath` values, optional delivery URLs, and image metadata.

There is no provider client, public route, validation flow, claim flow, scraper,
or deployed backend in Stage 1. The prepared Admin script is an operator tool,
not an automatically executed Cloud Function.

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
| `importacion` | Data/description/cover/gallery progress and bounded error state. |
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

Runtime validation rejects documents that do not preserve required groups,
states, timestamp types, ISO country-code shape, image metadata shape, the
manual-review reason allowlist/uniqueness invariant, or the invariant that a
visible provider must also be active and published. Timestamp validation
accepts valid native `Date` values before writes and structural Firestore
timestamps after reads.

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

- pending description:
  `where("importacion.descripcionImportada", "==", false)`;
- pending cover:
  `where("importacion.portadaImportada", "==", false)`;
- pending gallery:
  `where("importacion.galeriaImportada", "==", false)`;
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
Runtime reports and resume files live under the Git-ignored
`artifacts/providers/runtime/`.

The local emulator integration test uses the importer's own SDK, commits one
mapped provider to the Firestore emulator, reads it back, verifies that the
three native write `Date` values return as Firestore `Timestamp` values, and
deletes the emulator document. It never targets a real project.
