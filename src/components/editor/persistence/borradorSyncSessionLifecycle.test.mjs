import test from "node:test";
import assert from "node:assert/strict";

import { createBorradorSyncSessionLifecycle } from "./borradorSyncSessionLifecycle.js";

test("a loaded draft is not considered hydrated after the editor switches to a template", () => {
  const lifecycle = createBorradorSyncSessionLifecycle();
  const draftLoad = lifecycle.beginLoad({
    session: { kind: "draft", id: "draft-base" },
  });
  assert.equal(lifecycle.completeLoad(draftLoad), true);

  const draftIntent = lifecycle.capturePersistIntent({
    session: { kind: "draft", id: "draft-base" },
  });
  lifecycle.observeSession({
    session: { kind: "template", id: "template-copy" },
  });

  assert.equal(
    lifecycle.getPersistBlockReason(draftIntent, {
      session: { kind: "template", id: "template-copy" },
    }),
    "session-changed"
  );

  const templateIntent = lifecycle.capturePersistIntent({
    session: { kind: "template", id: "template-copy" },
  });
  assert.equal(
    lifecycle.getPersistBlockReason(templateIntent, {
      session: { kind: "template", id: "template-copy" },
    }),
    "draft-not-loaded"
  );
});

test("a repeated load invalidates queued work until the newest hydration completes", () => {
  const lifecycle = createBorradorSyncSessionLifecycle();
  const firstLoad = lifecycle.beginLoad({
    session: { kind: "template", id: "template-1" },
  });
  assert.equal(lifecycle.completeLoad(firstLoad), true);

  const queuedIntent = lifecycle.capturePersistIntent({
    session: { kind: "template", id: "template-1" },
  });
  const replacementLoad = lifecycle.beginLoad({
    session: { kind: "template", id: "template-1" },
  });

  assert.equal(
    lifecycle.getPersistBlockReason(queuedIntent, {
      session: { kind: "template", id: "template-1" },
    }),
    "session-load-changed"
  );
  assert.equal(lifecycle.completeLoad(firstLoad), false);
  assert.equal(lifecycle.completeLoad(replacementLoad), true);

  const freshIntent = lifecycle.capturePersistIntent({
    session: { kind: "template", id: "template-1" },
  });
  assert.equal(
    lifecycle.getPersistBlockReason(freshIntent, {
      session: { kind: "template", id: "template-1" },
    }),
    null
  );
});
