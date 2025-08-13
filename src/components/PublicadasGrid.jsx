import { useEffect, useMemo, useState } from "react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/firebase";
import { Link2, Copy, ExternalLink, Image as ImageIcon } from "lucide-react";
import { Pencil } from "lucide-react";

/**
 * Vista: Lista (tabla) de invitaciones publicadas
 * Columnas: Preview | Nombre | Estado | Fecha de publicación | Invitados confirmados
 */
export default function PublicadasGrid({ usuario }) {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPublicadas = async () => {
      if (!usuario?.uid) {
        setItems([]);
        setCargando(false);
        return;
      }
      setCargando(true);
      setError("");
      try {
        const q = query(
          collection(db, "publicadas"),
          where("userId", "==", usuario.uid),
          orderBy("publicadaEn", "desc")
        );
        const snap = await getDocs(q);
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setItems(docs);
      } catch (e) {
        // @ts-ignore
        setError(e?.message || "Error al cargar publicaciones");
        setItems([]);
      } finally {
        setCargando(false);
      }
    };
    fetchPublicadas();
  }, [usuario?.uid]);

  const filas = useMemo(() => {
    const ahora = Date.now();
    return items.map((it) => {
      // Derivar estado: Activa / Pausada / Expirada / Sin URL
      let estado = "Activa";
      if (it.activa === false) estado = "Pausada";
      if (it.vigenteHasta?.toDate && it.vigenteHasta.toDate().getTime() < ahora) estado = "Expirada";
      if (!it.urlPublica) estado = "Sin URL";

      // Confirmados: soporta distintos esquemas posibles
      const confirmados =
        typeof it.confirmados === "number"
          ? it.confirmados
          : typeof it.confirmadosCount === "number"
            ? it.confirmadosCount
            : typeof it.invitadosConfirmados === "number"
              ? it.invitadosConfirmados
              : 0;

      return {
        id: it.id,
        nombre: it.nombre || it.slug || "(sin nombre)",
        portada: it.portada,
        url: it.urlPublica || "",
        publicadaEn: it.publicadaEn?.toDate ? it.publicadaEn.toDate() : null,
        estado,
        confirmados,
        borradorSlug: it.borradorSlug || it.borradorId || it.slug || it.id,
      };
    });
  }, [items]);

  if (cargando) {
    return (
      <div className="mt-10 space-y-3">
        <div className="h-6 w-48 bg-gray-200 animate-pulse rounded" />
        <div className="w-full overflow-hidden rounded-xl border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[72px_1fr_120px_180px_180px] items-center gap-3 px-3 sm:px-4 py-3 border-b">
              <div className="h-14 w-14 bg-gray-100 animate-pulse rounded" />
              <div className="h-4 bg-gray-100 animate-pulse rounded w-3/5" />
              <div className="h-4 bg-gray-100 animate-pulse rounded w-24" />
              <div className="h-4 bg-gray-100 animate-pulse rounded w-36" />
              <div className="h-4 bg-gray-100 animate-pulse rounded w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-12 text-center text-red-600">
        <p className="font-medium">Ocurrió un error</p>
        <p className="text-sm opacity-80">{error}</p>
      </div>
    );
  }

  if (!filas.length) {
    return (
      <div className="text-center mt-12">
        <h2 className="text-xl font-bold mb-2">Tus invitaciones publicadas</h2>
        <p className="text-gray-500">Todavía no publicaste ninguna invitación.</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h2 className="text-xl font-semibold mb-4">Tus invitaciones publicadas</h2>

      {/* Contenedor responsivo: en móviles se apila, en desktop se ve tabular */}
      <div className="overflow-x-auto rounded-xl border">
        {/* Encabezado */}
        <div className="hidden md:grid grid-cols-[88px_1fr_160px_220px_220px_140px] bg-gray-50 text-gray-600 text-xs font-medium uppercase tracking-wide">
          <div className="px-4 py-3">Preview</div>
          <div className="px-4 py-3">Nombre</div>
          <div className="px-4 py-3">Estado</div>
          <div className="px-4 py-3">Fecha de publicación</div>
          <div className="px-4 py-3">Invitados confirmados</div>
          <div className="px-4 py-3 text-right">Editar</div>
        </div>

        {/* Filas */}
        <ul className="divide-y">
          {filas.map((f) => (
            <li
              key={f.id}
              className="group grid md:grid-cols-[88px_1fr_160px_220px_220px_140px] grid-cols-1 gap-3 md:gap-0 items-center px-3 sm:px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              {/* Preview */}
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 rounded-lg overflow-hidden bg-gray-100 border">
                  <a href={f.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {f.portada ? (
                      <img
                        src={f.portada}
                        alt={`Portada de ${f.nombre}`}
                        className="h-full w-full object-cover object-top"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-gray-400">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                    )}
                  </a>
                </div>
                {/* Acciones rápidas en móvil */}
                <div className="flex md:hidden items-center gap-2">
                  {f.url ? (
                    <>
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir invitación"
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 border rounded hover:bg-gray-100"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Ver
                      </a>
                      <button
                        onClick={() => copiar(f.url)}
                        title="Copiar link"
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 border rounded hover:bg-gray-100"
                      >
                        <Copy className="h-3.5 w-3.5" /> Copiar
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Nombre */}
              <div className="md:px-4">
                <div className="font-medium text-gray-800 truncate">{f.nombre}</div>
              </div>

              {/* Estado */}
              <div className="md:px-4">
                <EstadoPill valor={f.estado} />
              </div>

              {/* Fecha */}
              <div className="md:px-4 text-sm text-gray-700">
                {f.publicadaEn ? f.publicadaEn.toLocaleDateString() : "(sin fecha)"}
              </div>

              {/* Confirmados */}
              <div className="md:px-4 text-sm text-gray-700">{f.confirmados}</div>
              {/* 🔹 NUEVA celda: botón Editar */}
              <div className="md:px-4 flex md:justify-end">
                {f.borradorSlug ? (
                  <a
                    href={`/dashboard/?slug=${encodeURIComponent(f.borradorSlug)}`}
                    className="inline-flex items-center gap-2 text-xs font-medium px-2.5 py-1.5 border rounded-lg hover:bg-gray-100"
                    title="Editar borrador"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">No disponible</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EstadoPill({ valor }) {
  const base = "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium";
  const styles = {
    Activa: "bg-green-50 text-green-700 border border-green-200",
    Pausada: "bg-amber-50 text-amber-700 border border-amber-200",
    Expirada: "bg-gray-100 text-gray-600 border border-gray-200",
    "Sin URL": "bg-red-50 text-red-700 border border-red-200",
  };
  const cls = styles[valor] || "bg-gray-50 text-gray-700 border border-gray-200";
  return <span className={`${base} ${cls}`}>{valor}</span>;
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch (e) {
    console.warn("No se pudo copiar al portapapeles", e);
  }
}
