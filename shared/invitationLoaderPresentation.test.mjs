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
    /Preparando tu invitación\.\.\./
  );
  assert.doesNotMatch(
    INVITATION_LOADER_PRESENTATION_HTML,
    /Cargando vista previa/
  );
});

test("the canonical loader uses the Reserva el Dia violet identity", () => {
  assert.match(INVITATION_LOADER_PRESENTATION_HTML, /stroke:\s*#692B9A/i);
  assert.match(
    INVITATION_LOADER_PRESENTATION_HTML,
    /rgba\(239,\s*219,\s*255,\s*0\.82\)/
  );
  assert.match(INVITATION_LOADER_PRESENTATION_HTML, /#FAF5FF/i);
  assert.match(
    INVITATION_LOADER_PRESENTATION_HTML,
    /font-family:\s*"DM Sans",\s*system-ui/
  );
  assert.match(
    INVITATION_LOADER_PRESENTATION_HTML,
    /\.inv-loader__heart\s*\{[\s\S]*?position:\s*relative;[\s\S]*?z-index:\s*1;/
  );
  assert.doesNotMatch(INVITATION_LOADER_PRESENTATION_HTML, /rotate\(-45deg\)/);
  assert.doesNotMatch(
    INVITATION_LOADER_PRESENTATION_HTML,
    /#cf4f89|#6d2a53|rgba\((?:255,\s*223,\s*236|239,\s*208,\s*255|249,\s*206,\s*224|244,\s*175,\s*204|230,\s*123,\s*168|221,\s*126,\s*165|211,\s*70,\s*130|233,\s*145,\s*179|216,\s*61,\s*124)/i
  );
});

test("the branded loader preserves accessibility and reduced-motion behavior", () => {
  assert.match(INVITATION_LOADER_PRESENTATION_HTML, /role="status"/);
  assert.match(INVITATION_LOADER_PRESENTATION_HTML, /aria-live="polite"/);
  assert.match(
    INVITATION_LOADER_PRESENTATION_HTML,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation:\s*none !important;/
  );
  assert.match(INVITATION_LOADER_PRESENTATION_HTML, /inv-loader__error/);
  assert.match(
    INVITATION_LOADER_PRESENTATION_HTML,
    /data-invitation-retry="true"/
  );
});
