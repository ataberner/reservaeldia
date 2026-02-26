import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/firebase";
import { Copy, ExternalLink, Image as ImageIcon, Pencil, X } from "lucide-react";
import {
  adaptRsvpResponse,
  buildColumns,
  computeConfirmedGuestsFromRaw,
  computeSummaryCards,
  formatAnswerValue,
  normalizeRsvpSnapshot,
} from "@/domain/rsvp/publicadas";

export default function PublicadasGrid({ usuario }) {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [publicacionIdSeleccionada, setPublicacionIdSeleccionada] = useState(null);
  const [rsvps, setRsvps] = useState([]);
  const [cargandoRsvps, setCargandoRsvps] = useState(false);
  const [errorRsvps, setErrorRsvps] = useState("");
  const [detalleId, setDetalleId] = useState(null);

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
        const publicacionesQuery = query(
          collection(db, "publicadas"),
          where("userId", "==", usuario.uid),
          orderBy("publicadaEn", "desc")
        );

        const publicacionesSnap = await getDocs(publicacionesQuery);

        const docs = await Promise.all(
          publicacionesSnap.docs.map(async (documento) => {
            const data = documento.data() || {};
            const rsvpsSnap = await getDocs(collection(db, "publicadas", documento.id, "rsvps"));

            let confirmadosCount = 0;
            rsvpsSnap.forEach((responseDoc) => {
              confirmadosCount += computeConfirmedGuestsFromRaw(responseDoc.data() || {});
            });

            return {
              id: documento.id,
              ...data,
              rsvp: normalizeRsvpSnapshot(data.rsvp),
              confirmadosCount,
            };
          })
        );

        setItems(docs);
      } catch (fetchError) {
        setItems([]);
        setError(fetchError?.message || "Error al cargar publicaciones");
      } finally {
        setCargando(false);
      }
    };

    fetchPublicadas();
  }, [usuario?.uid]);

  const filas = useMemo(() => {
    const ahora = Date.now();

    return items.map((item) => {
      let estado = "Activa";
      if (item.activa === false) estado = "Pausada";
      if (item.vigenteHasta?.toDate && item.vigenteHasta.toDate().getTime() < ahora) estado = "Expirada";
      if (!item.urlPublica) estado = "Sin URL";

      const confirmados =
        typeof item.confirmados === "number"
          ? item.confirmados
          : typeof item.confirmadosCount === "number"
            ? item.confirmadosCount
            : typeof item.invitadosConfirmados === "number"
              ? item.invitadosConfirmados
              : 0;

      return {
        id: item.id,
        nombre: item.nombre || item.slug || "(sin nombre)",
        portada: item.portada || null,
        url: item.urlPublica || "",
        publicadaEn: item.publicadaEn?.toDate ? item.publicadaEn.toDate() : null,
        estado,
        confirmados,
        borradorSlug: item.borradorSlug || item.borradorId || item.slug || item.id,
        rsvp: item.rsvp || null,
      };
    });
  }, [items]);

  const publicacionSeleccionada = useMemo(
    () => filas.find((fila) => fila.id === publicacionIdSeleccionada) || null,
    [filas, publicacionIdSeleccionada]
  );

  useEffect(() => {
    if (!filas.length) {
      setPublicacionIdSeleccionada(null);
      return;
    }

    if (!publicacionIdSeleccionada) {
      setPublicacionIdSeleccionada(filas[0].id);
      return;
    }

    const stillExists = filas.some((fila) => fila.id === publicacionIdSeleccionada);
    if (!stillExists) {
      setPublicacionIdSeleccionada(filas[0].id);
    }
  }, [filas, publicacionIdSeleccionada]);

  useEffect(() => {
    setDetalleId(null);
  }, [publicacionIdSeleccionada]);

  useEffect(() => {
    if (!publicacionSeleccionada?.id) {
      setRsvps([]);
      return;
    }

    setCargandoRsvps(true);
    setErrorRsvps("");

    const rsvpsCollection = collection(db, "publicadas", publicacionSeleccionada.id, "rsvps");
    const rsvpsQuery = query(rsvpsCollection);

    const unsubscribe = onSnapshot(
      rsvpsQuery,
      (snapshot) => {
        const docs = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
        setRsvps(docs);
        setCargandoRsvps(false);
      },
      (snapshotError) => {
        setErrorRsvps(snapshotError?.message || "Error al cargar RSVPs");
        setRsvps([]);
        setCargandoRsvps(false);
      }
    );

    return () => unsubscribe();
  }, [publicacionSeleccionada?.id]);

  const adaptedResponses = useMemo(
    () =>
      rsvps
        .map((response) => adaptRsvpResponse(response, publicacionSeleccionada?.rsvp || null))
        .sort((a, b) => {
          const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
          const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
          return bTime - aTime;
        }),
    [rsvps, publicacionSeleccionada?.rsvp]
  );

  const columns = useMemo(
    () => buildColumns(publicacionSeleccionada?.rsvp || null, adaptedResponses),
    [publicacionSeleccionada?.rsvp, adaptedResponses]
  );

  const visibleColumns = useMemo(
    () => columns.filter((column) => column.id !== "full_name"),
    [columns]
  );

  const summaryCards = useMemo(
    () => computeSummaryCards(adaptedResponses, publicacionSeleccionada?.rsvp || null),
    [adaptedResponses, publicacionSeleccionada?.rsvp]
  );

  const detalleRespuesta = useMemo(
    () => adaptedResponses.find((response) => response.id === detalleId) || null,
    [adaptedResponses, detalleId]
  );

  const detalleColumns = useMemo(() => {
    const hasFullName = columns.some((column) => column.id === "full_name");
    if (hasFullName) return columns;
    return [{ id: "full_name", label: "Invitado", type: "short_text" }, ...columns];
  }, [columns]);

  if (cargando) {
    return (
      <div className="mt-10 space-y-3">
        <div className="h-6 w-48 bg-gray-200 animate-pulse rounded" />
        <div className="w-full overflow-hidden rounded-xl border">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="grid grid-cols-[72px_1fr_120px_170px_100px_120px] items-center gap-3 px-4 py-3 border-b"
            >
              <div className="h-14 w-14 bg-gray-100 animate-pulse rounded" />
              <div className="h-4 bg-gray-100 animate-pulse rounded w-3/5" />
              <div className="h-4 bg-gray-100 animate-pulse rounded w-24" />
              <div className="h-4 bg-gray-100 animate-pulse rounded w-32" />
              <div className="h-4 bg-gray-100 animate-pulse rounded w-16" />
              <div className="h-4 bg-gray-100 animate-pulse rounded w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-12 text-center text-red-600">
        <p className="font-medium">Ocurrio un error</p>
        <p className="text-sm opacity-80">{error}</p>
      </div>
    );
  }

  if (!filas.length) {
    return (
      <div className="text-center mt-12">
        <h2 className="text-xl font-bold mb-2">Tus invitaciones publicadas</h2>
        <p className="text-gray-500">Todavia no publicaste ninguna invitacion.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-8">
      <div>
        <h2 className="text-xl font-semibold mb-4">Tus invitaciones publicadas</h2>
        <div className="overflow-x-auto rounded-xl border">
          <div className="hidden md:grid md:grid-cols-[72px_minmax(180px,1.7fr)_minmax(110px,0.8fr)_minmax(150px,1fr)_minmax(90px,0.5fr)_minmax(110px,0.8fr)] bg-gray-50 text-gray-600 text-xs font-medium uppercase tracking-wide">
            <div className="px-4 py-3">Preview</div>
            <div className="px-4 py-3">Nombre</div>
            <div className="px-4 py-3">Estado</div>
            <div className="px-4 py-3">Fecha</div>
            <div className="px-4 py-3 text-right">Confirmados</div>
            <div className="px-4 py-3 text-right">Editar</div>
          </div>

          <ul className="divide-y">
            {filas.map((fila) => {
              const selected = fila.id === publicacionIdSeleccionada;
              return (
                <li
                  key={fila.id}
                  onClick={() => setPublicacionIdSeleccionada(fila.id)}
                  className={`grid md:grid-cols-[72px_minmax(180px,1.7fr)_minmax(110px,0.8fr)_minmax(150px,1fr)_minmax(90px,0.5fr)_minmax(110px,0.8fr)] grid-cols-1 gap-2 px-3 sm:px-4 py-3 transition-colors cursor-pointer ${
                    selected ? "bg-violet-50" : "hover:bg-gray-50"
                  }`}
                  title="Ver RSVPs de esta invitacion"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-16 w-16 rounded-lg overflow-hidden bg-gray-100 border">
                      <a
                        href={fila.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {fila.portada ? (
                          <img
                            src={fila.portada}
                            alt={`Portada de ${fila.nombre}`}
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

                    <div className="md:hidden flex items-center gap-2">
                      {fila.url ? (
                        <>
                          <a
                            href={fila.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 border rounded hover:bg-gray-100"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> Ver
                          </a>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              copiar(fila.url);
                            }}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 border rounded hover:bg-gray-100"
                          >
                            <Copy className="h-3.5 w-3.5" /> Copiar
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="md:px-4">
                    <div className="font-medium text-gray-800 truncate">{fila.nombre}</div>
                  </div>

                  <div className="md:px-4">
                    <EstadoPill valor={fila.estado} />
                  </div>

                  <div className="md:px-4 text-sm text-gray-700 whitespace-nowrap">
                    {fila.publicadaEn ? fila.publicadaEn.toLocaleDateString() : "(sin fecha)"}
                  </div>

                  <div className="md:px-4 text-sm text-gray-800 text-right font-medium">{fila.confirmados}</div>

                  <div className="md:px-4 flex md:justify-end">
                    {fila.borradorSlug ? (
                      <a
                        href={`/dashboard/?slug=${encodeURIComponent(fila.borradorSlug)}`}
                        className="inline-flex items-center gap-2 text-xs font-medium px-2.5 py-1.5 border rounded-lg hover:bg-gray-100"
                        title="Editar borrador"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">No disponible</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {publicacionSeleccionada ? (
        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h3 className="text-lg font-semibold">
              RSVPs de: <span className="text-violet-700">{publicacionSeleccionada.nombre}</span>
            </h3>
            <div className="text-sm text-gray-500">
              {cargandoRsvps ? "Cargando..." : `${adaptedResponses.length} registros`}
            </div>
          </div>

          {summaryCards.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {summaryCards.map((card) => (
                <article key={card.id} className="rounded-xl border border-violet-100 bg-violet-50/40 p-3">
                  <div className="text-xs uppercase tracking-wide text-violet-700">{card.label}</div>
                  <div className="mt-1 text-2xl font-semibold text-violet-900">{card.value}</div>
                </article>
              ))}
            </div>
          ) : null}

          {errorRsvps ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorRsvps}
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto rounded-xl border">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                    <tr>
                      <th className="px-4 py-3 text-left">Invitado</th>
                      {visibleColumns.map((column) => (
                        <th key={column.id} className="px-4 py-3 text-left whitespace-nowrap">
                          {column.label}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-left whitespace-nowrap">Fecha</th>
                      <th className="px-4 py-3 text-right">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {adaptedResponses.map((response) => (
                      <tr key={response.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{response.displayName}</td>
                        {visibleColumns.map((column) => (
                          <td key={`${response.id}-${column.id}`} className="px-4 py-3 text-gray-700 max-w-[220px]">
                            <span className="block truncate" title={formatAnswerValue(column, response.answers[column.id])}>
                              {formatAnswerValue(column, response.answers[column.id])}
                            </span>
                          </td>
                        ))}
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                          {response.createdAt ? response.createdAt.toLocaleString() : "(sin fecha)"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setDetalleId(response.id)}
                            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-3">
                {adaptedResponses.map((response) => (
                  <article key={response.id} className="rounded-xl border p-3 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-slate-900">{response.displayName}</h4>
                      <button
                        type="button"
                        onClick={() => setDetalleId(response.id)}
                        className="text-xs rounded border border-slate-200 px-2 py-1 text-slate-700"
                      >
                        Detalle
                      </button>
                    </div>
                    <div className="mt-2 space-y-1">
                      {visibleColumns.map((column) => (
                        <div key={`${response.id}-${column.id}`} className="flex items-start justify-between gap-3 text-sm">
                          <span className="text-slate-500">{column.label}</span>
                          <span className="text-slate-800 text-right">{formatAnswerValue(column, response.answers[column.id])}</span>
                        </div>
                      ))}
                      <div className="flex items-start justify-between gap-3 text-sm">
                        <span className="text-slate-500">Fecha</span>
                        <span className="text-slate-800 text-right">
                          {response.createdAt ? response.createdAt.toLocaleString() : "(sin fecha)"}
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {!cargandoRsvps && adaptedResponses.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No hay RSVPs para esta invitacion.
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {detalleRespuesta ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl max-h-[86vh] overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h4 className="font-semibold text-slate-900">Detalle RSVP</h4>
              <button
                type="button"
                onClick={() => setDetalleId(null)}
                className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-2 overflow-y-auto max-h-[calc(86vh-70px)]">
              {detalleColumns.map((column) => (
                <div key={column.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">{column.label}</div>
                  <div className="mt-1 text-sm text-slate-900 break-words">
                    {column.id === "full_name"
                      ? detalleRespuesta.displayName
                      : formatAnswerValue(column, detalleRespuesta.answers[column.id])}
                  </div>
                </div>
              ))}

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Fecha</div>
                <div className="mt-1 text-sm text-slate-900">
                  {detalleRespuesta.createdAt ? detalleRespuesta.createdAt.toLocaleString() : "(sin fecha)"}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
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
  } catch (error) {
    console.warn("No se pudo copiar al portapapeles", error);
  }
}
