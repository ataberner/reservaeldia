# Published Share Image Contract

## Scope

This document defines the normative contract for published social share images.

The share-image pipeline is a backend publication pipeline feature, not editor
responsibility and not a separate template-preview mapping. Invitations
published before this contract was implemented may not have `share` metadata or
`share.jpg` until they are republished.

## Contract Authority

The published share image is derived from the generated published invitation
HTML. The authority chain is:

1. `borradores/{slug}` canonical render state: `objetos`, `secciones`, `rsvp`,
   and `gifts`.
2. Backend publish preparation through `prepareRenderPayload(...)`.
3. Backend publish validation through `validatePreparedRenderPayload(...)`.
4. Base published HTML from `generateHtmlFromPreparedRenderPayload(...)`.
5. First-section capture from that generated HTML.

The share image must not be generated from the editor canvas, a template visual
preview, a local fallback preview, or an invented simplified mapping.

## Strict Publish Pipeline Order

When this feature is enabled, publish must follow this order:

1. Prepare render payload.
2. Generate base published HTML.
3. Attempt first-section share image generation.
4. Decode, normalize, upload, and confirm generated `share.jpg`.
5. Resolve generated share metadata.
6. Inject final Open Graph metadata using the generated image.
7. Upload final `index.html`.
8. Persist `publicadas/{slug}` including generated `share`.

The final `index.html` must only be uploaded after `share.imageUrl` is resolved
and confirmed as generated metadata for the current publish attempt. The final
HTML must never reference a missing `og:image`. If `share.jpg` cannot be
generated, uploaded, decoded, or confirmed in step 4, the publish attempt must
fail in a controlled way before final `index.html` upload and before
`publicadas/{slug}` is persisted as active/successful.

Because the public route is lifecycle-gated by `publicadas/{slug}`, an uploaded
HTML artifact is not considered public until the Firestore publication document
is persisted.

Successful publication is atomic from the user perspective: if the function
returns success, the public URL, final HTML, generated share image, and persisted
share metadata are all ready for production sharing.

## Share Image Lifecycle

Every successful publish operation must resolve fresh `share` metadata for the
current publish attempt. This applies to:

- initial publish
- republish/update after edits
- publish/update that changes the public slug
- retry of a failed or interrupted publish attempt

Generated share images must be based on the current base published HTML for that
same publish attempt.

For republish/update using the same slug, the generated artifact at
`publicadas/{slug}/share.jpg` must be overwritten or replaced before final
`index.html` is uploaded.

For slug changes, both `share.storagePath` and generated `share.imageUrl` must
use the new public slug. Share metadata from the previous slug must not be
reused as generated metadata for the new slug.

A publish attempt must not reuse stale `share` metadata from a previous publish
attempt. Fallback metadata from any previous attempt must never be promoted to a
successful publish result.

Rollback mode (`PUBLISH_SHARE_IMAGE_ENABLED=0`) disables renderer execution and
therefore makes new publish/republish attempts fail closed. It must not publish
new active documents with fallback/default share metadata.

`share.version` must be set for every successful publish attempt and must be present in
`share.imageUrl` as `?v={share.version}`. The version must change when the
generated share image changes or the public slug changes. To avoid stale
crawler caches after republish, using a publish-attempt version is allowed even
when the visual image bytes are unchanged.

## HTML Source

The renderer must load the generated base published HTML from the publish
pipeline. This is the same HTML source that will become the public invitation
after Open Graph metadata is injected.

The source HTML must not be rewritten to isolate the section. Section isolation
is a renderer-context operation only.

## First Section Identification

The first section is the rendered DOM element matching:

```css
.inv > .sec:first-child
```

This selector relies on the existing published HTML structure emitted by the
generator. Section ordering is the ordering already produced by the publish HTML
generator from the prepared payload. The share-image implementation must not
infer a separate section order from Firestore, canvas state, template metadata,
or preview-only payloads.

If no `.inv > .sec:first-child` element is available, share generation fails
and the publish attempt must fail before becoming active/successful.

## Renderer Contract

The renderer must:

1. Load the generated publish HTML.
2. Wait for `document.readyState === "complete"`.
3. Wait for `document.fonts.ready`.
4. Wait for every `document.images` entry to load or error.
5. Wait at least two animation frames after the readiness waits finish.
6. Select `.inv > .sec:first-child`.
7. Hide all other sections only inside the renderer DOM context.
8. Wait for the selected first section's finite entrance motion to settle.
9. Avoid mutating the stored HTML or the HTML string that will be uploaded.
10. Capture a `1200x630` output.

