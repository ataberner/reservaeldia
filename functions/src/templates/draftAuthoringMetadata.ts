type RawRecord = Record<string, unknown>;
const AUTHORING_DRAFT_VERSION = 2;
const DETACHED_VISUALS_VERSION = 1;
const APPLY_TARGET_SCOPES = new Set(["objeto", "seccion", "rsvp"]);
const APPLY_TARGET_MODES = new Set(["set", "replace"]);
const APPLY_TARGET_TRANSFORMS = new Set([
  "identity",
  "date_to_countdown_iso",
  "date_to_text",
  "images_to_first_url",
]);
const DEFAULT_DATE_TEXT_TRANSFORM_PRESET = "event_date_long_es_ar";
const DEFAULT_DATETIME_TEXT_TRANSFORM_PRESET = "event_datetime_long_es_ar";
const DATE_TEXT_FORMAT_PRESETS = new Set([
  "event_date_long_es_ar",
  "event_date_short_es_ar",
  "event_date_dotted_es_ar",
  "event_date_slash_short_year_es_ar",
  "event_date_pipe_short_year_es_ar",
  "event_date_day_month_es_ar",
  "event_datetime_long_es_ar",
  "event_datetime_short_es_ar",
]);

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function toFieldKey(value: unknown): string {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function asObject(value: unknown): RawRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as RawRecord;
}

function normalizeNonNegativeInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed);
}

function normalizeDateTextFormatPreset(value: unknown, fieldType: unknown): string {
  const preset = normalizeText(value);
  if (DATE_TEXT_FORMAT_PRESETS.has(preset)) return preset;
  return normalizeText(fieldType).toLowerCase() === "datetime"
    ? DEFAULT_DATETIME_TEXT_TRANSFORM_PRESET
    : DEFAULT_DATE_TEXT_TRANSFORM_PRESET;
}

function normalizeDetachedTarget(
  value: unknown,
  fieldType: unknown
): RawRecord | null {
  const source = asObject(value);
  const scope = normalizeText(source.scope).toLowerCase();
  const id = normalizeText(source.id);
  const path = normalizeText(source.path);
  if (!APPLY_TARGET_SCOPES.has(scope) || !path) return null;
  if ((scope === "objeto" || scope === "seccion") && !id) return null;

  const rawMode = normalizeText(source.mode).toLowerCase();
  const mode = APPLY_TARGET_MODES.has(rawMode) ? rawMode : "set";
  const rawTransform = asObject(source.transform);
  const transformKind = normalizeText(rawTransform.kind).toLowerCase();
  const transform = APPLY_TARGET_TRANSFORMS.has(transformKind)
    ? {
        kind: transformKind,
        ...(transformKind === "date_to_text"
          ? { preset: normalizeDateTextFormatPreset(rawTransform.preset, fieldType) }
          : {}),
      }
    : null;

  return {
    scope,
    ...(id ? { id } : {}),
    path,
    mode,
    ...(transform ? { transform } : {}),
  };
}

