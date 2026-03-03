import { useEffect, useMemo, useState } from "react";

const TEXT_FIELD_TYPE_OPTIONS = [
  { value: "text", label: "Texto corto" },
  { value: "textarea", label: "Texto largo" },
  { value: "date", label: "Fecha" },
  { value: "time", label: "Hora" },
  { value: "datetime", label: "Fecha y hora" },
  { value: "location", label: "Ubicacion" },
  { value: "url", label: "URL" },
];

const FIELD_GROUP_OPTIONS = [
  "Datos principales",
  "Ubicaciones",
  "Regalos",
  "Galeria",
  "Vestimenta",
];

function normalizeText(value) {
  return String(value || "").trim();
}

function buildSuggestedLabel(selectedElement, selectedElementType) {
  if (selectedElementType === "countdown") {
    return "Fecha del evento";
  }
  const rawText = normalizeText(selectedElement?.texto);
  if (!rawText) return "Nuevo campo";
  if (rawText.length <= 32) return rawText;
  return `${rawText.slice(0, 32)}...`;
}

export default function TemplateDynamicFieldMenuSection({
  visible = false,
  canConfigure = false,
  loading = false,
  saving = false,
  error = "",
  selectedElement = null,
  selectedElementType = "",
  selectedIsSupportedElement = false,
  suggestedFieldType = "text",
  selectedField = null,
  fieldsSchema = [],
  onCreateField,
  onLinkField,
  onEditField,
  onUnlinkField,
  onDeleteField,
  onViewUsage,
}) {
  const [mode, setMode] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [createLabel, setCreateLabel] = useState("");
  const [createType, setCreateType] = useState("text");
  const [createGroup, setCreateGroup] = useState("Datos principales");
  const [createOptional, setCreateOptional] = useState(false);
  const [linkFieldKey, setLinkFieldKey] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editType, setEditType] = useState("text");
  const [editGroup, setEditGroup] = useState("Datos principales");
  const [editOptional, setEditOptional] = useState(false);

  const availableFields = useMemo(
    () => (Array.isArray(fieldsSchema) ? fieldsSchema : []),
    [fieldsSchema]
  );
  const createTypeOptions = useMemo(() => {
    if (selectedElementType === "countdown") {
      return TEXT_FIELD_TYPE_OPTIONS.filter(
        (option) => option.value === "date" || option.value === "datetime"
      );
    }
    return TEXT_FIELD_TYPE_OPTIONS;
  }, [selectedElementType]);
  const editTypeOptions = useMemo(() => {
    if (selectedElementType === "countdown") {
      return TEXT_FIELD_TYPE_OPTIONS.filter(
        (option) => option.value === "date" || option.value === "datetime"
      );
    }
    return TEXT_FIELD_TYPE_OPTIONS;
  }, [selectedElementType]);

  useEffect(() => {
    setMode("");
    setSubmitError("");
    setCreateLabel(buildSuggestedLabel(selectedElement, selectedElementType));
    setCreateType(
      selectedElementType === "countdown"
        ? "date"
        : normalizeText(suggestedFieldType) || "text"
    );
    setCreateGroup("Datos principales");
    setCreateOptional(false);
    setLinkFieldKey("");
  }, [selectedElement?.id, selectedElementType, suggestedFieldType, visible]);

  useEffect(() => {
    if (!selectedField) return;
    setEditLabel(normalizeText(selectedField.label) || selectedField.key || "Campo");
    const incomingType = normalizeText(selectedField.type) || "text";
    if (
      selectedElementType === "countdown" &&
      incomingType !== "date" &&
      incomingType !== "datetime"
    ) {
      setEditType("date");
    } else {
      setEditType(incomingType);
    }
    setEditGroup(normalizeText(selectedField.group) || "Datos principales");
    setEditOptional(Boolean(selectedField.optional));
  }, [selectedElementType, selectedField]);

  if (!visible) return null;

  const hasLinkedField = Boolean(selectedField?.key);

  const sectionButtonBase =
    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[12px] transition";
  const sectionButtonNeutral = `${sectionButtonBase} bg-slate-50 text-slate-700 hover:bg-slate-100`;
  const sectionButtonHighlight = `${sectionButtonBase} bg-violet-50 text-violet-700 hover:bg-violet-100`;
  const sectionButtonDanger = `${sectionButtonBase} bg-rose-50 text-rose-700 hover:bg-rose-100`;

  const renderHint = () => {
    if (loading) {
      return <p className="text-[10px] text-slate-500">Cargando configuracion...</p>;
    }
    if (!canConfigure) {
      return (
        <p className="text-[10px] text-amber-700">
          Este borrador no tiene plantilla base vinculada. No se puede configurar schema.
        </p>
      );
    }
    if (!selectedIsSupportedElement) {
      return (
        <p className="text-[10px] text-slate-500">
          MVP activo: selecciona un texto o countdown para configurar campo dinamico.
        </p>
      );
    }

    if (selectedElementType === "countdown") {
      return (
        <p className="text-[10px] text-slate-500">
          Vincula una fecha al countdown para que el formulario actualice su cuenta regresiva.
        </p>
      );
    }

    return (
      <p className="text-[10px] text-slate-500">
        Configura este texto como campo del formulario para reutilizarlo en templates.
      </p>
    );
  };

  const handleCreateField = async () => {
    if (typeof onCreateField !== "function") return;
    setSubmitError("");

    try {
      await onCreateField({
        label: createLabel,
        type: createType,
        group: createGroup,
        optional: createOptional,
      });
      setMode("");
    } catch (createError) {
      setSubmitError(
        createError instanceof Error
          ? createError.message
          : "No se pudo crear el campo dinamico."
      );
    }
  };

  const handleLinkField = async () => {
    if (!linkFieldKey || typeof onLinkField !== "function") return;
    setSubmitError("");

    try {
      await onLinkField(linkFieldKey);
      setMode("");
    } catch (linkError) {
      setSubmitError(
        linkError instanceof Error
          ? linkError.message
          : "No se pudo vincular el elemento al campo seleccionado."
      );
    }
  };

  const handleEditField = async () => {
    if (!selectedField?.key || typeof onEditField !== "function") return;
    setSubmitError("");

    try {
      await onEditField(selectedField.key, {
        label: editLabel,
        type: editType,
        group: editGroup,
        optional: editOptional,
      });
      setMode("");
    } catch (editError) {
      setSubmitError(
        editError instanceof Error
          ? editError.message
          : "No se pudo actualizar la configuracion del campo."
      );
    }
  };

  const handleDeleteField = async () => {
    if (!selectedField?.key || typeof onDeleteField !== "function") return;
    const confirmDelete = window.confirm(
      `Eliminar el campo '${selectedField.key}'? Solo se elimina si no tiene targets.`
    );
    if (!confirmDelete) return;

    setSubmitError("");
    try {
      await onDeleteField(selectedField.key);
      setMode("");
    } catch (deleteError) {
      setSubmitError(
        deleteError instanceof Error
          ? deleteError.message
          : "No se pudo eliminar el campo."
      );
    }
  };

  return (
    <section className="rounded-lg border border-violet-200 bg-violet-50/40 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
          Campos dinamicos
        </p>
        {saving ? (
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">
            Guardando...
          </span>
        ) : null}
      </div>

      {renderHint()}

      {hasLinkedField ? (
        <div className="mt-2 rounded-md border border-violet-200 bg-white p-2 text-[11px] text-violet-800">
          <strong>Campo activo:</strong> {selectedField.label || selectedField.key}
          <div className="text-[10px] text-violet-600">
            key: {selectedField.key} - grupo: {selectedField.group || "Datos principales"}
          </div>
        </div>
      ) : null}

      <div className="mt-2 space-y-1.5">
        {!hasLinkedField ? (
          <>
            <button
              type="button"
              className={sectionButtonHighlight}
              disabled={!canConfigure || !selectedIsSupportedElement}
              onClick={() => setMode((prev) => (prev === "create" ? "" : "create"))}
            >
              Configurar como campo dinamico
            </button>

            <button
              type="button"
              className={sectionButtonNeutral}
              disabled={!canConfigure || !selectedIsSupportedElement || availableFields.length === 0}
              onClick={() => setMode((prev) => (prev === "link" ? "" : "link"))}
            >
              Vincular a campo existente
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={sectionButtonHighlight}
              disabled={!canConfigure}
              onClick={() => setMode((prev) => (prev === "edit" ? "" : "edit"))}
            >
              Editar configuracion del campo
            </button>
            <button
              type="button"
              className={sectionButtonNeutral}
              disabled={!canConfigure || typeof onUnlinkField !== "function"}
              onClick={() => {
                setSubmitError("");
                Promise.resolve(onUnlinkField?.()).catch((unlinkError) => {
                  setSubmitError(
                    unlinkError instanceof Error
                      ? unlinkError.message
                      : "No se pudo desvincular el elemento."
                  );
                });
              }}
            >
              Desvincular de campo
            </button>
            <button
              type="button"
              className={sectionButtonNeutral}
              disabled={!canConfigure || typeof onViewUsage !== "function"}
              onClick={() => onViewUsage?.(selectedField.key)}
            >
              Ver donde se usa
            </button>
            <button
              type="button"
              className={sectionButtonDanger}
              disabled={!canConfigure}
              onClick={handleDeleteField}
            >
              Eliminar campo (si esta huerfano)
            </button>
          </>
        )}
      </div>

      {mode === "create" && (
        <div className="mt-2 rounded-md border border-violet-200 bg-white p-2">
          <p className="mb-1 text-[11px] font-semibold text-violet-700">Nuevo campo</p>
          <label className="mb-1 block text-[11px] text-slate-600">Label</label>
          <input
            value={createLabel}
            onChange={(event) => setCreateLabel(event.target.value)}
            className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
            placeholder="Ej: Nombres"
          />

          <label className="mb-1 block text-[11px] text-slate-600">Tipo</label>
          <select
            value={createType}
            onChange={(event) => setCreateType(event.target.value)}
            className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
          >
            {createTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label className="mb-1 block text-[11px] text-slate-600">Grupo</label>
          <select
            value={createGroup}
            onChange={(event) => setCreateGroup(event.target.value)}
            className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
          >
            {FIELD_GROUP_OPTIONS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>

          <label className="mb-2 flex items-center gap-2 text-[12px] text-slate-700">
            <input
              type="checkbox"
              checked={createOptional}
              onChange={(event) => setCreateOptional(event.target.checked)}
            />
            Campo opcional
          </label>

          <button
            type="button"
            className="w-full rounded bg-violet-600 px-2 py-1.5 text-[12px] font-medium text-white hover:bg-violet-700"
            onClick={handleCreateField}
            disabled={!canConfigure || saving}
          >
            Confirmar campo
          </button>
        </div>
      )}

      {mode === "link" && (
        <div className="mt-2 rounded-md border border-violet-200 bg-white p-2">
          <p className="mb-1 text-[11px] font-semibold text-violet-700">Vincular a existente</p>
          <select
            value={linkFieldKey}
            onChange={(event) => setLinkFieldKey(event.target.value)}
            className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
          >
            <option value="">Seleccionar campo...</option>
            {availableFields.map((field) => (
              <option key={field.key} value={field.key}>
                {field.label || field.key} ({field.key})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="w-full rounded bg-violet-600 px-2 py-1.5 text-[12px] font-medium text-white hover:bg-violet-700"
            onClick={handleLinkField}
            disabled={!linkFieldKey || saving}
          >
            Vincular
          </button>
        </div>
      )}

      {mode === "edit" && hasLinkedField && (
        <div className="mt-2 rounded-md border border-violet-200 bg-white p-2">
          <p className="mb-1 text-[11px] font-semibold text-violet-700">Editar campo</p>
          <label className="mb-1 block text-[11px] text-slate-600">Label</label>
          <input
            value={editLabel}
            onChange={(event) => setEditLabel(event.target.value)}
            className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
          />

          <label className="mb-1 block text-[11px] text-slate-600">Tipo</label>
          <select
            value={editType}
            onChange={(event) => setEditType(event.target.value)}
            className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
          >
            {editTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label className="mb-1 block text-[11px] text-slate-600">Grupo</label>
          <select
            value={editGroup}
            onChange={(event) => setEditGroup(event.target.value)}
            className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
          >
            {FIELD_GROUP_OPTIONS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>

          <label className="mb-2 flex items-center gap-2 text-[12px] text-slate-700">
            <input
              type="checkbox"
              checked={editOptional}
              onChange={(event) => setEditOptional(event.target.checked)}
            />
            Campo opcional
          </label>

          <button
            type="button"
            className="w-full rounded bg-violet-600 px-2 py-1.5 text-[12px] font-medium text-white hover:bg-violet-700"
            onClick={handleEditField}
            disabled={saving}
          >
            Guardar cambios
          </button>
        </div>
      )}

      {submitError || error ? (
        <p className="mt-2 rounded-md bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
          {submitError || error}
        </p>
      ) : null}
    </section>
  );
}
