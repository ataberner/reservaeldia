import { useMemo, useRef, useState } from "react";

function normalizeText(value) {
  return String(value || "").trim();
}

function toSafeUrls(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

function formatCountLabel(count, singular, plural) {
  const safeCount = Number.isFinite(count) ? count : 0;
  return `${safeCount} ${safeCount === 1 ? singular : plural}`;
}

function buildNextSelection({ currentUrls, nextUrl, isSingle, maxImages }) {
  const safeUrl = normalizeText(nextUrl);
  if (!safeUrl) return currentUrls;
  if (isSingle) {
    if (currentUrls.length === 1 && currentUrls[0] === safeUrl) return currentUrls;
    return [safeUrl];
  }
  if (currentUrls.includes(safeUrl)) return currentUrls;
  if (currentUrls.length >= maxImages) return currentUrls;
  return [...currentUrls, safeUrl].slice(0, maxImages);
}

function moveItem(items, index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) return items;

  const next = [...items];
  const [movedItem] = next.splice(index, 1);
  next.splice(targetIndex, 0, movedItem);
  return next;
}

export default function TemplateMediaFieldInput({
  field,
  value,
  defaultImages = [],
  isTouched = false,
  maxImages = 12,
  galleryRules = null,
  libraryImages = [],
  libraryLoading = false,
  libraryHasMore = false,
  libraryUploading = false,
  openingEditor = false,
  onLoadMoreLibrary,
  onUploadFiles,
  onChange,
}) {
  const fileInputRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadingLocal, setUploadingLocal] = useState(false);

  const selectedUrls = useMemo(() => {
    const rawUrls = toSafeUrls(value);
    if (rawUrls.length > 0) return rawUrls.slice(0, maxImages);
    if (isTouched) return [];
    return toSafeUrls(defaultImages).slice(0, maxImages);
  }, [defaultImages, isTouched, maxImages, value]);
  const isSingle = maxImages === 1;
  const remainingSlots = isSingle ? 1 : Math.max(0, maxImages - selectedUrls.length);
  const effectiveUploading = libraryUploading || uploadingLocal;

  const handleSelectLibraryImage = (url) => {
    if (openingEditor) return;

    const nextSelection = buildNextSelection({
      currentUrls: selectedUrls,
      nextUrl: url,
      isSingle,
      maxImages,
    });

    if (nextSelection === selectedUrls) {
      if (!isSingle && selectedUrls.length >= maxImages) {
        setErrorMessage(`Puedes seleccionar hasta ${maxImages} imagenes en este campo.`);
      }
      return;
    }

    setErrorMessage("");
    onChange?.(nextSelection);
  };

  const handleRemoveAt = (index) => {
    if (openingEditor) return;
    setErrorMessage("");
    onChange?.(selectedUrls.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleMove = (index, direction) => {
    if (openingEditor) return;
    setErrorMessage("");
    onChange?.(moveItem(selectedUrls, index, direction));
  };

  const handleUploadInput = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    if (!isSingle && files.length > remainingSlots) {
      setErrorMessage(
        `Puedes agregar hasta ${remainingSlots} ${remainingSlots === 1 ? "imagen mas" : "imagenes mas"}.`
      );
      return;
    }

    setErrorMessage("");
    setUploadingLocal(true);

    try {
      const uploadedUrls = await onUploadFiles?.(files);
      const safeUploadedUrls = toSafeUrls(uploadedUrls);
      if (!safeUploadedUrls.length) return;

      const nextSelection = isSingle
        ? [safeUploadedUrls[safeUploadedUrls.length - 1]]
        : [...selectedUrls, ...safeUploadedUrls.filter((url) => !selectedUrls.includes(url))].slice(
            0,
            maxImages
          );

      setPickerOpen(true);
      onChange?.(nextSelection);
    } catch (error) {
      setErrorMessage(String(error?.message || "No se pudieron subir las imagenes."));
    } finally {
      setUploadingLocal(false);
    }
  };

  return (
    <div className="rounded-lg border border-[#ece3fb] bg-white p-3 md:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-900">{field.label}</p>
          {field.helperText ? (
            <p className="mt-1 text-[11px] leading-5 text-slate-500">{field.helperText}</p>
          ) : null}
        </div>
        <span className="text-[11px] text-slate-500">Maximo {maxImages}</span>
      </div>

      <p className="mt-2 text-[11px] leading-5 text-slate-500">
        {galleryRules?.recommendedSizeText
          ? `Recomendado: ${galleryRules.recommendedSizeText}.`
          : "Sube imagenes en buena calidad para mantener el resultado premium."}
        {galleryRules?.recommendedRatio ? ` Ratio sugerido: ${galleryRules.recommendedRatio}.` : ""}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={openingEditor || effectiveUploading}
          className="rounded-md border border-[#e1d5f8] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#5f3596] hover:bg-[#f7f2ff] disabled:opacity-60"
        >
          {effectiveUploading ? "Subiendo..." : isSingle ? "Subir imagen" : "Subir imagenes"}
        </button>
        <button
          type="button"
          onClick={() => setPickerOpen((current) => !current)}
          disabled={openingEditor}
          className="rounded-md border border-[#ded2f5] bg-[#f7f2ff] px-2.5 py-1.5 text-[11px] font-semibold text-[#5f3596] hover:bg-[#f0e6ff] disabled:opacity-60"
        >
          {pickerOpen ? "Ocultar mis fotos" : "Elegir de mis fotos"}
        </button>
        <span className="text-[11px] text-slate-500">
          {formatCountLabel(selectedUrls.length, "foto seleccionada", "fotos seleccionadas")}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={!isSingle}
        onChange={handleUploadInput}
        disabled={openingEditor || effectiveUploading}
        className="hidden"
      />

      {errorMessage ? (
        <p className="mt-2 text-[11px] text-rose-600">{errorMessage}</p>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {selectedUrls.length > 0 ? (
          selectedUrls.map((url, index) => (
            <div
              key={`${field.key}-selected-${url}-${index}`}
              className="overflow-hidden rounded-xl border border-[#eadff8] bg-white"
            >
              <div className="relative aspect-square overflow-hidden bg-slate-50">
                <img
                  src={url}
                  alt={`${field.label} ${index + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                <span className="absolute left-2 top-2 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {index + 1}
                </span>
              </div>

              <div className="flex items-center justify-between gap-1 border-t border-[#f1e8ff] p-1.5">
                <button
                  type="button"
                  onClick={() => handleMove(index, -1)}
                  disabled={openingEditor || index === 0}
                  className="rounded-md border border-[#eadff8] px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveAt(index)}
                  disabled={openingEditor}
                  className="rounded-md border border-[#f1d5de] px-2 py-1 text-[10px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                >
                  Quitar
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(index, 1)}
                  disabled={openingEditor || index === selectedUrls.length - 1}
                  className="rounded-md border border-[#eadff8] px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  →
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full rounded-xl border border-dashed border-[#e6dcf8] bg-[#fcf9ff] px-3 py-4 text-[11px] text-slate-500">
            {isSingle
              ? "Todavia no elegiste una imagen para este bloque."
              : "Todavia no elegiste fotos para esta galeria."}
          </div>
        )}
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        {isSingle
          ? "Seleccionar otra foto reemplaza la actual."
          : "Cada foto nueva se agrega al final. Puedes reordenarlas con las flechas."}
      </p>

      {pickerOpen ? (
        <div className="mt-3 rounded-xl border border-[#ece3fb] bg-[#faf7ff] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#5f3596]">
              Mis imagenes
            </p>
            <span className="text-[11px] text-slate-500">
              {libraryLoading ? "Cargando..." : formatCountLabel(libraryImages.length, "foto", "fotos")}
            </span>
          </div>

          {libraryImages.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {libraryImages.map((image) => {
                const imageUrl = normalizeText(image?.url);
                const alreadySelected = selectedUrls.includes(imageUrl);
                const selectionDisabled = !isSingle && !alreadySelected && selectedUrls.length >= maxImages;

                return (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => handleSelectLibraryImage(imageUrl)}
                    disabled={openingEditor || selectionDisabled}
                    className={`overflow-hidden rounded-xl border text-left transition ${
                      alreadySelected
                        ? "border-[#6f3bc0] ring-2 ring-[#6f3bc0]/15"
                        : "border-[#e7ddf8] hover:border-[#d1baf7]"
                    } ${selectionDisabled ? "opacity-55" : ""}`}
                  >
                    <div className="aspect-square overflow-hidden bg-white">
                      <img
                        src={image.thumbnailUrl || imageUrl}
                        alt={image.name || "Imagen guardada"}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="border-t border-[#f1e8ff] bg-white px-2 py-1.5 text-[10px] font-medium text-slate-600">
                      {alreadySelected
                        ? isSingle
                          ? "Imagen activa"
                          : "Ya elegida"
                        : isSingle
                          ? "Usar imagen"
                          : "Agregar"}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#e6dcf8] bg-white px-3 py-4 text-[11px] text-slate-500">
              Tus fotos guardadas van a aparecer aca apenas subas la primera.
            </div>
          )}

          {libraryHasMore ? (
            <button
              type="button"
              onClick={onLoadMoreLibrary}
              disabled={openingEditor || libraryLoading}
              className="mt-3 rounded-md border border-[#e1d5f8] bg-white px-3 py-1.5 text-[11px] font-medium text-[#5f3596] hover:bg-[#f7f2ff] disabled:opacity-60"
            >
              {libraryLoading ? "Cargando..." : "Cargar mas fotos"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
