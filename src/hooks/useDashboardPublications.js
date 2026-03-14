import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/firebase";
import {
  getPublicationStatus,
  resolvePublicationDates,
  toMs,
} from "@/domain/publications/state";
import { getDraftPreviewCandidates } from "@/domain/drafts/preview";
import {
  getPublicationPreview,
  resolvePublicationDraftLookupSlug,
  resolvePublicationEditableDraftSlug,
} from "@/domain/publications/preview";

const HOME_PUBLICATIONS_LIMIT = 10;

function isPermissionDeniedError(error) {
  const code = String(error?.code || "").toLowerCase();
  return code === "permission-denied" || code.includes("permission-denied");
}

function getPublicationItemKey(source, id) {
  const safeSource = typeof source === "string" && source.trim() ? source.trim() : "active";
  const safeId = typeof id === "string" ? id.trim() : String(id || "").trim();
  return `${safeSource}:${safeId}`;
}

async function resolveDraftPreviewFallbackByItemKey(items = []) {
  const itemKeyToDraftSlug = new Map();

  items.forEach((item) => {
    const hasPreview = getPublicationPreview(item?.data);
    if (hasPreview) return;

    const fallbackSlug =
      typeof item?.id === "string" && item.id.trim() ? item.id.trim() : "";
    const draftSlug = resolvePublicationDraftLookupSlug(item?.data, fallbackSlug);
    if (!draftSlug) return;

    itemKeyToDraftSlug.set(getPublicationItemKey(item?.source, item?.id), draftSlug);
  });

  const uniqueDraftSlugs = [...new Set(itemKeyToDraftSlug.values())];
  if (!uniqueDraftSlugs.length) return new Map();

  const draftPreviewBySlug = new Map();

  await Promise.all(
    uniqueDraftSlugs.map(async (draftSlug) => {
      try {
        const draftSnap = await getDoc(doc(db, "borradores", draftSlug));
        if (!draftSnap.exists()) return;

        const draftData = draftSnap.data() || {};
        const fallbackPreview =
          getDraftPreviewCandidates(draftData, { includePlaceholder: false })[0] || "";

        if (fallbackPreview) {
          draftPreviewBySlug.set(draftSlug, fallbackPreview);
        }
      } catch {
        // Ignoramos fallos puntuales para no bloquear el rail.
      }
    })
  );

  const fallbackByItemKey = new Map();
  itemKeyToDraftSlug.forEach((draftSlug, itemKey) => {
    const preview = draftPreviewBySlug.get(draftSlug) || "";
    if (preview) {
      fallbackByItemKey.set(itemKey, preview);
    }
  });

  return fallbackByItemKey;
}

function buildActiveItem(docItem, nowMs, fallbackPreview = "") {
  const data = docItem.data() || {};
  const status = getPublicationStatus(data, nowMs);
  const dates = resolvePublicationDates(data);
  const sortMs =
    toMs(data.enPapeleraAt) ||
    toMs(data.ultimaPublicacionEn) ||
    toMs(data.updatedAt) ||
    toMs(data.createdAt) ||
    toMs(dates.publishedAt);

  return {
    id: docItem.id,
    source: "active",
    publicSlug: docItem.id,
    nombre: data.nombre || data.slug || docItem.id,
    portada: getPublicationPreview(data) || fallbackPreview,
    url: status.isActive ? String(data.urlPublica || "").trim() : "",
    borradorSlug: resolvePublicationEditableDraftSlug(data),
    statusLabel: status.label,
    isActive: status.isActive,
    isPaused: status.isPaused,
    isTrashed: status.isTrashed,
    isFinalized: status.isFinalized,
    publishedAt: dates.publishedAt,
    expiresAt: dates.expiresAt,
    pausedAt: dates.pausedAt,
    trashedAt: dates.trashedAt,
    finalizadaEn: null,
    sortMs,
    raw: data,
  };
}

