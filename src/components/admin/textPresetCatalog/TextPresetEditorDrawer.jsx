import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeInvitationType } from "@/domain/invitationTypes";
import { ALL_FONTS } from "@/config/fonts";

const CATEGORY_OPTIONS = ["boda", "quince", "cumple", "empresarial", "general"];

function normalizeString(value) {
  return String(value || "").trim();
}

function slugify(value) {
  return normalizeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function defaultItem(index = 0) {
  return {
    id: `item-${index + 1}`,
    texto: index === 0 ? "Nuevo texto" : `Texto ${index + 1}`,
    x: 0,
    y: index * 40,
    fontFamily: "sans-serif",
    fontSize: index === 0 ? 32 : 22,
    color: "#111111",
    align: "left",
    fontWeight: "normal",
    lineHeight: 1.2,
    letterSpacing: 0,
    italic: false,
    uppercase: false,
  };
}

function normalizeDraft(source) {
  const safe = source || {};
  const itemsRaw = Array.isArray(safe.items) ? safe.items : [];
  const items = itemsRaw.length
    ? itemsRaw.map((item, index) => ({
        id: normalizeString(item?.id || `item-${index + 1}`) || `item-${index + 1}`,
        texto: String(item?.texto || ""),
        x: Number.isFinite(Number(item?.x)) ? Number(item.x) : 0,
        y: Number.isFinite(Number(item?.y)) ? Number(item.y) : index * 40,
        fontFamily: normalizeString(item?.fontFamily || "sans-serif") || "sans-serif",
        fontSize: Number.isFinite(Number(item?.fontSize)) ? Number(item.fontSize) : 24,
        color: normalizeString(item?.color || "#000000") || "#000000",
        align: ["left", "center", "right"].includes(String(item?.align || "").toLowerCase())
          ? String(item.align).toLowerCase()
          : "left",
        fontWeight: normalizeString(item?.fontWeight || "normal") || "normal",
        lineHeight:
          Number.isFinite(Number(item?.lineHeight)) && Number(item?.lineHeight) > 0
            ? Number(item.lineHeight)
            : 1.2,
        letterSpacing: Number.isFinite(Number(item?.letterSpacing)) ? Number(item.letterSpacing) : 0,
        italic: item?.italic === true,
        uppercase: item?.uppercase === true,
      }))
    : [defaultItem(0)];

  const tipo = String(safe.tipo || (items.length > 1 ? "compuesto" : "simple")).toLowerCase() === "compuesto"
    ? "compuesto"
    : "simple";

  return {
    id: safe.id || null,
    nombre: normalizeString(safe.nombre || ""),
    slug: normalizeString(safe.slug || ""),
    tipo,
    categoria: normalizeInvitationType(safe.categoria),
    tagsInput: Array.isArray(safe.tags) ? safe.tags.join(", ") : normalizeString(safe.tags || ""),
    activo: safe.activo !== false,
    mostrarEnEditor: safe.mostrarEnEditor !== false,
    orden: Number.isFinite(Number(safe.orden)) ? Number(safe.orden) : 0,
    items: tipo === "simple" ? [items[0]] : items,
  };
}

let previewMeasureCtx = null;
function getPreviewMeasureCtx() {
  if (typeof document === "undefined") return null;
  if (previewMeasureCtx) return previewMeasureCtx;
  const canvas = document.createElement("canvas");
  previewMeasureCtx = canvas.getContext("2d");
  return previewMeasureCtx;
}

function normalizeAlign(value) {
  const raw = String(value || "left").toLowerCase();
  if (raw === "center" || raw === "right") return raw;
  return "left";
}

function buildFontString({
  fontStyle = "normal",
  fontWeight = "normal",
  fontSize = 24,
  fontFamily = "sans-serif",
}) {
  const style = fontStyle && fontStyle !== "normal" ? `${fontStyle} ` : "";
  const weight = fontWeight && fontWeight !== "normal" ? `${fontWeight} ` : "";
  return `${style}${weight}${Number(fontSize)}px ${fontFamily}`;
}

function measureTextWidth(texto, fontDesc, letterSpacing = 0) {
  const safeText = String(texto ?? "").replace(/\r\n/g, "\n");
  const safeSpacing = Number(letterSpacing) || 0;
  const lines = safeText.split("\n");
  const ctx = getPreviewMeasureCtx();

  if (!ctx) {
    const safeSize = Number(fontDesc?.fontSize) || 24;
    return Math.max(
      ...lines.map((line) => {
        const safeLine = String(line || "");
        return Math.max(
          20,
          safeLine.length * (safeSize * 0.56) + Math.max(0, safeLine.length - 1) * safeSpacing
        );
      }),
      20
    );
  }

  ctx.font = buildFontString(fontDesc);
  return Math.max(
    ...lines.map((line) => {
      const safeLine = String(line || "");
      const baseWidth = ctx.measureText(safeLine).width;
      const spacingExtra = Math.max(0, safeLine.length - 1) * safeSpacing;
      return Math.max(20, baseWidth + spacingExtra);
    }),
    20
  );
}

function buildPreviewLayout(items) {
  const sourceItems = Array.isArray(items) ? items : [];
  if (!sourceItems.length) {
    return {
      minX: 0,
      minY: 0,
      maxX: 260,
      maxY: 120,
      width: 260,
      height: 120,
      scale: 1,
      items: [],
    };
  }

  const positioned = sourceItems.map((item, index) => {
    const x = Number.isFinite(Number(item?.x)) ? Number(item.x) : 0;
    const y = Number.isFinite(Number(item?.y)) ? Number(item.y) : 0;
    const fontSize = Number.isFinite(Number(item?.fontSize)) ? Number(item.fontSize) : 24;
    const lineHeight =
      Number.isFinite(Number(item?.lineHeight)) && Number(item?.lineHeight) > 0
        ? Number(item.lineHeight)
        : 1.2;
    const letterSpacing = Number.isFinite(Number(item?.letterSpacing)) ? Number(item.letterSpacing) : 0;
    const align = normalizeAlign(item?.align || item?.textAlign);
    const text = item?.uppercase === true ? String(item?.texto || "").toUpperCase() : String(item?.texto || "");

    const width = measureTextWidth(
      text,
      {
        fontFamily: item?.fontFamily || "sans-serif",
        fontSize,
        fontWeight: item?.fontWeight || "normal",
        fontStyle: item?.italic ? "italic" : "normal",
      },
      letterSpacing
    );

    const linesCount = Math.max(1, text.split(/\r?\n/).length);
    const height = Math.max(fontSize, fontSize * lineHeight * linesCount);
    const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
    const right = left + width;

    return {
      key: item?.id || `item-${index + 1}`,
      index,
      xAnchor: x,
      yAnchor: y,
      left,
      right,
      width,
      height,
      text,
      align,
      fontFamily: item?.fontFamily || "sans-serif",
      fontSize,
      fontWeight: item?.fontWeight || "normal",
      fontStyle: item?.italic ? "italic" : "normal",
      lineHeight,
      letterSpacing,
      color: item?.color || "#111111",
    };
  });

  const minX = positioned.reduce((acc, entry) => Math.min(acc, entry.left), Number.POSITIVE_INFINITY);
  const minY = positioned.reduce((acc, entry) => Math.min(acc, entry.yAnchor), Number.POSITIVE_INFINITY);
  const maxX = positioned.reduce((acc, entry) => Math.max(acc, entry.right), Number.NEGATIVE_INFINITY);
  const maxY = positioned.reduce(
    (acc, entry) => Math.max(acc, entry.yAnchor + entry.height),
    Number.NEGATIVE_INFINITY
  );

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return {
      minX: 0,
      minY: 0,
      maxX: 260,
      maxY: 120,
      width: 260,
      height: 120,
      scale: 1,
      items: positioned,
    };
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const scale = Math.min(1, 260 / width, 120 / height);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    scale,
    items: positioned,
  };
}

