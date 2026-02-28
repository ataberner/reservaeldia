import { useEffect, useMemo, useState } from "react";
import CountdownPresetLivePreview from "@/components/admin/countdown/CountdownPresetLivePreview";
import SvgUploadInspector from "@/components/admin/countdown/SvgUploadInspector";
import UnifiedColorPicker from "@/components/color/UnifiedColorPicker";
import {
  COUNTDOWN_DISTRIBUTIONS,
  COUNTDOWN_ENTRY_ANIMATIONS,
  COUNTDOWN_EVENT_CATEGORIES,
  COUNTDOWN_FRAME_ANIMATIONS,
  COUNTDOWN_LAYOUT_TYPES,
  COUNTDOWN_STYLE_CATEGORIES,
  COUNTDOWN_TICK_ANIMATIONS,
  COUNTDOWN_UNITS,
  createDefaultCountdownPresetConfig,
} from "@/domain/countdownPresets/contract";
import { createFutureDateISO, generateCountdownThumbnailDataUrl } from "@/domain/countdownPresets/renderModel";
import { normalizeCountdownCategory, validateCountdownPresetInput } from "@/domain/countdownPresets/validators";

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function getErrorMessage(error, fallback) {
  const message = error?.message || error?.details?.message || error?.details || fallback;
  return typeof message === "string" ? message : fallback;
}

function fileNameFromStoragePath(pathname) {
  const safe = String(pathname || "").trim();
  if (!safe) return "";
  const split = safe.split("/");
  return split[split.length - 1] || safe;
}

function dataUrlToBase64(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const parts = dataUrl.split(",");
  return parts.length < 2 ? null : parts[1] || null;
}

function isLegacyPresetSource(preset) {
  if (preset?.legacyPresetProps && typeof preset.legacyPresetProps === "object") {
    return true;
  }
  const migrationSource = String(preset?.metadata?.migrationSource || "");
  const isLegacySource = migrationSource.toLowerCase() === "legacy-config-v1";
  const activeVersion = Number(preset?.activeVersion || 0);
  const hasNoFrame = !String(preset?.svgRef?.storagePath || "").trim();
  return isLegacySource && activeVersion <= 1 && hasNoFrame;
}

function resolveArchiveActionLabel(preset) {
  if (!preset?.id) return "Archivar";
  if (preset?.estado === "published") return "Despublicar";
  if (preset?.estado === "archived" && Number(preset?.activeVersion || 0) > 0) return "Publicar";
  return "Archivar";
}

function buildUnitStyleFromLegacy(preset, fallback) {
  const legacy = preset?.legacyPresetProps;
  if (!legacy) return fallback;
  return {
    ...fallback,
    showLabels: legacy.showLabels !== false,
    separator: String(legacy.separator || "").slice(0, 4),
    boxBg: String(legacy.boxBg || fallback.boxBg),
    boxBorder: String(legacy.boxBorder || fallback.boxBorder),
    boxRadius: Number.isFinite(legacy.boxRadius) ? Number(legacy.boxRadius) : fallback.boxRadius,
    boxShadow: legacy.boxShadow === true,
  };
}

