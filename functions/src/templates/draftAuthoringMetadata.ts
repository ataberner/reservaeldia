type RawRecord = Record<string, unknown>;

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function asObject(value: unknown): RawRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as RawRecord;
}

function normalizeIssues(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const out: string[] = [];

  source.forEach((entry) => {
    const issue = normalizeText(entry);
    const key = issue.toLowerCase();
    if (!issue || seen.has(key)) return;
    seen.add(key);
    out.push(issue);
  });

  return out;
}

function hasAuthoringContract(source: RawRecord): boolean {
  return (
    Array.isArray(source.fieldsSchema) ||
    Object.keys(asObject(source.defaults)).length > 0 ||
    Object.keys(asObject(source.status)).length > 0
  );
}

export function buildDraftTemplateAuthoringMetadata({
  template,
  templateId,
  uid,
  updatedAt = null,
}: {
  template: RawRecord;
  templateId: string;
  uid: string;
  updatedAt?: unknown;
}) {
  const safeTemplate = asObject(template);
  const safeTemplateId = normalizeText(templateId);
  const source = asObject(safeTemplate.templateAuthoringDraft);
  const sourceTemplateId = normalizeText(source.sourceTemplateId);
  const alignedSource =
    !sourceTemplateId || !safeTemplateId || sourceTemplateId === safeTemplateId
      ? source
      : {};
  const fallbackSource = safeTemplate;

  if (!hasAuthoringContract(alignedSource) && !hasAuthoringContract(fallbackSource)) {
    return null;
  }

  const fieldsSchema = Array.isArray(alignedSource.fieldsSchema)
    ? alignedSource.fieldsSchema
    : Array.isArray(fallbackSource.fieldsSchema)
      ? fallbackSource.fieldsSchema
      : [];
  const defaults = Object.keys(asObject(alignedSource.defaults)).length
    ? asObject(alignedSource.defaults)
    : asObject(fallbackSource.defaults);
  const rawStatus = asObject(alignedSource.status);
  const issues = normalizeIssues(rawStatus.issues);

  return {
    version: Number.isFinite(Number(alignedSource.version))
      ? Math.max(1, Math.round(Number(alignedSource.version)))
      : 1,
    sourceTemplateId:
      normalizeText(alignedSource.sourceTemplateId) ||
      safeTemplateId ||
      null,
    fieldsSchema,
    defaults,
    status: {
      isReady: rawStatus.isReady !== false && issues.length === 0,
      issues,
    },
    updatedAt: updatedAt || alignedSource.updatedAt || null,
    updatedByUid: normalizeText(uid) || normalizeText(alignedSource.updatedByUid) || null,
  };
}
