import test from "node:test";
import assert from "node:assert/strict";
import presentation from "./invitationLoaderPresentation.cjs";

const {
  INVITATION_LOADER_PRESENTATION_HTML,
} = presentation;

test("preview shells reuse the canonical invitation loader presentation", () => {
  assert.match(INVITATION_LOADER_PRESENTATION_HTML, /inv-loader__heart/);
  assert.match(
    INVITATION_LOADER_PRESENTATION_HTML,
    /Preparando invitacion\.\.\./
  );
  assert.doesNotMatch(
    INVITATION_LOADER_PRESENTATION_HTML,
    /Cargando vista previa/
  );
});