function buildStateFromPreset(preset) {
  const source = preset?.draft || preset || null;
  const defaults = createDefaultCountdownPresetConfig();
  const legacyUnit = buildUnitStyleFromLegacy(preset, defaults.unidad);
  const config = {
    ...defaults,
    layout: { ...defaults.layout, ...(source?.layout || {}) },
    tipografia: { ...defaults.tipografia, ...(source?.tipografia || {}) },
    colores: { ...defaults.colores, ...(source?.colores || {}) },
    animaciones: { ...defaults.animaciones, ...(source?.animaciones || {}) },
    unidad: { ...legacyUnit, ...(source?.unidad || {}) },
    tamanoBase: Number.isFinite(source?.tamanoBase) ? source.tamanoBase : defaults.tamanoBase,
  };

  const svgRef = source?.svgRef || preset?.svgRef || null;
  return {
    nombre: String(source?.nombre || preset?.nombre || ""),
    categoria: normalizeCountdownCategory(source?.categoria || preset?.categoria),
    config,
    svgAsset: svgRef
      ? {
          valid: true,
          fileName: fileNameFromStoragePath(svgRef.storagePath),
          mimeType: "image/svg+xml",
          byteSize: Number(svgRef.bytes || 0),
          svgText: typeof svgRef.svgText === "string" ? svgRef.svgText : "",
          svgBase64: null,
          previewUrl: svgRef.downloadUrl || null,
          downloadUrl: svgRef.downloadUrl || null,
          colorMode: svgRef.colorMode || "fixed",
          inspection: {
            warnings: [],
            criticalErrors: [],
            checks: {
              fileName: fileNameFromStoragePath(svgRef.storagePath),
              bytes: Number(svgRef.bytes || 0),
              viewBox: svgRef.viewBox || null,
              hasFixedDimensions: Boolean(svgRef.hasFixedDimensions),
              colorMode: svgRef.colorMode || "fixed",
            },
          },
          isDirty: false,
        }
      : null,
  };
}

