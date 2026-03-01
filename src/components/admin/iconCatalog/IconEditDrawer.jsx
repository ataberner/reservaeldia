import { useEffect, useMemo, useState } from "react";
import { parseCategoriesInput } from "./iconCatalogMappers";

function normalizeString(value) {
  return String(value || "").trim();
}

function stringifyKeywords(list) {
  if (!Array.isArray(list)) return "";
  return list
    .map((entry) => normalizeString(entry))
    .filter(Boolean)
    .join(", ");
}

function stringifyCategories(icon) {
  return parseCategoriesInput([
    icon?.categoria,
    ...(Array.isArray(icon?.categorias) ? icon.categorias : []),
  ]).join(", ");
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

function renderValidationIssues(list) {
  const items = Array.isArray(list) ? list : [];
  if (!items.length) return null;
  return (
    <ul className="mt-1 space-y-1">
      {items.slice(0, 5).map((issue, index) => (
        <li key={`${issue?.code || "issue"}-${index}`} className="text-[11px]">
          {issue?.code ? `${issue.code}: ` : ""}{issue?.message || "Sin detalle"}
        </li>
      ))}
    </ul>
  );
}

export default function IconEditDrawer({
  open,
  icon,
  saving,
  onClose,
  onSave,
  categoryOptions = [],
}) {
  const [nombre, setNombre] = useState("");
  const [categoriasInput, setCategoriasInput] = useState("");
  const [keywordsInput, setKeywordsInput] = useState("");
  const [license, setLicense] = useState("");
  const [priority, setPriority] = useState("0");
  const [active, setActive] = useState(true);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open || !icon) return;
    setNombre(icon.nombre || "");
    setCategoriasInput(stringifyCategories(icon));
    setKeywordsInput(stringifyKeywords(icon.keywords));
    setLicense(icon.license || "");
    setPriority(String(icon.priority || 0));
    setActive(icon.isActive === true);
    setLocalError("");
  }, [open, icon]);

  const validationSummary = useMemo(() => {
    const validation = icon?.validation || null;
    return {
      status: validation?.status || "-",
      warnings: Array.isArray(validation?.warnings) ? validation.warnings : [],
      errors: Array.isArray(validation?.errors) ? validation.errors : [],
    };
  }, [icon]);

  const categoryPreview = useMemo(
    () => parseCategoriesInput(categoriasInput),
    [categoriasInput]
  );
  const availableCategories = useMemo(() => {
    return parseCategoriesInput(Array.isArray(categoryOptions) ? categoryOptions : []);
  }, [categoryOptions]);

  if (!open || !icon) return null;

  const submit = async (event) => {
    event.preventDefault();
    const parsedPriority = Number(priority);
    if (!normalizeString(nombre)) {
      setLocalError("El nombre es obligatorio.");
      return;
    }
    if (!Number.isFinite(parsedPriority)) {
      setLocalError("El orden debe ser numerico.");
      return;
    }

    setLocalError("");
    await onSave?.({
      iconId: icon.id,
      nombre,
      categoria: categoryPreview[0] || "",
      categoriasInput,
      keywordsInput,
      license,
      priority: parsedPriority,
      active,
    });
  };

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        aria-label="Cerrar panel de edicion"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/35"
      />

      <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-xl sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3 text-left">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Editar icono</h2>
            <p className="mt-1 text-xs text-slate-600">
              Actualiza metadatos sin re-subir el archivo.
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

        <form onSubmit={submit} className="space-y-3 text-left">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Nombre
            </span>
            <input
              type="text"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              maxLength={140}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Categorias
            </span>
            <input
              type="text"
              value={categoriasInput}
              onChange={(event) => setCategoriasInput(event.target.value)}
              list="icon-edit-category-options"
              placeholder="ej: baby shower, floral, infantil"
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
            <datalist id="icon-edit-category-options">
              {availableCategories.map((entry) => (
                <option key={`edit-cat-option-${entry}`} value={entry} />
              ))}
            </datalist>
            <p className="mt-1 text-[11px] text-slate-500">
              Separadas por coma. La primera se usa como categoria principal.
            </p>
            {availableCategories.length > 0 && (
              <div className="mt-1.5 max-h-24 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-1.5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Categorias vigentes
                </p>
                <div className="flex flex-wrap gap-1">
                  {availableCategories.map((entry) => {
                    const selected = categoryPreview.some(
                      (category) =>
                        normalizeString(category).toLowerCase() ===
                        entry.toLowerCase()
                    );
                    return (
                      <button
                        key={`edit-cat-chip-${entry}`}
                        type="button"
                        onClick={() =>
                          setCategoriasInput((prev) =>
                            toggleCategoryToken(prev, entry)
                          )
                        }
                        className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
                          selected
                            ? "border-teal-600 bg-teal-600 text-white"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {entry}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {categoryPreview.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {categoryPreview.map((category) => (
                  <span
                    key={category}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-700"
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
              placeholder="ej: wedding, flores, clasico"
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
              placeholder="ej: uso interno, free, premium"
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

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-200"
            />
            Icono activo
          </label>

          {localError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {localError}
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Estado tecnico
            </p>
            <p className="mt-1 text-xs text-slate-700">
              Validacion: <strong>{validationSummary.status}</strong>
            </p>
            {validationSummary.errors.length > 0 && (
              <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">
                <p className="text-[11px] font-semibold">Errores</p>
                {renderValidationIssues(validationSummary.errors)}
              </div>
            )}
            {validationSummary.warnings.length > 0 && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
                <p className="text-[11px] font-semibold">Warnings</p>
                {renderValidationIssues(validationSummary.warnings)}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="h-10 w-full rounded-lg border border-teal-600 bg-teal-600 px-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>
      </aside>
    </div>
  );
}