First-section entrance motion includes runtime classes and CSS generated by the
published HTML, such as `motionEffect` reveal/zoom/draw transitions,
gallery-stagger transitions, countdown v2 entry animations, and loader-to-page
opacity transitions that affect the first section. The renderer must prefer
deterministic browser signals such as `Animation.finished`,
`animationend`/`transitionend`-equivalent Web Animations API state, and stable
layout frames. If those signals are unavailable, it may compute a bounded wait
from the first section's finite `animation-duration`, `animation-delay`,
`transition-duration`, and `transition-delay` values, plus a short settling
buffer.

The renderer must not wait forever for infinite or decorative loops such as
pulse, shimmer, rotate, loader spinners, or countdown frame loops. Those effects
must not extend capture beyond the renderer budget. Invitations with no
first-section entrance motion must proceed after the normal readiness and
layout-stability waits without an arbitrary long delay.

The renderer budget is 5 to 8 seconds. A timeout, renderer error, missing first
section, readiness failure, or capture failure must fail the publish attempt in
a controlled way. The previously valid active publication, if any, must remain
safe and must not be replaced by fallback/default share metadata.

## Renderer Technology

A browser-based renderer is used because the share image must visually reflect
the real published HTML first section. The renderer dependency must remain
isolated and lazy-loaded so non-render publish work does not load the browser.

Before and after production rollout, validate at least:

- memory needed by the renderer in Cloud Functions v2
- cold start cost
- deployed package size
- browser binary or system dependency requirements
- runtime timeout behavior
- concurrent publish behavior
- Storage permissions for writing and confirming the artifact

## Output Contract

The generated share image must be:

- width `1200px`
- height `630px`
- JPEG format
- quality `80-90`, default `85`
- target size `< 300KB`

The image must represent the top of the invitation. Content must come from
`.inv > .sec:first-child`, and the capture must start from the top edge of that
section, with `Y = 0` relative to the section.

The renderer must output a final image already sized to `1200x630`. WhatsApp,
Open Graph consumers, and other crawlers must not be relied upon to crop or
resize the image.

Before a generated image is uploaded, the publish pipeline must decode the image
bytes and verify the actual format and dimensions. The saved generated artifact
must be an actual JPEG whose decoded dimensions are exactly `1200x630`.
Optional renderer-reported metadata is not sufficient. If the decoded generated
image is taller than `630px` but otherwise safe to normalize, the backend may
top-crop it to `1200x630` and re-encode it as JPEG. If the bytes cannot be
decoded or normalized safely, generation fails and the publish attempt must
fail.

Cropping is top-anchored. The image must not be vertically centered and must not
be cropped from the middle. If the first section is taller than `630px` in the
renderer viewport, the image must capture the top `630px` and crop overflow
from the bottom only.

If the first section is shorter than `630px` or otherwise leaves empty output
area, the empty area must be filled with a background derived from the first
section's computed background. If that background cannot be derived safely, use
a documented static fallback color.

The renderer must not capture the full invitation. It captures only the first
section/cover as rendered from the generated published HTML.

## Storage And Public URL Contract

`storagePath` and `imageUrl` are different fields with different meanings and
must never be treated as interchangeable.

`storagePath` is the internal Firebase Storage path, for example:

```txt
publicadas/{slug}/share.jpg
```

`imageUrl` is the public URL used by `og:image`, for example:

```txt
https://reservaeldia.com.ar/i/{slug}/share.jpg?v={share.version}
```

The public URL should be lifecycle-gated by the public invitation route when the
share image is generated next to the invitation artifact. Fallback URLs may
point to other validated public HTTPS image artifacts.

The public generated-image route must serve `publicadas/{slug}/share.jpg` only
when current `publicadas/{slug}.share` metadata has `status: "generated"`,
`source: "renderer"` or `"published-html-first-section"`, `storagePath:
"publicadas/{slug}/share.jpg"`, and the requested `?v=` matches
`share.version`. If a grandfathered publication has fallback metadata, the route
must not serve an older generated `share.jpg` as if it were current.

## Firestore Metadata Contract

`publicadas/{slug}` documents written by a successful publish must persist a
generated `share` object.

```ts
type PublishedShareMetadata = {
  status: "generated";
  source: "renderer" | "published-html-first-section";
  storagePath: string;
  imageUrl: string;
  width: 1200;
  height: 630;
  mimeType: "image/jpeg";
  version: string;
  generatedAt: Timestamp;
  fallbackReason?: null;
  errorCode?: null;
};
```