export default function TextPresetEditorDrawer({
  preset,
  saving,
  onClose,
  onSave,
}) {
  const [formState, setFormState] = useState(() => normalizeDraft(preset));
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [localError, setLocalError] = useState("");
  const previewRef = useRef(null);
  const dragStateRef = useRef({
    active: false,
    itemIndex: -1,
    pointerId: null,
    anchorDeltaX: 0,
    anchorDeltaY: 0,
  });

  useEffect(() => {
    if (!preset) return;
    const normalized = normalizeDraft(preset);
    setFormState(normalized);
    setSelectedItemIndex(0);
    setLocalError("");
  }, [preset]);

  const previewMetrics = useMemo(
    () => buildPreviewLayout(Array.isArray(formState?.items) ? formState.items : []),
    [formState?.items]
  );

  useEffect(() => {
    const active = dragStateRef.current;
    if (!active.active) return;

    const handleMove = (event) => {
      if (!dragStateRef.current.active) return;
      const container = previewRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const safeScale = Math.max(0.2, previewMetrics.scale);
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const pointerRawX = (event.clientX - centerX) / safeScale + previewMetrics.width / 2;
      const pointerRawY = (event.clientY - centerY) / safeScale + previewMetrics.height / 2;
      const nextAnchorRawX = pointerRawX - dragStateRef.current.anchorDeltaX;
      const nextAnchorRawY = pointerRawY - dragStateRef.current.anchorDeltaY;

      setFormState((prev) => {
        const items = Array.isArray(prev.items) ? [...prev.items] : [];
        const index = dragStateRef.current.itemIndex;
        if (!items[index]) return prev;

        const current = items[index];
        const nextX = Math.round(nextAnchorRawX + previewMetrics.minX);
        const nextY = Math.round(nextAnchorRawY + previewMetrics.minY);

        items[index] = {
          ...current,
          x: nextX,
          y: nextY,
        };

        return { ...prev, items };
      });
    };

    const handleUp = () => {
      dragStateRef.current = {
        active: false,
        itemIndex: -1,
        pointerId: null,
        anchorDeltaX: 0,
        anchorDeltaY: 0,
      };
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [previewMetrics]);

  const selectedItem = formState.items[selectedItemIndex] || formState.items[0] || defaultItem(0);

  const fontSelectOptions = useMemo(() => {
    const source = Array.isArray(ALL_FONTS) ? ALL_FONTS : [];
    const options = [];
    const seen = new Set();

    source.forEach((font) => {
      const value = normalizeString(font?.valor);
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      options.push({
        nombre: normalizeString(font?.nombre) || value,
        valor: value,
      });
    });

    const currentValue = normalizeString(selectedItem?.fontFamily);
    const hasCurrent = currentValue && seen.has(currentValue.toLowerCase());

    if (currentValue && !hasCurrent) {
      options.unshift({
        nombre: `${currentValue} (legacy)`,
        valor: currentValue,
      });
    }

    return options;
  }, [selectedItem?.fontFamily]);

  const updateField = (key, value) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const updateSelectedItem = (patch) => {
    setFormState((prev) => {
      const items = Array.isArray(prev.items) ? [...prev.items] : [];
      const index = Math.max(0, Math.min(selectedItemIndex, items.length - 1));
      if (!items[index]) return prev;

      items[index] = {
        ...items[index],
        ...patch,
      };

      return {
        ...prev,
        items,
      };
    });
  };

  const addItem = () => {
    setFormState((prev) => {
      const items = Array.isArray(prev.items) ? [...prev.items] : [];
      items.push(defaultItem(items.length));
      return {
        ...prev,
        tipo: "compuesto",
        items,
      };
    });

    setSelectedItemIndex((prev) => prev + 1);
  };

  const removeItem = (indexToRemove) => {
    setFormState((prev) => {
      const items = Array.isArray(prev.items) ? [...prev.items] : [];
      if (items.length <= 1) return prev;

      items.splice(indexToRemove, 1);
      if (!items.length) items.push(defaultItem(0));

      return {
        ...prev,
        tipo: items.length > 1 ? "compuesto" : "simple",
        items,
      };
    });

    setSelectedItemIndex((prev) => {
      if (prev > indexToRemove) return prev - 1;
      return Math.max(0, prev - (prev === indexToRemove ? 1 : 0));
    });
  };

  const handleTipoChange = (nextTipo) => {
    const tipo = nextTipo === "compuesto" ? "compuesto" : "simple";
    setFormState((prev) => {
      const items = Array.isArray(prev.items) ? [...prev.items] : [];
      if (tipo === "simple") {
        return {
          ...prev,
          tipo,
          items: [items[0] || defaultItem(0)],
        };
      }

      if (items.length >= 2) {
        return {
          ...prev,
          tipo,
          items,
        };
      }

      return {
        ...prev,
        tipo,
        items: [items[0] || defaultItem(0), defaultItem(1)],
      };
    });
    setSelectedItemIndex(0);
  };

  const submit = async (event) => {
    event.preventDefault();

    const nombre = normalizeString(formState.nombre);
    if (!nombre) {
      setLocalError("El nombre es obligatorio.");
      return;
    }

    const slug = slugify(formState.slug || nombre);
    if (!slug) {
      setLocalError("El slug es obligatorio.");
      return;
    }

    const categoria = normalizeInvitationType(formState.categoria);
    const tags = normalizeString(formState.tagsInput)
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);

    const items = (Array.isArray(formState.items) ? formState.items : [])
      .map((item, index) => ({
        ...item,
        id: normalizeString(item.id || `item-${index + 1}`) || `item-${index + 1}`,
        texto: String(item.texto || ""),
        x: Number.isFinite(Number(item.x)) ? Number(item.x) : 0,
        y: Number.isFinite(Number(item.y)) ? Number(item.y) : 0,
        fontFamily: normalizeString(item.fontFamily || "sans-serif") || "sans-serif",
        fontSize: Math.max(8, Math.min(240, Math.round(Number(item.fontSize) || 24))),
        color: normalizeString(item.color || "#000000") || "#000000",
        align: ["left", "center", "right"].includes(String(item.align || "").toLowerCase())
          ? String(item.align).toLowerCase()
          : "left",
        fontWeight: normalizeString(item.fontWeight || "normal") || "normal",
        lineHeight: Number.isFinite(Number(item.lineHeight)) ? Number(item.lineHeight) : 1.2,
        letterSpacing: Number.isFinite(Number(item.letterSpacing)) ? Number(item.letterSpacing) : 0,
        italic: item.italic === true,
        uppercase: item.uppercase === true,
      }))
      .filter((item) => item.id);

    if (!items.length) {
      setLocalError("Agrega al menos un texto al preset.");
      return;
    }

    const tipo = formState.tipo === "compuesto" && items.length > 1 ? "compuesto" : "simple";

    setLocalError("");
    await onSave?.({
      id: formState.id || null,
      slug,
      nombre,
      tipo,
      categoria,
      tags,
      activo: formState.activo === true,
      mostrarEnEditor: formState.mostrarEnEditor === true,
      orden: Number.isFinite(Number(formState.orden)) ? Number(formState.orden) : 0,
      items: tipo === "simple" ? [items[0]] : items,
    });
  };

  if (!preset) return null;

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        aria-label="Cerrar panel de edicion"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/35"
      />

      <aside className="absolute right-0 top-0 h-full w-full max-w-[740px] overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-xl sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3 text-left">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {formState.id ? "Editar preset de texto" : "Nuevo preset de texto"}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Define contenido y estilo inicial para el panel Texto del editor.
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
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Nombre
              </span>
              <input
                type="text"
                value={formState.nombre}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setFormState((prev) => ({
                    ...prev,
                    nombre: nextName,
                    slug: prev.id ? prev.slug : slugify(nextName),
                  }));
                }}
                maxLength={120}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Slug
              </span>
              <input
                type="text"
                value={formState.slug}
                onChange={(event) => updateField("slug", slugify(event.target.value))}
                maxLength={80}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tipo
              </span>
              <select
                value={formState.tipo}
                onChange={(event) => handleTipoChange(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              >
                <option value="simple">Simple</option>
                <option value="compuesto">Compuesto</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Categoria
              </span>
              <select
                value={formState.categoria}
                onChange={(event) => updateField("categoria", normalizeInvitationType(event.target.value))}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              >
                {CATEGORY_OPTIONS.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tags
              </span>
              <input
                type="text"
                value={formState.tagsInput}
                onChange={(event) => updateField("tagsInput", event.target.value)}
                placeholder="ej: elegante, floral"
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Orden
              </span>
              <input
                type="number"
                min={-9999}
                max={9999}
                value={formState.orden}
                onChange={(event) => updateField("orden", Number(event.target.value))}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={formState.activo === true}
                onChange={(event) => updateField("activo", event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-200"
              />
              Preset activo
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={formState.mostrarEnEditor === true}
                onChange={(event) => updateField("mostrarEnEditor", event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-200"
              />
              Mostrar en editor
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Items del preset
              </p>
              {formState.tipo === "compuesto" && (
                <button
                  type="button"
                  onClick={addItem}
                  className="rounded-md border border-cyan-300 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-700 hover:bg-cyan-100"
                >
                  Agregar item
                </button>
              )}
            </div>

            <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-1">
                {(formState.items || []).map((item, index) => (
                  <div key={item.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedItemIndex(index)}
                      className={`flex-1 rounded-md border px-2 py-1 text-left text-xs transition ${
                        selectedItemIndex === index
                          ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <p className="truncate font-semibold">{item.id}</p>
                      <p className="truncate text-[10px]">{item.texto || "Sin texto"}</p>
                    </button>
                    {formState.tipo === "compuesto" && formState.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100"
                        title="Eliminar item"
                      >
                        x
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Texto por defecto
                    </span>
                    <textarea
                      value={selectedItem.texto}
                      onChange={(event) => updateSelectedItem({ texto: event.target.value })}
                      rows={2}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                    />
                  </label>

                                    <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fuente</span>
                    <select
                      value={selectedItem.fontFamily || "sans-serif"}
                      onChange={(event) => updateSelectedItem({ fontFamily: event.target.value })}
                      className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                    >
                      {fontSelectOptions.map((option) => (
                        <option key={`font-option-${option.valor}`} value={option.valor}>
                          {option.nombre}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tamano</span>
                    <input
                      type="number"
                      min={8}
                      max={240}
                      value={selectedItem.fontSize}
                      onChange={(event) => updateSelectedItem({ fontSize: Number(event.target.value) })}
                      className="h-9 w-full rounded-lg border border-slate-300 px-2 text-xs text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Color</span>
                    <input
                      type="text"
                      value={selectedItem.color}
                      onChange={(event) => updateSelectedItem({ color: event.target.value })}
                      className="h-9 w-full rounded-lg border border-slate-300 px-2 text-xs text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Alineacion</span>
                    <select
                      value={selectedItem.align}
                      onChange={(event) => updateSelectedItem({ align: event.target.value })}
                      className="h-9 w-full rounded-lg border border-slate-300 px-2 text-xs text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                    >
                      <option value="left">left</option>
                      <option value="center">center</option>
                      <option value="right">right</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Font weight</span>
                    <input
                      type="text"
                      value={selectedItem.fontWeight}
                      onChange={(event) => updateSelectedItem({ fontWeight: event.target.value })}
                      className="h-9 w-full rounded-lg border border-slate-300 px-2 text-xs text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Line height</span>
                    <input
                      type="number"
                      min={0.6}
                      max={4}
                      step={0.05}
                      value={selectedItem.lineHeight}
                      onChange={(event) => updateSelectedItem({ lineHeight: Number(event.target.value) })}
                      className="h-9 w-full rounded-lg border border-slate-300 px-2 text-xs text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Letter spacing</span>
                    <input
                      type="number"
                      min={-10}
                      max={30}
                      step={0.1}
                      value={selectedItem.letterSpacing}
                      onChange={(event) => updateSelectedItem({ letterSpacing: Number(event.target.value) })}
                      className="h-9 w-full rounded-lg border border-slate-300 px-2 text-xs text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">X</span>
                    <input
                      type="number"
                      value={selectedItem.x}
                      onChange={(event) => updateSelectedItem({ x: Number(event.target.value) })}
                      className="h-9 w-full rounded-lg border border-slate-300 px-2 text-xs text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Y</span>
                    <input
                      type="number"
                      value={selectedItem.y}
                      onChange={(event) => updateSelectedItem({ y: Number(event.target.value) })}
                      className="h-9 w-full rounded-lg border border-slate-300 px-2 text-xs text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedItem.italic === true}
                      onChange={(event) => updateSelectedItem({ italic: event.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-200"
                    />
                    Italic
                  </label>

                  <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedItem.uppercase === true}
                      onChange={(event) => updateSelectedItem({ uppercase: event.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-200"
                    />
                    Uppercase inicial
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Preview en tiempo real</p>
              <div
                ref={previewRef}
                className="relative h-[180px] overflow-hidden rounded border border-dashed border-slate-300 bg-slate-50"
              >
                <div
                  className="absolute left-1/2 top-1/2"
                  style={{
                    width: previewMetrics.width,
                    height: previewMetrics.height,
                    transform: `translate(-50%, -50%) scale(${previewMetrics.scale})`,
                    transformOrigin: "center",
                  }}
                >
                  {previewMetrics.items.map((item) => {
                    const localLeft = item.left - previewMetrics.minX;
                    const localTop = item.yAnchor - previewMetrics.minY;
                    const isSelected = selectedItemIndex === item.index;

                    return (
                      <p
                        key={item.key}
                        className={`absolute m-0 cursor-move select-none whitespace-pre rounded px-1 ${
                          isSelected ? "ring-1 ring-cyan-500" : ""
                        }`}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          const container = previewRef.current;
                          if (!container) return;

                          setSelectedItemIndex(item.index);

                          const rect = container.getBoundingClientRect();
                          const safeScale = Math.max(0.2, previewMetrics.scale);
                          const centerX = rect.left + rect.width / 2;
                          const centerY = rect.top + rect.height / 2;
                          const pointerRawX = (event.clientX - centerX) / safeScale + previewMetrics.width / 2;
                          const pointerRawY = (event.clientY - centerY) / safeScale + previewMetrics.height / 2;
                          const anchorRawX = item.xAnchor - previewMetrics.minX;
                          const anchorRawY = item.yAnchor - previewMetrics.minY;

                          dragStateRef.current = {
                            active: true,
                            itemIndex: item.index,
                            pointerId: event.pointerId,
                            anchorDeltaX: pointerRawX - anchorRawX,
                            anchorDeltaY: pointerRawY - anchorRawY,
                          };
                        }}
                        style={{
                          left: localLeft,
                          top: localTop,
                          width: item.width,
                          fontFamily: item.fontFamily,
                          fontSize: item.fontSize,
                          fontWeight: item.fontWeight,
                          fontStyle: item.fontStyle,
                          lineHeight: item.lineHeight,
                          letterSpacing: item.letterSpacing,
                          color: item.color,
                          textAlign: item.align,
                        }}
                      >
                        {item.text || " "}
                      </p>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {localError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {localError}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="h-10 w-full rounded-lg border border-cyan-600 bg-cyan-600 px-3 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar preset"}
          </button>
        </form>
      </aside>
    </div>
  );
}






