import { useCallback, useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import { isDraftTrashed } from "@/domain/drafts/state";
import { getDraftPreviewCandidates } from "@/domain/drafts/preview";
import { resolveDraftPublicationLifecycleState } from "@/domain/invitations/readResolution";

const INITIAL_CACHE_RECOVERY_DELAY_MS = 5200;

function toMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date ? parsed.getTime() : 0;
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    return value.seconds * 1000;
  }
  return 0;
}

function formatFecha(value) {
  const ms = toMs(value);
  if (!ms) return "";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(ms));
}

function appendCacheBust(url, versionMs) {
  if (!url) return url;
  if (!Number.isFinite(versionMs) || versionMs <= 0) return url;
  if (/^data:image\//i.test(url) || /^blob:/i.test(url)) return url;

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set("v", String(Math.trunc(versionMs)));
      return parsed.toString();
    } catch {
      return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(
        String(Math.trunc(versionMs))
      )}`;
    }
  }

  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(
    String(Math.trunc(versionMs))
  )}`;
}

function getLifecycleState(draft) {
  return resolveDraftPublicationLifecycleState(draft);
}

function isVisibleDraft(draft) {
  if (isDraftTrashed(draft)) return false;
  const workspaceMode =
    typeof draft?.templateWorkspace?.mode === "string"
      ? draft.templateWorkspace.mode.trim()
      : "";
  if (workspaceMode === "template_edit") return false;
  return getLifecycleState(draft) === "draft";
}

function getDraftLastUpdatedValue(draft) {
  return (
    draft?.ultimaEdicion ||
    draft?.updatedAt ||
    draft?.fechaActualizacion ||
    draft?.creadoEn ||
    draft?.createdAt ||
    draft?.publicationLifecycle?.lastPublishedAt ||
    null
  );
}

function getDraftThumbnailVersionValue(draft) {
  return draft?.thumbnailUpdatedAt || getDraftLastUpdatedValue(draft);
}

function normalizeDraftItem(docItem) {
  const data = docItem?.data ? docItem.data() || {} : {};
  const slug = data?.slug || docItem?.id || "";
  if (!slug || !isVisibleDraft(data)) return null;

  const previewVersion = toMs(getDraftThumbnailVersionValue(data));
  const previewCandidates = getDraftPreviewCandidates(data).map((candidate) =>
    appendCacheBust(candidate, previewVersion)
  );

  return {
    id: docItem.id,
    slug,
    nombre: data?.nombre || slug,
    updatedLabel: formatFecha(getDraftLastUpdatedValue(data)),
    updatedAtMs: toMs(getDraftLastUpdatedValue(data)),
    previewCandidates,
    previewSrc: previewCandidates[0] || "/placeholder.jpg",
    raw: data,
  };
}

export function useDashboardDrafts({ userUid, startupRecoveryGeneration = 0 }) {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recoveryState, setRecoveryState] = useState("idle");
  const [resolvedScope, setResolvedScope] = useState(null);
  const scope = JSON.stringify([userUid, startupRecoveryGeneration]);

  useEffect(() => {
    let mounted = true;
    let hasResolvedSnapshot = false;
    let initialCacheTimer = null;
    const clearInitialCacheTimer = () => {
      if (initialCacheTimer !== null) clearTimeout(initialCacheTimer);
      initialCacheTimer = null;
    };
    if (!userUid) {
      setDrafts([]);
      setLoading(false);
      setError("");
      setRecoveryState("idle");
      setResolvedScope(scope);
      return () => {};
    }

    setLoading(true);
    setError("");
    setRecoveryState("idle");

    const draftsQuery = query(collection(db, "borradores"), where("userId", "==", userUid));
    const unsubscribe = onSnapshot(
      draftsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!mounted) return;
        // An empty local cache is not evidence that this account has no drafts.
        // Keep normal startup quiet while the SDK obtains its server snapshot.
        if (snapshot.metadata?.fromCache && snapshot.docs.length === 0) {
          if (!hasResolvedSnapshot && initialCacheTimer === null) {
            initialCacheTimer = setTimeout(() => {
              initialCacheTimer = null;
              if (mounted && !hasResolvedSnapshot) setRecoveryState("waiting");
            }, INITIAL_CACHE_RECOVERY_DELAY_MS);
          }
          return;
        }
        clearInitialCacheTimer();
        hasResolvedSnapshot = true;
        const items = snapshot.docs
          .map(normalizeDraftItem)
          .filter(Boolean)
          .sort((left, right) => right.updatedAtMs - left.updatedAtMs);

        setDrafts(items);
        setLoading(false);
        setResolvedScope(scope);
        setError("");
        setRecoveryState("idle");
      },
      (loadError) => {
        if (!mounted) return;
        clearInitialCacheTimer();
        console.error("Error cargando borradores del dashboard:", loadError);
        setDrafts([]);
        setLoading(false);
        setResolvedScope(scope);
        setRecoveryState("idle");
        setError(loadError?.message || "No se pudieron cargar tus borradores.");
      }
    );

    return () => {
      mounted = false;
      clearInitialCacheTimer();
      unsubscribe();
    };
  }, [userUid, startupRecoveryGeneration, scope]);

  const removeDraft = useCallback((slug) => {
    const safeSlug = String(slug || "").trim();
    if (!safeSlug) return;

    setDrafts((previous) => previous.filter((draft) => draft.slug !== safeSlug));
  }, []);

  return {
    drafts: resolvedScope === scope ? drafts : [],
    loading: loading || resolvedScope !== scope,
    error,
    recoveryState,
    removeDraft,
  };
}
