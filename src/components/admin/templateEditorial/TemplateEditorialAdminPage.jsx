import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import ConfirmDeleteItemModal from "@/components/ConfirmDeleteItemModal";
import DashboardCardTrashButton from "@/components/DashboardCardTrashButton";
import TemplateCardShell from "@/components/templates/TemplateCardShell";
import {
  getTemplateEditorialStateMeta,
  groupTemplatesByEditorialState,
  TEMPLATE_EDITORIAL_STATE_ORDER,
} from "@/domain/templates/editorial";
import {
  hardDeleteTemplateFromTrash,
  listTemplateTagsAdmin,
  listTemplateTrashAdmin,
  listTemplatesAdmin,
  moveTemplateToTrash,
  restoreTemplateFromTrash,
} from "@/domain/templates/adminService";

const VIEW_MODES = Object.freeze({
  ACTIVE: "active",
  TRASH: "trash",
});

const GRID_CLASS =
  "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeFilterToken(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createCatalogTagIndex(tags) {
  const index = new Map();
  (Array.isArray(tags) ? tags : []).forEach((entry) => {
    const label = normalizeText(entry);
    const token = normalizeFilterToken(label);
    if (!label || !token || index.has(token)) return;
    index.set(token, label);
  });
  return index;
}

function collectUsedCatalogTags(items, tags) {
  const catalogIndex = createCatalogTagIndex(tags);
  if (!catalogIndex.size) return [];

  const usedTokens = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const sourceTags = Array.isArray(item?.tags) ? item.tags : [];
    sourceTags.forEach((entry) => {
      const token = normalizeFilterToken(entry);
      if (!token || !catalogIndex.has(token)) return;
      usedTokens.add(token);
    });
  });

  return Array.from(usedTokens)
    .map((token) => catalogIndex.get(token))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));
}

