import { useEffect, useMemo, useRef, useState } from "react";
import {
  convertSvgToCurrentColor,
  inspectSvgFile,
  inspectSvgText,
  svgTextToBase64,
} from "@/domain/countdownPresets/svgInspector";

const SVG_RECOMMENDATION_GUIDE = [
  "Usa solo viewBox para que el frame escale sin deformarse.",
  "Si el archivo pesa mas de 200 KB, optimizalo para mejorar carga movil.",
  "Si necesitas recolorear el frame desde el preset, exportalo con currentColor.",
];

function getFriendlyWarning(warning = "") {
  const normalized = String(warning || "").trim();
  if (!normalized) return "";

  if (normalized.includes("width/height fijos")) {
    return "Tiene width/height fijos: conviene quitarlos y dejar solo viewBox para un escalado consistente.";
  }
  if (normalized.includes("pesa mas de 200KB")) {
    return "Supera 200 KB: optimizalo para acelerar la carga, especialmente en dispositivos moviles.";
  }
  if (normalized.includes("no usa currentColor")) {
    return "No usa currentColor: el color del frame quedara fijo y no podra editarse desde colores.";
  }
  if (normalized.includes("viewBox no es cuadrado")) {
    return "El viewBox no es 1:1: puede recortarse o verse desbalanceado en algunos layouts.";
  }
  if (normalized.includes("modo de color")) {
    return "No se pudo detectar el modo de color del SVG. Revisa rellenos y trazos en el archivo.";
  }
  return normalized;
}

function formatBytes(bytes) {
  const safeBytes = Number(bytes || 0);
  if (!Number.isFinite(safeBytes) || safeBytes <= 0) return "0 KB";
  if (safeBytes >= 1024 * 1024) return `${(safeBytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(safeBytes / 1024).toFixed(1)} KB`;
}

function formatViewBoxSize(width, height) {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight)) return "-";
  return `${safeWidth} x ${safeHeight}`;
}

function formatViewBoxRatio(width, height) {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight) || safeHeight <= 0) return "-";
  const ratio = safeWidth / safeHeight;
  if (Math.abs(ratio - 1) <= 0.01) return "1:1";
  return `${ratio.toFixed(2)}:1`;
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="truncate text-xs font-medium text-slate-800" title={value || "-"}>
        {value || "-"}
      </dd>
      <p className="text-[10px] leading-4 text-slate-500">{hint}</p>
    </div>
  );
}