function buildHistoryItem(docItem, fallbackPreview = "") {
  const data = docItem.data() || {};
  const dates = resolvePublicationDates(data);
  const sortMs =
    toMs(data.finalizadaEn) || toMs(data.updatedAt) || toMs(data.createdAt) || 0;

  return {
    id: docItem.id,
    source: "history",
    publicSlug:
      (typeof data.sourceSlug === "string" && data.sourceSlug.trim()) ||
      (typeof data.slug === "string" && data.slug.trim()) ||
      "",
    nombre: data.nombre || data.slug || "(sin nombre)",
    portada: getPublicationPreview(data) || fallbackPreview,
    url: "",
    borradorSlug: resolvePublicationEditableDraftSlug(data),
    statusLabel: "Finalizada",
    isActive: false,
    isPaused: false,
    isTrashed: false,
    isFinalized: true,
    publishedAt: dates.publishedAt || null,
    expiresAt: dates.expiresAt || null,
    pausedAt: null,
    trashedAt: null,
    finalizadaEn: data.finalizadaEn || null,
    sortMs,
    raw: data,
  };
}

export function useDashboardPublications({ userUid }) {
  const [publications, setPublications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let mounted = true;

    const loadPublications = async () => {
      if (!userUid) {
        if (!mounted) return;
        setPublications([]);
        setLoading(false);
        setError("");
        return;
      }

      setLoading(true);
      setError("");

      try {
        const nowMs = Date.now();
        const activeQuery = query(
          collection(db, "publicadas"),
          where("userId", "==", userUid),
          orderBy("publicadaEn", "desc"),
          limit(HOME_PUBLICATIONS_LIMIT)
        );

        const historyQuery = query(
          collection(db, "publicadas_historial"),
          where("userId", "==", userUid),
          limit(HOME_PUBLICATIONS_LIMIT)
        );

        const [activeResult, historyResult] = await Promise.allSettled([
          getDocs(activeQuery),
          getDocs(historyQuery),
        ]);

        if (activeResult.status !== "fulfilled") {
          throw activeResult.reason;
        }

        const activeSnap = activeResult.value;
        const historySnap =
          historyResult.status === "fulfilled" ? historyResult.value : null;

        if (
          historyResult.status === "rejected" &&
          !isPermissionDeniedError(historyResult.reason)
        ) {
          throw historyResult.reason;
        }

        const rawItems = [
          ...activeSnap.docs.map((docItem) => ({
            id: docItem.id,
            source: "active",
            data: docItem.data() || {},
          })),
          ...(historySnap?.docs || []).map((docItem) => ({
            id: docItem.id,
            source: "history",
            data: docItem.data() || {},
          })),
        ];

        const fallbackPreviewByItemKey =
          await resolveDraftPreviewFallbackByItemKey(rawItems);

        const activeItems = activeSnap.docs
          .map((docItem) =>
            buildActiveItem(
              docItem,
              nowMs,
              fallbackPreviewByItemKey.get(getPublicationItemKey("active", docItem.id)) || ""
            )
          )
          .filter((item) => !item.isTrashed);

        const historyItems = historySnap
          ? historySnap.docs.map((docItem) =>
              buildHistoryItem(
                docItem,
                fallbackPreviewByItemKey.get(getPublicationItemKey("history", docItem.id)) || ""
              )
            )
          : [];

        const merged = [...activeItems, ...historyItems]
          .sort((left, right) => right.sortMs - left.sortMs)
          .slice(0, HOME_PUBLICATIONS_LIMIT);

        if (!mounted) return;
        setPublications(merged);
      } catch (loadError) {
        if (!mounted) return;
        setPublications([]);
        setError(loadError?.message || "No se pudieron cargar tus publicaciones.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadPublications();

    return () => {
      mounted = false;
    };
  }, [refreshTick, userUid]);

  const refresh = useCallback(() => {
    setRefreshTick((previous) => previous + 1);
  }, []);

  return {
    publications,
    loading,
    error,
    refresh,
  };
}
