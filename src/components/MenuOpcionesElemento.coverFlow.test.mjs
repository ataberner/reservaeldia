import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const elementMenuSource = readFileSync(
  new URL("./MenuOpcionesElemento.jsx", import.meta.url),
  "utf8"
);
const overlaysSource = readFileSync(
  new URL("./editor/canvasEditor/CanvasEditorOverlays.jsx", import.meta.url),
  "utf8"
);
const canvasEditorSource = readFileSync(
  new URL("./CanvasEditor.jsx", import.meta.url),
  "utf8"
);
const imageTabSource = readFileSync(
  new URL("./MiniToolbarTabImagen.jsx", import.meta.url),
  "utf8"
);
const draftMetaSource = readFileSync(
  new URL("./editor/canvasEditor/useCanvasEditorDraftMeta.js", import.meta.url),
  "utf8"
);

test("selected canvas images expose the cover action only through the admin gear menu", () => {
  const useAsStart = elementMenuSource.indexOf("{/* Usar como (roles de imagen) */}");
  const useAsEnd = elementMenuSource.indexOf("{esRsvp &&", useAsStart);
  assert.notEqual(useAsStart, -1);
  assert.notEqual(useAsEnd, -1);

  const useAsSource = elementMenuSource.slice(useAsStart, useAsEnd);
  assert.match(
    useAsSource,
    /canManageSite && typeof onSetCoverImage === "function"/
  );
  assert.match(useAsSource, /"Usar como portada"/);
  assert.match(
    elementMenuSource,
    /onSetCoverImage\(elementoSeleccionado, \{\s*syncLinkedVisuals: false/
  );

  assert.match(overlaysSource, /onSetCoverImage=\{onSetCoverImage\}/);
  assert.match(canvasEditorSource, /onSetCoverImage=\{updateCoverImage\}/);
  assert.match(elementMenuSource, /kind: "canvas-object"/);
  assert.match(elementMenuSource, /kind: "section-background"/);
  assert.equal(
    (elementMenuSource.match(/"Usar como portada"/g) || []).length >= 2,
    true
  );
});

test("Assistant replacement keeps linked canvas images and backgrounds synchronized through the same owner", () => {
  assert.match(imageTabSource, /coverImage: readEditorCoverImage\(\)/);
  assert.doesNotMatch(imageTabSource, /resolveFirstSectionBaseImage/);
  assert.match(
    imageTabSource,
    /updateCoverImage\(uploadedUrl, \{ syncLinkedVisuals: true \}\)/
  );
  assert.match(imageTabSource, /src=\{coverState\.imageUrl\}/);
  assert.doesNotMatch(imageTabSource, /label: "Usar como portada"/);
});

test("template sessions require a real marked cover before exposing the Assistant block", () => {
  assert.match(
    draftMetaSource,
    /const requiresExplicitCoverSource =\s*editorSession\?\.kind === "template"/
  );
  assert.match(
    draftMetaSource,
    /allowLegacyPortadaFallback: !requiresExplicitCoverSource/
  );
});
