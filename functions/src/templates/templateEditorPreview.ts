import {
  buildPreviewRenderPayloadFromPreparedPayload,
  generateHtmlFromPreparedRenderPayload,
  prepareRenderPayload,
  validatePreparedRenderPayload,
} from "../render/prepareRenderPayload";

type UnknownRecord = Record<string, unknown>;

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

export async function prepareTemplateEditorPreview(params: {
  templateId: string;
  editorDocument: UnknownRecord;
  includeDebugPayload?: boolean;
  previewTimingSessionId?: string;
}) {
  const includeTiming = Boolean(normalizeText(params.previewTimingSessionId));
  const now = () => performance.now();
  const roundMs = (value: number) => Math.round(Math.max(0, value) * 10) / 10;
  const startedAt = includeTiming ? now() : 0;
  const templateId = normalizeText(params.templateId);
  const prepared = await prepareRenderPayload(params.editorDocument, {
    purpose: "template-editor-preview",
  });
  const preparedAt = includeTiming ? now() : 0;
  const validation = validatePreparedRenderPayload(prepared);
  const validatedAt = includeTiming ? now() : 0;
  const previewPayload = params.includeDebugPayload === true
    ? buildPreviewRenderPayloadFromPreparedPayload(prepared)
    : null;
  const previewPayloadBuiltAt = includeTiming ? now() : 0;
  const blocked = validation.canPublish === false;
  const htmlGenerado = blocked
    ? ""
    : generateHtmlFromPreparedRenderPayload(prepared, {
        slug: templateId,
        isPreview: true,
      });
  const htmlGeneratedAt = includeTiming ? now() : 0;
  const previewTiming = includeTiming
    ? {
        sessionId: normalizeText(params.previewTimingSessionId).slice(0, 96),
        readDraftMs: 0,
        prepareRenderPayloadMs: roundMs(preparedAt - startedAt),
        validatePreparedRenderPayloadMs: roundMs(validatedAt - preparedAt),
        buildPreviewPayloadMs: roundMs(previewPayloadBuiltAt - validatedAt),
        generateHtmlMs: roundMs(htmlGeneratedAt - previewPayloadBuiltAt),
        serializeMs: 0,
        totalBackendMs: roundMs(htmlGeneratedAt - startedAt),
        assetNormalization: prepared.assetNormalizationDiagnostics,
      }
    : null;

  return {
    blocked,
    htmlGenerado,
    validation,
    ...(previewPayload ? { previewPayload } : {}),
    ...(previewTiming ? { previewTiming } : {}),
  };
}
