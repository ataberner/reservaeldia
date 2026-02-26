import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions as cloudFunctions } from "@/firebase";
import { Copy, ExternalLink, Image as ImageIcon, Pencil, Trash2, X } from "lucide-react";
import {
  adaptRsvpResponse,
  buildColumns,
  computeConfirmedGuestsFromRaw,
  computeSummaryCards,
  formatAnswerValue,
  normalizeRsvpSnapshot,
} from "@/domain/rsvp/publicadas";

function isPermissionDeniedError(error) {
  const code = String(error?.code || "").toLowerCase();
  return code === "permission-denied" || code.includes("permission-denied");
}

function toMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date ? parsed.getTime() : 0;
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    return value.seconds * 1000;
  }
  return 0;
}

function toDate(value) {
  const ms = toMs(value);
  return ms > 0 ? new Date(ms) : null;
}

function normalizeHistoricSummary(rawSummary) {
  const source =
    rawSummary && typeof rawSummary === "object" ? rawSummary : {};

  const toInt = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  };

  return {
    confirmedResponses: toInt(source.confirmedResponses ?? source.confirmados),
    declinedResponses: toInt(source.declinedResponses ?? source.noAsisten),
    confirmedGuests: toInt(source.confirmedGuests ?? source.invitadosConfirmados),
    vegetarianCount: toInt(source.vegetarianCount ?? source.vegetarianos),
    veganCount: toInt(source.veganCount ?? source.veganos),
    childrenCount: toInt(source.childrenCount ?? source.children),
    dietaryRestrictionsCount: toInt(
      source.dietaryRestrictionsCount ?? source.restrictions
    ),
    transportCount: toInt(source.transportCount ?? source.transport),
    totalResponses: toInt(source.totalResponses),
  };
}

