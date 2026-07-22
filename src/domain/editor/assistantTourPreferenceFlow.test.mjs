import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readSource(relativeUrl) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("the dashboard header restores the existing user preference immediately before Trash", () => {
  const source = readSource("../../components/DashboardHeader.jsx");
  const mobileEditorHeaderSource = readSource(
    "../../components/editor/header/CanvasEditorHeader.jsx"
  );
  const restoreIndex = source.indexOf('key: "assistant-tour-restore"');
  const trashIndex = source.indexOf('key: "trash"');

  assert.ok(restoreIndex >= 0);
  assert.ok(trashIndex > restoreIndex);
  assert.match(source, /createAssistantGuidedTourPreferencePatch\(\{[\s\S]*?assistantTourOptOut:\s*false/);
  assert.match(source, /resolveAssistantGuidedTourRestoreMenuItemState/);
  assert.match(source, /label:\s*assistantTourRestoreMenuItemState\.label/);
  assert.match(source, /dashboardUserMenu\s*=\s*!slugInvitacion/);
  assert.match(source, /data-assistant-tour-restore-action="editor"/);
  assert.match(
    source,
    /data-assistant-tour-restore-action="editor"[\s\S]*?disabled=\{assistantTourRestoreMenuItemState\.disabled\}/
  );
  assert.match(
    source,
    /assistantTourRestoreMenuItemState=\{[\s\S]*?assistantTourRestoreMenuItemState[\s\S]*?handleRestoreAssistantTour=\{handleRestoreAssistantTour\}/
  );
  assert.match(
    mobileEditorHeaderSource,
    /data-assistant-tour-restore-action="mobile-editor"[\s\S]*?assistantTourRestoreMenuItemState\.label/
  );
});

test("the preference wiring stays user-scoped and uses the existing callables without browser storage", () => {
  const hookSource = readSource("../../hooks/useUserUiPreferences.js");
  const backendSource = readSource("../../../functions/src/index.ts");

  assert.match(hookSource, /httpsCallable\(cloudFunctions,\s*"getMyUiPreferences"\)/);
  assert.match(hookSource, /httpsCallable\(cloudFunctions,\s*"updateMyUiPreferences"\)/);
  assert.match(hookSource, /\[getMyUiPreferencesCallable, userUid\]/);
  assert.match(hookSource, /if \(!mounted\) return/);
  assert.match(
    hookSource,
    /await updateMyUiPreferencesCallable\(normalizedPatch\)[\s\S]*?setPreferences\(savedPreferences\)/
  );
  assert.doesNotMatch(hookSource, /setPreferences\(nextPreferences\)/);
  assert.doesNotMatch(hookSource, /localStorage|sessionStorage/);

  assert.match(backendSource, /const uid = requireAuth\(request\)/);
  assert.match(backendSource, /db\.collection\("usuarios"\)\.doc\(uid\)/);
  assert.match(backendSource, /buildUserUiPreferencesMergePayload\(\{/);
  assert.doesNotMatch(
    backendSource,
    /payload\["uiPreferences\.assistantTourOptOut"\]/
  );
  assert.match(backendSource, /userRef\.set\(payload, \{ merge: true \}\)/);
});

test("the same preference reaches the header and guided tour while menu actions prevent duplicate submits", () => {
  const layoutSource = readSource("../../components/DashboardLayout.jsx");
  const headerSource = readSource("../../components/DashboardHeader.jsx");
  const appHeaderSource = readSource("../../components/appHeader/AppHeader.jsx");

  assert.match(
    layoutSource,
    /<DashboardHeader[\s\S]*?assistantTourOptOut=\{assistantTourOptOut\}[\s\S]*?<DashboardSidebar/
  );
  assert.match(
    layoutSource,
    /<DashboardSidebar[\s\S]*?assistantTourOptOut=\{assistantTourOptOut\}/
  );
  assert.match(
    layoutSource,
    /onAssistantTourPreferenceChange=\{resolvedAssistantTourPreferenceChange\}/
  );
  assert.match(
    layoutSource,
    /assistantTourRestartKey=\{assistantTourRestartKey\}/
  );
  assert.match(headerSource, /assistantTourRestoreMenuItemState\.canRestore/);
  assert.match(
    headerSource,
    /disabled:\s*assistantTourRestoreMenuItemState\.disabled/
  );
  assert.match(appHeaderSource, /if \(item\.disabled\) return/);
  assert.match(appHeaderSource, /disabled=\{item\.disabled === true\}/);
});

test("pending hydration and repeated effects cannot activate the same tour session twice", () => {
  const tourSource = readSource(
    "../../components/editor/assistantTour/AssistantGuidedTour.jsx"
  );

  assert.match(
    tourSource,
    /resolveAssistantGuidedTourActivation\(\{[\s\S]*?editorReady,[\s\S]*?preferencesLoaded,[\s\S]*?assistantTourOptOut,[\s\S]*?editorReadOnly,/
  );
  assert.match(
    tourSource,
    /assistantActivationSessionRef\.current = activation\.activationSessionKey;[\s\S]*?if \(!activation\.shouldRequest\) return;[\s\S]*?onRequestAssistantMode\(\);/
  );
  assert.match(
    tourSource,
    /shouldAutoStartAssistantGuidedTour\(\{[\s\S]*?preferencesLoaded,[\s\S]*?assistantTourOptOut,/
  );
  assert.match(
    tourSource,
    /shouldRestartAssistantGuidedTourSession\(\{[\s\S]*?lastHandledRestartKey:\s*handledRestartKeyRef\.current/
  );
  assert.doesNotMatch(tourSource, /suppressTourForCurrentOpening/);
});

test("a confirmed restore resets the current tour session once without remounting the editor", () => {
  const layoutSource = readSource("../../components/DashboardLayout.jsx");
  const tourSource = readSource(
    "../../components/editor/assistantTour/AssistantGuidedTour.jsx"
  );

  assert.match(
    layoutSource,
    /if \(assistantTourRestoreRequestRef\.current\) \{[\s\S]*?return assistantTourRestoreRequestRef\.current;/
  );
  assert.match(
    layoutSource,
    /savedPreferences\?\.assistantTourOptOut !== false[\s\S]*?assistantTourRestartSequenceRef\.current \+= 1;[\s\S]*?setAssistantTourRestartKey/
  );
  assert.match(
    tourSource,
    /handledRestartKeyRef\.current = Number\(restartKey\);[\s\S]*?setClosedSessionKey\(""\);[\s\S]*?setCompletedSessionKey\(""\);[\s\S]*?setPhase\(initialPhase\)/
  );
  assert.match(
    tourSource,
    /preferenceRequestIdRef\.current \+= 1;[\s\S]*?clearPreferenceFeedbackTimer\(\);[\s\S]*?assistantActivationSessionRef\.current = "";/
  );
  assert.doesNotMatch(layoutSource, /window\.location\.reload|location\.reload/);
});

test("normal close stays local while opt-out shows confirmed feedback before closing", () => {
  const tourSource = readSource(
    "../../components/editor/assistantTour/AssistantGuidedTour.jsx"
  );
  const closeHandler = tourSource.slice(
    tourSource.indexOf("const handleClose"),
    tourSource.indexOf("const handlePreferenceChange")
  );
  const preferenceHandler = tourSource.slice(
    tourSource.indexOf("const handlePreferenceChange"),
    tourSource.indexOf("useEffect(() =>", tourSource.indexOf("const handlePreferenceChange"))
  );

  assert.match(closeHandler, /setClosedSessionKey\(sessionKey\)/);
  assert.doesNotMatch(closeHandler, /onAssistantTourPreferenceChange/);
  assert.match(
    preferenceHandler,
    /onAssistantTourPreferenceChange\([\s\S]*?assistantTourOptOut:\s*checked/
  );
  assert.match(preferenceHandler, /setPreferenceFeedbackState\("saving"\)/);
  assert.match(
    preferenceHandler,
    /savedPreferences\?\.assistantTourOptOut !== true[\s\S]*?setPreferenceFeedbackState\("confirmed"\)/
  );
  assert.match(
    preferenceHandler,
    /setTimeout\([\s\S]*?setClosedSessionKey\(requestSessionKey\)/
  );
  assert.match(tourSource, /Marcado correctamente/);
  assert.match(tourSource, /preferenceFeedbackState === "confirmed"/);
});
