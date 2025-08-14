// src/components/PublicadasGrid.jsx
import { useEffect, useMemo, useState } from "react";
import { collection, query, where, orderBy, getDocs, onSnapshot } from "firebase/firestore"; // 👈 agregamos onSnapshot
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

  // 🆕 Estados para selección y RSVPs
  const [publicacionSeleccionada, setPublicacionSeleccionada] = useState(null); // { id, nombre }
  const [rsvps, setRsvps] = useState([]);
  const [cargandoRsvps, setCargandoRsvps] = useState(false);
  const [errorRsvps, setErrorRsvps] = useState("");

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

        // 🔢 Para cada publicación contamos confirmados en subcolección rsvps
        const docs = await Promise.all(
          snap.docs.map(async (d) => {
            const data = { id: d.id, ...d.data() };

            const rsvpsSnap = await getDocs(collection(db, "publicadas", d.id, "rsvps"));

            let confirmadosCount = 0;
            rsvpsSnap.forEach((r) => {
              const rv = r.data();

              // ✅ Normalizamos el "sí"
              const confirma =
                typeof rv.confirma === "boolean"
                  ? rv.confirma
                  : (typeof rv.confirmado === "boolean"
                    ? rv.confirmado
                    : (rv.asistencia === "si" || rv.asistencia === "sí"));

              if (confirma) {
                // 👥 Sumamos cantidad si existe, sino 1
                const cantidad = rv.cantidad ?? rv.invitados ?? rv.asistentes ?? 1;
                confirmadosCount += Number(cantidad) || 0;
              }
            });

            return { ...data, confirmadosCount };
          })
        );

        setItems(docs);
      } catch (e) {
        setError(e?.message || "Error al cargar publicaciones");
        setItems([]);
      } finally {
        setCargando(false);
      }
    };

    fetchPublicadas();
  }, [usuario?.uid]);



  // 🔎 Normalización de filas
  const filas = useMemo(() => {
    const ahora = Date.now();
    return items.map((it) => {
      let estado = "Activa";
      if (it.activa === false) estado = "Pausada";
      if (it.vigenteHasta?.toDate && it.vigenteHasta.toDate().getTime() < ahora) estado = "Expirada";
      if (!it.urlPublica) estado = "Sin URL";

      const confirmados =
        typeof it.confirmados === "number"
          ? it.confirmados
          : typeof it.confirmadosCount === "number"
            ? it.confirmadosCount
            : typeof it.invitadosConfirmados === "number"
              ? it.invitadosConfirmados
              : 0;

      return {
        id: it.id, // 👈 lo usamos como <slug> de publicadas/<id>/rsvps
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

  // 🧭 Escuchar RSVPs de la publicación seleccionada
  useEffect(() => {
    if (!publicacionSeleccionada?.id) {
      setRsvps([]);
      return;
    }

    setCargandoRsvps(true);
    setErrorRsvps("");

    // Si tenés un campo de fecha en RSVPs, ordenalo por ese campo (p. ej. "creadoEn")
    // Si no, quitá el orderBy.
    const colRef = collection(db, "publicadas", publicacionSeleccionada.id, "rsvps");
    // Intentamos ordenar por un campo habitual, pero si no existe, podés quitar el orderBy:
    const q = query(colRef /* , orderBy("creadoEn", "desc") */);

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRsvps(docs);
        setCargandoRsvps(false);
      },
      (err) => {
        setErrorRsvps(err?.message || "Error al cargar RSVPs");
        setRsvps([]);
        setCargandoRsvps(false);
      }
    );

    return () => unsub();
  }, [publicacionSeleccionada?.id]);


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

  // 🔧 Convierte varios tipos de timestamp a Date
  const tsToDate = (v) => {
    if (!v) return null;
    // Firestore Timestamp
    if (typeof v.toDate === "function") return v.toDate();
    // Marca de tiempo en milisegundos (number)
    if (typeof v === "number") return new Date(v);
    // Objeto estilo { seconds, nanoseconds }
    if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
    return null;
  };


  return (
    <div className="mt-8">
      <h2 className="text-xl font-semibold mb-4">Tus invitaciones publicadas</h2>

      {/* Tabla de publicaciones */}
      <div className="overflow-x-auto rounded-xl border">
       <div
  className="
    hidden md:grid
    md:grid-cols-[72px_minmax(160px,1.5fr)_minmax(110px,0.8fr)_minmax(150px,1fr)_minmax(90px,0.6fr)_minmax(110px,0.8fr)]
    lg:grid-cols-[80px_minmax(200px,1.7fr)_minmax(120px,0.9fr)_minmax(170px,1.1fr)_minmax(100px,0.6fr)_minmax(120px,0.8fr)]
    xl:grid-cols-[88px_minmax(240px,2fr)_minmax(130px,0.9fr)_minmax(190px,1.1fr)_minmax(110px,0.6fr)_minmax(130px,0.8fr)]
    bg-gray-50 text-gray-600 text-xs font-medium uppercase tracking-wide
  "
>
  <div className="px-3 lg:px-4 py-3">Preview</div>
  <div className="px-3 lg:px-4 py-3">Nombre</div>
  <div className="px-3 lg:px-4 py-3">Estado</div>
  <div className="px-3 lg:px-4 py-3 whitespace-nowrap">Fecha</div>
  <div className="px-3 lg:px-4 py-3 text-right">Confirmados</div>
  <div className="px-3 lg:px-4 py-3 text-right">Editar</div>
</div>



      

        <ul className="divide-y">
          {filas.map((f) => {
            const selected = publicacionSeleccionada?.id === f.id;
            return (
             <li
  key={f.id}
  onClick={() => setPublicacionSeleccionada({ id: f.id, nombre: f.nombre })}
  className={
    `
    group grid
    md:grid-cols-[72px_minmax(160px,1.5fr)_minmax(110px,0.8fr)_minmax(150px,1fr)_minmax(90px,0.6fr)_minmax(110px,0.8fr)]
    lg:grid-cols-[80px_minmax(200px,1.7fr)_minmax(120px,0.9fr)_minmax(170px,1.1fr)_minmax(100px,0.6fr)_minmax(120px,0.8fr)]
    xl:grid-cols-[88px_minmax(240px,2fr)_minmax(130px,0.9fr)_minmax(190px,1.1fr)_minmax(110px,0.6fr)_minmax(130px,0.8fr)]
    grid-cols-1
    gap-2 md:gap-3 items-center
    px-3 sm:px-4 py-3 transition-colors cursor-pointer
    ${selected ? "bg-violet-50" : "hover:bg-gray-50"}`
  }
  title="Ver RSVPs de esta invitación"
>

                {/* Preview */}
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 rounded-lg overflow-hidden bg-gray-100 border">
                    <a href={f.url} target="_blank" rel="noreferrer" className="underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
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
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Ver
                        </a>
                        <button
                          onClick={(e) => { e.stopPropagation(); copiar(f.url); }}
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
                <div className="md:px-3 lg:px-4">
                  <div className="font-medium text-gray-800 truncate">{f.nombre}</div>
                </div>

                {/* Estado */}
                <div className="md:px-3 lg:px-4">
                  <EstadoPill valor={f.estado} />
                </div>

                {/* Fecha */}
                <div className="md:px-3 lg:px-4 text-sm text-gray-700 whitespace-nowrap">
                  {f.publicadaEn ? f.publicadaEn.toLocaleDateString() : "(sin fecha)"}
                </div>

                {/* 🆕 Confirmados */}
                <div className="md:px-3 lg:px-4 text-sm text-gray-800 text-right font-medium">
                  {f.confirmados}
                </div>

                {/* Editar */}
                <div className="md:px-3 lg:px-4 flex md:justify-end">
                  {f.borradorSlug ? (
                    <a
                      href={`/dashboard/?slug=${encodeURIComponent(f.borradorSlug)}`}
                      className="inline-flex items-center gap-2 text-xs font-medium px-2.5 py-1.5 border rounded-lg hover:bg-gray-100"
                      title="Editar borrador"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400 whitespace-nowrap">No disponible</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 🆕 Sección RSVPs debajo */}
      {publicacionSeleccionada?.id && (
        <div className="mt-8">
          <div className="flex items-end justify-between mb-3">
            <h3 className="text-lg font-semibold">
              RSVPs de: <span className="font-medium text-violet-700">{publicacionSeleccionada.nombre}</span>
            </h3>
            <div className="text-sm text-gray-500">
              {cargandoRsvps ? "Cargando..." : `${rsvps.length} registros`}
            </div>
          </div>

          {errorRsvps ? (
            <div className="p-3 rounded border border-red-200 bg-red-50 text-red-700 text-sm">
              {errorRsvps}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              {/* Encabezado */}
              <div className="hidden md:grid grid-cols-[1.5fr_110px_1fr_160px] bg-gray-50 text-gray-600 text-xs font-medium uppercase tracking-wide">
                <div className="px-4 py-3">Invitado</div>
                <div className="px-4 py-3">Confirma</div>
                <div className="px-4 py-3">Mensaje</div>
                <div className="px-4 py-3">Fecha</div>
              </div>

              <ul className="divide-y">
                {rsvps.map((r) => {
                  // 🔧 Normalizamos campos comunes
                  const nombre =
                    r.nombre ||
                    r.nombreCompleto ||
                    r.invitado ||
                    r.email ||
                    r.telefono ||
                    "(sin nombre)";
                  const confirma =
                    typeof r.confirma === "boolean"
                      ? r.confirma
                      : (typeof r.confirmado === "boolean" ? r.confirmado : (r.asistencia === "si" || r.asistencia === "sí"));
                  const cantidad = r.cantidad ?? r.invitados ?? r.asistentes ?? 1;
                  const mensaje = r.mensaje || r.comentarios || "";
                  // 🔎 Tomamos la fecha de creación desde el primer campo disponible
                  const fechaTS =
                    r.creadoEn ||
                    r.createdAt ||
                    r.fecha ||
                    r.fechaCreacion ||
                    r.enviadoEn ||
                    r.timestamp ||
                    null;

                  const fecha = tsToDate(fechaTS);


                  return (
                    <li key={r.id} className="grid md:grid-cols-[1.5fr_110px_1fr_160px] grid-cols-1 gap-2 md:gap-0 px-3 sm:px-4 py-3">
                      <div className="md:px-4">
                        <div className="font-medium text-gray-800">{nombre}</div>
                        {(r.email || r.telefono) && (
                          <div className="text-xs text-gray-500">
                            {r.email ? r.email : ""}{r.email && r.telefono ? " · " : ""}{r.telefono ? r.telefono : ""}
                          </div>
                        )}
                      </div>

                      <div className="md:px-4">
                        <span className={"inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium " + (confirma ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-600 border border-gray-200")}>
                          {confirma ? "Sí" : "No"}
                        </span>
                      </div>

                      <div className="md:px-4 text-sm text-gray-700 break-words">{mensaje || <span className="text-gray-400">(sin mensaje)</span>}</div>
                      <div className="md:px-4 text-sm text-gray-700">
                        {fecha ? fecha.toLocaleString() : "(sin fecha)"}
                      </div>
                    </li>
                  );
                })}

                {!cargandoRsvps && rsvps.length === 0 && (
                  <li className="px-4 py-6 text-sm text-gray-500">No hay RSVPs para esta invitación.</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EstadoPill({ valor }) {
  const base = "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium";
  const styles = {
    Activa: "bg-green-50 text-green-700 border border-green-200",
    Pausada: "bg-amber-50 text-amber-700 border border-amber-200",
    Expirada: "bg-gray-100 text-gray-600 border border-gray-200",
    "Sin URL": "bg-red-50 text-red-700 border red-200",
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
