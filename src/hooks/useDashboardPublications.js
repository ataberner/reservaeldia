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
import {
  getPublicationPreviewItemKey,
  resolvePublicationPreviewReadModelsByItemKey,
  resolvePublicationEditableDraftSlug,
} from "@/domain/publications/preview";

const HOME_PUBLICATIONS_LIMIT = 10;

function isPermissionDeniedError(error) {
  const code = String(error?.code || "").toLowerCase();
  return code === "permission-denied" || code.includes("permission-denied");
}

function buildActiveItem(docItem, nowMs, previewReadModel = null) {
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
    portada: previewReadModel?.primarySrc || "",
    previewCandidates: Array.isArray(previewReadModel?.candidates)
      ? previewReadModel.candidates
      : [],
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

function buildHistoryItem(docItem, previewReadModel = null) {
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
    portada: previewReadModel?.primarySrc || "",
    previewCandidates: Array.isArray(previewReadModel?.candidates)
      ? previewReadModel.candidates
      : [],
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

        const previewReadModelByItemKey =
          await resolvePublicationPreviewReadModelsByItemKey(rawItems, {
            readDraftBySlug: async (draftSlug) =>
              getDoc(doc(db, "borradores", draftSlug)),
          });

        const activeItems = activeSnap.docs
          .map((docItem) =>
            buildActiveItem(
              docItem,
              nowMs,
              previewReadModelByItemKey.get(
                getPublicationPreviewItemKey("active", docItem.id)
              ) || null
            )
          )
          .filter((item) => !item.isTrashed);

        const historyItems = historySnap
          ? historySnap.docs.map((docItem) =>
              buildHistoryItem(
                docItem,
                previewReadModelByItemKey.get(
                  getPublicationPreviewItemKey("history", docItem.id)
                ) || null
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
