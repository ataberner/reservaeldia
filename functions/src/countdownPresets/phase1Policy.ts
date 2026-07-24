type UnknownRecord = Record<string, unknown>;

export type PublicCatalogVersionResolution =
  | {
      ok: true;
      activeVersion: number;
      versionData: UnknownRecord;
    }
  | {
      ok: false;
      reason:
        | "not-published"
        | "active-version-invalid"
        | "active-version-missing"
        | "version-corrupt"
        | "version-number-mismatch";
    };

export type CountdownOperationReplay =
  | { kind: "none" }
  | { kind: "replay"; result: UnknownRecord }
  | { kind: "conflict"; reason: "operation-type-mismatch" | "operation-incomplete" };

export type CountdownVersionTransition =
  | { kind: "replay"; result: UnknownRecord }
  | {
      kind: "conflict";
      reason:
        | "operation-type-mismatch"
        | "operation-incomplete"
        | "draft-version-mismatch"
        | "draft-missing";
    }
  | {
      kind: "commit";
      nextDraftVersion?: number;
      nextActiveVersion?: number;
    };

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function integerOrNull(value: unknown): number | null {
  if (value === null || typeof value === "undefined" || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function resolvePublicCatalogVersion(params: {
  rootData: unknown;
  versionExists: boolean;
  versionData: unknown;
}): PublicCatalogVersionResolution {
  const rootData = asRecord(params.rootData);
  if (!rootData || normalizeText(rootData.estado) !== "published") {
    return { ok: false, reason: "not-published" };
  }

  const activeVersion = integerOrNull(rootData.activeVersion);
  if (activeVersion === null || activeVersion <= 0) {
    return { ok: false, reason: "active-version-invalid" };
  }
  if (!params.versionExists) {
    return { ok: false, reason: "active-version-missing" };
  }

  const versionData = asRecord(params.versionData);
  if (!versionData) {
    return { ok: false, reason: "version-corrupt" };
  }

  const storedVersion = integerOrNull(versionData.version);
  if (storedVersion !== activeVersion) {
    return { ok: false, reason: "version-number-mismatch" };
  }

  return {
    ok: true,
    activeVersion,
    versionData,
  };
}

export function resolveCountdownOperationReplay(
  operationData: unknown,
  expectedType: "save" | "publish"
): CountdownOperationReplay {
  if (!operationData) return { kind: "none" };
  const operation = asRecord(operationData);
  if (!operation || normalizeText(operation.type) !== expectedType) {
    return { kind: "conflict", reason: "operation-type-mismatch" };
  }
  if (normalizeText(operation.status) !== "completed") {
    return { kind: "conflict", reason: "operation-incomplete" };
  }
  const result = asRecord(operation.result);
  if (!result) {
    return { kind: "conflict", reason: "operation-incomplete" };
  }
  return { kind: "replay", result };
}

export function planSaveDraftTransition(params: {
  currentDraftVersion: unknown;
  expectedDraftVersion: unknown;
  operationData?: unknown;
}): CountdownVersionTransition {
  const replay = resolveCountdownOperationReplay(params.operationData, "save");
  if (replay.kind !== "none") return replay;

  const currentDraftVersion = integerOrNull(params.currentDraftVersion);
  const expectedDraftVersion = integerOrNull(params.expectedDraftVersion);
  if (currentDraftVersion !== expectedDraftVersion) {
    return { kind: "conflict", reason: "draft-version-mismatch" };
  }

  return {
    kind: "commit",
    nextDraftVersion: (currentDraftVersion || 0) + 1,
  };
}

export function planPublishDraftTransition(params: {
  currentDraftVersion: unknown;
  expectedDraftVersion: unknown;
  activeVersion: unknown;
  hasDraft: boolean;
  operationData?: unknown;
}): CountdownVersionTransition {
  const replay = resolveCountdownOperationReplay(params.operationData, "publish");
  if (replay.kind !== "none") return replay;

  const currentDraftVersion = integerOrNull(params.currentDraftVersion);
  const expectedDraftVersion = integerOrNull(params.expectedDraftVersion);
  if (currentDraftVersion !== expectedDraftVersion) {
    return { kind: "conflict", reason: "draft-version-mismatch" };
  }
  if (!params.hasDraft) {
    return { kind: "conflict", reason: "draft-missing" };
  }

  const activeVersion = integerOrNull(params.activeVersion);
  return {
    kind: "commit",
    nextActiveVersion: Math.max(0, activeVersion || 0) + 1,
  };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function countdownObjectReferencesPreset(value: UnknownRecord, presetId: string): boolean {
  const type = normalizeText(value.tipo).toLowerCase();
  if (type === "countdown" && normalizeText(value.presetId) === presetId) {
    return true;
  }

  const frameValue = normalizeText(value.frameSvgUrl);
  if (!frameValue) return false;
  const decoded = safeDecode(frameValue);
  return (
    decoded.includes(`assets/countdown/frames/${presetId}/`) ||
    decoded.includes(`assets/countdown/staging/${presetId}/`)
  );
}

export function documentReferencesCountdownPreset(
  value: unknown,
  presetId: string
): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => documentReferencesCountdownPreset(entry, presetId));
  }

  const record = asRecord(value);
  if (!record) return false;
  if (countdownObjectReferencesPreset(record, presetId)) return true;

  return Object.values(record).some((entry) =>
    documentReferencesCountdownPreset(entry, presetId)
  );
}

export function resolveCountdownPresetDeletionPolicy(params: {
  activeVersion: unknown;
  versionCount: number;
  referenceCount: number;
}): "hard-delete" | "tombstone" {
  const activeVersion = integerOrNull(params.activeVersion);
  if ((activeVersion || 0) > 0) return "tombstone";
  if (Math.max(0, Number(params.versionCount) || 0) > 0) return "tombstone";
  if (Math.max(0, Number(params.referenceCount) || 0) > 0) return "tombstone";
  return "hard-delete";
}