function Card({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
      <h3 className="mb-1.5 text-xs font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

function resolvePaintMode(value) {
  const safe = String(value || "").trim().toLowerCase();
  if (!safe || safe === "transparent" || safe === "none") return "transparent";
  if (HEX_COLOR.test(safe)) return "color";
  return "advanced";
}

function resolveHexColor(value, fallback) {
  const safe = String(value || "").trim();
  return HEX_COLOR.test(safe) ? safe : fallback;
}

function PaintModeButton({ active, onClick, children, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
        active
          ? "bg-slate-800 text-white"
          : "bg-transparent text-slate-600 hover:bg-slate-100"
      } ${disabled ? "cursor-not-allowed opacity-50 hover:bg-transparent" : ""}`}
    >
      {children}
    </button>
  );
}

function UnitPaintField({
  label,
  value,
  onChange,
  colorFallback,
  advancedPlaceholder,
}) {
  const mode = resolvePaintMode(value);
  const colorValue = resolveHexColor(value, colorFallback);

  const setMode = (nextMode) => {
    if (nextMode === "transparent") {
      onChange("transparent");
      return;
    }
    if (nextMode === "color") {
      onChange(colorValue);
      return;
    }
    onChange(value && String(value).trim() ? String(value) : "rgba(15,23,42,0.12)");
  };

  return (
    <div className="space-y-1 text-[11px] font-medium text-slate-600">
      <span>{label}</span>
      <div className="grid grid-cols-3 rounded-lg border border-slate-300 bg-white p-0.5">
        <PaintModeButton active={mode === "transparent"} onClick={() => setMode("transparent")}>
          Transparente
        </PaintModeButton>
        <PaintModeButton active={mode === "color"} onClick={() => setMode("color")}>
          Color
        </PaintModeButton>
        <PaintModeButton active={mode === "advanced"} onClick={() => setMode("advanced")}>
          Avanzado
        </PaintModeButton>
      </div>

      {mode === "color" ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5">
          <span
            className="max-w-[110px] truncate text-[11px] font-semibold text-slate-700"
            title={colorValue}
          >
            {colorValue.toUpperCase()}
          </span>
          <UnifiedColorPicker
            value={colorValue}
            onChange={onChange}
            fallbackColor={colorFallback}
            panelWidth={272}
            showGradients={false}
            title={`Cambiar ${label.toLowerCase()}`}
            triggerClassName="h-7 w-7 rounded border border-slate-300"
          />
        </div>
      ) : null}

      {mode === "advanced" ? (
        <input
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
          placeholder={advancedPlaceholder}
        />
      ) : null}

      {mode === "transparent" ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-500">
          Sin color aplicado.
        </p>
      ) : null}
    </div>
  );
}

function ColorField({ label, value, onChange, fallback = "#111111" }) {
  const safePaint = String(value || "").trim() || fallback;
  const isGradient = safePaint.toLowerCase().startsWith("linear-gradient(");
  return (
    <label className="space-y-1 text-[11px] font-medium text-slate-600">
      <span>{label}</span>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5">
        <span
          className="max-w-[110px] truncate text-[11px] font-semibold text-slate-700"
          title={safePaint}
        >
          {isGradient ? "Gradiente" : safePaint.toUpperCase()}
        </span>
        <UnifiedColorPicker
          value={safePaint}
          onChange={onChange}
          fallbackColor={fallback}
          panelWidth={272}
          title={`Cambiar ${label.toLowerCase()}`}
          triggerClassName="h-7 w-7 rounded border border-slate-300"
        />
      </div>
    </label>
  );
}

function FrameColorField({
  value,
  onChange,
  disabled = false,
  helperText = "",
}) {
  const safeValue = String(value || "").trim();
  const isTransparent = safeValue.toLowerCase() === "transparent";
  const colorValue = isTransparent ? "#773dbe" : safeValue || "#773dbe";

  return (
    <div className="space-y-1 text-[11px] font-medium text-slate-600">
      <span>Color del frame</span>
      <div className="grid grid-cols-2 rounded-lg border border-slate-300 bg-white p-0.5">
        <PaintModeButton
          active={!isTransparent}
          onClick={() => onChange(colorValue)}
          disabled={disabled}
        >
          Color
        </PaintModeButton>
        <PaintModeButton
          active={isTransparent}
          onClick={() => onChange("transparent")}
          disabled={disabled}
        >
          Transparente
        </PaintModeButton>
      </div>

      {!isTransparent ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5">
          <span
            className="max-w-[110px] truncate text-[11px] font-semibold text-slate-700"
            title={colorValue}
          >
            {colorValue.toLowerCase().startsWith("linear-gradient(") ? "Gradiente" : colorValue.toUpperCase()}
          </span>
          <UnifiedColorPicker
            value={colorValue}
            onChange={onChange}
            fallbackColor="#773dbe"
            panelWidth={272}
            showGradients={false}
            title="Cambiar color del frame"
            disabled={disabled}
            triggerClassName="h-7 w-7 rounded border border-slate-300"
          />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-500">
          Sin borde general visible.
        </p>
      )}
      {helperText ? <p className="text-[11px] text-slate-500">{helperText}</p> : null}
    </div>
  );
}

export default function CountdownPresetForm({
  selectedPreset,
  saving,
  publishing,
  archiving,
  deleting,
  onSaveDraft,
  onPublishDraft,
  onToggleArchive,
  onDeletePreset,
  lastMessage,
}) {
  const [formState, setFormState] = useState(() => buildStateFromPreset(null));
  const [targetISO, setTargetISO] = useState(() => createFutureDateISO(45));
  const [errorMessage, setErrorMessage] = useState("");
  const [validationWarnings, setValidationWarnings] = useState([]);

  useEffect(() => {
    setFormState(buildStateFromPreset(selectedPreset));
    setErrorMessage("");
    setValidationWarnings([]);
  }, [selectedPreset]);

  useEffect(() => {
    const sourceUrl = formState?.svgAsset?.downloadUrl || formState?.svgAsset?.previewUrl;
    const hasSvgText = typeof formState?.svgAsset?.svgText === "string" && formState.svgAsset.svgText.trim();
    if (!sourceUrl || hasSvgText) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(sourceUrl);
        if (!response.ok) return;
        const svgText = await response.text();
        if (cancelled || !svgText.trim()) return;
        setFormState((prev) =>
          !prev?.svgAsset || (prev.svgAsset.svgText || "").trim()
            ? prev
            : { ...prev, svgAsset: { ...prev.svgAsset, svgText } }
        );
      } catch {
        // Non-blocking.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formState?.svgAsset?.downloadUrl, formState?.svgAsset?.previewUrl, formState?.svgAsset?.svgText]);

  const setConfigField = (section, key, value) =>
    setFormState((prev) => ({
      ...prev,
      config: { ...prev.config, [section]: { ...prev.config[section], [key]: value } },
    }));

  const visibleUnits = formState.config.layout.visibleUnits || [];
  const canPublish = Boolean(selectedPreset?.id && selectedPreset?.draftVersion);
  const isPublished = selectedPreset?.estado === "published";
  const canDelete = Boolean(selectedPreset?.id && !isPublished);
  const isArchived = selectedPreset?.estado === "archived";
  const isLegacyPreset = isLegacyPresetSource(selectedPreset);
  const useLegacyCanvasPreview =
    isLegacyPreset &&
    !formState?.svgAsset?.isDirty &&
    !String(formState?.svgAsset?.svgText || "").trim();
  const archiveActionLabel = resolveArchiveActionLabel(selectedPreset);
  const currentStatus = selectedPreset?.estado || "draft";
  const svgColorMode = formState.svgAsset?.colorMode || "fixed";
  const svgText = formState.svgAsset?.svgText || "";
  const frameUrl =
    formState?.svgAsset?.previewUrl ||
    formState?.svgAsset?.downloadUrl ||
    selectedPreset?.draft?.svgRef?.downloadUrl ||
    selectedPreset?.svgRef?.downloadUrl ||
    "";
  const hasFrameSvg =
    Boolean(frameUrl) || Boolean(String(formState?.svgAsset?.svgText || "").trim());
  const canEditSvgFrameColor = !hasFrameSvg || svgColorMode === "currentColor";
  const frameColorHelper = hasFrameSvg
    ? svgColorMode === "currentColor"
      ? "Este SVG usa currentColor: el color se actualiza en el preview y en el canvas."
      : "Este SVG tiene color fijo. Para cambiar su color desde el preset, exportalo usando currentColor."
    : "Sin SVG cargado: este color se usa como borde de fallback del countdown.";
  const previewConfig = useMemo(() => formState.config || createDefaultCountdownPresetConfig(), [formState.config]);

  const toggleUnit = (unit) =>
    setFormState((prev) => {
      const current = prev.config.layout.visibleUnits || [];
      const next = current.includes(unit) ? current.filter((item) => item !== unit) : [...current, unit];
      return { ...prev, config: { ...prev.config, layout: { ...prev.config.layout, visibleUnits: next } } };
    });

  const handleSaveDraft = async () => {
    setErrorMessage("");
    setValidationWarnings([]);
    const validation = validateCountdownPresetInput({
      nombre: formState.nombre,
      categoria: formState.categoria,
      config: { ...formState.config, svgRef: { colorMode: svgColorMode } },
      svgInspection: formState.svgAsset?.inspection || null,
    });
    if (!validation.valid) {
      setErrorMessage(validation.errors.join(" "));
      setValidationWarnings(validation.warnings);
      return;
    }

    const svgTextForPayload = formState.svgAsset?.svgText || "";
    if (!svgTextForPayload && !selectedPreset?.svgRef?.downloadUrl && !isLegacyPreset) {
      setErrorMessage("Debes subir un SVG valido antes de guardar.");
      return;
    }

    try {
      const thumbnailDataUrl = await generateCountdownThumbnailDataUrl({
        config: validation.normalized.config,
        svgText: svgTextForPayload || selectedPreset?.svgRef?.svgText || "",
        svgColorMode,
        frameColor: validation.normalized.config.colores.frameColor,
        size: 320,
        targetISO,
      });
      await onSaveDraft?.({
        presetId: selectedPreset?.id || null,
        nombre: validation.normalized.nombre,
        categoria: validation.normalized.categoria,
        expectedDraftVersion: selectedPreset?.draftVersion ?? null,
        config: { ...validation.normalized.config, svgRef: { colorMode: svgColorMode } },
        assets: {
          svgFileName: formState.svgAsset?.isDirty ? formState.svgAsset?.fileName : null,
          svgBase64: formState.svgAsset?.isDirty ? formState.svgAsset?.svgBase64 : null,
          thumbnailPngBase64: dataUrlToBase64(thumbnailDataUrl),
        },
      });
      setValidationWarnings(validation.warnings);
      setFormState((prev) => ({ ...prev, svgAsset: prev.svgAsset ? { ...prev.svgAsset, isDirty: false } : prev.svgAsset }));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo guardar el borrador."));
    }
  };

  const handlePublish = async () => {
    setErrorMessage("");
    if (!selectedPreset?.id || !selectedPreset?.draftVersion) {
      setErrorMessage("No hay borrador pendiente para publicar.");
      return;
    }
    try {
      await onPublishDraft?.({
        presetId: selectedPreset.id,
        expectedDraftVersion: selectedPreset.draftVersion,
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo publicar el preset."));
    }
  };

  const handleArchiveToggle = async () => {
    setErrorMessage("");
    if (!selectedPreset?.id) return;
    try {
      await onToggleArchive?.({ presetId: selectedPreset.id, archived: !isArchived });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo actualizar el estado del preset."));
    }
  };

  const handleDeletePreset = async () => {
    setErrorMessage("");
    if (!selectedPreset?.id || !canDelete) return;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm("Se eliminara este preset con todas sus versiones y assets. Esta accion no se puede deshacer.");
    if (!confirmed) return;
    try {
      await onDeletePreset?.({ presetId: selectedPreset.id });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo eliminar el preset."));
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <header className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{selectedPreset?.id ? "Editar preset" : "Nuevo preset"}</h2>
          <p className="text-[11px] text-slate-600">Estado actual: <span className="font-semibold">{currentStatus}</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedPreset?.id ? (
            <button
              type="button"
              onClick={handleDeletePreset}
              disabled={deleting || !canDelete}
              title={canDelete ? "Eliminar preset" : "Solo puedes eliminar presets despublicados (draft o archived)."}
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Eliminando..." : "Eliminar"}
            </button>
          ) : null}
          {selectedPreset?.id ? <button type="button" onClick={handleArchiveToggle} disabled={archiving} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{archiving ? "Procesando..." : archiveActionLabel}</button> : null}
          <button type="button" onClick={handleSaveDraft} disabled={saving} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50">{saving ? "Guardando..." : "Guardar borrador"}</button>
          <button type="button" onClick={handlePublish} disabled={!canPublish || publishing} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{publishing ? "Publicando..." : "Publicar version"}</button>
        </div>
      </header>

      {lastMessage ? <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">{lastMessage}</div> : null}
      {errorMessage ? <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{errorMessage}</div> : null}
      {validationWarnings.length ? <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">{validationWarnings.join(" ")}</div> : null}
      {isLegacyPreset && !formState?.svgAsset?.previewUrl ? <div className="mb-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-700">Preset legacy sin frame SVG. Puedes editarlo y publicarlo igual, o subir un frame nuevo.</div> : null}

      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(300px,390px)] lg:overflow-hidden">
        <div className="space-y-3 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
          <Card title="Datos">
            <input value={formState.nombre} onChange={(e) => setFormState((prev) => ({ ...prev, nombre: e.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" placeholder="Ejemplo: Floral premium" />
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <select value={formState.categoria.event} onChange={(e) => setFormState((prev) => ({ ...prev, categoria: normalizeCountdownCategory({ ...prev.categoria, event: e.target.value }) }))} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs">{COUNTDOWN_EVENT_CATEGORIES.map((key) => <option key={key} value={key}>{key}</option>)}</select>
              <select value={formState.categoria.style} onChange={(e) => setFormState((prev) => ({ ...prev, categoria: normalizeCountdownCategory({ ...prev.categoria, style: e.target.value }) }))} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs">{COUNTDOWN_STYLE_CATEGORIES.map((key) => <option key={key} value={key}>{key}</option>)}</select>
              <input value={formState.categoria.custom || ""} onChange={(e) => setFormState((prev) => ({ ...prev, categoria: normalizeCountdownCategory({ ...prev.categoria, custom: e.target.value }) }))} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs" placeholder="Custom" />
            </div>
          </Card>

          <SvgUploadInspector value={formState.svgAsset} onChange={(svgAsset) => setFormState((prev) => ({ ...prev, svgAsset }))} />

          <Card title="Color del frame SVG">
            <FrameColorField
              value={formState.config.colores.frameColor}
              onChange={(nextValue) => setConfigField("colores", "frameColor", nextValue)}
              disabled={!canEditSvgFrameColor}
              helperText={frameColorHelper}
            />
          </Card>

          <Card title="Layout">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-[11px] font-medium text-slate-600">
                <span>Tipo de layout</span>
                <select value={formState.config.layout.type} onChange={(e) => setConfigField("layout", "type", e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs">{COUNTDOWN_LAYOUT_TYPES.map((key) => <option key={key} value={key}>{key}</option>)}</select>
              </label>
              <label className="space-y-1 text-[11px] font-medium text-slate-600">
                <span>Distribucion</span>
                <select value={formState.config.layout.distribution} onChange={(e) => setConfigField("layout", "distribution", e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs">{COUNTDOWN_DISTRIBUTIONS.map((key) => <option key={key} value={key}>{key}</option>)}</select>
              </label>
              <label className="space-y-1 text-[11px] font-medium text-slate-600">
                <span>Espaciado (gap px)</span>
                <input type="number" min={0} max={48} value={formState.config.layout.gap} onChange={(e) => setConfigField("layout", "gap", Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs" />
              </label>
              <label className="space-y-1 text-[11px] font-medium text-slate-600">
                <span>Padding del frame (px)</span>
                <input type="number" min={0} max={64} value={formState.config.layout.framePadding} onChange={(e) => setConfigField("layout", "framePadding", Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs" />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">{COUNTDOWN_UNITS.map((unit) => <label key={unit} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"><input type="checkbox" checked={visibleUnits.includes(unit)} onChange={() => toggleUnit(unit)} />{unit}</label>)}</div>
          </Card>

          <Card title="Tipografia y colores">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-[11px] font-medium text-slate-600">
                <span>Fuente base</span>
                <input value={formState.config.tipografia.fontFamily} onChange={(e) => setConfigField("tipografia", "fontFamily", e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs" placeholder="Fuente" />
              </label>
              <label className="space-y-1 text-[11px] font-medium text-slate-600">
                <span>Tamano base ({formState.config.tamanoBase}px)</span>
                <input type="range" min={220} max={640} value={formState.config.tamanoBase} onChange={(e) => setFormState((prev) => ({ ...prev, config: { ...prev.config, tamanoBase: Number(e.target.value) } }))} className="w-full" />
              </label>
              <label className="space-y-1 text-[11px] font-medium text-slate-600">
                <span>Tamano numero (px)</span>
                <input type="number" min={10} max={120} value={formState.config.tipografia.numberSize} onChange={(e) => setConfigField("tipografia", "numberSize", Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs" />
              </label>
              <label className="space-y-1 text-[11px] font-medium text-slate-600">
                <span>Tamano label (px)</span>
                <input type="number" min={8} max={72} value={formState.config.tipografia.labelSize} onChange={(e) => setConfigField("tipografia", "labelSize", Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs" />
              </label>
              <label className="space-y-1 text-[11px] font-medium text-slate-600">
                <span>Letter spacing (px)</span>
                <input type="number" min={-2} max={12} step={0.1} value={formState.config.tipografia.letterSpacing} onChange={(e) => setConfigField("tipografia", "letterSpacing", Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs" />
              </label>
              <label className="space-y-1 text-[11px] font-medium text-slate-600">
                <span>Line height</span>
                <input type="number" min={0.8} max={2} step={0.05} value={formState.config.tipografia.lineHeight} onChange={(e) => setConfigField("tipografia", "lineHeight", Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs" />
              </label>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <ColorField
                label="Color numero"
                value={formState.config.colores.numberColor}
                fallback="#111111"
                onChange={(nextValue) => setConfigField("colores", "numberColor", nextValue)}
              />
              <ColorField
                label="Color label"
                value={formState.config.colores.labelColor}
                fallback="#4b5563"
                onChange={(nextValue) => setConfigField("colores", "labelColor", nextValue)}
              />
            </div>
          </Card>

          <Card title="Estilo de unidad">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-[11px] font-medium text-slate-600">
                <span>Mostrar labels</span>
                <span className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700">
                  <input type="checkbox" checked={formState.config.unidad.showLabels !== false} onChange={(e) => setConfigField("unidad", "showLabels", e.target.checked)} />
                  Activo
                </span>
              </label>
              <label className="space-y-1 text-[11px] font-medium text-slate-600">
                <span>Separador entre unidades</span>
                <input value={formState.config.unidad.separator || ""} onChange={(e) => setConfigField("unidad", "separator", e.target.value.slice(0, 4))} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs" placeholder="Ej: : o |" />
              </label>
              <UnitPaintField
                label="Fondo de unidad"
                value={formState.config.unidad.boxBg || "transparent"}
                onChange={(nextValue) => setConfigField("unidad", "boxBg", nextValue)}
                colorFallback="#ffffff"
                advancedPlaceholder="Ej: rgba(255,255,255,0.8)"
              />
              <UnitPaintField
                label="Borde de unidad"
                value={formState.config.unidad.boxBorder || "transparent"}
                onChange={(nextValue) => setConfigField("unidad", "boxBorder", nextValue)}
                colorFallback="#e2e8f0"
                advancedPlaceholder="Ej: rgba(226,232,240,0.9)"
              />
              <label className="space-y-1 text-[11px] font-medium text-slate-600">
                <span>Radio de borde (px)</span>
                <input type="number" min={0} max={120} value={formState.config.unidad.boxRadius} onChange={(e) => setConfigField("unidad", "boxRadius", Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs" />
              </label>
              <label className="space-y-1 text-[11px] font-medium text-slate-600">
                <span>Sombra de unidad</span>
                <span className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700">
                  <input type="checkbox" checked={formState.config.unidad.boxShadow === true} onChange={(e) => setConfigField("unidad", "boxShadow", e.target.checked)} />
                  Activa
                </span>
              </label>
            </div>
          </Card>

          <Card title="Animaciones">
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="space-y-1 text-[11px] font-medium text-slate-600">
                <span>Entrada</span>
                <select value={formState.config.animaciones.entry} onChange={(e) => setConfigField("animaciones", "entry", e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs">{COUNTDOWN_ENTRY_ANIMATIONS.map((key) => <option key={key} value={key}>{key}</option>)}</select>
              </label>
              <label className="space-y-1 text-[11px] font-medium text-slate-600">
                <span>Tick (cada segundo)</span>
                <select value={formState.config.animaciones.tick} onChange={(e) => setConfigField("animaciones", "tick", e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs">{COUNTDOWN_TICK_ANIMATIONS.map((key) => <option key={key} value={key}>{key}</option>)}</select>
              </label>
              <label className="space-y-1 text-[11px] font-medium text-slate-600">
                <span>Frame</span>
                <select value={formState.config.animaciones.frame} onChange={(e) => setConfigField("animaciones", "frame", e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs">{COUNTDOWN_FRAME_ANIMATIONS.map((key) => <option key={key} value={key}>{key}</option>)}</select>
              </label>
            </div>
          </Card>
        </div>

        <div className="space-y-2 lg:min-h-0 lg:self-start">
          <Card title="Fecha simulada del preview">
            <input type="datetime-local" value={new Date(targetISO).toISOString().slice(0, 16)} onChange={(e) => { const nextDate = new Date(e.target.value); if (Number.isFinite(nextDate.getTime())) setTargetISO(nextDate.toISOString()); }} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs" />
          </Card>
          <CountdownPresetLivePreview
            config={previewConfig}
            svgText={svgText}
            frameUrl={frameUrl}
            svgColorMode={svgColorMode}
            frameColor={formState.config.colores.frameColor}
            targetISO={targetISO}
            legacyPresetProps={selectedPreset?.legacyPresetProps || null}
            useLegacyCanvasPreview={useLegacyCanvasPreview}
          />
        </div>
      </div>
    </section>
  );
}