export function normalizeDetachedVisualsMetadata(
  value: unknown,
  fieldsSchema: unknown = []
): RawRecord {
  const source = asObject(value);
  const allowedFieldKeys = new Set(
    (Array.isArray(fieldsSchema) ? fieldsSchema : [])
      .map((field) => normalizeText(asObject(field).key))
      .filter(Boolean)
  );
  const fieldTypeByKey = new Map(
    (Array.isArray(fieldsSchema) ? fieldsSchema : [])
      .map((field) => {
        const sourceField = asObject(field);
        return [normalizeText(sourceField.key), sourceField.type] as const;
      })
      .filter(([fieldKey]) => Boolean(fieldKey))
  );
  const entries: RawRecord[] = [];
  const seenEntryIds = new Set<string>();
  let maxSequence = 0;

  (Array.isArray(source.entries) ? source.entries : []).forEach((rawEntry) => {
    const entry = asObject(rawEntry);
    const id = normalizeText(entry.id);
    const renderObject = asObject(entry.object);
    if (!id || seenEntryIds.has(id) || !Object.keys(renderObject).length) return;

    const sequence = Math.max(1, normalizeNonNegativeInteger(entry.sequence, 1));
    const targets: RawRecord[] = [];
    const seenTargets = new Set<string>();
    (Array.isArray(entry.targets) ? entry.targets : []).forEach((rawTargetRecord) => {
      const targetRecord = asObject(rawTargetRecord);
      const fieldKey = toFieldKey(targetRecord.fieldKey);
      const target = normalizeDetachedTarget(
        targetRecord.target,
        fieldTypeByKey.get(fieldKey)
      );
      if (!fieldKey || !allowedFieldKeys.has(fieldKey) || !target) return;
      const transform = asObject(target.transform);
      const targetKey = `${fieldKey}|${normalizeText(target.scope)}|${normalizeText(
        target.id
      )}|${normalizeText(target.path)}|${normalizeText(target.mode)}|${normalizeText(
        transform.kind
      )}|${normalizeText(transform.preset)}`;
      if (seenTargets.has(targetKey)) return;
      seenTargets.add(targetKey);
      targets.push({ fieldKey, target });
    });

    const fieldKeys: string[] = [];
    const seenFieldKeys = new Set<string>();
    [
      ...(Array.isArray(entry.fieldKeys) ? entry.fieldKeys : []),
      ...targets.map((target) => target.fieldKey),
    ].forEach((rawFieldKey) => {
      const fieldKey = toFieldKey(rawFieldKey);
      if (!fieldKey || !allowedFieldKeys.has(fieldKey) || seenFieldKeys.has(fieldKey)) return;
      seenFieldKeys.add(fieldKey);
      fieldKeys.push(fieldKey);
    });
    if (!fieldKeys.length) return;

    const rawSource = asObject(entry.source);
    const rawKind = normalizeText(rawSource.kind).toLowerCase();
    const kind = rawKind === "group-child" || rawKind === "event-map" ? rawKind : "root";
    const rawChildIndex = Number(rawSource.childIndex);
    const hasValidChildIndex =
      Number.isFinite(rawChildIndex) && rawChildIndex >= 0;
    const normalizedSource: RawRecord = {
      kind,
      rootId:
        normalizeText(rawSource.rootId) || normalizeText(renderObject.id) || id,
      rootIndex: normalizeNonNegativeInteger(rawSource.rootIndex, 0),
      ...(kind === "group-child" && hasValidChildIndex
        ? { childIndex: Math.round(rawChildIndex) }
        : {}),
      sectionId: normalizeText(rawSource.sectionId) || null,
    };

    seenEntryIds.add(id);
    maxSequence = Math.max(maxSequence, sequence);
    entries.push({
      id,
      sequence,
      fieldKeys,
      object: { ...renderObject },
      targets,
      source: normalizedSource,
    });
  });

  const requestedNextSequence = normalizeNonNegativeInteger(source.nextSequence, 1);
  const claimedFieldKeys = new Set<string>();
  const latestEntries = entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const sequenceDelta = Number(right.entry.sequence) - Number(left.entry.sequence);
      return sequenceDelta || right.index - left.index;
    })
    .reduce<Array<{ entry: RawRecord; index: number }>>((kept, candidate) => {
      const fieldKeys = (Array.isArray(candidate.entry.fieldKeys)
        ? candidate.entry.fieldKeys
        : []
      )
        .map((fieldKey) => normalizeText(fieldKey))
        .filter((fieldKey) => fieldKey && !claimedFieldKeys.has(fieldKey));
      if (!fieldKeys.length) return kept;
      fieldKeys.forEach((fieldKey) => claimedFieldKeys.add(fieldKey));
      const retainedFields = new Set(fieldKeys);
      kept.push({
        index: candidate.index,
        entry: {
          ...candidate.entry,
          fieldKeys,
          targets: (Array.isArray(candidate.entry.targets)
            ? candidate.entry.targets
            : []
          ).filter((targetRecord) =>
            retainedFields.has(normalizeText(asObject(targetRecord).fieldKey))
          ),
        },
      });
      return kept;
    }, [])
    .sort((left, right) => left.index - right.index)
    .map(({ entry }) => entry);

  return {
    version: DETACHED_VISUALS_VERSION,
    nextSequence: Math.max(1, maxSequence + 1, requestedNextSequence),
    entries: latestEntries,
  };
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
    Object.keys(asObject(source.status)).length > 0 ||
    Object.keys(asObject(source.detachedVisuals)).length > 0
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
      ? Math.max(AUTHORING_DRAFT_VERSION, Math.round(Number(alignedSource.version)))
      : AUTHORING_DRAFT_VERSION,
    sourceTemplateId:
      normalizeText(alignedSource.sourceTemplateId) ||
      safeTemplateId ||
      null,
    fieldsSchema,
    defaults,
    detachedVisuals: normalizeDetachedVisualsMetadata(
      alignedSource.detachedVisuals,
      fieldsSchema
    ),
    status: {
      isReady: rawStatus.isReady !== false && issues.length === 0,
      issues,
    },
    updatedAt: updatedAt || alignedSource.updatedAt || null,
    updatedByUid: normalizeText(uid) || normalizeText(alignedSource.updatedByUid) || null,
  };
}