export default function SvgUploadInspector({
  value,
  onChange,
}) {
  const [uploading, setUploading] = useState(false);
  const [convertingColor, setConvertingColor] = useState(false);
  const [localError, setLocalError] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const objectUrlRef = useRef(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const inspection = value?.inspection || null;
  const previewUrl = value?.previewUrl || value?.downloadUrl || null;
  const hasSvgText = Boolean(String(value?.svgText || "").trim());
  const warnings = inspection?.warnings || [];
  const criticalErrors = inspection?.criticalErrors || [];
  const checks = inspection?.checks || {};

  const summary = useMemo(
    () => ({
      fileName: checks.fileName || value?.fileName || "-",
      mimeType: checks.mimeType || value?.mimeType || "-",
      bytesLabel: formatBytes(checks.bytes || value?.byteSize || 0),
      viewBox: checks.viewBox || "-",
      viewBoxSize: formatViewBoxSize(checks.viewBoxWidth, checks.viewBoxHeight),
      ratio: formatViewBoxRatio(checks.viewBoxWidth, checks.viewBoxHeight),
      isSquare: checks.isSquare === true ? "Si" : checks.isSquare === false ? "No" : "-",
      hasFixedDimensions: checks.hasFixedDimensions === true ? "Si" : checks.hasFixedDimensions === false ? "No" : "-",
      colorMode: checks.colorMode || value?.colorMode || "fixed",
      dynamicColor:
        (checks.colorMode || value?.colorMode || "fixed") === "currentColor"
          ? "Si"
          : "No",
    }),
    [checks, value]
  );
  const friendlyWarnings = useMemo(
    () => warnings.map((warning) => getFriendlyWarning(warning)).filter(Boolean),
    [warnings]
  );
  const isDynamicColorSvg = summary.colorMode === "currentColor";
  const infoTitle = useMemo(() => {
    const lines = [
      "Guia rapida para SVG",
      ...SVG_RECOMMENDATION_GUIDE.map((tip) => `- ${tip}`),
      "",
      "Estado del archivo actual",
    ];
    if (friendlyWarnings.length > 0) {
      lines.push(...friendlyWarnings.map((warning) => `- ${warning}`));
    } else {
      lines.push("- Cumple las recomendaciones principales para uso en countdown.");
    }
    return lines.join("\n");
  }, [friendlyWarnings]);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setLocalError("");

    try {
      const report = await inspectSvgFile(file);
      const svgText = report?.svgText || "";
      const previewBlob = new Blob([svgText], { type: "image/svg+xml" });
      const nextUrl = URL.createObjectURL(previewBlob);

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      objectUrlRef.current = nextUrl;

      const payload = {
        valid: report.valid,
        fileName: file.name,
        mimeType: file.type || "image/svg+xml",
        byteSize: file.size || 0,
        svgText,
        svgBase64: svgText ? svgTextToBase64(svgText) : null,
        previewUrl: nextUrl,
        colorMode: report?.checks?.colorMode || "fixed",
        inspection: report,
        isDirty: true,
      };

      onChange?.(payload);
    } catch (error) {
      setLocalError(
        typeof error?.message === "string"
          ? error.message
          : "No se pudo inspeccionar el SVG."
      );
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleConvertToEditableColor = async () => {
    if (!hasSvgText || !value) {
      setLocalError("No hay contenido SVG para convertir.");
      return;
    }

    setConvertingColor(true);
    setLocalError("");

    try {
      const converted = convertSvgToCurrentColor(value.svgText);
      if (!converted.changed || !converted.svgText) {
        const currentReport = inspectSvgText({
          svgText: value.svgText,
          fileName: value.fileName || "frame.svg",
          byteSize: value.byteSize || 0,
          mimeType: value.mimeType || "image/svg+xml",
        });
        const mode = currentReport?.checks?.colorMode || "fixed";
        setLocalError(
          mode === "currentColor"
            ? "El SVG ya usa currentColor."
            : "No se pudo convertir automaticamente. Editalo manualmente y reemplaza fill/stroke por currentColor."
        );
        return;
      }

      const nextByteSize = new Blob([converted.svgText], { type: "image/svg+xml" }).size;
      const report = inspectSvgText({
        svgText: converted.svgText,
        fileName: value.fileName || "frame.svg",
        byteSize: nextByteSize,
        mimeType: value.mimeType || "image/svg+xml",
      });

      const previewBlob = new Blob([converted.svgText], { type: "image/svg+xml" });
      const nextUrl = URL.createObjectURL(previewBlob);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      objectUrlRef.current = nextUrl;

      onChange?.({
        ...value,
        valid: report.valid,
        byteSize: nextByteSize,
        svgText: converted.svgText,
        svgBase64: svgTextToBase64(converted.svgText),
        previewUrl: nextUrl,
        colorMode: report?.checks?.colorMode || "fixed",
        inspection: report,
        isDirty: true,
      });
    } catch (error) {
      setLocalError(
        typeof error?.message === "string"
          ? error.message
          : "No se pudo convertir el SVG a color editable."
      );
    } finally {
      setConvertingColor(false);
    }
  };

  const handleRemoveSvg = () => {
    setLocalError("");
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    onChange?.(null);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Frame SVG</h3>
            <div
              className="relative z-20"
              onMouseEnter={() => setInfoOpen(true)}
              onMouseLeave={() => setInfoOpen(false)}
            >
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-800"
                aria-label="Ver recomendaciones para SVG"
                title={infoTitle}
                onFocus={() => setInfoOpen(true)}
                onBlur={() => setInfoOpen(false)}
                onClick={() => setInfoOpen((prev) => !prev)}
              >
                i
              </button>
              <div
                className={`absolute left-0 top-full mt-1.5 z-40 w-[min(20rem,calc(100vw-3rem))] rounded-lg border border-slate-200 bg-white p-3 shadow-lg transition-opacity duration-150 ${
                  infoOpen ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                <p className="text-[11px] font-semibold text-slate-900">Guia rapida para SVG</p>
                <ul className="mt-1 space-y-1 text-[11px] text-slate-600">
                  {SVG_RECOMMENDATION_GUIDE.map((tip) => (
                    <li key={tip}>- {tip}</li>
                  ))}
                </ul>
                <div className="mt-2 border-t border-slate-100 pt-2">
                  <p className="text-[11px] font-semibold text-slate-900">Estado del archivo actual</p>
                  {friendlyWarnings.length > 0 ? (
                    <ul className="mt-1 space-y-1 text-[11px] text-slate-600">
                      {friendlyWarnings.map((warning) => (
                        <li key={warning}>- {warning}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[11px] text-emerald-700">
                      Cumple las recomendaciones principales para uso en countdown.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-600">
            Inspeccion automatica: datos del archivo + compatibilidad del frame.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {value && !isDynamicColorSvg ? (
            <button
              type="button"
              onClick={handleConvertToEditableColor}
              disabled={uploading || convertingColor || !hasSvgText}
              title={
                hasSvgText
                  ? "Convierte fill/stroke del SVG a currentColor para habilitar el selector de color."
                  : "Esperando contenido SVG para convertir."
              }
              className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {convertingColor ? "Convirtiendo..." : "Hacer color editable"}
            </button>
          ) : null}
          {value ? (
            <button
              type="button"
              onClick={handleRemoveSvg}
              disabled={uploading || convertingColor}
              className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
            >
              Quitar SVG
            </button>
          ) : null}
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100">
            {uploading ? "Procesando..." : "Subir SVG"}
            <input
              type="file"
              accept=".svg,image/svg+xml"
              className="hidden"
              onChange={handleFileChange}
              disabled={convertingColor}
            />
          </label>
        </div>
      </div>

      {localError ? (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {localError}
        </div>
      ) : null}

      {criticalErrors.length > 0 ? (
        <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <p className="font-semibold">Bloquean guardado</p>
          <ul className="mt-1 space-y-1">
            {criticalErrors.map((errorText, index) => (
              <li key={`${errorText}-${index}`}>- {errorText}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-slate-700">Resumen del SVG</p>
        <dl className="grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-3">
          <MetricCard
            label="Archivo"
            value={summary.fileName}
            hint="Es el nombre del archivo que subiste."
          />
          <MetricCard
            label="Tipo MIME"
            value={summary.mimeType}
            hint="Confirma el formato detectado por el navegador."
          />
          <MetricCard
            label="Peso"
            value={summary.bytesLabel}
            hint="Cuanto ocupa el archivo: menos peso carga mas rapido."
          />
          <MetricCard
            label="viewBox"
            value={summary.viewBox}
            hint="Es el lienzo interno del dibujo que se usa para escalar."
          />
          <MetricCard
            label="Tamano viewBox"
            value={summary.viewBoxSize}
            hint="Muestra ancho x alto del lienzo interno."
          />
          <MetricCard
            label="Relacion"
            value={summary.ratio}
            hint="Compara ancho y alto. Lo ideal para marcos es 1:1."
          />
          <MetricCard
            label="Cuadrado"
            value={summary.isSquare}
            hint="Si es Si, el frame suele verse proporcionado en el countdown."
          />
          <MetricCard
            label="Width/height fijo"
            value={summary.hasFixedDimensions}
            hint="Si dice Si, trae tamano bloqueado. Mejor dejarlo en No."
          />
          <MetricCard
            label="Color editable"
            value={summary.dynamicColor}
            hint="Si dice Si, podras cambiar el color del frame desde el preset."
          />
        </dl>
        {value && !isDynamicColorSvg ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
            Este archivo usa color fijo. Usa "Hacer color editable" para convertirlo a currentColor.
          </p>
        ) : null}
      </div>

      {previewUrl ? (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <p className="mb-1 text-xs font-medium text-slate-700">Vista previa del archivo SVG</p>
          <div className="flex justify-center">
            <img
              src={previewUrl}
              alt="Preview SVG countdown frame"
              className="max-h-36 w-auto object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
