import { useEffect, useMemo, useRef, useState } from "react";
import {
  getFrameAssetPrimaryError,
  inspectFrameAssetFile,
} from "@/domain/countdownPresets/frameAssetInspector";
import {
  convertSvgToCurrentColor,
  inspectSvgText,
  svgTextToBase64,
} from "@/domain/countdownPresets/svgInspector";
import { resolveCountdownFrameAssetType } from "@/domain/countdownPresets/frameAssetContract";

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

export default function SvgUploadInspector({ value, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [convertingColor, setConvertingColor] = useState(false);
  const [localError, setLocalError] = useState("");
  const [technicalError, setTechnicalError] = useState("");
  const objectUrlRef = useRef(null);
  const fileInputRef = useRef(null);
  const uploadButtonRef = useRef(null);
  const restoreUploadFocusRef = useRef(false);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    []
  );

  useEffect(() => {
    if (uploading || !restoreUploadFocusRef.current) return undefined;
    restoreUploadFocusRef.current = false;
    const frameId = window.requestAnimationFrame(() => {
      try {
        uploadButtonRef.current?.focus({ preventScroll: true });
      } catch {
        uploadButtonRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [uploading]);

  const assetType = resolveCountdownFrameAssetType(value, value ? "svg" : null);
  const isSvg = assetType === "svg";
  const hasSvgText = Boolean(isSvg && String(value?.svgText || "").trim());
  const isDynamicColorSvg =
    isSvg && value?.colorMode === "currentColor";
  const previewUrl = value?.previewUrl || value?.downloadUrl || "";
  const warnings = Array.isArray(value?.inspection?.warnings)
    ? value.inspection.warnings
    : [];
  const fileSummary = useMemo(() => {
    const size = formatBytes(value?.byteSize);
    const dimensions =
      Number(value?.width) > 0 && Number(value?.height) > 0
        ? `${value.width} × ${value.height} px`
        : "";
    return [assetType?.toUpperCase(), size, dimensions]
      .filter(Boolean)
      .join(" · ");
  }, [assetType, value?.byteSize, value?.height, value?.width]);

  const replaceObjectUrl = (nextUrl) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = nextUrl;
  };

  const handleFileChange = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setUploading(true);
    setLocalError("");
    setTechnicalError("");

    try {
      const report = await inspectFrameAssetFile(file);
      if (!report?.valid) {
        setLocalError(getFrameAssetPrimaryError(report));
        setTechnicalError(
          Array.isArray(report?.criticalErrors)
            ? report.criticalErrors.join(" ")
            : ""
        );
        return;
      }

      const type = report.type;
      const svgText = type === "svg" ? report.svgText || "" : "";
      const previewSource =
        type === "svg"
          ? new Blob([svgText], { type: "image/svg+xml" })
          : file;
      const nextUrl = URL.createObjectURL(previewSource);
      replaceObjectUrl(nextUrl);

      onChange?.({
        valid: true,
        type,
        mimeType: report.mimeType,
        fileName: file.name,
        byteSize: Number(file.size || 0),
        width:
          type === "png"
            ? Number(report?.checks?.width || 0)
            : Number(report?.checks?.viewBoxWidth || 0) || null,
        height:
          type === "png"
            ? Number(report?.checks?.height || 0)
            : Number(report?.checks?.viewBoxHeight || 0) || null,
        hasAlpha:
          type === "png" ? report?.checks?.hasAlpha === true : null,
        hasTransparency:
          type === "png" &&
          typeof report?.checks?.hasTransparency === "boolean"
            ? report.checks.hasTransparency
            : null,
        svgText,
        assetBase64: report.assetBase64 || null,
        svgBase64: type === "svg" ? report.assetBase64 || null : null,
        previewUrl: nextUrl,
        downloadUrl: null,
        colorMode:
          type === "svg"
            ? report?.checks?.colorMode || "fixed"
            : "fixed",
        inspection: report,
        isDirty: true,
      });
    } catch (error) {
      setLocalError(getFrameAssetPrimaryError(error));
      setTechnicalError(
        typeof error?.message === "string" ? error.message : ""
      );
    } finally {
      restoreUploadFocusRef.current = true;
      setUploading(false);
      input.value = "";
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleConvertToEditableColor = async () => {
    if (!isSvg || !hasSvgText || !value) return;
    setConvertingColor(true);
    setLocalError("");
    setTechnicalError("");

    try {
      const converted = convertSvgToCurrentColor(value.svgText);
      if (!converted.changed || !converted.svgText) {
        setLocalError(
          value.colorMode === "currentColor"
            ? "El SVG ya permite cambiar el color."
            : "No pudimos habilitar el color editable automáticamente."
        );
        return;
      }

      const nextByteSize = new Blob([converted.svgText], {
        type: "image/svg+xml",
      }).size;
      const report = inspectSvgText({
        svgText: converted.svgText,
        fileName: value.fileName || "frame.svg",
        byteSize: nextByteSize,
        mimeType: "image/svg+xml",
      });
      if (!report.valid) {
        setLocalError(getFrameAssetPrimaryError(report));
        setTechnicalError(report.criticalErrors.join(" "));
        return;
      }

      const nextUrl = URL.createObjectURL(
        new Blob([converted.svgText], { type: "image/svg+xml" })
      );
      replaceObjectUrl(nextUrl);
      const base64 = svgTextToBase64(converted.svgText);
      onChange?.({
        ...value,
        type: "svg",
        mimeType: "image/svg+xml",
        valid: true,
        byteSize: nextByteSize,
        svgText: converted.svgText,
        assetBase64: base64,
        svgBase64: base64,
        previewUrl: nextUrl,
        colorMode: report?.checks?.colorMode || "currentColor",
        inspection: {
          ...report,
          type: "svg",
          mimeType: "image/svg+xml",
        },
        isDirty: true,
      });
    } catch (error) {
      setLocalError("No pudimos habilitar el color editable automáticamente.");
      setTechnicalError(
        typeof error?.message === "string" ? error.message : ""
      );
    } finally {
      setConvertingColor(false);
    }
  };

  const handleRemove = () => {
    setLocalError("");
    setTechnicalError("");
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    onChange?.(null);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            Archivo del frame
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            Acepta SVG o PNG de hasta 500 KB y 5 MB, respectivamente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {value ? (
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading || convertingColor}
              className="inline-flex min-h-11 items-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 outline-none hover:bg-rose-100 focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50"
            >
              Quitar
            </button>
          ) : null}
          <span className="relative inline-flex">
            <button
              ref={uploadButtonRef}
              type="button"
              onClick={handleUploadClick}
              disabled={uploading || convertingColor}
              aria-label={value ? "Reemplazar frame" : "Subir frame"}
              className="inline-flex min-h-11 items-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 outline-none hover:bg-violet-100 focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading
                ? "Validando..."
                : value
                  ? "Reemplazar"
                  : "Subir archivo"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".svg,.png,image/svg+xml,image/png"
              tabIndex={-1}
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-hidden border-0 p-0 opacity-0 [clip-path:inset(50%)] [clip:rect(0,0,0,0)]"
              onChange={handleFileChange}
              disabled={uploading || convertingColor}
            />
          </span>
        </div>
      </div>

      <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
          ¿Qué archivo conviene usar?
        </summary>
        <div className="mt-2 space-y-2 text-xs leading-5 text-slate-600">
          <p>
            <strong className="text-slate-800">SVG:</strong> Usá SVG para
            marcos simples, líneas, formas o diseños que necesiten cambiar de
            color. Se mantiene nítido en cualquier tamaño.
          </p>
          <p>
            <strong className="text-slate-800">PNG:</strong> Usá PNG para
            flores, acuarelas, texturas, sombras o ilustraciones complejas.
            Recomendamos fondo transparente y buena resolución.
          </p>
          <p>
            Para PNG, usá preferentemente una imagen cuadrada, transparente y
            de al menos 1200 × 1200 px.
          </p>
        </div>
      </details>

      {localError ? (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
        >
          <p className="font-semibold">{localError}</p>
          <p className="mt-0.5">
            El archivo anterior se conservó. Revisá el formato y volvé a
            intentarlo.
          </p>
          {process.env.NODE_ENV === "development" && technicalError ? (
            <details className="mt-1">
              <summary className="cursor-pointer">Detalle técnico</summary>
              <p className="mt-1 break-words">{technicalError}</p>
            </details>
          ) : null}
        </div>
      ) : null}

      {value ? (
        <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 sm:grid-cols-[minmax(0,1fr)_112px] sm:items-center">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-800">
              {value.fileName || "Frame seleccionado"}
            </p>
            {fileSummary ? (
              <p className="mt-0.5 text-[11px] text-slate-500">
                {fileSummary}
              </p>
            ) : null}
            {warnings[0] ? (
              <p role="status" className="mt-1 text-[11px] text-amber-700">
                {warnings[0]}
              </p>
            ) : null}
            {isSvg && !isDynamicColorSvg && hasSvgText ? (
              <button
                type="button"
                onClick={handleConvertToEditableColor}
                disabled={uploading || convertingColor}
                className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50"
              >
                {convertingColor
                  ? "Preparando color..."
                  : "Habilitar color editable"}
              </button>
            ) : null}
          </div>
          {previewUrl ? (
            <div
              className="flex h-28 items-center justify-center overflow-hidden rounded-lg border border-slate-200 p-1"
              style={{
                backgroundColor: "#f8fafc",
                backgroundImage:
                  "linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)",
                backgroundPosition:
                  "0 0, 0 8px, 8px -8px, -8px 0",
                backgroundSize: "16px 16px",
              }}
            >
              <img
                src={previewUrl}
                alt={`Vista previa de ${value.fileName || "frame"}`}
                className="pointer-events-none h-full w-full object-contain"
              />
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          El frame es opcional. Podés agregarlo o continuar sin archivo.
        </p>
      )}
    </div>
  );
}
