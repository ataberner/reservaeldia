import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const hookSource = fs.readFileSync(
  new URL("./useTemplateFieldAuthoring.js", import.meta.url),
  "utf8"
);
const canvasEditorSource = fs.readFileSync(
  new URL("../../CanvasEditor.jsx", import.meta.url),
  "utf8"
);
const persistenceSource = fs.readFileSync(
  new URL("../persistence/borradorSyncPersist.js", import.meta.url),
  "utf8"
);
const commitPolicySource = fs.readFileSync(
  new URL("../textSystem/commitPolicy/useInlineCommitPolicy.js", import.meta.url),
  "utf8"
);
const stageComposerSource = fs.readFileSync(
  new URL("../textSystem/render/konva/CanvasStageContentComposer.jsx", import.meta.url),
  "utf8"
);
const typedInlineEditorSource = fs.readFileSync(
  new URL("../canvasEditor/LinkedFieldTypedInlineEditor.jsx", import.meta.url),
  "utf8"
);
const fieldBadgeSource = fs.readFileSync(
  new URL("./TemplateFieldBadgeOverlay.jsx", import.meta.url),
  "utf8"
);
const canvasOverlaysSource = fs.readFileSync(
  new URL("../canvasEditor/CanvasEditorOverlays.jsx", import.meta.url),
  "utf8"
);

function readCallbackSlice(name, nextName) {
  const start = hookSource.indexOf(`const ${name} = useCallback`);
  const end = hookSource.indexOf(`const ${nextName} = useCallback`, start + 1);
  assert.notEqual(start, -1, `${name} callback missing`);
  assert.notEqual(end, -1, `${nextName} callback missing`);
  return hookSource.slice(start, end);
}

