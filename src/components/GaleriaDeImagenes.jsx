import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import ConfirmDeleteImagesModal from "@/components/ConfirmDeleteImagesModal";

export default function GaleriaDeImagenes({
  imagenes = [],
  imagenesEnProceso = [],
  cargarImagenes,
  cargando,
  seccionActivaId,
  borrarImagen,
  hayMas,
  onInsertar,
  onSelectImage,
  getImageActions,
  onSeleccionadasChange,
}) {
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [accionesAbiertasId, setAccionesAbiertasId] = useState("");
  const [mostrarModalBorrado, setMostrarModalBorrado] = useState(false);
  const [borrandoSeleccionadas, setBorrandoSeleccionadas] = useState(false);
  const loadMoreRef = useRef(null);

  useEffect(() => {
    if (typeof onSeleccionadasChange === "function") {
      onSeleccionadasChange(seleccionadas.length);
    }
  }, [seleccionadas, onSeleccionadasChange]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hayMas || typeof cargarImagenes !== "function") return undefined;
    if (typeof IntersectionObserver === "undefined") return undefined;

    let didRequest = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || didRequest || cargando || !hayMas) return;
        didRequest = true;
        cargarImagenes(false);
      },
      { root: null, rootMargin: "180px 0px", threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cargando, hayMas, cargarImagenes]);

  useEffect(() => {
    cargarImagenes(true);
  }, [cargarImagenes]);

  useEffect(() => {
    if (!accionesAbiertasId) return;
    if (imagenes.some((img) => img.id === accionesAbiertasId)) return;
    setAccionesAbiertasId("");
  }, [accionesAbiertasId, imagenes]);

  const toggleSeleccion = (id) => {
    setSeleccionadas((prev) =>
      prev.includes(id) ? prev.filter((imgId) => imgId !== id) : [...prev, id]
    );
  };

  const borrarSeleccionadas = async () => {
    if (!seleccionadas.length || borrandoSeleccionadas) return;

    setBorrandoSeleccionadas(true);
    const idsSeleccionadas = [...seleccionadas];

    try {
      for (const id of idsSeleccionadas) {
        const img = imagenes.find((item) => item.id === id);
        if (img) await borrarImagen(img);
      }
      setSeleccionadas([]);
      setMostrarModalBorrado(false);
    } finally {
      setBorrandoSeleccionadas(false);
    }
  };

  const cancelarSeleccion = () => {
    setSeleccionadas([]);
    setMostrarModalBorrado(false);
  };

  return (
    <div className="relative w-full">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 w-full">
        {imagenesEnProceso.map((nombre) => (
          <div
            key={nombre}
            className="relative bg-gray-200 rounded shadow animate-pulse w-full aspect-square flex items-center justify-center text-xs text-gray-500"
          >
            Cargando...
          </div>
        ))}

        {imagenes.map((img) => {
          const estaSeleccionada = seleccionadas.includes(img.id);
          const imageActions =
            typeof getImageActions === "function"
              ? (getImageActions(img) || []).filter(Boolean)
              : [];

          return (
            <div
              key={img.id}
              className={`relative bg-white rounded shadow overflow-visible cursor-pointer hover:scale-105 transition w-full aspect-square group ${
                accionesAbiertasId === img.id ? "z-30" : ""
              }`}
              onClick={() => {
                if (typeof img.url !== "string") return;
                setAccionesAbiertasId("");

                if (typeof onSelectImage === "function") {
                  onSelectImage(img);
                  return;
                }

                onInsertar({
                  id: `img-${Date.now()}`,
                  tipo: "imagen",
                  src: img.url,
                  ancho: Number.isFinite(img.ancho) ? img.ancho : undefined,
                  alto: Number.isFinite(img.alto) ? img.alto : undefined,
                  seccionId: seccionActivaId,
                });
              }}
            >
              <img
                src={img.thumbnailUrl || img.url}
                alt={img.nombre}
                className="w-full h-full rounded object-cover"
              />

              <div
                onClick={(event) => {
                  event.stopPropagation();
                  toggleSeleccion(img.id);
                }}
                className={`absolute top-1 left-1 w-5 h-5 rounded-sm border text-xs font-bold flex items-center justify-center z-10 shadow-sm transition-colors duration-200 ${
                  estaSeleccionada
                    ? "bg-purple-600 border-purple-600 text-white"
                    : "bg-white/95 border-slate-500 text-transparent"
                }`}
              >
                {estaSeleccionada && "?"}
              </div>

              {imageActions.length > 0 && (
                <div className="absolute right-1 top-1 z-20">
                  <button
                    type="button"
                    aria-label="Mas acciones"
                    aria-haspopup="menu"
                    aria-expanded={accionesAbiertasId === img.id}
                    title="Mas acciones"
                    onClick={(event) => {
                      event.stopPropagation();
                      setAccionesAbiertasId((current) => (current === img.id ? "" : img.id));
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-white/80 bg-white/95 text-zinc-700 shadow-sm transition hover:bg-purple-50"
                  >
                    <MoreHorizontal size={15} aria-hidden="true" />
                  </button>
                  {accionesAbiertasId === img.id && (
                    <div
                      role="menu"
                      className="absolute right-0 top-8 flex min-w-[138px] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 text-left shadow-lg"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {imageActions.map((action) => (
                        <button
                          key={action.key || action.label}
                          type="button"
                          role="menuitem"
                          title={action.title || action.label}
                          aria-label={action.title || action.label}
                          disabled={action.disabled === true}
                          onClick={(event) => {
                            event.stopPropagation();
                            action.onClick?.(img, event);
                            setAccionesAbiertasId("");
                          }}
                          className="min-h-[32px] px-2.5 py-1.5 text-left text-[11px] font-semibold leading-tight text-zinc-700 transition hover:bg-purple-50 hover:text-purple-800 disabled:cursor-not-allowed disabled:text-zinc-300"
                        >
                          <span className="block truncate">{action.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div ref={loadMoreRef} aria-hidden="true" className="h-1 w-full" />

      {seleccionadas.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white text-purple-800 rounded shadow-md p-3 flex gap-4 z-50">
          <button
            onClick={() => setMostrarModalBorrado(true)}
            className="text-red-600 font-semibold hover:underline"
            disabled={borrandoSeleccionadas}
          >
            Eliminar
          </button>
          <button
            onClick={cancelarSeleccion}
            className="text-gray-500 hover:underline"
            disabled={borrandoSeleccionadas}
          >
            Cancelar
          </button>
        </div>
      )}

      <ConfirmDeleteImagesModal
        isOpen={mostrarModalBorrado}
        selectedCount={seleccionadas.length}
        isDeleting={borrandoSeleccionadas}
        onCancel={() => {
          if (borrandoSeleccionadas) return;
          setMostrarModalBorrado(false);
        }}
        onConfirm={borrarSeleccionadas}
      />
    </div>
  );
}

