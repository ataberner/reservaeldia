import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildStorageAssetDescriptor,
  pickStorageAssetDescriptorFields,
  resolveStorageDownloadToken,
} from "./storageAssetDescriptor.js";

const firebaseUrl =
  "https://firebasestorage.googleapis.com/v0/b/reservaeldia-7a440.firebasestorage.app/o/" +
  "usuarios%2Fu-1%2Fimagenes%2Fhero.webp?alt=media&token=token-123";

test("canonical storage descriptors keep version, token, and source dimensions", () => {
  const descriptor = buildStorageAssetDescriptor({
    url: firebaseUrl,
    storagePath: "usuarios/u-1/imagenes/hero.webp",
    storageGeneration: "1777000000000000",
    width: 1600,
    height: 1067,
  });

  assert.equal(resolveStorageDownloadToken(firebaseUrl), "token-123");
  assert.deepEqual(descriptor, {
    url: firebaseUrl,
    storagePath: "usuarios/u-1/imagenes/hero.webp",
    storageGeneration: "1777000000000000",
    storageDownloadToken: "token-123",
    ancho: 1600,
    alto: 1067,
  });
  assert.deepEqual(pickStorageAssetDescriptorFields(descriptor), {
    storagePath: "usuarios/u-1/imagenes/hero.webp",
    storageGeneration: "1777000000000000",
    storageDownloadToken: "token-123",
  });
});

test("upload and legacy-crop owners persist metadata without backend byte downloads", () => {
  const uploadSource = readFileSync(
    new URL("../../hooks/useMisImagenes.js", import.meta.url),
    "utf8"
  );
  const editorSource = readFileSync(
    new URL(
      "../../components/editor/textSystem/render/konva/ElementoCanvasRenderer.jsx",
      import.meta.url
    ),
    "utf8"
  );
  const preparedDimensionSource = readFileSync(
    new URL(
      "../../../functions/src/utils/publishImageSourceDimensions.ts",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(uploadSource, /customMetadata:\s*\{[\s\S]*?sourceWidth:[\s\S]*?sourceHeight:/);
  assert.match(uploadSource, /storageGeneration:\s*uploadResult\?\.metadata\?\.generation/);
  assert.match(uploadSource, /storageDownloadToken:\s*resolveStorageDownloadToken\(url\)/);
  assert.match(uploadSource, /width:\s*sourceWidth,[\s\S]*?height:\s*sourceHeight/);
  assert.match(editorSource, /img\.naturalWidth/);
  assert.match(editorSource, /resolveStorageAssetDescriptorFromMetadata\(obj\)/);
  assert.doesNotMatch(preparedDimensionSource, /\.download\(|sharp|getStorage/);
});
