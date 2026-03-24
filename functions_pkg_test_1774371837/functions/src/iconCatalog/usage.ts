import { applyUsageDelta, findIconIdsByStoragePaths, findIconIdsByUrls, parseStoragePathFromUrl } from "./repository";
import type { ApplyIconUsageDeltaResult, IconUsageMap } from "./types";

type IconReferenceCandidate = {
  raw: string;
  storagePath: string | null;
  url: string | null;
};

function normalizeString(value: unknown): string {
  return String(value || "").trim();
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function normalizeUsageMap(value: unknown): IconUsageMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const out: IconUsageMap = {};
  for (const [iconId, count] of Object.entries(raw)) {
    const safeIconId = normalizeString(iconId);
    if (!safeIconId) continue;
    const parsed = Number(count);
    if (!Number.isFinite(parsed)) continue;
    const rounded = Math.round(parsed);
    if (rounded <= 0) continue;
    out[safeIconId] = rounded;
  }
  return out;
}

function buildReferenceCandidate(value: string): IconReferenceCandidate | null {
  const raw = normalizeString(value);
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw) || raw.startsWith("gs://")) {
    const storagePath = parseStoragePathFromUrl(raw);
    return {
      raw,
      storagePath,
      url: /^https?:\/\//i.test(raw) ? raw : null,
    };
  }

  return {
    raw,
    storagePath: raw,
    url: null,
  };
}

export function extractIconReferenceCandidates(objetos: unknown[]): IconReferenceCandidate[] {
  const list = Array.isArray(objetos) ? objetos : [];
  const out: IconReferenceCandidate[] = [];

  for (const rawItem of list) {
    const item = asObject(rawItem);
    if (String(item.tipo || "").trim().toLowerCase() !== "icono") continue;

    const source = normalizeString(item.url || item.src);
    if (!source) continue;
    const candidate = buildReferenceCandidate(source);
    if (!candidate) continue;
    out.push(candidate);
  }

  return out;
}

export async function resolveIconUsageFromObjects(objetos: unknown[]): Promise<{
  usageMap: IconUsageMap;
  unresolvedRefs: string[];
  resolvedRefs: number;
}> {
  const candidates = extractIconReferenceCandidates(objetos);
  if (!candidates.length) {
    return {
      usageMap: {},
      unresolvedRefs: [],
      resolvedRefs: 0,
    };
  }

  const storagePaths = Array.from(
    new Set(candidates.map((entry) => normalizeString(entry.storagePath)).filter(Boolean))
  );
  const urls = Array.from(
    new Set(candidates.map((entry) => normalizeString(entry.url)).filter(Boolean))
  );

  const [byStoragePath, byUrl] = await Promise.all([
    findIconIdsByStoragePaths(storagePaths),
    findIconIdsByUrls(urls),
  ]);

  const usageMap: IconUsageMap = {};
  const unresolvedRefs: string[] = [];
  let resolvedRefs = 0;

  for (const candidate of candidates) {
    const fromPath = candidate.storagePath ? byStoragePath.get(candidate.storagePath) : null;
    const fromUrl = candidate.url ? byUrl.get(candidate.url) : null;
    const iconId = fromPath || fromUrl || null;

    if (!iconId) {
      unresolvedRefs.push(candidate.raw);
      continue;
    }

    resolvedRefs += 1;
    usageMap[iconId] = (usageMap[iconId] || 0) + 1;
  }

  return {
    usageMap,
    unresolvedRefs,
    resolvedRefs,
  };
}

export function computeUsageDelta(nextMap: IconUsageMap, previousMap: IconUsageMap): IconUsageMap {
  const keys = new Set<string>([
    ...Object.keys(nextMap || {}),
    ...Object.keys(previousMap || {}),
  ]);
  const delta: IconUsageMap = {};

  for (const iconId of keys) {
    const next = Number(nextMap?.[iconId] || 0);
    const previous = Number(previousMap?.[iconId] || 0);
    const diff = next - previous;
    if (!Number.isFinite(diff) || diff === 0) continue;
    delta[iconId] = diff;
  }

  return delta;
}

export async function applyPublicationIconUsageDelta(params: {
  objetos: unknown[];
  oldUsageMap: unknown;
  publicSlug: string;
  usedAt: Date;
}): Promise<ApplyIconUsageDeltaResult> {
  const previous = normalizeUsageMap(params.oldUsageMap);
  const resolved = await resolveIconUsageFromObjects(params.objetos);
  const delta = computeUsageDelta(resolved.usageMap, previous);

  await applyUsageDelta({
    deltas: delta,
    publicSlug: params.publicSlug,
    usedAt: params.usedAt,
  });

  return {
    newUsage: resolved.usageMap,
    oldUsage: previous,
    appliedDelta: delta,
    unresolvedRefs: resolved.unresolvedRefs,
    resolvedRefs: resolved.resolvedRefs,
  };
}

