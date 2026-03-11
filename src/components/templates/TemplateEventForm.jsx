import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { buildTemplateFormState } from "@/domain/templates/formModel";
import { validateGalleryFiles } from "@/domain/templates/galleryUpload";

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function toSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveFieldInputType(fieldType) {
  if (fieldType === "date") return "date";
  if (fieldType === "time") return "time";
  if (fieldType === "datetime") return "datetime-local";
  if (fieldType === "url") return "url";
  return "text";
}

function resolveGalleryMaxImages(field, galleryRules) {
  const fieldMax = Number(field?.validation?.maxItems);
  const rulesMax = Number(galleryRules?.maxImages);
  if (Number.isFinite(fieldMax) && fieldMax > 0 && Number.isFinite(rulesMax) && rulesMax > 0) {
    return Math.min(fieldMax, rulesMax);
  }
  if (Number.isFinite(fieldMax) && fieldMax > 0) return fieldMax;
  if (Number.isFinite(rulesMax) && rulesMax > 0) return rulesMax;
  return 12;
}

const TemplateEventForm = forwardRef(function TemplateEventForm({
  template,
  formState,
  onFormStateChange,
  onLiveFieldUpdate,
  onSaveAndOpen,
  openingEditor = false,
  mode = "collapsed",
}, ref) {
  const [galleryFilesByField, setGalleryFilesByField] = useState({});
  const [galleryPreviewUrlsByField, setGalleryPreviewUrlsByField] = useState({});
  const [galleryErrorsByField, setGalleryErrorsByField] = useState({});

  const model = useMemo(
    () => buildTemplateFormState(template, formState),
    [formState, template]
  );
  const fields = model.fields;
  const groups = model.groups;
  const defaults = model.defaults;
  const rawValues = model.rawValues;
  const touchedKeys = model.touchedKeys || [];
  const hasDynamicFields = fields.length > 0;
  const galleryRules = template?.galleryRules && typeof template.galleryRules === "object"
    ? template.galleryRules
    : null;
  const isExpanded = mode === "expanded";

  useEffect(() => {
    setGalleryFilesByField({});
    setGalleryPreviewUrlsByField((prev) => {
      Object.values(asObject(prev)).forEach((urls) => {
        toSafeArray(urls).forEach((url) => URL.revokeObjectURL(url));
      });
      return {};
    });
    setGalleryErrorsByField({});
  }, [template?.id]);

  useEffect(
    () => () => {
      Object.values(asObject(galleryPreviewUrlsByField)).forEach((urls) => {
        toSafeArray(urls).forEach((url) => URL.revokeObjectURL(url));
      });
    },
    [galleryPreviewUrlsByField]
  );

  const notifyFormChange = (nextRawValues, nextTouchedKeys) => {
    onFormStateChange?.({
      rawValues: nextRawValues,
      touchedKeys: nextTouchedKeys,
    });
  };

  const handleFieldInputChange = (field, nextValue) => {
    const key = field.key;
    const nextRawValues = {
      ...rawValues,
      [key]: nextValue,
    };
    const nextTouchedKeys = Array.from(new Set([...touchedKeys, key]));
    notifyFormChange(nextRawValues, nextTouchedKeys);

    if (field.updateMode === "input") {
      onLiveFieldUpdate?.({
        fieldKey: key,
        value: nextValue,
        phase: "input",
      });
    }
  };

  const handleFieldBlur = (field) => {
    if (field.updateMode !== "blur") return;
    onLiveFieldUpdate?.({
      fieldKey: field.key,
      value: rawValues[field.key],
      phase: "blur",
    });
  };

  const handleGalleryFilesChange = (field, fileList) => {
    const key = field.key;
    const files = Array.from(fileList || []);

    try {
      validateGalleryFiles({
        files,
        field,
        galleryRules,
      });
    } catch (error) {
      setGalleryErrorsByField((prev) => ({
        ...prev,
        [key]: String(error?.message || "No se pudieron validar las imagenes."),
      }));
      return;
    }

    setGalleryErrorsByField((prev) => ({
      ...prev,
      [key]: "",
    }));

    setGalleryFilesByField((prev) => ({
      ...prev,
      [key]: files,
    }));

    setGalleryPreviewUrlsByField((prev) => {
      const next = { ...prev };
      toSafeArray(next[key]).forEach((url) => URL.revokeObjectURL(url));
      next[key] = files.map((file) => URL.createObjectURL(file));
      return next;
    });
  };

  const clearGallerySelection = (fieldKey) => {
    setGalleryFilesByField((prev) => ({
      ...prev,
      [fieldKey]: [],
    }));
    setGalleryErrorsByField((prev) => ({
      ...prev,
      [fieldKey]: "",
    }));
    setGalleryPreviewUrlsByField((prev) => {
      const next = { ...prev };
      toSafeArray(next[fieldKey]).forEach((url) => URL.revokeObjectURL(url));
      next[fieldKey] = [];
      return next;
    });
  };

  const handleSaveAndOpen = () => {
    onSaveAndOpen?.({
      rawValues,
      galleryFilesByField,
    });
  };

  useImperativeHandle(
    ref,
    () => ({
      submitChanges: handleSaveAndOpen,
    }),
    [galleryFilesByField, rawValues]
  );

  return (
    <div
      className={`relative grid min-h-0 flex-1 transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isExpanded ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0"
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-[2] transition-[height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isExpanded
            ? "h-14 bg-gradient-to-b from-transparent via-[#f7f1ff]/72 to-[#f7f1ff] opacity-100 sm:h-16"
            : "h-0 opacity-0"
        }`}
      />
      <div className="min-h-0 overflow-hidden">
        <div className="h-full overflow-y-auto px-3 pb-4 pt-6 sm:px-5 sm:pb-5 sm:pt-7">
          {!hasDynamicFields ? (
            <div className="rounded-xl border border-[#e9dcfb] bg-white/70 px-3 py-2 text-xs text-slate-600">
              Esta plantilla todavia no define campos dinamicos. Puedes abrir el editor directamente.
            </div>
          ) : null}

          {groups.map((group) => (
            <section
              key={group.name}
              className="rounded-xl border border-[#e9dcfb] bg-white/70 p-3 first:mt-0 mt-3"
            >
              <h4 className="text-xs font-semibold uppercase tracking-[0.04em] text-[#5f3596]">
                {group.name}
              </h4>

              <div className="mt-2 space-y-2.5">
                {group.fields.map((field) => {
                  if (field.type === "images") {
                    const fieldKey = field.key;
                    const selectedPreviews = toSafeArray(galleryPreviewUrlsByField[fieldKey]);
                    const defaultImages = toSafeArray(defaults[fieldKey]);
                    const maxImages = resolveGalleryMaxImages(field, galleryRules);
                    const galleryError = normalizeText(galleryErrorsByField[fieldKey]);

                    return (
                      <div key={field.key} className="rounded-lg border border-[#ece3fb] bg-white p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-900">{field.label}</p>
                          <span className="text-[11px] text-slate-500">Maximo {maxImages}</span>
                        </div>

                        <p className="mt-1 text-[11px] text-slate-500">
                          {galleryRules?.recommendedSizeText
                            ? `Recomendado: ${galleryRules.recommendedSizeText}.`
                            : "Cargar imagenes en buena calidad mejora el resultado final."}
                          {galleryRules?.recommendedRatio
                            ? ` Ratio sugerido: ${galleryRules.recommendedRatio}.`
                            : ""}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Si no subes fotos, se mantienen las que trae la plantilla y podras cambiarlas luego.
                        </p>

                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(event) =>
                              handleGalleryFilesChange(field, event.target.files)
                            }
                            disabled={openingEditor}
                            className="block w-full text-[11px] text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-[#efe8fb] file:px-2 file:py-1 file:text-[11px] file:font-semibold file:text-[#5f3596]"
                          />
                          {selectedPreviews.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => clearGallerySelection(fieldKey)}
                              disabled={openingEditor}
                              className="rounded-md border border-[#e1d5f8] bg-white px-2 py-1 text-[11px] font-medium text-[#5f3596] hover:bg-[#f7f2ff] disabled:opacity-60"
                            >
                              Limpiar
                            </button>
                          ) : null}
                        </div>

                        {galleryError ? (
                          <p className="mt-1 text-[11px] text-rose-600">{galleryError}</p>
                        ) : null}

                        <div className="mt-2 grid grid-cols-4 gap-1.5">
                          {(selectedPreviews.length ? selectedPreviews : defaultImages).slice(0, 8).map((url, index) => (
                            <div
                              key={`${fieldKey}-preview-${index}`}
                              className="aspect-square overflow-hidden rounded-md border border-[#ebebf3] bg-slate-50"
                            >
                              <img
                                src={url}
                                alt={`Preview ${index + 1}`}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          ))}
                        </div>

                        <p className="mt-1 text-[11px] text-slate-500">
                          {selectedPreviews.length > 0
                            ? `Reemplazaras ${selectedPreviews.length} foto(s) al guardar.`
                            : `Actualmente hay ${defaultImages.length} foto(s) por defecto.`}
                        </p>
                      </div>
                    );
                  }

                  const value = rawValues[field.key] ?? "";
                  const commonProps = {
                    id: `template-field-${field.key}`,
                    value,
                    placeholder: field.placeholder || "",
                    disabled: openingEditor,
                    onChange: (event) => handleFieldInputChange(field, event.target.value),
                    onBlur: () => handleFieldBlur(field),
                    className:
                      "mt-1 w-full rounded-lg border border-[#e3d8f8] bg-white px-2.5 py-2 text-sm text-slate-700 outline-none transition focus:border-[#6f3bc0] focus:ring-2 focus:ring-[#6f3bc0]/20 disabled:cursor-not-allowed disabled:bg-slate-50",
                  };

                  return (
                    <div key={field.key}>
                      <label
                        htmlFor={`template-field-${field.key}`}
                        className="text-xs font-semibold text-slate-800"
                      >
                        {field.label}
                        {field.optional ? (
                          <span className="ml-1 text-[11px] font-normal text-slate-500">(opcional)</span>
                        ) : null}
                      </label>

                      {field.type === "textarea" ? (
                        <textarea
                          {...commonProps}
                          rows={3}
                        />
                      ) : (
                        <input
                          {...commonProps}
                          type={resolveFieldInputType(field.type)}
                        />
                      )}

                      {field.helperText ? (
                        <p className="mt-1 text-[11px] text-slate-500">{field.helperText}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
});

export default TemplateEventForm;