function formatTypeLabel(value) {
  const text = normalizeText(value);
  if (!text) return "General";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDate(value) {
  const safeValue = value ? new Date(value) : null;
  if (!(safeValue instanceof Date) || Number.isNaN(safeValue.getTime())) {
    return "Sin fecha";
  }
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(safeValue);
}

function formatUidLabel(value) {
  const safeValue = normalizeText(value);
  if (!safeValue) return "Sin registro";
  if (safeValue.length <= 10) return safeValue;
  return `${safeValue.slice(0, 6)}...${safeValue.slice(-4)}`;
}

function getTrashMeta(item) {
  const safeTrash =
    item?.trash && typeof item.trash === "object" ? item.trash : {};
  return {
    deletedAt: safeTrash.deletedAt || null,
    deletedByUid: normalizeText(safeTrash.deletedByUid) || "",
    deletedByRole: normalizeText(safeTrash.deletedByRole) || "",
    previousEditorialStatus:
      normalizeText(safeTrash.previousEditorialStatus) ||
      normalizeText(item?.estadoEditorial) ||
      "publicada",
  };
}

function getVisibleTemplateTags(item, tagIndex) {
  const safeIndex = tagIndex instanceof Map ? tagIndex : new Map();
  const sourceTags = Array.isArray(item?.tags) ? item.tags : [];
  const out = [];
  const seen = new Set();

  sourceTags.forEach((entry) => {
    const token = normalizeFilterToken(entry);
    if (!token || !safeIndex.has(token) || seen.has(token)) return;
    seen.add(token);
    out.push(safeIndex.get(token) || normalizeText(entry));
  });

  return out;
}

function matchesTagFilter(item, selectedTag, tagIndex) {
  const normalizedSelectedTag = normalizeFilterToken(selectedTag);
  if (!normalizedSelectedTag || normalizedSelectedTag === "todas") return true;

  return getVisibleTemplateTags(item, tagIndex).some(
    (entry) => normalizeFilterToken(entry) === normalizedSelectedTag
  );
}

function matchSearch(item, search, tagIndex) {
  if (!search) return true;
  const trashMeta = getTrashMeta(item);
  const haystack = [
    item?.nombre,
    item?.tipo,
    trashMeta.deletedByUid,
    trashMeta.deletedByRole,
    ...getVisibleTemplateTags(item, tagIndex),
  ]
    .map((entry) => normalizeLower(entry))
    .join(" ");
  return haystack.includes(search);
}

function getActionKey(action, templateId) {
  return `${action}:${normalizeText(templateId)}`;
}

function buildActionButtonClass({ tone = "secondary", destructive = false } = {}) {
  if (destructive) {
    return "inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60";
  }
  if (tone === "primary") {
    return "inline-flex items-center gap-1.5 rounded-xl border border-[#d9c8f5] bg-[#faf6ff] px-3 py-2 text-xs font-semibold text-[#6f3bc0] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60";
  }
  return "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";
}

function TemplateStateSection({
  state,
  items,
  tagIndex,
  onOpenTemplate,
  onRequestMoveToTrash,
  workingTemplateId,
  pendingActionKey,
}) {
  const meta = getTemplateEditorialStateMeta(state);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">{meta.label}</h2>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.chipClass}`}>
              {items.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{meta.sectionDescription}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
          No hay plantillas en este estado para los filtros actuales.
        </div>
      ) : (
        <div className={`mt-5 ${GRID_CLASS}`}>
          {items.map((item, index) => {
            const permissions =
              item?.permissions && typeof item.permissions === "object"
                ? item.permissions
                : {};
            const cardStateMeta = getTemplateEditorialStateMeta(item?.estadoEditorial);
            const tags = getVisibleTemplateTags(item, tagIndex).slice(0, 4);
            const templateId = normalizeText(item?.id);
            const isWorking = workingTemplateId === templateId;
            const moveToTrashKey = getActionKey("move-to-trash", templateId);
            const isMovingToTrash = pendingActionKey === moveToTrashKey;
            const canMoveToTrash = permissions?.canMoveToTrash === true;
            const actionLabel = permissions?.readOnly ? "Ver en editor" : "Editar plantilla";

            return (
              <TemplateCardShell
                key={templateId}
                title={item?.nombre || "Plantilla"}
                imageSrc={item?.portada || "/placeholder.jpg"}
                imageAlt={`Vista previa de ${item?.nombre || "plantilla"}`}
                onClick={() => onOpenTemplate(item)}
                eager={index === 0}
                deleteControl={
                  canMoveToTrash ? (
                    <DashboardCardTrashButton
                      title="Mover plantilla a papelera"
                      ariaLabel={`Mover plantilla ${item?.nombre || "plantilla"} a papelera`}
                      isPending={isMovingToTrash}
                      disabled={Boolean(pendingActionKey && !isMovingToTrash)}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onRequestMoveToTrash(item);
                      }}
                    />
                  ) : null
                }
                imageOverlay={
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-start gap-2 p-3">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm ${cardStateMeta.badgeClass}`}>
                      {cardStateMeta.shortLabel}
                    </span>
                  </div>
                }
                summary={
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {tags.length ? (
                        tags.map((tag) => (
                          <span
                            key={`${templateId}-${tag}`}
                            className="rounded-full border border-[#e7daf8] bg-[#faf6ff] px-2 py-0.5 text-[11px] font-medium text-[#6f3bc0]"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">Sin etiquetas</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {permissions?.readOnly
                        ? "Solo lectura para este rol."
                        : "Editable dentro del workflow editorial."}
                    </p>
                  </div>
                }
                footer={
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6f3bc0]">
                    {actionLabel}
                  </p>
                }
                bottomActions={
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onOpenTemplate(item);
                      }}
                      disabled={isWorking}
                      className={buildActionButtonClass({ tone: "primary" })}
                    >
                      {isWorking ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ExternalLink className="h-3.5 w-3.5" />
                      )}
                      {permissions?.readOnly ? "Ver" : "Editar"}
                    </button>
                    <span className="text-[11px] font-medium text-slate-500">
                      {permissions?.readOnly ? "Solo lectura" : "Workflow activo"}
                    </span>
                  </div>
                }
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function TemplateTrashSection({
  items,
  isSuperAdmin,
  tagIndex,
  pendingActionKey,
  onRestore,
  onRequestHardDelete,
}) {
  return (
    <section className="rounded-3xl border border-rose-200/70 bg-gradient-to-br from-white via-rose-50/45 to-orange-50/45 p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">Papelera de plantillas</h2>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
              {items.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Conservacion manual, sin purga automatica. Las plantillas restauradas recuperan su estado editorial previo.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700">
          {isSuperAdmin ? "Vista global de superadmin" : "Solo plantillas archivadas por vos"}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-8 text-sm text-slate-500">
          No hay plantillas en papelera para los filtros actuales.
        </div>
      ) : (
        <div className={`mt-5 ${GRID_CLASS}`}>
          {items.map((item, index) => {
            const permissions =
              item?.permissions && typeof item.permissions === "object"
                ? item.permissions
                : {};
            const templateId = normalizeText(item?.id);
            const tags = getVisibleTemplateTags(item, tagIndex).slice(0, 4);
            const trashMeta = getTrashMeta(item);
            const previousStateMeta = getTemplateEditorialStateMeta(
              trashMeta.previousEditorialStatus
            );
            const restoreKey = getActionKey("restore", templateId);
            const hardDeleteKey = getActionKey("hard-delete", templateId);
            const isRestoring = pendingActionKey === restoreKey;
            const isHardDeleting = pendingActionKey === hardDeleteKey;

            return (
              <TemplateCardShell
                key={templateId}
                title={item?.nombre || "Plantilla"}
                imageSrc={item?.portada || "/placeholder.jpg"}
                imageAlt={`Vista previa de ${item?.nombre || "plantilla"}`}
                onClick={() => {}}
                disabled={true}
                eager={index === 0}
                imageOverlay={
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 shadow-sm">
                      Papelera
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm ${previousStateMeta.badgeClass}`}>
                      {previousStateMeta.shortLabel}
                    </span>
                  </div>
                }
                summary={
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        Plantilla
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {formatTypeLabel(item?.tipo)}
                      </span>
                      {tags.slice(0, 2).map((tag) => (
                        <span
                          key={`${templateId}-${tag}`}
                          className="rounded-full border border-[#e7daf8] bg-[#faf6ff] px-2 py-0.5 text-[11px] font-medium text-[#6f3bc0]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="space-y-1 text-xs text-slate-500">
                      <p>Estado previo: {previousStateMeta.label}</p>
                      <p>En papelera: {formatDate(trashMeta.deletedAt)}</p>
                      <p>
                        Eliminada por:{" "}
                        {trashMeta.deletedByRole === "superadmin" ? "Superadmin" : "Admin"}{" "}
                        ({formatUidLabel(trashMeta.deletedByUid)})
                      </p>
                    </div>
                  </div>
                }
                footer={
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700">
                    Restauracion manual
                  </p>
                }
                bottomActions={
                  <div className="flex flex-wrap items-center gap-2">
                    {permissions?.canRestoreFromTrash ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onRestore(item);
                        }}
                        disabled={Boolean(pendingActionKey)}
                        className={buildActionButtonClass({ tone: "primary" })}
                      >
                        {isRestoring ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        Restaurar
                      </button>
                    ) : null}

                    {permissions?.canHardDeleteFromTrash ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onRequestHardDelete(item);
                        }}
                        disabled={Boolean(pendingActionKey)}
                        className={buildActionButtonClass({ destructive: true })}
                      >
                        {isHardDeleting ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Borrar definitivo
                      </button>
                    ) : null}

                    {!permissions?.canRestoreFromTrash &&
                    !permissions?.canHardDeleteFromTrash ? (
                      <span className="text-[11px] font-medium text-slate-500">
                        Sin acciones disponibles
                      </span>
                    ) : null}
                  </div>
                }
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function TemplateEditorialAdminPage({
  isSuperAdmin = false,
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [activeTemplates, setActiveTemplates] = useState([]);
  const [trashedTemplates, setTrashedTemplates] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("todas");
  const [viewMode, setViewMode] = useState(VIEW_MODES.ACTIVE);
  const [workingTemplateId, setWorkingTemplateId] = useState("");
  const [pendingActionKey, setPendingActionKey] = useState("");
  const [templatePendingTrash, setTemplatePendingTrash] = useState(null);
  const [templatePendingHardDelete, setTemplatePendingHardDelete] = useState(null);

  const loadTemplates = async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");

    try {
      const [activeResult, trashResult, tagsResult] = await Promise.all([
        listTemplatesAdmin({}),
        listTemplateTrashAdmin({}),
        listTemplateTagsAdmin({}),
      ]);
      const nextActiveTemplates = Array.isArray(activeResult?.items)
        ? activeResult.items
        : [];
      const nextTrashedTemplates = Array.isArray(trashResult?.items)
        ? trashResult.items
        : [];
      const catalogTags = Array.isArray(tagsResult?.items) ? tagsResult.items : [];

      const nextTags = catalogTags
        .map((item) => normalizeText(item?.label))
        .filter(Boolean)
        .filter((label, index, array) => (
          array.findIndex((entry) => normalizeFilterToken(entry) === normalizeFilterToken(label)) === index
        ))
        .sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));

      setActiveTemplates(nextActiveTemplates);
      setTrashedTemplates(nextTrashedTemplates);
      setAvailableTags(nextTags);
    } catch (loadError) {
      console.error("Error cargando plantillas internas:", loadError);
      setError(
        loadError?.message ||
          "No se pudo cargar la gestion interna de plantillas."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  const tagIndex = useMemo(
    () => createCatalogTagIndex(availableTags),
    [availableTags]
  );

  const visibleFilterTags = useMemo(
    () => collectUsedCatalogTags(
      [...activeTemplates, ...trashedTemplates],
      availableTags
    ),
    [activeTemplates, availableTags, trashedTemplates]
  );

  useEffect(() => {
    if (selectedTag === "todas") return;
    const tagStillExists = visibleFilterTags.some(
      (entry) => normalizeFilterToken(entry) === normalizeFilterToken(selectedTag)
    );
    if (!tagStillExists) {
      setSelectedTag("todas");
    }
  }, [selectedTag, visibleFilterTags]);

  const searchToken = normalizeLower(search);
  const filteredActiveTemplates = useMemo(() => {
    return activeTemplates.filter((item) => {
      if (!matchesTagFilter(item, selectedTag, tagIndex)) {
        return false;
      }
      return matchSearch(item, searchToken, tagIndex);
    });
  }, [activeTemplates, searchToken, selectedTag, tagIndex]);

  const filteredTrashedTemplates = useMemo(() => {
    return trashedTemplates.filter((item) => {
      if (!matchesTagFilter(item, selectedTag, tagIndex)) {
        return false;
      }
      return matchSearch(item, searchToken, tagIndex);
    });
  }, [searchToken, selectedTag, tagIndex, trashedTemplates]);

  const groupedActiveTemplates = useMemo(
    () => groupTemplatesByEditorialState(filteredActiveTemplates),
    [filteredActiveTemplates]
  );

  const visibleCount =
    viewMode === VIEW_MODES.TRASH
      ? filteredTrashedTemplates.length
      : filteredActiveTemplates.length;

  const handleOpenTemplate = async (item) => {
    const templateId = normalizeText(item?.id);
    if (!templateId) return;

    setWorkingTemplateId(templateId);
    try {
      await router.push(`/dashboard?templateId=${encodeURIComponent(templateId)}`);
    } catch (openError) {
      console.error("Error abriendo plantilla interna:", openError);
      alert(
        openError?.message ||
          "No se pudo abrir la plantilla en el editor interno."
      );
    } finally {
      setWorkingTemplateId("");
    }
  };

  const handleRestoreTemplate = async (item) => {
    const templateId = normalizeText(item?.id);
    if (!templateId || pendingActionKey) return;

    const actionKey = getActionKey("restore", templateId);
    setPendingActionKey(actionKey);
    setError("");

    try {
      await restoreTemplateFromTrash({ templateId });
      await loadTemplates({ silent: true });
    } catch (restoreError) {
      console.error("Error restaurando plantilla:", restoreError);
      setError(
        restoreError?.message ||
          "No se pudo restaurar la plantilla desde papelera."
      );
    } finally {
      setPendingActionKey("");
    }
  };

  const handleConfirmMoveToTrash = async () => {
    const templateId = normalizeText(templatePendingTrash?.id);
    if (!templateId || pendingActionKey) return;

    const actionKey = getActionKey("move-to-trash", templateId);
    setPendingActionKey(actionKey);
    setError("");

    try {
      await moveTemplateToTrash({ templateId });
      setTemplatePendingTrash(null);
      await loadTemplates({ silent: true });
    } catch (moveError) {
      console.error("Error moviendo plantilla a papelera:", moveError);
      setError(
        moveError?.message ||
          "No se pudo mover la plantilla a papelera."
      );
    } finally {
      setPendingActionKey("");
    }
  };

  const handleConfirmHardDelete = async () => {
    const templateId = normalizeText(templatePendingHardDelete?.id);
    if (!templateId || pendingActionKey) return;

    const actionKey = getActionKey("hard-delete", templateId);
    setPendingActionKey(actionKey);
    setError("");

    try {
      await hardDeleteTemplateFromTrash({ templateId });
      setTemplatePendingHardDelete(null);
      await loadTemplates({ silent: true });
    } catch (hardDeleteError) {
      console.error("Error borrando plantilla definitivamente:", hardDeleteError);
      setError(
        hardDeleteError?.message ||
          "No se pudo borrar definitivamente la plantilla."
      );
    } finally {
      setPendingActionKey("");
    }
  };

  return (
    <section className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-[28px] border border-[#e7dcfb] bg-gradient-to-br from-white via-[#faf6ff] to-[#f2f7ff] p-5 shadow-[0_18px_55px_rgba(111,59,192,0.12)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6f3bc0]">
              Panel interno
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Gestion editorial de plantillas
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Flujo interno para revisar, editar, archivar y restaurar plantillas segun estado editorial y permisos por rol.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/admin/panel-creativo"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Panel creativo
            </a>
            <a
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl border border-[#d8c6f4] bg-[#faf6ff] px-3 py-2 text-sm font-semibold text-[#6f3bc0] transition hover:bg-white"
            >
              Abrir dashboard
            </a>
            <button
              type="button"
              onClick={() => void loadTemplates({ silent: true })}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {TEMPLATE_EDITORIAL_STATE_ORDER.map((state) => {
            const meta = getTemplateEditorialStateMeta(state);
            const count = groupedActiveTemplates[state]?.length || 0;
            return (
              <span
                key={state}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${meta.chipClass}`}
              >
                {meta.label}: {count}
              </span>
            );
          })}
          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
            Papelera: {filteredTrashedTemplates.length}
          </span>
          <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700">
            Total visible: {visibleCount}
          </span>
          <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700">
            Rol activo: {isSuperAdmin ? "Superadmin" : "Admin"}
          </span>
        </div>
      </header>

      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.05)] sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  viewMode === VIEW_MODES.TRASH
                    ? "Buscar por nombre, tipo, etiqueta o responsable del borrado"
                    : "Buscar por nombre, tipo o etiqueta"
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-[#cdb5f3] focus:bg-white focus:ring-2 focus:ring-[#e2d4fb]"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedTag("todas")}
                className={
                  selectedTag === "todas"
                    ? "rounded-full border border-[#d5c2f4] bg-[#faf6ff] px-3 py-2 text-xs font-semibold text-[#6f3bc0]"
                    : "rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                }
              >
                Todas
              </button>
              {visibleFilterTags.map((tag) => {
                const active = normalizeLower(tag) === normalizeLower(selectedTag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTag(tag)}
                    className={
                      active
                        ? "rounded-full border border-[#d5c2f4] bg-[#faf6ff] px-3 py-2 text-xs font-semibold text-[#6f3bc0]"
                        : "rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                    }
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setViewMode(VIEW_MODES.ACTIVE)}
              className={
                viewMode === VIEW_MODES.ACTIVE
                  ? "rounded-full border border-[#d5c2f4] bg-[#faf6ff] px-4 py-2 text-xs font-semibold text-[#6f3bc0]"
                  : "rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              }
            >
              Activas ({filteredActiveTemplates.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode(VIEW_MODES.TRASH)}
              className={
                viewMode === VIEW_MODES.TRASH
                  ? "rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700"
                  : "rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              }
            >
              Papelera ({filteredTrashedTemplates.length})
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="mt-5 rounded-3xl border border-slate-200 bg-white px-5 py-10 text-sm text-slate-600 shadow-sm">
          Cargando gestion de plantillas...
        </div>
      ) : error ? (
        <div className="mt-5 rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      ) : viewMode === VIEW_MODES.TRASH ? (
        <div className="mt-5">
          <TemplateTrashSection
            items={filteredTrashedTemplates}
            isSuperAdmin={isSuperAdmin}
            tagIndex={tagIndex}
            pendingActionKey={pendingActionKey}
            onRestore={handleRestoreTemplate}
            onRequestHardDelete={setTemplatePendingHardDelete}
          />
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {TEMPLATE_EDITORIAL_STATE_ORDER.map((state) => (
            <TemplateStateSection
              key={state}
              state={state}
              items={groupedActiveTemplates[state] || []}
              tagIndex={tagIndex}
              onOpenTemplate={handleOpenTemplate}
              onRequestMoveToTrash={setTemplatePendingTrash}
              workingTemplateId={workingTemplateId}
              pendingActionKey={pendingActionKey}
            />
          ))}
        </div>
      )}

      <ConfirmDeleteItemModal
        isOpen={Boolean(templatePendingTrash)}
        itemTypeLabel="plantilla"
        itemName={templatePendingTrash?.nombre}
        isDeleting={
          Boolean(templatePendingTrash?.id) &&
          pendingActionKey === getActionKey("move-to-trash", templatePendingTrash?.id)
        }
        dialogTitle="Mover plantilla a papelera"
        dialogDescription={`"${templatePendingTrash?.nombre || "Esta plantilla"}" se movera a papelera.`}
        warningText="Dejara de aparecer en la gestion activa y podra restaurarse desde esta misma pantalla."
        confirmButtonText="Mover a papelera"
        confirmingButtonText="Moviendo..."
        onCancel={() => {
          if (pendingActionKey) return;
          setTemplatePendingTrash(null);
        }}
        onConfirm={handleConfirmMoveToTrash}
      />

      <ConfirmDeleteItemModal
        isOpen={Boolean(templatePendingHardDelete)}
        itemTypeLabel="plantilla"
        itemName={templatePendingHardDelete?.nombre}
        isDeleting={
          Boolean(templatePendingHardDelete?.id) &&
          pendingActionKey === getActionKey("hard-delete", templatePendingHardDelete?.id)
        }
        dialogTitle="Borrar plantilla definitivamente"
        dialogDescription={`"${templatePendingHardDelete?.nombre || "Esta plantilla"}" se eliminara de forma permanente.`}
        warningText="Esta accion solo esta disponible para superadmin y no se puede deshacer."
        confirmButtonText="Borrar definitivamente"
        confirmingButtonText="Borrando..."
        onCancel={() => {
          if (pendingActionKey) return;
          setTemplatePendingHardDelete(null);
        }}
        onConfirm={handleConfirmHardDelete}
      />
    </section>
  );
}
