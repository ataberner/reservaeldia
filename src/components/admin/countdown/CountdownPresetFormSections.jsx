import SvgUploadInspector from "@/components/admin/countdown/SvgUploadInspector";
import UnifiedColorPicker from "@/components/color/UnifiedColorPicker";
import {
  COUNTDOWN_DISTRIBUTIONS,
  COUNTDOWN_ENTRY_ANIMATIONS,
  COUNTDOWN_EVENT_CATEGORIES,
  COUNTDOWN_FRAME_ANIMATIONS,
  COUNTDOWN_LABEL_TRANSFORMS,
  COUNTDOWN_LAYOUT_TYPES,
  COUNTDOWN_NUMERIC_LIMITS,
  COUNTDOWN_STYLE_CATEGORIES,
  COUNTDOWN_TICK_ANIMATIONS,
  COUNTDOWN_UNITS,
} from "@/domain/countdownPresets/contract";
import { resolveCountdownFrameAssetType } from "@/domain/countdownPresets/frameAssetContract";
import { normalizeCountdownCategory } from "@/domain/countdownPresets/validators";
import { replaceCountdownPresetFrameAsset } from "@/domain/countdownPresets/builderFormModel";

const LABELS = Object.freeze({
  singleFrame: "Frame único",
  multiUnit: "Un frame por unidad",
  centered: "Centrada",
  vertical: "Vertical",
  grid: "Grilla",
  editorial: "Editorial",
  days: "Días",
  hours: "Horas",
  minutes: "Minutos",
  seconds: "Segundos",
  none: "Sin animación",
  fadeUp: "Aparecer desde abajo",
  fadeIn: "Fundido",
  scaleIn: "Escala suave",
  flipSoft: "Giro suave",
  pulse: "Pulso",
  rotateSlow: "Rotación lenta",
  shimmer: "Brillo",
  uppercase: "Mayúsculas",
  lowercase: "Minúsculas",
  capitalize: "Iniciales en mayúscula",
  boda: "Boda",
  quince: "Quince",
  cumpleanos: "Cumpleaños",
  aniversario: "Aniversario",
  "baby-shower": "Baby shower",
  corporativo: "Corporativo",
  general: "General",
  minimal: "Minimalista",
  floral: "Floral",
  romantico: "Romántico",
  moderno: "Moderno",
  clasico: "Clásico",
  premium: "Premium",
});

function labelFor(value) {
  return LABELS[value] || String(value || "");
}

function Section({ id, title, description, errorCount = 0, children }) {
  return (
    <fieldset
      id={`countdown-section-${id}`}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <legend className="px-1 text-sm font-semibold text-slate-950">
        {title}
      </legend>
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-xs leading-5 text-slate-600">{description}</p>
        {errorCount ? (
          <span className="shrink-0 rounded-full bg-rose-100 px-2 py-1 text-[10px] font-semibold text-rose-700">
            {errorCount} {errorCount === 1 ? "error" : "errores"}
          </span>
        ) : null}
      </div>
      {children}
    </fieldset>
  );
}

function Field({
  id,
  label,
  error,
  hint = "",
  className = "",
  children,
}) {
  return (
    <div className={`space-y-1 ${className}`} data-countdown-field={id}>
      <label
        htmlFor={`countdown-field-${id}`}
        className="block text-xs font-medium text-slate-700"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p id={`countdown-error-${id}`} className="text-xs text-rose-700">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] leading-4 text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

function inputProps(id, error) {
  return {
    id: `countdown-field-${id}`,
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `countdown-error-${id}` : undefined,
    className: `min-h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
      error ? "border-rose-400" : "border-slate-300"
    }`,
  };
}

function NumericField({
  id,
  label,
  value,
  range,
  step,
  optional = false,
  error,
  onChange,
  hint,
}) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <input
        {...inputProps(id, error)}
        type="number"
        min={range.min}
        max={range.max}
        step={step}
        value={value ?? ""}
        placeholder={optional ? "Automático" : undefined}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === "" && optional ? null : raw === "" ? "" : Number(raw));
        }}
      />
    </Field>
  );
}

