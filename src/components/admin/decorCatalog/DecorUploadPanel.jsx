import { useEffect, useMemo, useState } from "react";
import { parseCategoriesInput } from "./decorCatalogMappers";

const ACCEPTED_FILE_TYPES = [
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp",
];

function normalizeString(value) {
  return String(value || "").trim();
}

function parseKeywords(value) {
  return normalizeString(value)
    .split(",")
    .map((entry) => normalizeString(entry).toLowerCase())
    .filter(Boolean);
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "0 KB";
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  return `${(size / 1024).toFixed(1)} KB`;
}

function parseIssue(issue) {
  if (typeof issue === "string") return issue;
  const code = normalizeString(issue?.code);
  const message = normalizeString(issue?.message);
  if (code && message) return `${code}: ${message}`;
  return message || code || "Detalle no disponible";
}

function toggleCategoryToken(currentInput, category) {
  const target = normalizeString(category);
  if (!target) return currentInput;

  const currentList = parseCategoriesInput(currentInput);
  const targetKey = target.toLowerCase();
  const exists = currentList.some(
    (entry) => normalizeString(entry).toLowerCase() === targetKey
  );

  const nextList = exists
    ? currentList.filter(
        (entry) => normalizeString(entry).toLowerCase() !== targetKey
      )
    : [...currentList, target];
  return nextList.join(", ");
}

