import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Tag, X } from "lucide-react";
import {
  listTemplateTagsAdmin,
  upsertTemplateEditorial,
  upsertTemplateTag,
} from "@/domain/templates/adminService";
import {
  getTemplateEditorialStateMeta,
  normalizeTemplateEditorialState,
} from "@/domain/templates/editorial";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function buildEditorialSignature(state, tags) {
  const safeState = normalizeTemplateEditorialState(state);
  const safeTags = Array.isArray(tags)
    ? tags.map((entry) => normalizeLower(entry)).filter(Boolean)
    : [];
  return `${safeState}::${safeTags.join("|")}`;
}

function normalizeWorkspace(value) {
  const safeValue = value && typeof value === "object" ? value : {};
  return {
    templateId: normalizeText(safeValue.templateId),
    templateName: normalizeText(safeValue.templateName) || "Plantilla",
    estadoEditorial: normalizeTemplateEditorialState(safeValue.estadoEditorial),
    tags: Array.isArray(safeValue.tags) ? safeValue.tags.filter(Boolean) : [],
    readOnly: safeValue.readOnly === true,
    permissions:
      safeValue.permissions && typeof safeValue.permissions === "object"
        ? safeValue.permissions
        : {},
  };
}

function buildStateOptions(workspace) {
  const currentState = normalizeTemplateEditorialState(workspace?.estadoEditorial);
  const allowedTransitions = Array.isArray(workspace?.permissions?.allowedTransitions)
    ? workspace.permissions.allowedTransitions
    : [];
  const set = new Set([currentState, ...allowedTransitions]);
  return [...set].map((state) => ({
    value: normalizeTemplateEditorialState(state),
    meta: getTemplateEditorialStateMeta(state),
  }));
}