function resolveEditableDraftSlug(data) {
  const candidates = [data?.borradorSlug, data?.borradorId, data?.draftSlug];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function buildHistoricSummaryCards(summary) {
  return [
    {
      id: "confirmed",
      label: "Confirmados",
      value: summary.confirmedResponses,
    },
    {
      id: "declined",
      label: "No asisten",
      value: summary.declinedResponses,
    },
    {
      id: "confirmed_guests",
      label: "Personas confirmadas",
      value: summary.confirmedGuests,
    },
    {
      id: "vegetarian",
      label: "Vegetarianos",
      value: summary.vegetarianCount,
    },
    {
      id: "vegan",
      label: "Veganos",
      value: summary.veganCount,
    },
    {
      id: "children",
      label: "Total ninos",
      value: summary.childrenCount,
    },
    {
      id: "restrictions",
      label: "Con restricciones",
      value: summary.dietaryRestrictionsCount,
    },
    {
      id: "transport",
      label: "Requieren transporte",
      value: summary.transportCount,
    },
  ];
}

export default function PublicadasGrid({ usuario }) {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [deletingPublicSlug, setDeletingPublicSlug] = useState("");

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

        const historialQuery = query(
          collection(db, "publicadas_historial"),
          where("userId", "==", usuario.uid)
        );

        const [publicacionesResult, historialResult] = await Promise.allSettled([
          getDocs(publicacionesQuery),
          getDocs(historialQuery),
        ]);

        if (publicacionesResult.status !== "fulfilled") {
          throw publicacionesResult.reason;
        }

        const publicacionesSnap = publicacionesResult.value;
        const historialSnap =
          historialResult.status === "fulfilled"
            ? historialResult.value
            : null;

        if (historialResult.status === "rejected" && !isPermissionDeniedError(historialResult.reason)) {
          throw historialResult.reason;
        }

        const activeDocs = await Promise.all(
          publicacionesSnap.docs.map(async (documento) => {
            const data = documento.data() || {};
            const rsvpsSnap = await getDocs(
              collection(db, "publicadas", documento.id, "rsvps")
            );

            let confirmadosCount = 0;
            rsvpsSnap.forEach((responseDoc) => {
              confirmadosCount += computeConfirmedGuestsFromRaw(responseDoc.data() || {});
            });

            return {
              id: documento.id,
              source: "active",
              ...data,
              rsvp: normalizeRsvpSnapshot(data.rsvp),
              confirmadosCount,
            };
          })
        );

        const historyDocs = (historialSnap?.docs || []).map((documento) => {
          const data = documento.data() || {};
          return {
            id: documento.id,
            source: "history",
            ...data,
            rsvp: normalizeRsvpSnapshot(data.rsvp),
            rsvpSummary: normalizeHistoricSummary(data.rsvpSummary),
          };
        });

        setItems([...activeDocs, ...historyDocs]);
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

    const mapped = items.map((item) => {
      const isHistory = item.source === "history";
      const publicadaEn = toDate(item.publicadaEn);
      const vigenteHasta = toDate(item.vigenteHasta);
      const finalizadaEn = toDate(item.finalizadaEn || item.finalizedAt);
      const isExpired = !isHistory && vigenteHasta ? vigenteHasta.getTime() <= ahora : false;
      const isFinalized =
        isHistory ||
        String(item.estado || "").toLowerCase() === "finalizada" ||
        isExpired;

      const summary = normalizeHistoricSummary(item.rsvpSummary);

      const confirmados = isFinalized
        ? summary.confirmedGuests
        : typeof item.confirmados === "number"
          ? item.confirmados
          : typeof item.confirmadosCount === "number"
            ? item.confirmadosCount
            : typeof item.invitadosConfirmados === "number"
              ? item.invitadosConfirmados
              : 0;

      const fechaEvento = isFinalized ? finalizadaEn || vigenteHasta || publicadaEn : publicadaEn;
      const sortMs =
        toMs(item.ultimaPublicacionEn) ||
        toMs(finalizadaEn) ||
        toMs(vigenteHasta) ||
        toMs(publicadaEn);

      return {
        id: item.id,
        source: item.source || "active",
        publicSlug:
          (typeof item.sourceSlug === "string" && item.sourceSlug.trim()) ||
          (typeof item.slug === "string" && item.slug.trim()) ||
          (item.source === "active" ? String(item.id || "").trim() : ""),
        nombre: item.nombre || item.slug || "(sin nombre)",
        portada: item.portada || null,
        url: isFinalized ? "" : item.urlPublica || "",
        publicadaEn,
        fechaEvento,
        estado: isFinalized ? "Finalizada" : "Activa",
        isFinalized,
        confirmados,
        borradorSlug: resolveEditableDraftSlug(item),
        rsvp: item.rsvp || null,
        rsvpSummary: summary,
        sortMs,
      };
    });

    return mapped.sort((a, b) => b.sortMs - a.sortMs);
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
    if (
      !publicacionSeleccionada?.id ||
      publicacionSeleccionada.isFinalized ||
      publicacionSeleccionada.source !== "active"
    ) {
      setRsvps([]);
      setCargandoRsvps(false);
      setErrorRsvps("");
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
  }, [publicacionSeleccionada?.id, publicacionSeleccionada?.isFinalized, publicacionSeleccionada?.source]);

  const handleHardDeleteLegacy = async (publicSlug) => {
    if (!publicSlug || deletingPublicSlug) return;
    const confirmed = window.confirm(
      "Se eliminara la publicacion legacy, su HTML publicado y cualquier historial asociado. Esta accion no se puede deshacer."
    );
    if (!confirmed) return;

    setDeletingPublicSlug(publicSlug);
    try {
      const hardDelete = httpsCallable(cloudFunctions, "hardDeleteLegacyPublication");
      await hardDelete({ slug: publicSlug });
      setItems((prev) =>
        prev.filter((item) => {
          const itemPublicSlug =
            (typeof item?.sourceSlug === "string" && item.sourceSlug.trim()) ||
            (typeof item?.slug === "string" && item.slug.trim()) ||
            (item?.source === "active" ? String(item.id || "").trim() : "");
          return itemPublicSlug !== publicSlug;
        })
      );
    } catch (deleteError) {
      const message =
        deleteError?.message || "No se pudo eliminar la publicacion legacy.";
      setError(typeof message === "string" ? message : "No se pudo eliminar la publicacion legacy.");
    } finally {
      setDeletingPublicSlug("");
    }
  };

  const adaptedResponses = useMemo(
    () =>
      publicacionSeleccionada?.isFinalized
        ? []
        : rsvps
            .map((response) =>
              adaptRsvpResponse(response, publicacionSeleccionada?.rsvp || null)
            )
            .sort((a, b) => {
              const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
              const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
              return bTime - aTime;
            }),
    [rsvps, publicacionSeleccionada?.rsvp, publicacionSeleccionada?.isFinalized]
  );

  const columns = useMemo(
    () => buildColumns(publicacionSeleccionada?.rsvp || null, adaptedResponses),
    [publicacionSeleccionada?.rsvp, adaptedResponses]
  );

  const visibleColumns = useMemo(
    () => columns.filter((column) => column.id !== "full_name"),
    [columns]
  );

  const liveSummaryCards = useMemo(
    () => computeSummaryCards(adaptedResponses, publicacionSeleccionada?.rsvp || null),
    [adaptedResponses, publicacionSeleccionada?.rsvp]
  );

  const historicSummaryCards = useMemo(
    () =>
      publicacionSeleccionada?.isFinalized
        ? buildHistoricSummaryCards(publicacionSeleccionada.rsvpSummary || {})
        : [],
    [publicacionSeleccionada]
  );

  const summaryCards = publicacionSeleccionada?.isFinalized
    ? historicSummaryCards
    : liveSummaryCards;

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
        <div className="h-6 w-48 rounded bg-gray-200 animate-pulse" />
        <div className="w-full overflow-hidden rounded-xl border">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="grid grid-cols-[72px_1fr_120px_170px_100px_120px] items-center gap-3 border-b px-4 py-3"
            >
              <div className="h-14 w-14 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-3/5 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-24 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-32 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-16 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
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
      <div className="mt-12 text-center">
        <h2 className="mb-2 text-xl font-bold">Tus invitaciones publicadas</h2>
        <p className="text-gray-500">Todavia no publicaste ninguna invitacion.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-8">
      <div>
        <h2 className="mb-4 text-xl font-semibold">Tus invitaciones publicadas</h2>
        <div className="overflow-x-auto rounded-xl border">
          <div className="hidden bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-600 md:grid md:grid-cols-[72px_minmax(180px,1.7fr)_minmax(110px,0.8fr)_minmax(150px,1fr)_minmax(90px,0.5fr)_minmax(110px,0.8fr)]">
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
                  key={`${fila.source}-${fila.id}`}
                  onClick={() => setPublicacionIdSeleccionada(fila.id)}
                  className={`grid cursor-pointer grid-cols-1 gap-2 px-3 py-3 transition-colors md:grid-cols-[72px_minmax(180px,1.7fr)_minmax(110px,0.8fr)_minmax(150px,1fr)_minmax(90px,0.5fr)_minmax(110px,0.8fr)] sm:px-4 ${
                    selected ? "bg-violet-50" : "hover:bg-gray-50"
                  }`}
                  title={
                    fila.isFinalized
                      ? "Ver resumen historico de esta invitacion"
                      : "Ver RSVPs de esta invitacion"
                  }
                >
                  <div className="flex items-center gap-3">
                    <div className="h-16 w-16 overflow-hidden rounded-lg border bg-gray-100">
                      {fila.url ? (
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
                            <div className="flex h-full w-full items-center justify-center text-gray-400">
                              <ImageIcon className="h-6 w-6" />
                            </div>
                          )}
                        </a>
                      ) : fila.portada ? (
                        <img
                          src={fila.portada}
                          alt={`Portada de ${fila.nombre}`}
                          className="h-full w-full object-cover object-top opacity-80"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-400">
                          <ImageIcon className="h-6 w-6" />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 md:hidden">
                      {fila.url ? (
                        <>
                          <a
                            href={fila.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-gray-100"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> Ver
                          </a>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              copiar(fila.url);
                            }}
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-gray-100"
                          >
                            <Copy className="h-3.5 w-3.5" /> Copiar
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="md:px-4">
                    <div className="truncate font-medium text-gray-800">{fila.nombre}</div>
                  </div>

                  <div className="md:px-4">
                    <EstadoPill valor={fila.estado} />
                  </div>

                  <div className="whitespace-nowrap text-sm text-gray-700 md:px-4">
                    {fila.fechaEvento ? fila.fechaEvento.toLocaleDateString() : "(sin fecha)"}
                  </div>

                  <div className="text-right text-sm font-medium text-gray-800 md:px-4">
                    {fila.confirmados}
                  </div>

                  <div className="flex md:justify-end md:px-4">
                    {fila.borradorSlug ? (
                      <a
                        href={`/dashboard/?slug=${encodeURIComponent(fila.borradorSlug)}`}
                        className="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-gray-100"
                        title="Editar borrador"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </a>
                    ) : fila.publicSlug ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleHardDeleteLegacy(fila.publicSlug);
                        }}
                        disabled={Boolean(deletingPublicSlug)}
                        title="Eliminar publicacion legacy"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {deletingPublicSlug === fila.publicSlug ? "Eliminando..." : "Eliminar legacy"}
                      </button>
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
              {publicacionSeleccionada.isFinalized ? "Resumen" : "RSVPs"} de:{" "}
              <span className="text-violet-700">{publicacionSeleccionada.nombre}</span>
            </h3>
            <div className="text-sm text-gray-500">
              {publicacionSeleccionada.isFinalized
                ? "Historico"
                : cargandoRsvps
                  ? "Cargando..."
                  : `${adaptedResponses.length} registros`}
            </div>
          </div>

          {summaryCards.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {summaryCards.map((card) => (
                <article
                  key={card.id}
                  className="rounded-xl border border-violet-100 bg-violet-50/40 p-3"
                >
                  <div className="text-xs uppercase tracking-wide text-violet-700">{card.label}</div>
                  <div className="mt-1 text-2xl font-semibold text-violet-900">{card.value}</div>
                </article>
              ))}
            </div>
          ) : null}

          {publicacionSeleccionada.isFinalized ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              Esta invitacion esta finalizada. Se conserva solo el resumen historico.
            </div>
          ) : errorRsvps ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorRsvps}
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-xl border md:block">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                    <tr>
                      <th className="px-4 py-3 text-left">Invitado</th>
                      {visibleColumns.map((column) => (
                        <th key={column.id} className="whitespace-nowrap px-4 py-3 text-left">
                          {column.label}
                        </th>
                      ))}
                      <th className="whitespace-nowrap px-4 py-3 text-left">Fecha</th>
                      <th className="px-4 py-3 text-right">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {adaptedResponses.map((response) => (
                      <tr key={response.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{response.displayName}</td>
                        {visibleColumns.map((column) => (
                          <td
                            key={`${response.id}-${column.id}`}
                            className="max-w-[220px] px-4 py-3 text-gray-700"
                          >
                            <span
                              className="block truncate"
                              title={formatAnswerValue(column, response.answers[column.id])}
                            >
                              {formatAnswerValue(column, response.answers[column.id])}
                            </span>
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700">
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

              <div className="space-y-3 md:hidden">
                {adaptedResponses.map((response) => (
                  <article key={response.id} className="rounded-xl border bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-slate-900">{response.displayName}</h4>
                      <button
                        type="button"
                        onClick={() => setDetalleId(response.id)}
                        className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700"
                      >
                        Detalle
                      </button>
                    </div>
                    <div className="mt-2 space-y-1">
                      {visibleColumns.map((column) => (
                        <div
                          key={`${response.id}-${column.id}`}
                          className="flex items-start justify-between gap-3 text-sm"
                        >
                          <span className="text-slate-500">{column.label}</span>
                          <span className="text-right text-slate-800">
                            {formatAnswerValue(column, response.answers[column.id])}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-start justify-between gap-3 text-sm">
                        <span className="text-slate-500">Fecha</span>
                        <span className="text-right text-slate-800">
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
          <div className="max-h-[86vh] w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
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

            <div className="max-h-[calc(86vh-70px)] space-y-2 overflow-y-auto p-4">
              {detalleColumns.map((column) => (
                <div key={column.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">{column.label}</div>
                  <div className="mt-1 break-words text-sm text-slate-900">
                    {column.id === "full_name"
                      ? detalleRespuesta.displayName
                      : formatAnswerValue(column, detalleRespuesta.answers[column.id])}
                  </div>
                </div>
              ))}

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Fecha</div>
                <div className="mt-1 text-sm text-slate-900">
                  {detalleRespuesta.createdAt
                    ? detalleRespuesta.createdAt.toLocaleString()
                    : "(sin fecha)"}
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
  const base = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium";
  const styles = {
    Activa: "border border-green-200 bg-green-50 text-green-700",
    Finalizada: "border border-slate-300 bg-slate-100 text-slate-700",
    Pausada: "border border-amber-200 bg-amber-50 text-amber-700",
    Expirada: "border border-gray-200 bg-gray-100 text-gray-600",
    "Sin URL": "border border-red-200 bg-red-50 text-red-700",
  };

  const cls = styles[valor] || "border border-gray-200 bg-gray-50 text-gray-700";
  return <span className={`${base} ${cls}`}>{valor}</span>;
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch (error) {
    console.warn("No se pudo copiar al portapapeles", error);
  }
}