export default function DecorUploadPanel({
  open,
  onClose,
  onUpload,
  uploadState,
  categoryOptions = [],
}) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [categoriesInput, setCategoriesInput] = useState("");
  const [keywordsInput, setKeywordsInput] = useState("");
  const [priority, setPriority] = useState("0");
  const [license, setLicense] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const phase = uploadState?.phase || "idle";
  const isBusy = submitting || phase === "uploading" || phase === "processing";
  const availableCategories = useMemo(() => {
    return parseCategoriesInput(Array.isArray(categoryOptions) ? categoryOptions : []);
  }, [categoryOptions]);
  const selectedCategories = useMemo(
    () => parseCategoriesInput(categoriesInput),
    [categoriesInput]
  );

  const previewUrl = useMemo(() => {
    if (!(file instanceof File)) return "";
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!open) return;
    setLocalError("");
  }, [open]);

  if (!open) return null;

  const resetForm = () => {
    setFile(null);
    setName("");
    setCategoriesInput("");
    setKeywordsInput("");
    setPriority("0");
    setLicense("");
    setLocalError("");
  };

  const validateFile = (nextFile) => {
    if (!(nextFile instanceof File)) {
      return "Selecciona un archivo valido.";
    }

    if (!ACCEPTED_FILE_TYPES.includes(nextFile.type)) {
      return "Formato no permitido. Usa SVG, PNG, JPG o WEBP.";
    }

    if (nextFile.size <= 0) {
      return "El archivo esta vacio.";
    }
    return "";
  };

  const assignFile = (nextFile) => {
    const validationError = validateFile(nextFile);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError("");
    setFile(nextFile);
    if (!name) {
      setName(nextFile.name.replace(/\.[^.]+$/, ""));
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) assignFile(dropped);
  };

  const onFileInputChange = (event) => {
    const selected = event.target.files?.[0];
    if (selected) assignFile(selected);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!file) {
      setLocalError("Debes seleccionar un archivo.");
      return;
    }

    const parsedPriority = Number(priority);
    if (!Number.isFinite(parsedPriority)) {
      setLocalError("El orden debe ser numerico.");
      return;
    }

    setLocalError("");
    setSubmitting(true);

    try {
      const parsedCategories = parseCategoriesInput(categoriesInput);
      const result = await onUpload?.({
        file,
        nombre: name || file.name,
        categoria: parsedCategories[0] || "",
        categorias: parsedCategories,
        keywords: parseKeywords(keywordsInput),
        priority: parsedPriority,
        license,
      });

      if (result?.ok) {
        resetForm();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const errors = Array.isArray(uploadState?.errors) ? uploadState.errors : [];
  const warnings = Array.isArray(uploadState?.warnings) ? uploadState.warnings : [];

  return (
    <div className="mt-2 flex max-h-[calc(100dvh-170px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:max-h-[calc(100dvh-190px)] sm:p-4">
      <div className="mb-2 flex items-start justify-between gap-3 text-left sm:mb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Subir decoracion</h2>
          <p className="mt-1 text-sm text-slate-600">
            Arrastra un archivo o selecciona uno. La validacion final la realiza el backend.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          Cerrar
        </button>
      </div>

      <div className="min-h-0 overflow-y-auto pr-1">
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 text-left lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragActive(false);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
              className={`rounded-xl border-2 border-dashed p-4 transition ${
                dragActive
                  ? "border-teal-500 bg-teal-50"
                  : "border-slate-300 bg-slate-50"
              }`}
            >
              <p className="text-sm font-medium text-slate-700">
                Drag & drop o seleccion manual
              </p>
              <p className="mt-1 text-xs text-slate-500">
                SVG, PNG, JPG o WEBP
              </p>
              <label className="mt-3 inline-flex cursor-pointer rounded-lg border border-teal-600 bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700">
                Seleccionar archivo
                <input
                  type="file"
                  accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
                  onChange={onFileInputChange}
                  className="hidden"
                  disabled={isBusy}
                />
              </label>
              {file && (
                <p className="mt-2 text-xs text-slate-600">
                  Archivo: <strong>{file.name}</strong> ({formatFileSize(file.size)})
                </p>
              )}
            </div>

            {previewUrl ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Preview
                </p>
                <div className="flex h-32 items-center justify-center rounded-lg border border-slate-200 bg-white">
                  <img src={previewUrl} alt="Preview nueva decoracion" className="max-h-24 w-auto object-contain" />
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Nombre
              </span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Categorias
              </span>
              <input
                type="text"
                value={categoriesInput}
                onChange={(event) => setCategoriesInput(event.target.value)}
                list="icon-upload-category-options"
                placeholder="Ej: baby shower, floral, infantil"
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
              <datalist id="icon-upload-category-options">
                {availableCategories.map((entry) => (
                  <option key={`upload-cat-option-${entry}`} value={entry} />
                ))}
              </datalist>
              <p className="mt-1 text-[11px] text-slate-500">
                Puedes seleccionar varias vigentes o escribir nuevas (separadas por coma).
              </p>
              {availableCategories.length > 0 && (
                <div className="mt-1.5 max-h-20 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-1.5">
                  <div className="flex flex-wrap gap-1">
                    {availableCategories.map((entry) => (
                      <button
                        key={`upload-cat-chip-${entry}`}
                        type="button"
                        onClick={() =>
                          setCategoriesInput((prev) => toggleCategoryToken(prev, entry))
                        }
                        className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
                          selectedCategories.some(
                            (category) =>
                              normalizeString(category).toLowerCase() ===
                              entry.toLowerCase()
                          )
                            ? "border-teal-600 bg-teal-600 text-white"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {entry}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {selectedCategories.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {selectedCategories.map((category) => (
                    <span
                      key={`upload-cat-selected-${category}`}
                      className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-700"
                    >
                      {category}
                    </span>
                  ))}
                </div>
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Keywords
              </span>
              <input
                type="text"
                value={keywordsInput}
                onChange={(event) => setKeywordsInput(event.target.value)}
                placeholder="ej: floral, minimal, fiesta"
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Licencia
              </span>
              <input
                type="text"
                value={license}
                onChange={(event) => setLicense(event.target.value)}
                placeholder="ej: free, interno, premium"
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Orden manual
              </span>
              <input
                type="number"
                min={-9999}
                max={9999}
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>

            {localError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {localError}
              </div>
            ) : null}

            <div className="sticky bottom-0 z-10 -mx-1 bg-white/95 px-1 pb-1 pt-2 backdrop-blur">
              <button
                type="submit"
                disabled={isBusy}
                className="h-10 w-full rounded-lg border border-teal-600 bg-teal-600 px-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {phase === "uploading"
                  ? "Subiendo..."
                  : phase === "processing"
                    ? "Procesando..."
                    : "Subir decoracion"}
              </button>
            </div>
          </div>
        </form>

        {normalizeString(uploadState?.text) && (
          <div
            className={`mt-3 rounded-lg border px-3 py-2 text-left text-xs ${
              uploadState?.phase === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : uploadState?.validationStatus === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-cyan-200 bg-cyan-50 text-cyan-700"
            }`}
          >
            {uploadState.text}
          </div>
        )}

        {errors.length > 0 && (
          <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left text-xs text-rose-700">
            <p className="font-semibold">Errores de backend</p>
            <ul className="mt-1 space-y-1">
              {errors.map((issue, index) => (
                <li key={`upload-error-${index}`}>{parseIssue(issue)}</li>
              ))}
            </ul>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-700">
            <p className="font-semibold">Warnings de backend</p>
            <ul className="mt-1 space-y-1">
              {warnings.map((issue, index) => (
                <li key={`upload-warning-${index}`}>{parseIssue(issue)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

