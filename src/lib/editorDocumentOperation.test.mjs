import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEditorDocumentOperation } from "./editorDocumentOperation.js";
import { publishDashboardDocumentNameState } from "./dashboardDocumentNameBridge.js";

function runtime() {
  const target = new EventTarget();
  target.Event = Event;
  target.CustomEvent = CustomEvent;
  const select = (documentId) => publishDashboardDocumentNameState({
    documentId, editable: true, hydrated: true,
  }, target);
  select("A");
  return { target, select };
}

for (const targetKind of ["cover", "gallery"]) {
  test(`L1 cancelling the real ${targetKind} picker settles both operations and removes listeners`, () => {
    const { target } = runtime();
    let listeners = 0;
    const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
    const registered = new Set();
    target.addEventListener = (type, handler, options) => { registered.add(handler); listeners = registered.size; add(type, handler, options); };
    target.removeEventListener = (type, handler) => { registered.delete(handler); listeners = registered.size; remove(type, handler); };
    const sidebar = readFileSync(new URL("../components/DashboardSidebar.jsx", import.meta.url), "utf8");
    const images = readFileSync(new URL("../components/MiniToolbarTabImagen.jsx", import.meta.url), "utf8");
    const start = sidebar.indexOf("const cancelPendingImageSelection = useCallback(") + "const cancelPendingImageSelection = useCallback(".length;
    const callback = sidebar.slice(start, sidebar.indexOf(", []);", start));
    const settledHandlers = [...images.matchAll(/onUploadSettled: (\(\{ cancelled \} = \{\}\) => \{[\s\S]*?\n      \}),/g)];
    assert.equal(settledHandlers.length, 2);
    const operation = createEditorDocumentOperation(target);
    const sidebarOperation = createEditorDocumentOperation(target);
    let notices = [], clears = 0;
    const settled = new Function("operation", "clearReplacementUpload", "setPanelNoticeSafe", `const uploadKey='synthetic'; return (${settledHandlers[targetKind === "gallery" ? 0 : 1][1]});`)(operation, () => clears++, (value) => notices.push(value));
    const ref = { current: { operation: sidebarOperation, onUploadSettled: settled } };
    const cancel = new Function("pendingUploadedImageHandlerRef", `return (${callback});`)(ref);
    assert.equal(listeners, 2);
    cancel();
    assert.equal(ref.current, null);
    assert.equal(operation.isCurrent(), false);
    assert.equal(sidebarOperation.isCurrent(), false);
    assert.equal(listeners, 0);
    assert.equal(clears, 1);
    assert.deepEqual(notices, [""]);
    cancel();
    assert.equal(clears, 1);
    assert.match(sidebar, /onCancel: cancelPendingImageSelection/);
    assert.match(sidebar, /if \(!selectedFile\) \{ cancelPendingImageSelection\(\); return; \}/);
    assert.match(sidebar, /const abrirSelectorImagen = useCallback\([\s\S]{0,100}cancelPendingImageSelection\(\)/);
    assert.match(sidebar, /useEffect\(\(\) => cancelPendingImageSelection/);
  });
}

for (const kind of ["Places", "cover upload", "Gallery upload"]) {
  for (const scenario of ["same document", "other document", "returned to A", "cancelled/unmounted"]) {
    test(`${kind}: deferred completion, ${scenario}`, async () => {
      const { target, select } = runtime();
      const operation = createEditorDocumentOperation(target);
      const writes = [];
      const mutate = () => writes.push(target.__dashboardDocumentNameState.documentId);
      let applyResponse = () => operation.run(mutate);
      if (kind !== "Places") {
        // Execute the actual upload continuation wired by the toolbar, with the
        // upload delayed and only its existing mutation owner substituted.
        const source = readFileSync(new URL("../components/MiniToolbarTabImagen.jsx", import.meta.url), "utf8");
        const owner = kind === "cover upload" ? "updateCoverImage" : "replaceGalleryPhotoTargetWithUpload";
        const callback = source.match(new RegExp(`onUploadedImage: (\\(uploadedUrl\\) =>\\s*operation\\.run\\(\\(\\) => ${owner}\\([^\\n]+\\)\\)),`));
        assert.ok(callback, `Missing ${owner} upload callback`);
        applyResponse = new Function("operation", owner, `const galleryId='gallery-A', target={cellId:'cell-A',sourceIndex:0}; return (${callback[1]});`)(operation, mutate);
      }
      let complete;
      const response = new Promise((resolve) => { complete = resolve; });
      const pending = (async () => {
        await response;
        return applyResponse("synthetic-upload");
      })();
      if (scenario === "other document" || scenario === "returned to A") select("B");
      if (scenario === "returned to A") select("A");
      if (scenario === "cancelled/unmounted") operation.cancel();
      complete();
      if (scenario === "same document") { await pending; assert.deepEqual(writes, ["A"]); }
      else { await assert.rejects(pending, /sesión/); assert.deepEqual(writes, []); }
      operation.cancel();
    });
  }
}

test("Places and both upload callbacks guard the actual owner invocation", () => {
  const places = readFileSync(new URL("../components/editor/designerAi/DesignerAiLocationControl.jsx", import.meta.url), "utf8");
  const images = readFileSync(new URL("../components/MiniToolbarTabImagen.jsx", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../hooks/useEditorDocumentOperation.js", import.meta.url), "utf8");
  assert.match(places, /operation\.run\(\(\) => applyEventGooglePlaceSelection/);
  assert.match(images, /operation\.run\(\(\) => replaceGalleryPhotoTargetWithUpload/);
  assert.match(images, /operation\.run\(\(\) => updateCoverImage/);
  assert.match(hook, /useLayoutEffect\(\(\) => \(\) =>/);
  assert.match(hook, /operation\.cancel\(\)/);
});

for (const scenario of ["same", "switch", "unmount"]) {
  test(`real Places handler with a deferred provider response: ${scenario}`, async () => {
    const { target, select } = runtime();
    const source = readFileSync(new URL("../components/editor/designerAi/DesignerAiLocationControl.jsx", import.meta.url), "utf8");
    const handler = source.slice(source.indexOf("const handleSelect = ") + "const handleSelect = ".length, source.indexOf("\n\n  return (", source.indexOf("const handleSelect = "))).replace(/;\s*$/, "");
    const operation = createEditorDocumentOperation(target);
    let respond;
    const response = new Promise((resolve) => { respond = resolve; });
    const writes = [];
    const selectPlace = new Function("beginOperation", "fetchGooglePlaceDetailsFromPrediction", "applyEventGooglePlaceSelection", "window", `const selecting=false, feature='ceremony', sessionTokenRef={}; const setSelecting=()=>{}, setError=()=>{}, onSelectionApplied=()=>true; return (${handler});`)(() => operation, () => response, () => writes.push(target.__dashboardDocumentNameState.documentId), target);
    const pending = selectPlace({ prediction: {} });
    if (scenario === "switch") select("B");
    if (scenario === "unmount") operation.cancel();
    respond({ id: "synthetic-place" });
    await pending;
    assert.deepEqual(writes, scenario === "same" ? ["A"] : []);
  });
}

test("late header name persistence cannot publish A's state into B", async () => {
  const { target, select } = runtime();
  const source = readFileSync(new URL("../components/DashboardHeader.jsx", import.meta.url), "utf8");
  const start = source.indexOf("async (nombreDocumento = nombreBorrador");
  const end = source.indexOf("\n        },", start) + "\n        }".length;
  const operation = createEditorDocumentOperation(target);
  let persisted;
  const pendingWrite = new Promise((resolve) => { persisted = resolve; });
  const uiWrites = [];
  const save = new Function("beginDocumentOperation", "persistEditorSessionPatch", "setNombreBorrador", `const slugInvitacion='A', normalizedEditorSession={kind:'draft',id:'A'}, isTemplateSession=false, nombreBorrador='', designerAiConversation={namePolicy:{mode:'unknown'}}; const normalizeText=v=>String(v).trim(), normalizeDesignerAiConversationState=v=>v, setDesignerAiConversation=()=>{}; return (${source.slice(start,end)});`)(() => operation, () => pendingWrite, (name) => uiWrites.push(name));
  const pending = save("Nombre A");
  select("B"); persisted(); await pending;
  assert.deepEqual(uiWrites, []);
});
