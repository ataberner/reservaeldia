import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDashboardPreviewCompatibilityState,
  buildDashboardPreviewControllerContext,
  canApplyDashboardPreviewControllerSession,
  createDashboardPreviewControllerSession,
} from "./useDashboardPreviewController.js";

test("stale async preview sessions are ignored when a newer preview-open token is active", () => {
  const firstSession = createDashboardPreviewControllerSession({
    slugInvitacion: "draft-a",
    editorSession: {
      kind: "draft",
      id: "draft-a",
    },
    requestSequence: 1,
  });
  const secondSession = createDashboardPreviewControllerSession({
    slugInvitacion: "draft-b",
    editorSession: {
      kind: "draft",
      id: "draft-b",
    },
    requestSequence: 2,
  });
  const currentContext = buildDashboardPreviewControllerContext({
    slugInvitacion: "draft-b",
    editorSession: {
      kind: "draft",
      id: "draft-b",
    },
  });

  assert.equal(
    canApplyDashboardPreviewControllerSession({
      activeSession: {
        ...secondSession,
        isOpen: true,
      },
      session: firstSession,
      currentContext,
    }),
    false
  );
  assert.equal(
    canApplyDashboardPreviewControllerSession({
      activeSession: {
        ...secondSession,
        isOpen: true,
      },
      session: secondSession,
      currentContext,
    }),
    true
  );
});

test("preview session tokens become invalid when the editor context changes", () => {
  const session = createDashboardPreviewControllerSession({
    slugInvitacion: "draft-a",
    editorSession: {
      kind: "draft",
      id: "draft-a",
    },
    requestSequence: 1,
  });

  assert.equal(
    canApplyDashboardPreviewControllerSession({
      activeSession: {
        ...session,
        isOpen: true,
      },
      session,
      currentContext: buildDashboardPreviewControllerContext({
        slugInvitacion: "template-workspace-1",
        editorSession: {
          kind: "template",
          id: "template-workspace-1",
        },
      }),
    }),
    false
  );
});

test("template sessions never enable publish or checkout compatibility paths", () => {
  const templateState = buildDashboardPreviewCompatibilityState({
    slugInvitacion: "template-workspace-1",
    editorSession: {
      kind: "template",
      id: "template-workspace-1",
    },
  });
  const draftState = buildDashboardPreviewCompatibilityState({
    slugInvitacion: "draft-1",
    editorSession: {
      kind: "draft",
      id: "draft-1",
    },
  });

  assert.deepEqual(templateState, {
    isTemplateSession: true,
    canUsePublishCompatibility: false,
    canOpenCheckoutFromPreview: false,
    shouldRefreshPublishValidationAfterPreview: false,
    publishValidationRefreshMode: "none",
  });
  assert.deepEqual(draftState, {
    isTemplateSession: false,
    canUsePublishCompatibility: true,
    canOpenCheckoutFromPreview: true,
    shouldRefreshPublishValidationAfterPreview: true,
    publishValidationRefreshMode: "compatibility-side-effect",
  });
});
