import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, LayoutTemplate, Plus, Save, Trash2 } from "lucide-react";
import { buildPublishedTagStats, normalizeDashboardHomeConfig } from "@/domain/dashboard/homeModel";
import { getDashboardHomeConfig, upsertDashboardHomeConfig } from "@/domain/dashboard/service";
import { listTemplateTagsAdmin, listTemplatesAdmin } from "@/domain/templates/adminService";

function normalizeText(value) {
  return String(value || "").trim();
}

function createCategoryRow(order = 10) {
  return {
    id: `categoria-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tagSlug: "",
    tagLabel: "",
    active: true,
    order,
  };
}

function reorderRows(rows, fromIndex, toIndex) {
  const safeRows = Array.isArray(rows) ? [...rows] : [];
  if (fromIndex < 0 || toIndex < 0) return safeRows;
  if (fromIndex >= safeRows.length || toIndex >= safeRows.length) return safeRows;

  const [moved] = safeRows.splice(fromIndex, 1);
  safeRows.splice(toIndex, 0, moved);

  return safeRows.map((row, index) => ({
    ...row,
    order: (index + 1) * 10,
  }));
}

function buildValidationError(config) {
  const normalized = normalizeDashboardHomeConfig(config);
  const rawCategoryRows = Array.isArray(config?.categoryRows) ? config.categoryRows : [];
  const seen = new Set();

  if (normalized.featuredRow.active && !normalized.featuredRow.tagSlug) {
    return "Plantillas destacadas debe usar una etiqueta existente.";
  }

  if (normalized.featuredRow.active && normalized.featuredRow.tagSlug) {
    seen.add(normalized.featuredRow.tagSlug);
  }

  const hasEmptyRawCategory = rawCategoryRows.some(
    (row) => !normalizeText(row?.tagSlug)
  );
  if (hasEmptyRawCategory) {
    return "Cada categoria del dashboard debe seleccionar una etiqueta existente antes de guardar.";
  }

  for (const row of normalized.categoryRows) {
    if (!row.tagSlug) {
      return "Cada categoria del dashboard debe usar una etiqueta existente.";
    }
    if (seen.has(row.tagSlug)) {
      return `La etiqueta "${row.tagSlug}" esta repetida en la configuracion del dashboard.`;
    }
    seen.add(row.tagSlug);
  }

  return "";
}

function TagSelect({
  value,
  options,
  onChange,
  disabled = false,
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange?.(event.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#d0b8f4] focus:ring-2 focus:ring-[#eadffd] disabled:cursor-not-allowed disabled:bg-slate-100"
    >
      <option value="">Selecciona una etiqueta</option>
      {options.map((option) => (
        <option key={option.slug} value={option.slug}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export default function DashboardHomeConfigPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [availableTags, setAvailableTags] = useState([]);
  const [publishedTemplates, setPublishedTemplates] = useState([]);
  const [formState, setFormState] = useState(() => normalizeDashboardHomeConfig(null));

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setError("");

      try {
        const [config, tagsResult, templatesResult] = await Promise.all([
          getDashboardHomeConfig(),
          listTemplateTagsAdmin({}),
          listTemplatesAdmin({}),
        ]);

        if (cancelled) return;

        const tags = Array.isArray(tagsResult?.items)
          ? tagsResult.items
              .map((item) => ({
                slug: normalizeText(item?.slug),
                label: normalizeText(item?.label) || normalizeText(item?.slug),
              }))
              .filter((item) => item.slug && item.label)
          : [];

        const activeTemplates = Array.isArray(templatesResult?.items)
          ? templatesResult.items.filter(
              (item) =>
                normalizeText(item?.estadoEditorial).toLowerCase() === "publicada"
            )
          : [];

        setAvailableTags(tags);
        setPublishedTemplates(activeTemplates);
        setFormState(normalizeDashboardHomeConfig(config));
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError?.message ||
            "No se pudo cargar la configuracion del home del dashboard."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const publishedTagStats = useMemo(
    () => buildPublishedTagStats(publishedTemplates),
    [publishedTemplates]
  );

  const featuredWarning =
    formState?.featuredRow?.tagSlug &&
    !publishedTagStats.get(formState.featuredRow.tagSlug)
      ? "La etiqueta seleccionada no tiene plantillas publicadas visibles hoy."
      : "";

  const handleFeaturedToggle = () => {
    setFormState((previous) => ({
      ...previous,
      featuredRow: {
        ...previous.featuredRow,
        active: !previous.featuredRow.active,
      },
    }));
  };

  const handleFeaturedTagChange = (tagSlug) => {
    const matchedTag = availableTags.find((tag) => tag.slug === tagSlug);
    setFormState((previous) => ({
      ...previous,
      featuredRow: {
        active: Boolean(tagSlug),
        tagSlug,
        tagLabel: matchedTag?.label || "",
      },
    }));
  };

  const handleCategoryChange = (rowId, patch) => {
    setFormState((previous) => ({
      ...previous,
      categoryRows: previous.categoryRows.map((row) => {
        if (row.id !== rowId) return row;

        const nextTagSlug =
          typeof patch.tagSlug === "string" ? patch.tagSlug : row.tagSlug;
        const matchedTag = availableTags.find((tag) => tag.slug === nextTagSlug);

        return {
          ...row,
          ...patch,
          tagSlug: nextTagSlug,
          tagLabel:
            typeof patch.tagSlug === "string"
              ? matchedTag?.label || ""
              : row.tagLabel || "",
        };
      }),
    }));
  };

  const handleAddCategory = () => {
    setFormState((previous) => ({
      ...previous,
      categoryRows: [
        ...previous.categoryRows,
        createCategoryRow((previous.categoryRows.length + 1) * 10),
      ],
    }));
  };

  const handleRemoveCategory = (rowId) => {
    setFormState((previous) => ({
      ...previous,
      categoryRows: previous.categoryRows
        .filter((row) => row.id !== rowId)
        .map((row, index) => ({
          ...row,
          order: (index + 1) * 10,
        })),
    }));
  };

  const handleMoveCategory = (rowIndex, direction) => {
    setFormState((previous) => ({
      ...previous,
      categoryRows: reorderRows(
        previous.categoryRows,
        rowIndex,
        direction === "up" ? rowIndex - 1 : rowIndex + 1
      ),
    }));
  };

  const handleSave = async () => {
    const validationError = buildValidationError(formState);
    if (validationError) {
      setError(validationError);
      setSuccess("");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const savedConfig = await upsertDashboardHomeConfig({
        featuredRow: formState.featuredRow,
        categoryRows: formState.categoryRows,
      });
      setFormState(normalizeDashboardHomeConfig(savedConfig));
      setSuccess("La configuracion editorial del dashboard se guardo correctamente.");
    } catch (saveError) {
      setError(
        saveError?.message ||
          "No se pudo guardar la configuracion del home del dashboard."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Cargando configuracion del home del dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#e7dcfb] bg-gradient-to-br from-white via-[#faf6ff] to-[#f4f8ff] p-5 shadow-[0_14px_40px_rgba(111,59,192,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#dcc8fb] bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f3bc0]">
              <LayoutTemplate className="h-3.5 w-3.5" />
              Home del dashboard
            </div>
            <h2 className="mt-3 text-xl font-semibold text-slate-900">
              Gestion editorial de filas del dashboard
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Usa solo etiquetas existentes para definir Plantillas destacadas y el orden de las categorias visibles.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl border border-[#7e4dc6]/35 bg-gradient-to-r from-[#8a57cf] via-[#773dbe] to-[#6433b0] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(119,61,190,0.24)] transition hover:-translate-y-[1px] disabled:cursor-wait disabled:opacity-70"
          >
            <Save className="h-4 w-4" />
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Plantillas destacadas</h3>
            <p className="mt-1 text-sm text-slate-600">
              Esta fila usa una sola etiqueta existente y aparece antes que las categorias.
            </p>
          </div>
          <button
            type="button"
            onClick={handleFeaturedToggle}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${
              formState.featuredRow.active
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {formState.featuredRow.active ? "Activa" : "Inactiva"}
          </button>
        </div>

        <div className="mt-4 max-w-xl">
          <TagSelect
            value={formState.featuredRow.tagSlug}
            options={availableTags}
            onChange={handleFeaturedTagChange}
          />
        </div>

        {featuredWarning ? (
          <p className="mt-3 text-sm text-amber-700">{featuredWarning}</p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Categorias del dashboard</h3>
            <p className="mt-1 text-sm text-slate-600">
              Define el orden editorial, activa o desactiva filas y elige solo entre etiquetas existentes.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddCategory}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Agregar categoria
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {formState.categoryRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
              Aun no configuraste categorias editoriales para el dashboard.
            </div>
          ) : (
            formState.categoryRows.map((row, index) => {
              const publishedCount = Number(publishedTagStats.get(row.tagSlug) || 0);
              const hasWarning = Boolean(row.tagSlug) && publishedCount === 0;

              return (
                <div
                  key={row.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          Posicion {index + 1}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                            row.active
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-slate-100 text-slate-600"
                          }`}
                        >
                          {row.active ? "Activa" : "Inactiva"}
                        </span>
                        {row.tagSlug ? (
                          <span className="rounded-full border border-[#dfcff8] bg-[#faf6ff] px-2.5 py-1 text-[11px] font-semibold text-[#6f3bc0]">
                            {row.tagLabel || row.tagSlug}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 max-w-xl">
                        <TagSelect
                          value={row.tagSlug}
                          options={availableTags}
                          onChange={(tagSlug) =>
                            handleCategoryChange(row.id, {
                              tagSlug,
                            })
                          }
                        />
                      </div>
                      {hasWarning ? (
                        <p className="mt-3 text-sm text-amber-700">
                          Esta etiqueta no tiene plantillas publicadas visibles hoy.
                        </p>
                      ) : row.tagSlug ? (
                        <p className="mt-3 text-sm text-slate-500">
                          Plantillas publicadas visibles para esta etiqueta: {publishedCount}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleCategoryChange(row.id, {
                            active: !row.active,
                          })
                        }
                        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${
                          row.active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        {row.active ? "Visible" : "Oculta"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveCategory(index, "up")}
                        disabled={index === 0}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Subir categoria"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveCategory(index, "down")}
                        disabled={index === formState.categoryRows.length - 1}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Bajar categoria"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveCategory(row.id)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100"
                        aria-label="Eliminar categoria"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
