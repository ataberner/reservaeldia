import { forwardRef, useImperativeHandle, useMemo } from "react";
import { buildTemplateFormState } from "@/domain/templates/formModel";
import TemplateMediaFieldInput from "@/components/templates/TemplateMediaFieldInput";
import useTemplateMediaLibrary from "@/hooks/useTemplateMediaLibrary";

function normalizeText(value) {
  return String(value || "").trim();
}

function toSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatCountLabel(count, singular, plural) {
  const safeCount = Number.isFinite(count) ? count : 0;
  return `${safeCount} ${safeCount === 1 ? singular : plural}`;
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
  const hasImageFields = fields.some((field) => field.type === "images");
  const galleryRules = template?.galleryRules && typeof template.galleryRules === "object"
    ? template.galleryRules
    : null;
  const isExpanded = mode === "expanded";
  const mediaLibrary = useTemplateMediaLibrary({
    enabled: hasImageFields,
    reloadKey: template?.id,
  });

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

  const handleMediaFieldChange = (field, nextUrls) => {
    const key = field.key;
    const maxImages = resolveGalleryMaxImages(field, galleryRules);
    const sanitizedUrls = toSafeArray(nextUrls)
      .map((entry) => normalizeText(entry))
      .filter(Boolean)
      .slice(0, maxImages);
    const nextRawValues = {
      ...rawValues,
      [key]: sanitizedUrls,
    };
    const nextTouchedKeys = Array.from(new Set([...touchedKeys, key]));

    notifyFormChange(nextRawValues, nextTouchedKeys);
    onLiveFieldUpdate?.({
      fieldKey: key,
      value: sanitizedUrls,
      phase: "confirm",
    });
  };

  const handleMediaUpload = async (field, files) => {
    const maxImages = resolveGalleryMaxImages(field, galleryRules);
    return mediaLibrary.uploadFiles({
      files,
      field: {
        ...field,
        validation: {
          ...(field?.validation && typeof field.validation === "object"
            ? field.validation
            : {}),
          maxItems: maxImages,
        },
      },
      galleryRules,
    });
  };

  const handleSaveAndOpen = () => {
    onSaveAndOpen?.({
      rawValues,
      touchedKeys,
      galleryFilesByField: {},
    });
  };

  useImperativeHandle(
    ref,
    () => ({
      submitChanges: handleSaveAndOpen,
    }),
    [rawValues, touchedKeys]
  );

  return (
    <div
      className={`relative h-full min-h-0 transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isExpanded ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-[2] transition-[height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isExpanded
            ? "h-14 bg-gradient-to-b from-transparent via-[#f7f1ff]/72 to-[#f7f1ff] opacity-100 sm:h-16"
            : "h-0 opacity-0"
        }`}
      />
      <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
        <div className="min-h-full bg-[#f7f1ff] px-3 pb-4 pt-5 sm:px-5 sm:pb-5 sm:pt-6">
          <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">
            {!hasDynamicFields ? (
              <div className="rounded-xl border border-[#e9dcfb] bg-white/75 px-4 py-3 text-sm text-slate-600">
                Esta plantilla todavia no define campos dinamicos. Puedes abrir el editor directamente.
              </div>
            ) : null}

            {groups.map((group) => (
              <section
                key={group.name}
                className="rounded-xl border border-[#e9dcfb] bg-white/78 p-3.5"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#f1e8ff] pb-2.5">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#5f3596]">
                    {group.name}
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {formatCountLabel(group.fields.length, "campo", "campos")}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {group.fields.map((field) => {
                    if (field.type === "images") {
                      const fieldKey = field.key;

                      return (
                        <TemplateMediaFieldInput
                          key={fieldKey}
                          field={field}
                          value={rawValues[fieldKey]}
                          defaultImages={defaults[fieldKey]}
                          isTouched={touchedKeys.includes(fieldKey)}
                          maxImages={resolveGalleryMaxImages(field, galleryRules)}
                          galleryRules={galleryRules}
                          libraryImages={mediaLibrary.images}
                          libraryLoading={mediaLibrary.loading}
                          libraryHasMore={mediaLibrary.hasMore}
                          libraryUploading={mediaLibrary.uploading}
                          openingEditor={openingEditor}
                          onLoadMoreLibrary={mediaLibrary.loadMore}
                          onUploadFiles={(files) => handleMediaUpload(field, files)}
                          onChange={(nextUrls) => handleMediaFieldChange(field, nextUrls)}
                        />
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
                        "mt-1.5 w-full rounded-lg border border-[#e3d8f8] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#6f3bc0] focus:ring-2 focus:ring-[#6f3bc0]/15 disabled:cursor-not-allowed disabled:bg-slate-50",
                    };
                    const updateModeLabel = field.updateMode === "input"
                      ? "Vista previa en vivo"
                      : field.updateMode === "blur"
                        ? "Se aplica al salir"
                        : "";
                    const isWideField = field.type === "textarea";

                    return (
                      <div
                        key={field.key}
                        className={isWideField ? "md:col-span-2" : ""}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label
                            htmlFor={`template-field-${field.key}`}
                            className="text-xs font-semibold text-slate-800"
                          >
                            {field.label}
                            {field.optional ? (
                              <span className="ml-1 font-normal text-slate-500">(opcional)</span>
                            ) : null}
                          </label>

                          {updateModeLabel ? (
                            <span className="text-[10px] text-slate-400">{updateModeLabel}</span>
                          ) : null}
                        </div>

                        {field.helperText ? (
                          <p className="mt-1 text-[11px] text-slate-500">{field.helperText}</p>
                        ) : null}

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
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

export default TemplateEventForm;