Rules:

- `imageUrl` is required and must point to `/i/{slug}/share.jpg?v={share.version}`.
- `storagePath` is required and must be `publicadas/{slug}/share.jpg`.
- `version` must be set for every successful publish attempt and must change
  when the generated share image changes or the public slug changes.
- `generatedAt` records when the generated metadata was resolved.
- Existing active publications that predate this generated-only success
  contract may still contain `fallback`, `pending`, or `rendering` share
  metadata until they are republished or repaired. New successful publish writes
  must not create those states.

## Open Graph Metadata Contract

The final uploaded `index.html` must include Open Graph and Twitter metadata
based on the resolved `share` object:

```html
<meta property="og:title" content="..." />
<meta property="og:description" content="..." />
<meta property="og:image" content="{share.imageUrl}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="https://reservaeldia.com.ar/i/{slug}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
```

The metadata injection step must escape HTML attribute values. The final HTML
must not include an `og:image` URL unless that URL has been resolved as valid and
publicly usable.

## Fallback Contract

Fallback metadata may exist only for legacy/grandfathered documents,
diagnostics, repair tooling, or emergency internal recovery. It is not a
successful publish result. If fallback is resolved internally, it must still use
this exact order:

1. Existing `portada`, only if validated as a public image.
2. Explicit template share image, defined as template metadata and used only if
   valid/public.
3. Static default share image, a required public `1200x630` deployed artifact
   for the fallback path.

The explicit template share image field is:

```txt
plantillas/{templateId}.share.imageUrl
```

No other template preview field is a fallback alias for this contract.

A valid public image is an absolute HTTPS URL that can be fetched publicly,
returns a JPEG image, and decodes to exactly `1200x630`. Private Storage paths,
signed URLs that cannot be considered stable enough for sharing, blob URLs,
relative paths, non-JPEG images, images with other decoded dimensions, and
missing values are invalid.

The static default image is mandatory for diagnostics and emergency recovery,
but it does not make a publish attempt successful. A new publish/republish must
not return success or persist an active publication with the static default
image as its final `og:image`.

## Idempotency

The generated artifact path is deterministic:

```txt
publicadas/{slug}/share.jpg
```

Retries for the same publish/update may overwrite the same generated artifact.
The resolved public URL must include a version query string, and the Firestore
`share.version` value must match the URL.

If a retry cannot confirm the generated artifact, the retry must fail before
uploading final HTML or persisting active publication metadata. No persisted
successful public document may point to a missing or invalid generated image.

## Cache And Versioning

WhatsApp and other crawlers aggressively cache Open Graph images. The public
`imageUrl` must include a stable version query parameter:

```txt
?v={share.version}
```

`share.version` should be derived from the publish/update attempt or a content
hash of the generated share image. It must change whenever the social preview
image changes.

The internal `storagePath` does not need to include the version. Keeping the
path stable allows overwrites and cleanup under the publication artifact prefix.

## Rollback Flag

`PUBLISH_SHARE_IMAGE_ENABLED=0` must disable renderer execution and make new
publish/republish attempts fail closed. The flag is a runtime rollback for
rendering risk, but it must not allow a new active publication to succeed with a
generic fallback image.

Existing active publications remain accessible while the flag is disabled.

## Required Tests

The implementation must be guarded by tests for:

- metadata and Open Graph tag escaping
- generated-only publish completion
- renderer readiness waits, `.inv > .sec:first-child` selection,
  first-section finite entrance-motion settling, renderer-only hiding, no
  stored-HTML mutation, and `1200x630` capture
- no unnecessary wait for no-motion first sections and no unbounded wait for
  infinite decorative animations
- renderer timeout/error behavior proving publish fails closed without
  corrupting an existing active publication
- aspect-ratio composition and deterministic background fill
- JPEG quality range and target-size checks where practical
- strict separation between `storagePath` and `imageUrl`
- publish execution proving no persisted or publicly served HTML references a
  missing `og:image`
- upload-confirmation failure after generated metadata selection, proving final
  HTML and active publication metadata are not persisted
- rollback flag fail-closed behavior
- same-slug republish artifact restore/cleanup behavior
- existing preview/publish render parity tests remaining unchanged

## Explicit Non-Goals

- No editor-generated share images.
- No template visual preview as share-image authority.
- No direct simplified render-contract-to-image mapping.
- No full-invitation capture.
- No `og:image` that points to an unvalidated or private image.
