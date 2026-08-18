import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./MiniToolbarTabImagen.jsx", import.meta.url),
  "utf8"
);

test("Gallery drag preview escapes the transformed sidebar only on mobile", () => {
  assert.match(source, /import \{ createPortal \} from "react-dom";/);

  const selectionStart = source.indexOf("const renderedGalleryDragPreview =");
  const selectionEnd = source.indexOf("\n\n  return (", selectionStart);
  assert.notEqual(selectionStart, -1);
  assert.notEqual(selectionEnd, -1);

  const previewMountSelection = source.slice(selectionStart, selectionEnd);
  assert.match(
    previewMountSelection,
    /galleryDragPreview && isMobileViewport && typeof document !== "undefined" && document\.body/
  );
  assert.match(
    previewMountSelection,
    /createPortal\(galleryDragPreview, document\.body\)/
  );
  assert.match(previewMountSelection, /: galleryDragPreview;/);
  assert.match(source, /\{renderedGalleryDragPreview\}/);
});
