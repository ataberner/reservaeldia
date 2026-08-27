import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const detailsSource = readFileSync(
  new URL("../../components/MiniToolbarTabDetallesEvento.jsx", import.meta.url),
  "utf8"
);
const headerSource = readFileSync(
  new URL("../../components/DashboardHeader.jsx", import.meta.url),
  "utf8"
);

test("Assistant person-name corrections keep an automatic event name synchronized", () => {
  assert.match(detailsSource, /namePolicy\?\.mode === "automatic"/);
  assert.match(detailsSource, /buildAutomaticEventName\(\s*nextNames\.primaryName,\s*nextNames\.secondaryName/s);
  assert.match(detailsSource, /source: "assistant-automatic-name"/);
});

test("manual document-name commits persist explicit authority", () => {
  assert.match(headerSource, /mode: "explicit"/);
  assert.match(headerSource, /designerAiConversation: nextConversation/);
  assert.match(headerSource, /reason: "document-name"/);
});