test("authoring persistence always carries the complete reached render roots", () => {
  const persistSlice = readCallbackSlice("persistSnapshot", "commitSnapshot");

  assert.match(persistSlice, /const liveState = latestAuthoringStateRef\.current/);
  assert.match(persistSlice, /const renderObjects = Array\.isArray\(options\.nextObjects\)/);
  assert.match(persistSlice, /const renderSections = Array\.isArray\(options\.nextSections\)/);
  assert.match(persistSlice, /const renderEventDetails =/);
  assert.match(
    persistSlice,
    /const payload = hydrateSnapshot\(nextSnapshot, renderObjects\)/
  );
  assert.match(persistSlice, /const renderPatch = \{\s*objetos: renderObjects,\s*secciones: renderSections,\s*eventDetails: renderEventDetails,/s);
});

test("autosave omits dynamic metadata until authoring hydration succeeds", () => {
  assert.match(
    canvasEditorSource,
    /templateAuthoringSnapshotRef\.current\s*=\s*templateAuthoring\.hydrated === true\s*\? templateAuthoring\.getSnapshot\(\)\s*:\s*null;/s
  );
  assert.match(
    persistenceSource,
    /typeof safeState\.getTemplateAuthoringSnapshot === "function"\s*\? safeState\.getTemplateAuthoringSnapshot\(\)\s*:\s*null;/s
  );
  assert.match(
    persistenceSource,
    /\.\.\.\(normalizedAuthoring\s*\? \{ templateAuthoringDraft: normalizedAuthoring \}\s*:\s*\{\}\)/s
  );
});

test("dynamic visual commits rebuild from the latest structured snapshot", () => {
  const commitSlice = readCallbackSlice(
    "commitDynamicVisualMutation",
    "restoreDynamicFieldRepresentation"
  );

  assert.match(commitSlice, /const liveState = latestAuthoringStateRef\.current/);
  assert.match(commitSlice, /const liveValues = ensureValuesForSchema/);
  assert.match(
    commitSlice,
    /buildSnapshotWithValues\(\s*targetFields,\s*liveValues,[\s\S]*liveSnapshot\s*\)/
  );
  assert.match(commitSlice, /nextObjects: targetObjects/);
  assert.match(commitSlice, /nextSections: targetSections/);
  assert.match(commitSlice, /nextEventDetails: targetEventDetails/);
});

test("location writes rebase on latest values and patch only the reached phase", () => {
  const locationSlice = readCallbackSlice(
    "updateEventLocation",
    "linkSelectionToEventLocation"
  );

  assert.match(locationSlice, /const liveState = latestAuthoringStateRef\.current/);
  assert.match(locationSlice, /const liveValues = ensureValuesForSchema/);
  assert.match(locationSlice, /defaults: liveValues/);
  assert.match(locationSlice, /const nextLocations = asObject/);
  assert.match(
    locationSlice,
    /__eventDetails:\s*\{\s*locations:\s*\{\s*\[feature\]:/s
  );
  assert.doesNotMatch(
    locationSlice,
    /const valuesPatch = \{ __eventDetails: nextValues\.__eventDetails \}/
  );
});

test("canvas-linked text changes delegate by explicit event-details role", () => {
  const linkedInlineSlice = readCallbackSlice(
    "updateLinkedTextFromCanvas",
    "linkSelectionToEventTime"
  );

  assert.match(linkedInlineSlice, /normalizeDynamicInlineFieldValue/);
  assert.match(linkedInlineSlice, /EVENT_PERSON_NAME_ROLES\.COUPLE/);
  assert.match(linkedInlineSlice, /resolveEventCoupleNamesInlineEdit/);
  assert.match(linkedInlineSlice, /coupleValueByFieldKey/);
  assert.match(linkedInlineSlice, /updateEventPersonNames/);
  assert.match(linkedInlineSlice, /EVENT_LOCATION_ROLES\.VENUE_ADDRESS/);
  assert.match(linkedInlineSlice, /buildEventGoogleMapClearPatch/);
  assert.match(linkedInlineSlice, /updateEventLocation/);
  assert.match(linkedInlineSlice, /updateEventTimes/);
  assert.match(linkedInlineSlice, /isEventDateField/);
  assert.match(linkedInlineSlice, /splitEventDateInlineControlValue/);
  assert.match(linkedInlineSlice, /event-date-time-inline-update/);
  assert.match(linkedInlineSlice, /updateTemplateFieldValues/);
  assert.match(linkedInlineSlice, /updateTemplateFieldValue/);
});

test("linked inline commits never mutate the canvas text object directly", () => {
  const linkedStart = commitPolicySource.indexOf(
    "const linkedField = editing.linkedField || null;",
    commitPolicySource.indexOf("const onInlineFinish")
  );
  const normalCommitStart = commitPolicySource.indexOf(
    "const textoNuevoValidado",
    linkedStart
  );
  assert.notEqual(linkedStart, -1);
  assert.notEqual(normalCommitStart, -1);

  const linkedCommitSlice = commitPolicySource.slice(linkedStart, normalCommitStart);
  assert.match(linkedCommitSlice, /editing\.originalValue/);
  assert.match(linkedCommitSlice, /descriptor: linkedField/);
  assert.match(linkedCommitSlice, /phase: finishReason === "escape" \? "cancel" : "commit"/);
  assert.doesNotMatch(linkedCommitSlice, /setObjetos/);
  assert.match(commitPolicySource.slice(normalCommitStart), /setObjetos\(actualizado\)/);
});

test("linked fields enter the existing inline lifecycle and typed fields use native inputs", () => {
  assert.match(stageComposerSource, /onResolveDynamicFieldInlineEdit/);
  assert.match(stageComposerSource, /startEdit\(id, initialText, \{[\s\S]*linkedField,/);
  assert.doesNotMatch(stageComposerSource, /onDynamicFieldInlineBlocked/);
  assert.match(typedInlineEditorSource, /type=\{inputType\}/);
  assert.match(typedInlineEditorSource, /input\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(typedInlineEditorSource, /showPicker/);
  assert.match(typedInlineEditorSource, /onRequestFinish\?\.\("escape"\)/);
  assert.match(typedInlineEditorSource, /data-preserve-inline-edit="true"/);
  assert.match(stageComposerSource, /linkedFieldForSelection\?\.openOnSelect === true/);
  assert.match(stageComposerSource, /reason: "linked-date-selected"/);
  assert.match(
    stageComposerSource,
    /editing\.linkedField\.controlKind !== "text"[\s\S]*supportsInlinePreview && !usesTypedLinkedControl/
  );
});

test("a selected linked field shows its schema label without adding hover ownership", () => {
  assert.match(canvasOverlaysSource, /displayMode=\{shouldShowTemplateFieldBadge \? "template" : "linked"\}/);
  assert.match(fieldBadgeSource, /displayMode === "linked" \? `🔗 \$\{label\}`/);
  assert.match(fieldBadgeSource, /displayMode === "template" \? \[normalizeText\(hoveredElementId\)\] : \[\]/);
  assert.match(fieldBadgeSource, /data-linked-field-indicator/);
});

test("restore reads one latest state and changes visibility only on the restored map", () => {
  const restoreSlice = readCallbackSlice(
    "restoreDynamicFieldRepresentation",
    "getFieldUsage"
  );

  assert.match(restoreSlice, /const liveState = latestAuthoringStateRef\.current/);
  assert.match(restoreSlice, /fieldsSchema: liveFieldsSchema/);
  assert.match(restoreSlice, /objetos: liveObjects/);
  assert.match(restoreSlice, /detachedVisuals: liveDetachedVisuals/);
  assert.match(restoreSlice, /delete locationProjection\.showMap/);
  assert.doesNotMatch(restoreSlice, /showMap:\s*true/);
  assert.match(
    restoreSlice,
    /if \(normalizeText\(object\?\.tipo\)\.toLowerCase\(\) === "mapa-google"\) \{\s*next\.mostrarMapa = Boolean\(normalizeText\(next\.googlePlaceId\)\);/s
  );
  assert.match(restoreSlice, /nextEventDetails: liveEventDetails/);
  assert.match(
    restoreSlice,
    /restored\.reason === "restored"[\s\S]*preserveRecoveredTextBoxLayout\(\{[\s\S]*recoveredObject: restoredObject,[\s\S]*normalizedObject: insertNormalizedObject,/s
  );
});
