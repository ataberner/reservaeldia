import { useCallback, useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import { isDraftTrashed } from "@/domain/drafts/state";
import { getDraftPreviewCandidates } from "@/domain/drafts/preview";

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
  const explicitState =
    typeof draft?.publicationLifecycle?.state === "string"
      ? draft.publicationLifecycle.state.trim().toLowerCase()
      : "";

  if (explicitState === "draft" || explicitState === "published" || explicitState === "finalized") {
    return explicitState;
  }

  const hasPublicSlug =
    typeof draft?.slugPublico === "string" && draft.slugPublico.trim().length > 0;
  return hasPublicSlug ? "published" : "draft";
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

export function useDashboardDrafts({ userUid }) {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userUid) {
      setDrafts([]);
      setLoading(false);
      setError("");
      return () => {};
    }

    setLoading(true);
    setError("");

    const draftsQuery = query(collection(db, "borradores"), where("userId", "==", userUid));
    const unsubscribe = onSnapshot(
      draftsQuery,
      (snapshot) => {
        const items = snapshot.docs
          .map(normalizeDraftItem)
          .filter(Boolean)
          .sort((left, right) => right.updatedAtMs - left.updatedAtMs);

        setDrafts(items);
        setLoading(false);
      },
      (loadError) => {
        console.error("Error cargando borradores del dashboard:", loadError);
        setDrafts([]);
        setLoading(false);
        setError(loadError?.message || "No se pudieron cargar tus borradores.");
      }
    );

    return () => unsubscribe();
  }, [userUid]);

  const removeDraft = useCallback((slug) => {
    const safeSlug = String(slug || "").trim();
    if (!safeSlug) return;

    setDrafts((previous) => previous.filter((draft) => draft.slug !== safeSlug));
  }, []);

  return {
    drafts,
    loading,
    error,
    removeDraft,
  };
}
