import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const indicatorSource = fs.readFileSync(
  new URL("./DynamicFieldVisualIndicator.jsx", import.meta.url),
  "utf8"
);
const detailsSource = fs.readFileSync(
  new URL("../../MiniToolbarTabDetallesEvento.jsx", import.meta.url),
  "utf8"
);
const storySource = fs.readFileSync(
  new URL("../../MiniToolbarTabTexto.jsx", import.meta.url),
  "utf8"
);

test("dynamic field adornment exposes visible, hidden, absent, count and async states", () => {
  assert.match(indicatorSource, /\["visible", "hidden", "absent"\]/);
  assert.doesNotMatch(indicatorSource, /\bEye\b|EyeOff|RotateCcw/);
  assert.match(indicatorSource, /\? "Visible"/);
  assert.match(indicatorSource, /\? "Oculto"/);
  assert.match(indicatorSource, /\? "Insertar"/);
  assert.match(indicatorSource, /Visible en la invitacion/);
  assert.match(indicatorSource, /linkedCount > 1/);
  assert.match(indicatorSource, /resolveNextDynamicFieldVisualRootId/);
  assert.match(indicatorSource, /previousRootObjectIdRef/);
  assert.match(indicatorSource, /onActivate\?\.\(\{ rootObjectId \}\)/);
  assert.match(detailsSource, /focusDynamicFieldVisual\(status, fieldKeys, rootObjectId\)/);
  assert.match(storySource, /focusStoryTextVisual\(storyTextState\.visualStatus, rootObjectId\)/);
  assert.match(indicatorSource, /aria-label=\{label\}/);
  assert.match(indicatorSource, /aria-busy=\{loading \|\| undefined\}/);
  assert.match(indicatorSource, /h-10 min-w-\[64px\]/);
  assert.match(indicatorSource, /rounded-md px-1\.5/);
  assert.match(indicatorSource, /motion-reduce:animate-none/);
});

test("event and story inputs integrate the adornment without covering native pickers", () => {
  assert.match(detailsSource, /function DynamicFieldInputShell/);
  assert.match(detailsSource, /data-dynamic-field-input-shell="true"/);
  assert.match(detailsSource, /flex h-\[42px\] w-full max-w-\[361px\]/);
  assert.match(detailsSource, /focus-within:\[border-color:#692B9A\]/);
  assert.match(detailsSource, /!mt-0 !h-full !w-auto !max-w-none min-w-0 flex-1 !border-0/);
  assert.match(detailsSource, /!static !h-full min-w-\[64px\] self-stretch !rounded-none border-l/);
  assert.doesNotMatch(detailsSource, /absolute top-\[7px\]/);
  assert.doesNotMatch(detailsSource, /nativePicker \? "right-7" : "right-1"/);
  assert.doesNotMatch(detailsSource, /countdownVisualProps/);
  assert.doesNotMatch(detailsSource, /mapVisualProps/);
  assert.match(detailsSource, /status\?\.restoreFieldKey \|\| status\?\.fieldKey/);
  assert.match(detailsSource, /EVENT_PRIMARY_PERSON_SCROLL_FIELD_KEYS/);
  assert.match(detailsSource, /EVENT_SECONDARY_PERSON_SCROLL_FIELD_KEYS/);
  assert.match(detailsSource, /id=\{dateInputId\}/);
  assert.match(detailsSource, /id=\{startInputId\}/);
  assert.match(detailsSource, /id=\{endInputId\}/);
  assert.match(detailsSource, /id=\{placeInputId\}/);
  assert.match(detailsSource, /id=\{addressInputId\}/);
  assert.match(detailsSource, /id="event-dress-code-value"/);
  assert.match(storySource, /id="template-field-texto-historia"/);
  assert.match(storySource, /data-dynamic-field-input-shell="true"/);
  assert.match(storySource, /flex min-h-\[112px\] w-full max-w-\[361px\]/);
  assert.match(storySource, /!static !h-10 min-w-\[64px\] shrink-0 !rounded-none border-l/);
  assert.doesNotMatch(storySource, /absolute right-1 top-2/);
  assert.match(storySource, /restoreDynamicFieldRepresentation/);
});