function PaintField({ id, label, value, fallback, error, onChange }) {
  const safeValue = String(value || "");
  const pickerValue = /^#[0-9a-f]{3,6}$/i.test(safeValue)
    ? safeValue
    : fallback;
  return (
    <Field id={id} label={label} error={error}>
      <div
        className={`flex min-h-11 items-center gap-2 rounded-lg border bg-white px-2 ${
          error ? "border-rose-400" : "border-slate-300"
        }`}
      >
        <input
          id={`countdown-field-${id}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `countdown-error-${id}` : undefined}
          value={safeValue}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-slate-900 outline-none"
        />
        <UnifiedColorPicker
          value={pickerValue}
          onChange={onChange}
          fallbackColor={fallback}
          panelWidth={272}
          title={`Cambiar ${label.toLowerCase()}`}
          triggerClassName="h-9 w-9 rounded-md border border-slate-300"
        />
      </div>
    </Field>
  );
}

export default function CountdownPresetFormSections({
  formState,
  validation,
  selectedPreset,
  onChange,
}) {
  const touchedFields = new Set(validation?.touchedFields || []);
  const showAllErrors = validation?.attempted === true;
  const errors = Object.fromEntries(
    Object.entries(validation?.fieldErrors || {}).filter(
      ([fieldId]) => showAllErrors || touchedFields.has(fieldId)
    )
  );
  const sectionErrors = showAllErrors ? validation?.sectionErrors || {} : {};
  const config = formState.config;
  const setRoot = (key, value, fieldId) =>
    onChange({ ...formState, [key]: value }, fieldId);
  const setConfig = (section, key, value, fieldId = `${section}.${key}`) =>
    onChange(
      {
        ...formState,
        config: {
          ...config,
          [section]: { ...config[section], [key]: value },
        },
      },
      fieldId
    );
  const setBaseSize = (value) =>
    onChange(
      { ...formState, config: { ...config, tamanoBase: value } },
      "tamanoBase"
    );
  const setFrameAsset = (svgAsset) => {
    onChange(
      replaceCountdownPresetFrameAsset(formState, svgAsset),
      "svgAsset"
    );
  };
  const toggleUnit = (unit) => {
    const units = Array.isArray(config.layout.visibleUnits)
      ? config.layout.visibleUnits
      : [];
    const visibleUnits = units.includes(unit)
      ? units.filter((entry) => entry !== unit)
      : COUNTDOWN_UNITS.filter(
          (entry) => units.includes(entry) || entry === unit
        );
    setConfig(
      "layout",
      "visibleUnits",
      visibleUnits,
      "layout.visibleUnits"
    );
  };

  const source = selectedPreset?.draft || selectedPreset || null;
  const frameAssetType = resolveCountdownFrameAssetType(
    formState.svgAsset,
    formState.svgAsset ? "svg" : null
  );
  const isCurrentColor =
    frameAssetType === "svg" &&
    formState.svgAsset?.colorMode === "currentColor";
  const frameScale = Number.isFinite(Number(config.layout.frameScale))
    ? Number(config.layout.frameScale)
    : COUNTDOWN_NUMERIC_LIMITS.frameScale.default;

  return (
    <div className="space-y-4">
      <Section
        id="information"
        title="Información"
        description="Identidad del preset y estado persistido. El identificador técnico se muestra sólo para diagnóstico."
        errorCount={sectionErrors.information?.length || 0}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="nombre"
            label="Nombre"
            error={errors.nombre}
            className="sm:col-span-2"
          >
            <input
              {...inputProps("nombre", errors.nombre)}
              value={formState.nombre}
              onChange={(event) =>
                setRoot("nombre", event.target.value, "nombre")
              }
              autoComplete="off"
            />
          </Field>
          <Field
            id="categoria.event"
            label="Tipo de evento"
            error={errors["categoria.event"]}
          >
            <select
              {...inputProps("categoria.event", errors["categoria.event"])}
              value={formState.categoria.event}
              onChange={(event) =>
                setRoot(
                  "categoria",
                  normalizeCountdownCategory({
                    ...formState.categoria,
                    event: event.target.value,
                  }),
                  "categoria.event"
                )
              }
            >
              {COUNTDOWN_EVENT_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {labelFor(value)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="categoria.style"
            label="Estilo"
            error={errors["categoria.style"]}
          >
            <select
              {...inputProps("categoria.style", errors["categoria.style"])}
              value={formState.categoria.style}
              onChange={(event) =>
                setRoot(
                  "categoria",
                  normalizeCountdownCategory({
                    ...formState.categoria,
                    style: event.target.value,
                  }),
                  "categoria.style"
                )
              }
            >
              {COUNTDOWN_STYLE_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {labelFor(value)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="categoria.custom"
            label="Etiqueta adicional"
            hint="Opcional. Se incorpora al nombre visible de la categoría."
            className="sm:col-span-2"
          >
            <input
              {...inputProps("categoria.custom", null)}
              value={formState.categoria.custom || ""}
              onChange={(event) =>
                setRoot(
                  "categoria",
                  normalizeCountdownCategory({
                    ...formState.categoria,
                    custom: event.target.value,
                  }),
                  "categoria.custom"
                )
              }
            />
          </Field>
        </div>
        <dl className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Estado</dt>
            <dd className="font-semibold text-slate-800">
              {selectedPreset?.estado === "published"
                ? "Publicado"
                : selectedPreset?.estado === "archived"
                  ? "Archivado"
                  : "Borrador"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Versión activa</dt>
            <dd className="font-semibold text-slate-800">
              {Number(selectedPreset?.activeVersion || 0) || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Versión de borrador</dt>
            <dd className="font-semibold text-slate-800">
              {Number(selectedPreset?.draftVersion || 0) || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">ID técnico</dt>
            <dd
              className="truncate font-mono text-[10px] text-slate-700"
              title={selectedPreset?.id || ""}
            >
              {selectedPreset?.id || "Se asigna al guardar"}
            </dd>
          </div>
        </dl>
      </Section>

      <Section
        id="layout"
        title="Layout"
        description="Geometría soportada por el renderer schema 2."
        errorCount={sectionErrors.layout?.length || 0}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="layout.type" label="Tipo" error={errors["layout.type"]}>
            <select
              {...inputProps("layout.type", errors["layout.type"])}
              value={config.layout.type}
              onChange={(event) =>
                setConfig("layout", "type", event.target.value)
              }
            >
              {COUNTDOWN_LAYOUT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {labelFor(value)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="layout.distribution"
            label="Distribución"
            error={errors["layout.distribution"]}
          >
            <select
              {...inputProps(
                "layout.distribution",
                errors["layout.distribution"]
              )}
              value={config.layout.distribution}
              onChange={(event) =>
                setConfig("layout", "distribution", event.target.value)
              }
            >
              {COUNTDOWN_DISTRIBUTIONS.map((value) => (
                <option key={value} value={value}>
                  {labelFor(value)}
                </option>
              ))}
            </select>
          </Field>
          <NumericField
            id="layout.gap"
            label="Espaciado entre unidades (px)"
            value={config.layout.gap}
            range={COUNTDOWN_NUMERIC_LIMITS.gap}
            error={errors["layout.gap"]}
            onChange={(value) => setConfig("layout", "gap", value)}
          />
          <NumericField
            id="layout.framePadding"
            label="Padding del frame (px)"
            value={config.layout.framePadding}
            range={COUNTDOWN_NUMERIC_LIMITS.framePadding}
            error={errors["layout.framePadding"]}
            onChange={(value) => setConfig("layout", "framePadding", value)}
          />
          <NumericField
            id="layout.chipWidth"
            label="Ancho del chip (px)"
            value={config.layout.chipWidth}
            range={COUNTDOWN_NUMERIC_LIMITS.chipWidth}
            optional
            error={errors["layout.chipWidth"]}
            hint="Vacío conserva el cálculo automático del renderer."
            onChange={(value) => setConfig("layout", "chipWidth", value)}
          />
          <NumericField
            id="tamanoBase"
            label="Tamaño base (px)"
            value={config.tamanoBase}
            range={COUNTDOWN_NUMERIC_LIMITS.tamanoBase}
            error={errors.tamanoBase}
            onChange={setBaseSize}
          />
        </div>
        <div
          className="mt-4"
          data-countdown-field="layout.visibleUnits"
        >
          <p className="text-xs font-medium text-slate-700">
            Unidades visibles
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {COUNTDOWN_UNITS.map((unit) => (
              <label
                key={unit}
                className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm ${
                  errors["layout.visibleUnits"]
                    ? "border-rose-400"
                    : "border-slate-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={config.layout.visibleUnits.includes(unit)}
                  onChange={() => toggleUnit(unit)}
                />
                {labelFor(unit)}
              </label>
            ))}
          </div>
          {errors["layout.visibleUnits"] ? (
            <p className="mt-1 text-xs text-rose-700">
              {errors["layout.visibleUnits"]}
            </p>
          ) : null}
        </div>
      </Section>

      <Section
        id="typography"
        title="Tipografía"
        description="Escala, ritmo y transformación de números y etiquetas."
        errorCount={sectionErrors.typography?.length || 0}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="tipografia.fontFamily"
            label="Fuente"
            error={errors["tipografia.fontFamily"]}
            className="sm:col-span-2"
          >
            <input
              {...inputProps(
                "tipografia.fontFamily",
                errors["tipografia.fontFamily"]
              )}
              value={config.tipografia.fontFamily}
              onChange={(event) =>
                setConfig("tipografia", "fontFamily", event.target.value)
              }
            />
          </Field>
          <NumericField
            id="tipografia.numberSize"
            label="Tamaño de números (px)"
            value={config.tipografia.numberSize}
            range={COUNTDOWN_NUMERIC_LIMITS.numberSize}
            error={errors["tipografia.numberSize"]}
            onChange={(value) =>
              setConfig("tipografia", "numberSize", value)
            }
          />
          <NumericField
            id="tipografia.labelSize"
            label="Tamaño de etiquetas (px)"
            value={config.tipografia.labelSize}
            range={COUNTDOWN_NUMERIC_LIMITS.labelSize}
            error={errors["tipografia.labelSize"]}
            onChange={(value) => setConfig("tipografia", "labelSize", value)}
          />
          <NumericField
            id="tipografia.letterSpacing"
            label="Espaciado entre letras (px)"
            value={config.tipografia.letterSpacing}
            range={COUNTDOWN_NUMERIC_LIMITS.letterSpacing}
            step={0.1}
            error={errors["tipografia.letterSpacing"]}
            onChange={(value) =>
              setConfig("tipografia", "letterSpacing", value)
            }
          />
          <NumericField
            id="tipografia.lineHeight"
            label="Interlineado"
            value={config.tipografia.lineHeight}
            range={COUNTDOWN_NUMERIC_LIMITS.lineHeight}
            step={0.05}
            error={errors["tipografia.lineHeight"]}
            onChange={(value) => setConfig("tipografia", "lineHeight", value)}
          />
          <Field
            id="tipografia.labelTransform"
            label="Transformación de etiquetas"
            error={errors["tipografia.labelTransform"]}
            className="sm:col-span-2"
          >
            <select
              {...inputProps(
                "tipografia.labelTransform",
                errors["tipografia.labelTransform"]
              )}
              value={config.tipografia.labelTransform}
              onChange={(event) =>
                setConfig("tipografia", "labelTransform", event.target.value)
              }
            >
              {COUNTDOWN_LABEL_TRANSFORMS.map((value) => (
                <option key={value} value={value}>
                  {labelFor(value)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section
        id="colors"
        title="Colores y unidades"
        description="Pinturas CSS seguras y estilo visual de cada chip."
        errorCount={sectionErrors.colors?.length || 0}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <PaintField
            id="colores.numberColor"
            label="Color de números"
            value={config.colores.numberColor}
            fallback="#111111"
            error={errors["colores.numberColor"]}
            onChange={(value) => setConfig("colores", "numberColor", value)}
          />
          <PaintField
            id="colores.labelColor"
            label="Color de etiquetas"
            value={config.colores.labelColor}
            fallback="#4b5563"
            error={errors["colores.labelColor"]}
            onChange={(value) => setConfig("colores", "labelColor", value)}
          />
          <PaintField
            id="unidad.boxBg"
            label="Fondo de unidad"
            value={config.unidad.boxBg}
            fallback="#ffffff"
            error={errors["unidad.boxBg"]}
            onChange={(value) => setConfig("unidad", "boxBg", value)}
          />
          <PaintField
            id="unidad.boxBorder"
            label="Borde de unidad"
            value={config.unidad.boxBorder}
            fallback="#e2e8f0"
            error={errors["unidad.boxBorder"]}
            onChange={(value) => setConfig("unidad", "boxBorder", value)}
          />
          <NumericField
            id="unidad.boxRadius"
            label="Radio (px)"
            value={config.unidad.boxRadius}
            range={COUNTDOWN_NUMERIC_LIMITS.boxRadius}
            error={errors["unidad.boxRadius"]}
            onChange={(value) => setConfig("unidad", "boxRadius", value)}
          />
          <Field id="unidad.separator" label="Separador">
            <input
              {...inputProps("unidad.separator", null)}
              value={config.unidad.separator || ""}
              maxLength={4}
              onChange={(event) =>
                setConfig("unidad", "separator", event.target.value.slice(0, 4))
              }
            />
          </Field>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={config.unidad.showLabels !== false}
              onChange={(event) =>
                setConfig("unidad", "showLabels", event.target.checked)
              }
            />
            Mostrar etiquetas
          </label>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={config.unidad.boxShadow === true}
              onChange={(event) =>
                setConfig("unidad", "boxShadow", event.target.checked)
              }
            />
            Sombra de unidad
          </label>
        </div>
      </Section>

      <Section
        id="frame"
        title="Frame"
        description="Agregá un marco vectorial o ilustrado al countdown."
        errorCount={sectionErrors.frame?.length || 0}
      >
        <div data-countdown-field="svgAsset">
          <SvgUploadInspector
            value={formState.svgAsset}
            onChange={setFrameAsset}
          />
          {errors.svgAsset ? (
            <p className="mt-1 text-xs text-rose-700">{errors.svgAsset}</p>
          ) : null}
        </div>
        {formState.svgAsset ? (
          <div
            className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
            data-countdown-field="layout.frameScale"
          >
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="countdown-field-layout.frameScale"
                className="text-xs font-medium text-slate-700"
              >
                Tamaño del frame
              </label>
              <output
                htmlFor="countdown-field-layout.frameScale"
                className="min-w-14 text-right text-sm font-semibold tabular-nums text-slate-900"
              >
                {Math.round(frameScale * 100)}%
              </output>
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id="countdown-field-layout.frameScale"
                type="range"
                min={COUNTDOWN_NUMERIC_LIMITS.frameScale.min}
                max={COUNTDOWN_NUMERIC_LIMITS.frameScale.max}
                step={0.05}
                value={frameScale}
                aria-invalid={Boolean(errors["layout.frameScale"])}
                aria-describedby={
                  errors["layout.frameScale"]
                    ? "countdown-error-layout.frameScale"
                    : "countdown-help-layout.frameScale"
                }
                onChange={(event) =>
                  setConfig(
                    "layout",
                    "frameScale",
                    Number(event.target.value)
                  )
                }
                className="min-h-11 min-w-0 flex-1 cursor-pointer accent-violet-600 outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              />
              <button
                type="button"
                onClick={() =>
                  setConfig(
                    "layout",
                    "frameScale",
                    COUNTDOWN_NUMERIC_LIMITS.frameScale.default
                  )
                }
                disabled={
                  frameScale === COUNTDOWN_NUMERIC_LIMITS.frameScale.default
                }
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Restablecer
              </button>
            </div>
            {errors["layout.frameScale"] ? (
              <p
                id="countdown-error-layout.frameScale"
                className="mt-1 text-xs text-rose-700"
              >
                {errors["layout.frameScale"]}
              </p>
            ) : (
              <p
                id="countdown-help-layout.frameScale"
                className="mt-1 text-[11px] leading-4 text-slate-500"
              >
                Ajustá este valor para que el marco envuelva correctamente el
                countdown. El contenido interior no cambia de tamaño.
              </p>
            )}
          </div>
        ) : null}
        {isCurrentColor ? (
          <div className="mt-3">
            <PaintField
              id="colores.frameColor"
              label="Color del frame"
              value={config.colores.frameColor}
              fallback="#773dbe"
              error={errors["colores.frameColor"]}
              onChange={(value) => setConfig("colores", "frameColor", value)}
            />
            <p className="mt-2 text-[11px] text-slate-500">
              El SVG usa color editable y responde a este control.
            </p>
          </div>
        ) : null}
      </Section>

      <Section
        id="animations"
        title="Animaciones"
        description="Sólo se ofrecen los modos soportados por schema 2; la simulación puede forzar movimiento reducido."
        errorCount={sectionErrors.animations?.length || 0}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            [
              "entry",
              "Entrada",
              COUNTDOWN_ENTRY_ANIMATIONS,
              errors["animaciones.entry"],
            ],
            [
              "tick",
              "Cambio de número",
              COUNTDOWN_TICK_ANIMATIONS,
              errors["animaciones.tick"],
            ],
            [
              "frame",
              "Frame",
              COUNTDOWN_FRAME_ANIMATIONS,
              errors["animaciones.frame"],
            ],
          ].map(([key, label, options, error]) => (
            <Field
              key={key}
              id={`animaciones.${key}`}
              label={label}
              error={error}
            >
              <select
                {...inputProps(`animaciones.${key}`, error)}
                value={config.animaciones[key]}
                onChange={(event) =>
                  setConfig("animaciones", key, event.target.value)
                }
              >
                {options.map((value) => (
                  <option key={value} value={value}>
                    {labelFor(value)}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      </Section>

      {source?.validationReport?.warnings?.length ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <h3 className="font-semibold">Advertencias del borrador persistido</h3>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {source.validationReport.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
