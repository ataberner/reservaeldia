import test from "node:test";
import assert from "node:assert/strict";
import presentation from "./invitationLoaderPresentation.cjs";

const {
  INVITATION_LOADER_PRESENTATION_HTML,
  buildInvitationLoaderLoadingDocumentHTML,
} = presentation;

test("template preview placeholder reuses the canonical invitation loader presentation", () => {
  const loadingDocument = buildInvitationLoaderLoadingDocumentHTML();

  assert.match(INVITATION_LOADER_PRESENTATION_HTML, /inv-loader__heart/);
  assert.match(
    INVITATION_LOADER_PRESENTATION_HTML,
    /Preparando invitacion\.\.\./
  );
  assert.match(loadingDocument, /<body data-loader-ready="0">/);
  assert.match(loadingDocument, /inv-loader__heart/);
  assert.match(loadingDocument, /Preparando invitacion\.\.\./);
  assert.doesNotMatch(loadingDocument, /Cargando vista previa/);
  assert.doesNotMatch(loadingDocument, /<script>/);
});
