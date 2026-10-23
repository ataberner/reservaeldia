import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultGiftConfig } from "../../../domain/gifts/config.js";
import { createGiftMetadataState, giftLinkMetadataReducer as reduce } from "./giftLinkMetadataState.js";

const link = { id: "gift-1", url: "https://example.com/a", title: "", imageUrl: "", visible: true };
function fixture(overrides = {}) {
  const config = createDefaultGiftConfig();
  config.giftLinks = [{ ...link, ...overrides }];
  return createGiftMetadataState(config);
}
const start = (state, token = 1, url = link.url) => reduce(state, { type: "metadata-start", id: link.id, url, token });
const complete = (state, result, token = 1) => reduce(state, { type: "metadata-complete", id: link.id, token, result });
const edit = (state, changes) => reduce(state, { type: "edit-link", id: link.id, changes });
const result = { status: "found", title: "Cafetera", imageUrl: "https://example.com/cafetera.jpg" };

test("metadata fills missing fields and sanitizes untrusted or partial results", () => {
  const full = complete(start(fixture()), result);
  assert.equal(full.draft.giftLinks[0].title, "Cafetera");
  assert.equal(full.draft.giftLinks[0].imageUrl, result.imageUrl);
  assert.equal(full.requests[link.id].status, "found");
  const partial = complete(start(fixture()), { status: "found", title: "  Café\n  nuevo  ", imageUrl: "javascript:bad" });
  assert.equal(partial.draft.giftLinks[0].title, "Café nuevo");
  assert.equal(partial.draft.giftLinks[0].imageUrl, "");
  const imageOnly = complete(start(fixture()), { status: "found", imageUrl: result.imageUrl });
  assert.equal(imageOnly.draft.giftLinks[0].title, "");
  assert.equal(imageOnly.draft.giftLinks[0].imageUrl, result.imageUrl);
});

test("manual input during a request wins independently for title and image", () => {
  const requested = start(fixture());
  const manualTitle = complete(edit(requested, { title: "Mi título" }), result);
  assert.equal(manualTitle.draft.giftLinks[0].title, "Mi título");
  assert.equal(manualTitle.draft.giftLinks[0].imageUrl, result.imageUrl);
  const manualImage = complete(edit(requested, { imageUrl: "https://example.com/manual.jpg" }), result);
  assert.equal(manualImage.draft.giftLinks[0].title, result.title);
  assert.equal(manualImage.draft.giftLinks[0].imageUrl, "https://example.com/manual.jpg");
});

test("typing and clearing a manual field still prevents a late response from refilling it", () => {
  const pending = start(fixture());
  const cleared = edit(edit(pending, { title: "Algo escrito" }), { title: "" });
  assert.equal(complete(cleared, result).draft.giftLinks[0].title, "");
});

test("initial values are preserved and an explicitly edited automatic value becomes manual", () => {
  assert.equal(complete(start(fixture({ title: "Existente" })), result).draft.giftLinks[0].title, "Existente");
  let state = complete(start(fixture()), result);
  state = edit(state, { title: "Cafetera" });
  state = complete(start(state, 2), { ...result, title: "Título nuevo" }, 2);
  assert.equal(state.draft.giftLinks[0].title, "Cafetera");
});

test("out-of-order requests and URL changes including A to B to A discard old metadata", () => {
  const latest = start(start(fixture(), 1), 2);
  assert.equal(complete(latest, result, 1).draft.giftLinks[0].title, "");
  assert.equal(complete(latest, result, 2).draft.giftLinks[0].title, "Cafetera");
  const changedBack = edit(edit(start(fixture()), { url: "https://example.com/b" }), { url: link.url });
  assert.equal(complete(changedBack, result).draft.giftLinks[0].title, "");
});

test("changing the URL clears only automatically supplied values and allows fresh lookup", () => {
  let state = complete(start(fixture()), result);
  state = edit(state, { imageUrl: "https://example.com/manual.jpg" });
  state = edit(state, { url: "https://example.com/b" });
  assert.equal(state.draft.giftLinks[0].title, "");
  assert.equal(state.draft.giftLinks[0].imageUrl, "https://example.com/manual.jpg");
  state = complete(start(state, 2, "https://example.com/b"), { ...result, title: "Otro regalo" }, 2);
  assert.equal(state.draft.giftLinks[0].title, "Otro regalo");
  assert.equal(state.draft.giftLinks[0].imageUrl, "https://example.com/manual.jpg");
});

test("removed links cannot be resurrected by late responses", () => {
  const removed = reduce(start(fixture()), { type: "remove-link", id: link.id });
  assert.deepEqual(complete(removed, result).draft.giftLinks, []);
});

test("empty and unavailable responses preserve manual data and do not add request state to saved draft", () => {
  for (const status of ["empty", "unavailable"]) {
    const state = complete(start(fixture({ title: "Manual" })), { status });
    assert.equal(state.draft.giftLinks[0].title, "Manual");
    assert.equal(state.requests[link.id].status, status);
    assert.equal(Object.hasOwn(state.draft, "requests"), false);
  }
});