export default function TemplateEditorialDrawer({
  open = false,
  onClose,
  templateWorkspace = null,
  onSaved,
}) {
  const AUTOSAVE_DEBOUNCE_MS = 500;
  const workspace = useMemo(
    () => normalizeWorkspace(templateWorkspace),
    [templateWorkspace]
  );
  const workspaceTagsSignature = useMemo(
    () => workspace.tags.map((entry) => normalizeLower(entry)).join("|"),
    [workspace.tags]
  );
  const templateId = workspace.templateId;
  const readOnly = workspace.readOnly || workspace?.permissions?.readOnly === true;
  const [loadingTags, setLoadingTags] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("idle");
  const [tagQuery, setTagQuery] = useState("");
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState(workspace.tags);
  const [selectedState, setSelectedState] = useState(workspace.estadoEditorial);
  const lastPersistedSignatureRef = useRef(
    buildEditorialSignature(workspace.estadoEditorial, workspace.tags)
  );
  const failedSignatureRef = useRef("");
  const latestSelectedStateRef = useRef(selectedState);
  const latestSelectedTagsRef = useRef(selectedTags);

  useEffect(() => {
    if (!open) return;
    setSelectedTags(workspace.tags);
    setSelectedState(workspace.estadoEditorial);
    setTagQuery("");
    setError("");
    setSaveStatus("idle");
    lastPersistedSignatureRef.current = buildEditorialSignature(
      workspace.estadoEditorial,
      workspace.tags
    );
    failedSignatureRef.current = "";
  }, [open, workspace.estadoEditorial, workspaceTagsSignature]);

  useEffect(() => {
    latestSelectedStateRef.current = selectedState;
    latestSelectedTagsRef.current = selectedTags;
  }, [selectedState, selectedTags]);

  useEffect(() => {
    if (!open || !templateId) return;

    let cancelled = false;
    setLoadingTags(true);

    void (async () => {
      try {
        const result = await listTemplateTagsAdmin({});
        if (cancelled) return;
        setAvailableTags(Array.isArray(result?.items) ? result.items : []);
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError?.message ||
            "No se pudo cargar el catalogo de etiquetas."
        );
      } finally {
        if (!cancelled) {
          setLoadingTags(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, templateId]);

  const stateOptions = useMemo(
    () => buildStateOptions(workspace),
    [workspace]
  );

  const filteredAvailableTags = useMemo(() => {
    const query = normalizeLower(tagQuery);
    const selectedSet = new Set(selectedTags.map((entry) => normalizeLower(entry)));

    return availableTags.filter((item) => {
      const label = normalizeText(item?.label);
      if (!label || selectedSet.has(normalizeLower(label))) return false;
      if (!query) return true;
      return normalizeLower(label).includes(query);
    });
  }, [availableTags, selectedTags, tagQuery]);

  const selectedSignature = useMemo(
    () => buildEditorialSignature(selectedState, selectedTags),
    [selectedState, selectedTags]
  );

  const selectedStateMeta = getTemplateEditorialStateMeta(selectedState);
  const canPersist = !readOnly && !saving;
  const canCreateTag =
    canPersist &&
    normalizeText(tagQuery) &&
    !availableTags.some(
      (item) => normalizeLower(item?.label) === normalizeLower(tagQuery)
    ) &&
    !selectedTags.some((item) => normalizeLower(item) === normalizeLower(tagQuery));

  const addTag = (label) => {
    const safeLabel = normalizeText(label);
    if (!safeLabel) return;
    setSelectedTags((previous) => {
      if (previous.some((item) => normalizeLower(item) === normalizeLower(safeLabel))) {
        return previous;
      }
      return [...previous, safeLabel];
    });
    setTagQuery("");
  };

  const removeTag = (label) => {
    const safeLabel = normalizeText(label);
    setSelectedTags((previous) =>
      previous.filter((item) => normalizeLower(item) !== normalizeLower(safeLabel))
    );
  };

  const handleCreateTag = async () => {
    const label = normalizeText(tagQuery);
    if (!label || !canCreateTag) return;

    setSaving(true);
    setError("");
    try {
      const result = await upsertTemplateTag({ label });
      const item =
        result?.item && typeof result.item === "object" ? result.item : null;
      const nextLabel = normalizeText(item?.label) || label;
      setAvailableTags((previous) => {
        const alreadyThere = previous.some(
          (entry) => normalizeLower(entry?.label) === normalizeLower(nextLabel)
        );
        if (alreadyThere) return previous;
        return [...previous, item || { id: nextLabel, label: nextLabel, usageCount: 0 }];
      });
      addTag(nextLabel);
    } catch (createError) {
      setError(
        createError?.message || "No se pudo crear la nueva etiqueta."
      );
    } finally {
      setSaving(false);
    }
  };

  const persistEditorialChanges = useCallback(async ({
    nextState,
    nextTags,
    requestSignature,
  }) => {
    setSaving(true);
    setSaveStatus("saving");
    setError("");
    try {
      const result = await upsertTemplateEditorial({
        templateId,
        estadoEditorial: nextState,
        tags: nextTags,
      });
      const item =
        result?.item && typeof result.item === "object" ? result.item : {};
      const persistedState = normalizeTemplateEditorialState(
        item?.estadoEditorial || nextState
      );
      const persistedTags = Array.isArray(item?.tags) ? item.tags : nextTags;
      const persistedSignature = buildEditorialSignature(
        persistedState,
        persistedTags
      );

      lastPersistedSignatureRef.current = persistedSignature;
      failedSignatureRef.current = "";

      if (
        buildEditorialSignature(
          latestSelectedStateRef.current,
          latestSelectedTagsRef.current
        ) === requestSignature
      ) {
        setSelectedState(persistedState);
        setSelectedTags(persistedTags);
      }

      setSaveStatus("saved");
      onSaved?.(item);
    } catch (saveError) {
      failedSignatureRef.current = requestSignature;
      setSaveStatus("error");
      setError(
        saveError?.message ||
          "No se pudieron guardar los cambios editoriales."
      );
    } finally {
      setSaving(false);
    }
  }, [onSaved, templateId]);

  useEffect(() => {
    if (!open || !templateId || readOnly) return undefined;
    if (saving) return undefined;
    if (selectedSignature === lastPersistedSignatureRef.current) {
      if (saveStatus !== "idle") {
        setSaveStatus("idle");
      }
      return undefined;
    }
    if (selectedSignature === failedSignatureRef.current) {
      return undefined;
    }

    setSaveStatus("pending");
    const nextState = selectedState;
    const nextTags = [...selectedTags];
    const timer = window.setTimeout(() => {
      void persistEditorialChanges({
        nextState,
        nextTags,
        requestSignature: selectedSignature,
      });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    AUTOSAVE_DEBOUNCE_MS,
    open,
    persistEditorialChanges,
    readOnly,
    saveStatus,
    saving,
    selectedSignature,
    selectedState,
    selectedTags,
    templateId,
  ]);

  // This drawer often mounts closed and opens later in the same tree.
  // Keep the visibility guard after every hook to preserve hook order.
  if (!open || !templateId) return null;

  let saveStatusLabel = "Los cambios se guardan automaticamente.";
  let saveStatusClass = "text-slate-500";
  if (saveStatus === "pending") {
    saveStatusLabel = "Cambios pendientes de guardado...";
    saveStatusClass = "text-amber-600";
  } else if (saveStatus === "saving") {
    saveStatusLabel = "Guardando cambios...";
    saveStatusClass = "text-[#6f3bc0]";
  } else if (saveStatus === "saved") {
    saveStatusLabel = "Cambios guardados automaticamente.";
    saveStatusClass = "text-emerald-600";
  } else if (saveStatus === "error") {
    saveStatusLabel = "Hubo un error al guardar automaticamente.";
    saveStatusClass = "text-red-600";
  }

  return (
    <div className="fixed inset-0 z-[110]">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/25 backdrop-blur-[1.5px]"
        aria-label="Cerrar panel editorial"
      />

      <aside
        data-preserve-canvas-selection="true"
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6f3bc0]">
              Metadata editorial
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              {workspace.templateName}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Estado y etiquetas de la plantilla base actual.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Estado actual
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selectedStateMeta.badgeClass}`}>
                {selectedStateMeta.label}
              </span>
              {readOnly ? (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                  Solo lectura
                </span>
              ) : null}
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Cambiar estado
            </label>
            <select
              value={selectedState}
              disabled={readOnly}
              onChange={(event) =>
                setSelectedState(
                  normalizeTemplateEditorialState(event.target.value)
                )
              }
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#d0b8f4] focus:ring-2 focus:ring-[#eadffd] disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              {stateOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.meta.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-[#6f3bc0]" />
                <h3 className="text-sm font-semibold text-slate-900">Etiquetas</h3>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Catalogo libre para clasificar y ordenar plantillas publicadas.
              </p>
            </div>

            <div className="space-y-4 px-4 py-4">
              <div className="flex flex-wrap gap-2">
                {selectedTags.length ? (
                  selectedTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full border border-[#e6daf9] bg-[#faf6ff] px-2.5 py-1 text-xs font-semibold text-[#6f3bc0]"
                    >
                      {tag}
                      {!readOnly ? (
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="rounded-full p-0.5 text-[#6f3bc0] transition hover:bg-white"
                          aria-label={`Quitar etiqueta ${tag}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      ) : null}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No hay etiquetas asignadas.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Buscar o crear etiqueta
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={tagQuery}
                    disabled={readOnly}
                    onChange={(event) => setTagQuery(event.target.value)}
                    placeholder="Ej: floral, minimalista, premium"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#d0b8f4] focus:bg-white focus:ring-2 focus:ring-[#eadffd] disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() => void handleCreateTag()}
                      disabled={!canCreateTag}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#d6c1f5] bg-[#faf6ff] px-3 py-2.5 text-xs font-semibold text-[#6f3bc0] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Crear
                    </button>
                  ) : null}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Etiquetas disponibles
                </p>
                {loadingTags ? (
                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando catalogo...
                  </div>
                ) : filteredAvailableTags.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {filteredAvailableTags.slice(0, 20).map((item) => (
                      <button
                        key={item.id || item.label}
                        type="button"
                        disabled={readOnly}
                        onClick={() => addTag(item.label)}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-[#d4bdf2] hover:bg-[#faf6ff] hover:text-[#6f3bc0] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    No hay coincidencias para el filtro actual.
                  </p>
                )}
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-200 px-5 py-4">
          {readOnly ? (
            <p className="text-sm text-slate-500">
              Esta plantilla esta bloqueada para tu rol en el estado actual.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className={`flex items-center gap-2 text-sm ${saveStatusClass}`}>
                {saveStatus === "saving" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                <span>{saveStatusLabel}</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
