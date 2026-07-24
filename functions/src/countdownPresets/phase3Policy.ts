type DuplicateSourceResult =
  | {
      ok: true;
      sourceKind: "draft" | "published";
      sourceVersion: number | null;
      sourcePayload: Record<string, unknown>;
    }
  | {
      ok: false;
      reason:
        | "source-missing"
        | "active-version-invalid"
        | "active-version-missing";
    };

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function resolveCountdownDuplicateSource({
  rootData,
  activeVersionData = null,
}: {
  rootData: unknown;
  activeVersionData?: unknown;
}): DuplicateSourceResult {
  if (!rootData || typeof rootData !== "object" || Array.isArray(rootData)) {
    return { ok: false, reason: "source-missing" };
  }
  const root = rootData as Record<string, unknown>;
  if (root.draft && typeof root.draft === "object" && !Array.isArray(root.draft)) {
    return {
      ok: true,
      sourceKind: "draft",
      sourceVersion: null,
      sourcePayload: root.draft as Record<string, unknown>,
    };
  }
  const activeVersion = positiveInteger(root.activeVersion);
  if (!activeVersion) {
    return { ok: false, reason: "active-version-invalid" };
  }
  if (
    !activeVersionData ||
    typeof activeVersionData !== "object" ||
    Array.isArray(activeVersionData)
  ) {
    return { ok: false, reason: "active-version-missing" };
  }
  return {
    ok: true,
    sourceKind: "published",
    sourceVersion: activeVersion,
    sourcePayload: activeVersionData as Record<string, unknown>,
  };
}

export function buildCountdownDuplicateDraftRoot({
  presetId,
  duplicateName,
  category,
  config,
  svgRef,
  validationReport,
  uid,
  sourcePresetId,
  sourceKind,
  sourceVersion,
  schemaVersion,
  renderContractVersion,
  now,
}: {
  presetId: string;
  duplicateName: string;
  category: unknown;
  config: {
    layout: unknown;
    tipografia: unknown;
    colores: unknown;
    animaciones: unknown;
    unidad: unknown;
    tamanoBase: number;
  };
  svgRef: unknown;
  validationReport: {
    warnings: string[];
    checks: Record<string, unknown>;
  };
  uid: string;
  sourcePresetId: string;
  sourceKind: "draft" | "published";
  sourceVersion: number | null;
  schemaVersion: number;
  renderContractVersion: number;
  now: unknown;
}) {
  const draft = {
    id: presetId,
    nombre: duplicateName,
    categoria: category,
    svgRef,
    layout: config.layout,
    tipografia: config.tipografia,
    colores: config.colores,
    animaciones: config.animaciones,
    unidad: config.unidad,
    tamanoBase: config.tamanoBase,
    validationReport,
  };
  return {
    id: presetId,
    nombre: duplicateName,
    categoria: category,
    estado: "draft" as const,
    draftVersion: 1,
    svgRef,
    layout: config.layout,
    tipografia: config.tipografia,
    colores: config.colores,
    animaciones: config.animaciones,
    unidad: config.unidad,
    tamanoBase: config.tamanoBase,
    draft,
    metadata: {
      schemaVersion,
      renderContractVersion,
      createdAt: now,
      createdByUid: uid,
      updatedAt: now,
      updatedByUid: uid,
      duplicatedFromPresetId: sourcePresetId,
      duplicatedFromVersion: sourceVersion,
      duplicatedFromSource: sourceKind,
    },
  };
}
