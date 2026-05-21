import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions as cloudFunctions } from "@/firebase";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Link2,
  Pause,
  Pencil,
  Play,
  PlusCircle,
  Search,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
  XCircle,
} from "lucide-react";
import ConfirmDeleteItemModal from "@/components/ConfirmDeleteItemModal";
import ResolvedPreviewImage from "@/components/publications/ResolvedPreviewImage";
import { copyPublicationUrlToClipboard } from "@/domain/publications/share";
import {
  adaptRsvpResponse,
  buildColumns,
  formatAnswerValue,
  normalizeRsvpSnapshot,
} from "@/domain/rsvp/publicadas";
import { toDate, toMs } from "@/domain/publications/state";
import {
  assembleDashboardPublicationItems,
  loadUserPublicationSourceRecords,
} from "@/domain/publications/dashboardList";
import { transitionPublishedInvitationState } from "@/domain/publications/service";
import {
  buildResponsesCsv,
  computeHistoricResponseMetrics,
  computeResponseMetrics,
  filterInvitationRows,
  filterResponseRows,
  getResponseAttendanceKey,
  getResponseAttendanceLabel,
  getResponseMessage,
  getResponsePartySize,
  getResponseShortAttendanceLabel,
  paginateItems,
} from "@/domain/publications/myInvitationsView";

const INVITATIONS_PAGE_SIZE = 6;
const RESPONSES_PAGE_SIZE = 5;

const INVITATION_FILTERS = [
  { id: "all", label: "Todas" },
  { id: "active", label: "Activas" },
  { id: "paused", label: "Pausadas" },
  { id: "finalized", label: "Finalizadas" },
];

const RESPONSE_FILTERS = [
  { id: "all", label: "Todas" },
  { id: "confirmed", label: "Confirmados" },
  { id: "declined", label: "No asisten" },
  { id: "pending", label: "Pendientes" },
];

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

function toNonNegativeInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function resolveInvitedCount(raw) {
  return toNonNegativeInt(
    raw?.invitadosCount ??
      raw?.totalInvitados ??
      raw?.invitadosTotal ??
      raw?.guestCount ??
      raw?.guestsCount
  );
}

function formatDate(value, fallback = "Sin fecha") {
  const ms = toMs(value);
  if (!ms) return fallback;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(ms));
}

function formatDateTime(value) {
  if (!(value instanceof Date)) return "-";
  return value.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeTypeLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "Invitacion";
  if (normalized === "boda") return "Invitacion de boda";
  if (normalized === "cumple" || normalized === "cumpleanos") {
    return "Invitacion de cumpleanos";
  }
  return `Invitacion de ${normalized}`;
}

function formatPublicUrlLabel(url) {
  const safeUrl = String(url || "").trim();
  if (!safeUrl) return "Sin enlace publico";
  try {
    const parsed = new URL(safeUrl);
    return `${parsed.host}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return safeUrl;
  }
}

function downloadTextFile(filename, content, mimeType) {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function sanitizeDownloadFilename(value, fallback = "invitacion") {
  const normalized = String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "");
  return normalized || fallback;
}

function getCsvFilename(publicacion) {
  return `${sanitizeDownloadFilename(publicacion?.nombre)}.csv`;
}

function createMetricCards(metrics) {
  return [
    {
      id: "confirmed",
      label: "Confirmados",
      value: metrics.confirmedResponses,
      detail:
        metrics.totalExpected > 0
          ? `${Math.round((metrics.confirmedResponses / metrics.totalExpected) * 100)}% del total`
          : "Sin invitados cargados",
      icon: Users,
      tone: "brand",
    },
    {
      id: "declined",
      label: "No asisten",
      value: metrics.declinedResponses,
      detail:
        metrics.totalExpected > 0
          ? `${Math.round((metrics.declinedResponses / metrics.totalExpected) * 100)}% del total`
          : "Sin invitados cargados",
      icon: XCircle,
      tone: "orange",
    },
    {
      id: "pending",
      label: "Pendientes",
      value: metrics.pendingResponses,
      detail:
        metrics.totalExpected > 0
          ? `${Math.round((metrics.pendingResponses / metrics.totalExpected) * 100)}% del total`
          : "Sin pendientes",
      icon: Clock3,
      tone: "softBrand",
    },
  ];
}

export default function PublicadasGrid({
  usuario,
  focusPublicSlug = "",
  onCreateInvitation,
}) {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [deletingPublicSlug, setDeletingPublicSlug] = useState("");
  const [pendingStateActionKey, setPendingStateActionKey] = useState("");
  const [trashPendingPublication, setTrashPendingPublication] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const [publicacionIdSeleccionada, setPublicacionIdSeleccionada] = useState(null);
  const consumedFocusPublicSlugRef = useRef("");
  const [rsvps, setRsvps] = useState([]);
  const [cargandoRsvps, setCargandoRsvps] = useState(false);
  const [errorRsvps, setErrorRsvps] = useState("");
  const [detalleId, setDetalleId] = useState(null);

  const [invitationSearch, setInvitationSearch] = useState("");
  const [invitationStatusFilter, setInvitationStatusFilter] = useState("all");
  const [invitationPage, setInvitationPage] = useState(1);
  const [responseSearch, setResponseSearch] = useState("");
  const [responseFilter, setResponseFilter] = useState("all");
  const [responsePage, setResponsePage] = useState(1);

  useEffect(() => {
    let mounted = true;

    const fetchPublicadas = async () => {
      if (!usuario?.uid) {
        if (!mounted) return;
        setItems([]);
        setCargando(false);
        return;
      }

      setCargando(true);
      setError("");
      setActionError("");

      try {
        const records = await loadUserPublicationSourceRecords({
          userUid: usuario.uid,
          enrichActiveRecord: async (record) => {
            const data =
              record?.data && typeof record.data === "object" ? record.data : {};
            const normalizedRsvp = normalizeRsvpSnapshot(data.rsvp);
            const rsvpsSnap = await getDocs(
              collection(db, "publicadas", record.id, "rsvps")
            );
            const responseRows = rsvpsSnap.docs.map((responseDoc) =>
              adaptRsvpResponse(
                { id: responseDoc.id, ...(responseDoc.data() || {}) },
                normalizedRsvp
              )
            );
            const responseMetrics = computeResponseMetrics(responseRows, {
              invitedCount: resolveInvitedCount(data),
            });

            return {
              ...record,
              data: {
                ...data,
                rsvp: normalizedRsvp,
                dashboardResponseMetrics: responseMetrics,
                confirmadosCount: responseMetrics.confirmedResponses,
              },
            };
          },
          enrichHistoryRecord: async (record) => {
            const data =
              record?.data && typeof record.data === "object" ? record.data : {};

            return {
              ...record,
              data: {
                ...data,
                rsvp: normalizeRsvpSnapshot(data.rsvp),
                rsvpSummary: normalizeHistoricSummary(data.rsvpSummary),
              },
            };
          },
        });
        const nextItems = await assembleDashboardPublicationItems(records, {
          readDraftBySlug: async (draftSlug) =>
            getDoc(doc(db, "borradores", draftSlug)),
        });

        if (!mounted) return;
        setItems(nextItems);
      } catch (fetchError) {
        if (!mounted) return;
        setItems([]);
        setError(fetchError?.message || "Error al cargar publicaciones");
      } finally {
        if (mounted) {
          setCargando(false);
        }
      }
    };

    void fetchPublicadas();

    return () => {
      mounted = false;
    };
  }, [usuario?.uid, refreshTick]);

  const filas = useMemo(() => {
    const mapped = items.map((item) => {
      const raw = item?.raw && typeof item.raw === "object" ? item.raw : {};
      const publicadaEn = item.publishedAt || null;
      const vigenteHasta = item.expiresAt || null;
      const finalizadaEn = toDate(item.finalizadaEn || raw.finalizedAt);
      const rsvpSummary = normalizeHistoricSummary(raw.rsvpSummary);
      const invitadosCount = resolveInvitedCount(raw);
      const responseMetrics = item.isFinalized
        ? computeHistoricResponseMetrics(rsvpSummary, { invitedCount: invitadosCount })
        : raw.dashboardResponseMetrics || computeResponseMetrics([], {
            invitedCount: invitadosCount,
          });

      const fechaEvento = item.isFinalized
        ? finalizadaEn || vigenteHasta || publicadaEn
        : publicadaEn;
      const sortMs =
        toMs(raw.enPapeleraAt) ||
        toMs(item.pausedAt) ||
        toMs(raw.ultimaPublicacionEn) ||
        toMs(finalizadaEn) ||
        toMs(vigenteHasta) ||
        toMs(publicadaEn);

      return {
        id: item.id,
        source: item.source || "active",
        publicSlug: item.publicSlug || "",
        nombre: item.nombre || "(sin nombre)",
        portada:
          typeof item.portada === "string" && item.portada.trim()
            ? item.portada.trim()
            : null,
        previewCandidates: Array.isArray(item.previewCandidates)
          ? item.previewCandidates
          : [],
        url: item.url || "",
        publicadaEn,
        fechaEvento,
        fechaEventoLabel: formatDate(fechaEvento),
        expiresAt: vigenteHasta,
        estado: item.statusLabel,
        stateKey: item.stateKey,
        isFinalized: item.isFinalized,
        isActive: item.isActive,
        isPaused: item.isPaused,
        isTrashed: item.isTrashed,
        confirmados: responseMetrics.confirmedResponses,
        invitadosCount,
        responseMetrics,
        borradorSlug: item.borradorSlug,
        tipoLabel: normalizeTypeLabel(raw.tipo || raw.tipoInvitacion || raw.plantillaTipo),
        rsvp: raw.rsvp || null,
        rsvpSummary,
        sortMs,
        raw,
      };
    });

    return mapped
      .filter((item) => !item.isTrashed)
      .sort((a, b) => b.sortMs - a.sortMs);
  }, [items]);

  const filteredInvitationRows = useMemo(
    () =>
      filterInvitationRows(filas, {
        search: invitationSearch,
        status: invitationStatusFilter,
      }),
    [filas, invitationSearch, invitationStatusFilter]
  );

  const invitationPagination = useMemo(
    () => paginateItems(filteredInvitationRows, invitationPage, INVITATIONS_PAGE_SIZE),
    [filteredInvitationRows, invitationPage]
  );

  const publicacionSeleccionada = useMemo(
    () => filas.find((fila) => fila.id === publicacionIdSeleccionada) || null,
    [filas, publicacionIdSeleccionada]
  );

  useEffect(() => {
    setInvitationPage(1);
  }, [invitationSearch, invitationStatusFilter]);

  useEffect(() => {
    if (!filteredInvitationRows.length) {
      setPublicacionIdSeleccionada(null);
      return;
    }

    const stillVisible = filteredInvitationRows.some(
      (fila) => fila.id === publicacionIdSeleccionada
    );

    if (!stillVisible) {
      setPublicacionIdSeleccionada(filteredInvitationRows[0].id);
    }
  }, [filteredInvitationRows, publicacionIdSeleccionada]);

  useEffect(() => {
    const safeFocusPublicSlug = String(focusPublicSlug || "").trim();
    if (!safeFocusPublicSlug) return;
    if (consumedFocusPublicSlugRef.current === safeFocusPublicSlug) return;

    const focusedRow = filas.find(
      (fila) =>
        fila.publicSlug === safeFocusPublicSlug || fila.id === safeFocusPublicSlug
    );
    if (!focusedRow?.id) return;

    consumedFocusPublicSlugRef.current = safeFocusPublicSlug;
    setPublicacionIdSeleccionada(focusedRow.id);
  }, [filas, focusPublicSlug]);

  useEffect(() => {
    setDetalleId(null);
    setResponseSearch("");
    setResponseFilter("all");
    setResponsePage(1);
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
        prev.filter((item) => item?.publicSlug !== publicSlug)
      );
    } catch (deleteError) {
      const message =
        deleteError?.message || "No se pudo eliminar la publicacion legacy.";
      setActionError(
        typeof message === "string"
          ? message
          : "No se pudo eliminar la publicacion legacy."
      );
    } finally {
      setDeletingPublicSlug("");
    }
  };

  const runStateTransition = async (fila, action) => {
    const safeSlug =
      typeof fila?.publicSlug === "string" ? fila.publicSlug.trim() : "";
    if (!safeSlug || pendingStateActionKey) return false;

    const actionKey = `${safeSlug}:${action}`;
    setPendingStateActionKey(actionKey);
    setError("");
    setActionError("");

    try {
      await transitionPublishedInvitationState({
        slug: safeSlug,
        action,
      });
      setRefreshTick((prev) => prev + 1);
      return true;
    } catch (transitionError) {
      const message =
        transitionError?.message ||
        "No se pudo actualizar el estado de la invitacion.";
      setActionError(
        typeof message === "string"
          ? message
          : "No se pudo actualizar el estado de la invitacion."
      );
      return false;
    } finally {
      setPendingStateActionKey("");
    }
  };

  const confirmMoveToTrash = async () => {
    if (!trashPendingPublication?.publicSlug) return;
    const moved = await runStateTransition(trashPendingPublication, "move_to_trash");
    if (moved) setTrashPendingPublication(null);
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

  const detalleColumns = useMemo(() => {
    const hasFullName = columns.some((column) => column.id === "full_name");
    if (hasFullName) return columns;
    return [{ id: "full_name", label: "Invitado", type: "short_text" }, ...columns];
  }, [columns]);

  const selectedMetrics = useMemo(() => {
    if (!publicacionSeleccionada) {
      return computeResponseMetrics([], {});
    }
    if (publicacionSeleccionada.isFinalized) {
      return computeHistoricResponseMetrics(publicacionSeleccionada.rsvpSummary || {}, {
        invitedCount: publicacionSeleccionada.invitadosCount,
      });
    }
    return computeResponseMetrics(adaptedResponses, {
      invitedCount: publicacionSeleccionada.invitadosCount,
    });
  }, [adaptedResponses, publicacionSeleccionada]);

  const filteredResponses = useMemo(
    () =>
      filterResponseRows(adaptedResponses, {
        search: responseSearch,
        attendanceFilter: responseFilter,
      }),
    [adaptedResponses, responseFilter, responseSearch]
  );

  const responsePagination = useMemo(
    () => paginateItems(filteredResponses, responsePage, RESPONSES_PAGE_SIZE),
    [filteredResponses, responsePage]
  );

  useEffect(() => {
    setResponsePage(1);
  }, [responseFilter, responseSearch]);

  const detalleRespuesta = useMemo(
    () => adaptedResponses.find((response) => response.id === detalleId) || null,
    [adaptedResponses, detalleId]
  );

  const responseFilterCounts = useMemo(() => {
    const counts = {
      all: selectedMetrics.totalExpected || adaptedResponses.length,
      confirmed: selectedMetrics.confirmedResponses,
      declined: selectedMetrics.declinedResponses,
      pending: selectedMetrics.pendingResponses,
    };
    return counts;
  }, [adaptedResponses.length, selectedMetrics]);

  const invitationFilterCounts = useMemo(() => {
    const counts = {
      all: filas.length,
      active: 0,
      paused: 0,
      finalized: 0,
    };
    filas.forEach((fila) => {
      if (fila.isActive) counts.active += 1;
      if (fila.isPaused) counts.paused += 1;
      if (fila.isFinalized) counts.finalized += 1;
    });
    return counts;
  }, [filas]);

  const selectInvitation = (fila) => {
    setPublicacionIdSeleccionada(fila.id);
  };

  const handleCreateInvitation = () => {
    if (typeof onCreateInvitation === "function") {
      onCreateInvitation();
      return;
    }
    if (typeof window !== "undefined") {
      window.location.href = "/dashboard#dashboard-home-template-collections";
    }
  };

  const handleExportResponses = () => {
    if (!publicacionSeleccionada || publicacionSeleccionada.isFinalized) return;
    const csv = buildResponsesCsv(filteredResponses, columns, formatAnswerValue);
    downloadTextFile(
      getCsvFilename(publicacionSeleccionada),
      csv,
      "text/csv;charset=utf-8"
    );
  };

  const renderPageHeader = () => (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] bg-[#692B9A] text-white shadow-[0_16px_32px_rgba(105,43,154,0.22)]">
          <CalendarDays className="h-6 w-6" />
        </div>
        <div className="text-left">
          <h1 className="text-[28px] font-semibold leading-tight text-[#262626] sm:text-[32px]">
            Mis invitaciones publicadas
          </h1>
          <p className="mt-1 text-sm leading-6 text-[#262626]/60 sm:text-base">
            Gestiona tus invitaciones y segui las respuestas de tus invitados.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleCreateInvitation}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#692B9A] px-5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(105,43,154,0.24)] transition hover:-translate-y-0.5 hover:bg-[#5c2389] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#692B9A] focus-visible:ring-offset-2 sm:w-auto"
      >
        <PlusCircle className="h-4 w-4" />
        Crear invitacion
      </button>
    </div>
  );

  const renderLoading = () => (
    <div className="space-y-6">
      {renderPageHeader()}
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[390px_minmax(0,1fr)]">
        <div className="rounded-[18px] border border-[#EFDBFF] bg-white p-4 shadow-[0_16px_40px_rgba(38,38,38,0.06)]">
          <div className="h-11 animate-pulse rounded-xl bg-[#FAF5FF]" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex gap-3 rounded-2xl border border-[#EFDBFF]/70 p-3">
                <div className="h-20 w-24 animate-pulse rounded-xl bg-[#FBF7F9]" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-[#FAF5FF]" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-[#FAF5FF]" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-[#FAF5FF]" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[18px] border border-[#EFDBFF] bg-white p-5 shadow-[0_16px_40px_rgba(38,38,38,0.06)]">
          <div className="flex gap-5">
            <div className="h-36 w-64 animate-pulse rounded-2xl bg-[#FBF7F9]" />
            <div className="flex-1 space-y-3">
              <div className="h-6 w-1/2 animate-pulse rounded bg-[#FAF5FF]" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-[#FAF5FF]" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-[#FAF5FF]" />
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl bg-[#FAF5FF]" />
            ))}
          </div>
          <div className="mt-6 h-64 animate-pulse rounded-2xl bg-[#FBF7F9]" />
        </div>
      </div>
    </div>
  );

  if (cargando) {
    return (
      <div className="mx-auto w-full max-w-[1480px] py-5 text-left [font-family:'DM_Sans',sans-serif] [&_h1]:[text-shadow:none] [&_h2]:[text-shadow:none] [&_h3]:[text-shadow:none] [&_h4]:[text-shadow:none] [&_p]:[text-shadow:none]">
        {renderLoading()}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1480px] py-5 text-left [font-family:'DM_Sans',sans-serif] [&_h1]:[text-shadow:none] [&_h2]:[text-shadow:none] [&_h3]:[text-shadow:none] [&_h4]:[text-shadow:none] [&_p]:[text-shadow:none]">
        {renderPageHeader()}
        <div className="mt-6 rounded-[18px] border border-[#FFDADA] bg-[#fff7f7] p-6 text-[#B3261E]">
          <p className="font-semibold">Ocurrio un error</p>
          <p className="mt-1 text-sm opacity-80">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1480px] py-4 text-left [font-family:'DM_Sans',sans-serif] sm:py-5 [&_h1]:[text-shadow:none] [&_h2]:[text-shadow:none] [&_h3]:[text-shadow:none] [&_h4]:[text-shadow:none] [&_p]:[text-shadow:none]">
      {renderPageHeader()}

      {actionError ? (
        <div className="mt-4 rounded-xl border border-[#FFDADA] bg-[#fff7f7] px-4 py-3 text-sm text-[#B3261E]">
          {actionError}
        </div>
      ) : null}

      {!filas.length ? (
        <div className="mt-6 rounded-[20px] border border-dashed border-[#EFDBFF] bg-[#FAF5FF] px-5 py-14 text-center text-[#262626]">
          <h2 className="text-xl font-semibold">Todavia no publicaste invitaciones</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-[#262626]/60">
            Cuando publiques una invitacion, vas a poder gestionar el enlace y
            ver las respuestas desde esta pantalla.
          </p>
          <button
            type="button"
            onClick={handleCreateInvitation}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-[#692B9A] px-5 py-2.5 text-sm font-semibold text-white"
          >
            <PlusCircle className="h-4 w-4" />
            Crear invitacion
          </button>
        </div>
      ) : (
        <div className="mt-5 grid min-w-0 gap-4 sm:mt-6 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="min-w-0">
            <InvitationListPanel
              rows={invitationPagination.items}
              totalRows={filteredInvitationRows.length}
              allRowsCount={filas.length}
              selectedId={publicacionIdSeleccionada}
              search={invitationSearch}
              onSearchChange={setInvitationSearch}
              statusFilter={invitationStatusFilter}
              onStatusFilterChange={setInvitationStatusFilter}
              filterCounts={invitationFilterCounts}
              pagination={invitationPagination}
              onPageChange={setInvitationPage}
              onSelect={selectInvitation}
            />
          </aside>

          <main className="min-w-0">
            <InvitationDetailPanel
              publicacion={publicacionSeleccionada}
              metrics={selectedMetrics}
              metricCards={createMetricCards(selectedMetrics)}
              responses={adaptedResponses}
              filteredResponses={filteredResponses}
              responseRows={responsePagination.items}
              responsePagination={responsePagination}
              responseSearch={responseSearch}
              onResponseSearchChange={setResponseSearch}
              responseFilter={responseFilter}
              onResponseFilterChange={setResponseFilter}
              responseFilterCounts={responseFilterCounts}
              onResponsePageChange={setResponsePage}
              cargandoRsvps={cargandoRsvps}
              errorRsvps={errorRsvps}
              pendingStateActionKey={pendingStateActionKey}
              deletingPublicSlug={deletingPublicSlug}
              onBackMobile={undefined}
              showBackMobile={false}
              onCopy={copiar}
              onExport={handleExportResponses}
              onRunTransition={runStateTransition}
              onMoveToTrash={setTrashPendingPublication}
              onHardDeleteLegacy={handleHardDeleteLegacy}
              onOpenDetail={setDetalleId}
            />
          </main>
        </div>
      )}

      {detalleRespuesta ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1238]/60 p-4 backdrop-blur-[3px]">
          <div className="max-h-[86vh] w-full max-w-lg overflow-hidden rounded-[24px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#EFDBFF] px-4 py-3">
              <h4 className="font-semibold text-[#262626]">Detalle RSVP</h4>
              <button
                type="button"
                onClick={() => setDetalleId(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#EFDBFF] text-[#692B9A] hover:bg-[#FAF5FF]"
                aria-label="Cerrar detalle"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[calc(86vh-70px)] space-y-2 overflow-y-auto p-4">
              {detalleColumns.map((column) => (
                <div key={column.id} className="rounded-xl border border-[#EFDBFF] p-3">
                  <div className="text-xs uppercase tracking-[0.08em] text-[#262626]/50">{column.label}</div>
                  <div className="mt-1 break-words text-sm text-[#262626]">
                    {column.id === "full_name"
                      ? detalleRespuesta.displayName
                      : formatAnswerValue(column, detalleRespuesta.answers[column.id])}
                  </div>
                </div>
              ))}

              <div className="rounded-xl border border-[#EFDBFF] p-3">
                <div className="text-xs uppercase tracking-[0.08em] text-[#262626]/50">Fecha</div>
                <div className="mt-1 text-sm text-[#262626]">
                  {formatDateTime(detalleRespuesta.createdAt)}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDeleteItemModal
        isOpen={Boolean(trashPendingPublication)}
        itemTypeLabel="invitacion"
        itemName={trashPendingPublication?.nombre || trashPendingPublication?.publicSlug}
        isDeleting={
          Boolean(trashPendingPublication?.publicSlug) &&
          pendingStateActionKey === `${trashPendingPublication?.publicSlug}:move_to_trash`
        }
        dialogTitle="Mover invitacion a papelera"
        dialogDescription={`"${trashPendingPublication?.nombre || trashPendingPublication?.publicSlug || "Esta invitacion"}" se movera a papelera.`}
        warningText="Dejara de aparecer en publicadas. Podras restaurarla luego como pausada."
        confirmButtonText="Mover a papelera"
        confirmingButtonText="Moviendo..."
        onCancel={() => {
          if (
            trashPendingPublication?.publicSlug &&
            pendingStateActionKey === `${trashPendingPublication.publicSlug}:move_to_trash`
          ) {
            return;
          }
          setTrashPendingPublication(null);
        }}
        onConfirm={confirmMoveToTrash}
      />
    </div>
  );
}

function InvitationListPanel({
  rows,
  totalRows,
  allRowsCount,
  selectedId,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  filterCounts,
  pagination,
  onPageChange,
  onSelect,
}) {
  return (
    <div className="max-h-[min(58vh,560px)] overflow-y-auto overscroll-contain rounded-[18px] border border-[#EFDBFF] bg-white p-3 shadow-[0_16px_40px_rgba(38,38,38,0.06)] lg:max-h-none lg:overflow-visible">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#262626]/40" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-11 w-full rounded-xl border border-[#E5E5E5] bg-white pl-10 pr-10 text-sm text-[#262626] outline-none transition placeholder:text-[#262626]/38 focus:border-[#692B9A] focus:ring-2 focus:ring-[#EFDBFF]"
          placeholder="Buscar invitacion..."
        />
        <SlidersHorizontal className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#692B9A]" />
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {INVITATION_FILTERS.map((filter) => {
          const active = statusFilter === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => onStatusFilterChange(filter.id)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "border-[#692B9A] bg-[#692B9A] text-white"
                  : "border-[#EFDBFF] bg-[#FAF5FF] text-[#692B9A] hover:bg-[#EFDBFF]"
              }`}
            >
              {filter.label} {filterCounts[filter.id] ?? 0}
            </button>
          );
        })}
      </div>

      <div className="mt-3 text-xs text-[#262626]/54">
        {totalRows} de {allRowsCount} invitaciones
      </div>

      {rows.length ? (
        <ul className="mt-3 space-y-2">
          {rows.map((fila) => (
            <InvitationListItem
              key={`${fila.source}-${fila.id}`}
              fila={fila}
              selected={fila.id === selectedId}
              onSelect={() => onSelect(fila)}
            />
          ))}
        </ul>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-[#EFDBFF] bg-[#FAF5FF] px-4 py-8 text-center text-sm text-[#262626]/60">
          No hay invitaciones para estos filtros.
        </div>
      )}

      <PaginationControls
        className="mt-4"
        pagination={pagination}
        onPageChange={onPageChange}
        compact
      />
    </div>
  );
}

function InvitationListItem({ fila, selected, onSelect }) {
  const metrics = fila.responseMetrics || {};
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`grid w-full grid-cols-[88px_minmax(0,1fr)_42px] gap-2 rounded-2xl border p-2 text-left transition sm:grid-cols-[112px_minmax(0,1fr)_46px] sm:gap-3 ${
          selected
            ? "border-[#692B9A] bg-[#FAF5FF] shadow-[0_10px_24px_rgba(105,43,154,0.16)]"
            : "border-transparent bg-white hover:border-[#EFDBFF] hover:bg-[#FBF7F9]"
        }`}
      >
        <div className="h-16 overflow-hidden rounded-xl bg-[#FBF7F9] sm:h-20">
          <ResolvedPreviewImage
            primarySrc={fila.portada || ""}
            previewCandidates={fila.previewCandidates || []}
            alt={`Portada de ${fila.nombre}`}
            className={`h-full w-full object-cover object-top ${
              fila.isPaused ? "opacity-80 saturate-[0.9]" : ""
            }`}
            fallbackIconClassName="h-5 w-5"
          />
        </div>
        <div className="min-w-0 py-0.5 sm:py-1">
          <h3 className="truncate text-sm font-semibold text-[#262626]" title={fila.nombre}>
            {fila.nombre}
          </h3>
          <p className="mt-1 text-xs text-[#262626]/54">{fila.fechaEventoLabel}</p>
          <div className="mt-2">
            <EstadoPill valor={fila.estado} />
          </div>
        </div>
        <div className="border-l border-[#EFDBFF] pl-2 text-xs">
          <MiniMetric tone="success" value={metrics.confirmedResponses || 0} />
          <MiniMetric tone="warning" value={metrics.declinedResponses || 0} />
          <MiniMetric tone="brand" value={metrics.pendingResponses || 0} />
        </div>
      </button>
    </li>
  );
}

function MiniMetric({ tone, value }) {
  const dotClass =
    tone === "success"
      ? "bg-[#029B4A]"
      : tone === "warning"
        ? "bg-[#F39F5F]"
        : "bg-[#692B9A]";

  return (
    <div className="flex items-center justify-between gap-2 py-1 text-[#262626]/70">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      <span>{value}</span>
    </div>
  );
}

function InvitationDetailPanel({
  publicacion,
  metrics,
  metricCards,
  filteredResponses,
  responseRows,
  responsePagination,
  responseSearch,
  onResponseSearchChange,
  responseFilter,
  onResponseFilterChange,
  responseFilterCounts,
  onResponsePageChange,
  cargandoRsvps,
  errorRsvps,
  pendingStateActionKey,
  deletingPublicSlug,
  onBackMobile,
  showBackMobile,
  onCopy,
  onExport,
  onRunTransition,
  onMoveToTrash,
  onHardDeleteLegacy,
  onOpenDetail,
}) {
  if (!publicacion) {
    return (
      <div className="flex min-h-[540px] items-center justify-center rounded-[18px] border border-[#EFDBFF] bg-white p-6 text-center text-[#262626]/60 shadow-[0_16px_40px_rgba(38,38,38,0.06)]">
        Selecciona una invitacion para ver sus respuestas.
      </div>
    );
  }

  const pauseActionKey = `${publicacion.publicSlug}:pause`;
  const resumeActionKey = `${publicacion.publicSlug}:resume`;
  const trashActionKey = `${publicacion.publicSlug}:move_to_trash`;
  const isPendingStateAction =
    pendingStateActionKey === pauseActionKey ||
    pendingStateActionKey === resumeActionKey ||
    pendingStateActionKey === trashActionKey;

  return (
    <div className="rounded-[18px] border border-[#EFDBFF] bg-white p-4 shadow-[0_16px_40px_rgba(38,38,38,0.06)] sm:p-5">
      {showBackMobile ? (
        <button
          type="button"
          onClick={onBackMobile}
          className="mb-4 inline-flex items-center gap-2 rounded-xl border border-[#EFDBFF] px-3 py-2 text-sm font-semibold text-[#692B9A]"
        >
          <ChevronLeft className="h-4 w-4" />
          Volver a invitaciones
        </button>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_190px]">
        <div className="overflow-hidden rounded-2xl bg-[#FBF7F9] xl:h-36">
          <ResolvedPreviewImage
            primarySrc={publicacion.portada || ""}
            previewCandidates={publicacion.previewCandidates || []}
            alt={`Portada de ${publicacion.nombre}`}
            className={`h-full min-h-[180px] w-full object-cover object-top xl:min-h-0 ${
              publicacion.isPaused ? "opacity-80 saturate-[0.9]" : ""
            }`}
          />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-2xl font-semibold text-[#262626]">
              {publicacion.nombre}
            </h2>
            <EstadoPill valor={publicacion.estado} />
          </div>
          <p className="mt-2 text-sm text-[#262626]/54">{publicacion.tipoLabel}</p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#262626]/70">
            <InfoItem icon={CalendarDays}>{formatDate(publicacion.fechaEvento)}</InfoItem>
            <InfoItem icon={Users}>
              {metrics.totalExpected || publicacion.invitadosCount || 0} invitados
            </InfoItem>
            <InfoItem icon={Link2}>{formatPublicUrlLabel(publicacion.url)}</InfoItem>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {publicacion.borradorSlug ? (
            <a
              href={`/dashboard/?slug=${encodeURIComponent(publicacion.borradorSlug)}`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#E5E5E5] bg-white px-3 text-sm font-semibold text-[#262626] transition hover:bg-[#FBF7F9]"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </a>
          ) : publicacion.publicSlug ? (
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#FFDADA] bg-white px-3 text-sm font-semibold text-[#B3261E] transition hover:bg-[#fff7f7] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => onHardDeleteLegacy(publicacion.publicSlug)}
              disabled={Boolean(deletingPublicSlug)}
            >
              <Trash2 className="h-4 w-4" />
              {deletingPublicSlug === publicacion.publicSlug ? "Eliminando..." : "Eliminar legacy"}
            </button>
          ) : null}

          {publicacion.url ? (
            <>
              <a
                href={publicacion.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#EFDBFF] bg-white px-3 text-sm font-semibold text-[#692B9A] transition hover:bg-[#FAF5FF]"
              >
                <ExternalLink className="h-4 w-4" />
                Ver online
              </a>
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#EFDBFF] bg-white px-3 text-sm font-semibold text-[#692B9A] transition hover:bg-[#FAF5FF]"
                onClick={() => onCopy(publicacion.url)}
              >
                <Copy className="h-4 w-4" />
                Copiar link
              </button>
            </>
          ) : null}

          {publicacion.source === "active" && !publicacion.isFinalized ? (
            <>
              {publicacion.isActive ? (
                <button
                  type="button"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#EFDBFF] px-3 text-sm font-semibold text-[#692B9A] transition hover:bg-[#e5c7ff] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => onRunTransition(publicacion, "pause")}
                  disabled={isPendingStateAction}
                >
                  <Pause className="h-4 w-4" />
                  Pausar
                </button>
              ) : null}

              {publicacion.isPaused ? (
                <>
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#692B9A] px-3 text-sm font-semibold text-white transition hover:bg-[#5c2389] disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => onRunTransition(publicacion, "resume")}
                    disabled={isPendingStateAction}
                  >
                    <Play className="h-4 w-4" />
                    Reanudar
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#FFDADA] bg-[#fff7f7] px-3 text-sm font-semibold text-[#B3261E] transition hover:bg-[#fff0f0] disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() =>
                      onMoveToTrash({
                        publicSlug: publicacion.publicSlug,
                        nombre: publicacion.nombre || publicacion.publicSlug,
                      })
                    }
                    disabled={isPendingStateAction}
                  >
                    <Trash2 className="h-4 w-4" />
                    Papelera
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-7 grid gap-3 md:grid-cols-3">
        {metricCards.map((card) => (
          <MetricCard key={card.id} card={card} />
        ))}
      </div>

      <div className="mt-7 border-t border-[#EFDBFF] pt-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[#262626]">
              {publicacion.isFinalized ? "Resumen historico" : `Respuestas (${metrics.totalExpected || metrics.totalResponses})`}
            </h3>
            <p className="mt-1 text-sm text-[#262626]/54">
              {publicacion.isFinalized
                ? "Esta invitacion esta finalizada. Se conserva solo el resumen historico."
                : `${filteredResponses.length} respuestas visibles con los filtros actuales.`}
            </p>
          </div>

          {!publicacion.isFinalized ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#262626]/40" />
                <input
                  value={responseSearch}
                  onChange={(event) => onResponseSearchChange(event.target.value)}
                  className="h-11 w-full rounded-xl border border-[#E5E5E5] bg-white pl-10 pr-3 text-sm outline-none transition placeholder:text-[#262626]/38 focus:border-[#692B9A] focus:ring-2 focus:ring-[#EFDBFF] sm:w-64"
                  placeholder="Buscar invitado..."
                />
              </div>
              <button
                type="button"
                onClick={onExport}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#E5E5E5] px-4 text-sm font-semibold text-[#262626] transition hover:bg-[#FBF7F9]"
              >
                <Download className="h-4 w-4" />
                Exportar
              </button>
            </div>
          ) : null}
        </div>

        {!publicacion.isFinalized ? (
          <>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {RESPONSE_FILTERS.map((filter) => {
                const active = responseFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => onResponseFilterChange(filter.id)}
                    className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                      active
                        ? "border-[#692B9A] bg-[#692B9A] text-white"
                        : filter.id === "declined"
                          ? "border-[#ffe0c9] bg-[#FFF6EF] text-[#D95700] hover:bg-[#FFEBD8]"
                          : "border-[#EFDBFF] bg-[#FAF5FF] text-[#692B9A] hover:bg-[#EFDBFF]"
                    }`}
                  >
                    {filter.label} {responseFilterCounts[filter.id] ?? 0}
                  </button>
                );
              })}
            </div>

            {cargandoRsvps ? (
              <div className="mt-5 h-56 animate-pulse rounded-2xl bg-[#FBF7F9]" />
            ) : errorRsvps ? (
              <div className="mt-5 rounded-xl border border-[#FFDADA] bg-[#fff7f7] p-4 text-sm text-[#B3261E]">
                {errorRsvps}
              </div>
            ) : (
              <ResponsesTable
                rows={responseRows}
                totalFiltered={filteredResponses.length}
                pagination={responsePagination}
                onPageChange={onResponsePageChange}
                onOpenDetail={onOpenDetail}
              />
            )}
          </>
        ) : (
          <HistoricSummary summary={publicacion.rsvpSummary} />
        )}
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, children }) {
  return (
    <div className="inline-flex min-w-0 items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-[#692B9A]" />
      <span className="truncate">{children}</span>
    </div>
  );
}

function MetricCard({ card }) {
  const Icon = card.icon;
  const toneClass =
    card.tone === "orange"
      ? "border-[#FFE7D4] bg-[#FFF6EF] text-[#D95700]"
      : card.tone === "softBrand"
        ? "border-[#EFDBFF] bg-[#FAF5FF] text-[#692B9A]"
        : "border-[#EFDBFF] bg-[#FAF5FF] text-[#692B9A]";
  const iconClass =
    card.tone === "orange"
      ? "bg-[#F39F5F]/15 text-[#F26900]"
      : "bg-[#EFDBFF] text-[#692B9A]";

  return (
    <article className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-center gap-4">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${iconClass}`}>
          <Icon className="h-7 w-7" />
        </div>
        <div>
          <p className="text-sm font-semibold">{card.label}</p>
          <div className="mt-1 text-3xl font-semibold">{card.value}</div>
          <p className="mt-1 text-sm opacity-75">{card.detail}</p>
        </div>
      </div>
    </article>
  );
}

function ResponsesTable({
  rows,
  totalFiltered,
  pagination,
  onPageChange,
  onOpenDetail,
}) {
  if (!rows.length) {
    return (
      <div className="mt-5 rounded-2xl border border-dashed border-[#EFDBFF] bg-[#FAF5FF] px-4 py-10 text-center text-sm text-[#262626]/60">
        No hay respuestas individuales para este filtro.
      </div>
    );
  }

  return (
    <>
      <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-[#EFDBFF] md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-[#FBF7F9] text-xs uppercase tracking-[0.08em] text-[#262626]/54">
            <tr>
              <th className="px-4 py-3 text-left">Invitado</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-left">Asistio</th>
              <th className="px-4 py-3 text-left">Cant. personas</th>
              <th className="px-4 py-3 text-left">Fecha</th>
              <th className="px-4 py-3 text-left">Mensaje</th>
              <th className="px-4 py-3 text-right">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFDBFF]">
            {rows.map((response) => (
              <tr key={response.id} className="hover:bg-[#FAF5FF]/55">
                <td className="px-4 py-3 font-medium text-[#262626]">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EFDBFF] text-xs font-semibold text-[#692B9A]">
                      {String(response.displayName || "?").trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <span className="max-w-[180px] truncate">{response.displayName}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <ResponseStatusPill response={response} />
                </td>
                <td className="px-4 py-3 text-[#262626]/70">
                  {getResponseShortAttendanceLabel(response)}
                </td>
                <td className="px-4 py-3 text-[#262626]/70">
                  {getResponsePartySize(response) || "-"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-[#262626]/70">
                  {formatDateTime(response.createdAt)}
                </td>
                <td className="max-w-[240px] px-4 py-3 text-[#262626]/70">
                  <span className="block truncate" title={getResponseMessage(response) || "-"}>
                    {getResponseMessage(response) || "-"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onOpenDetail(response.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-[#EFDBFF] px-3 py-1.5 text-xs font-semibold text-[#692B9A] hover:bg-[#FAF5FF]"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 space-y-3 md:hidden">
        {rows.map((response) => (
          <article key={response.id} className="rounded-2xl border border-[#EFDBFF] bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-semibold text-[#262626]">{response.displayName}</h4>
                <div className="mt-2">
                  <ResponseStatusPill response={response} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenDetail(response.id)}
                className="inline-flex items-center gap-1 rounded-full border border-[#EFDBFF] px-3 py-1.5 text-xs font-semibold text-[#692B9A]"
              >
                <Eye className="h-3.5 w-3.5" />
                Ver
              </button>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-[#262626]/70">
              <MobileFact label="Asistio" value={getResponseShortAttendanceLabel(response)} />
              <MobileFact label="Cant. personas" value={getResponsePartySize(response) || "-"} />
              <MobileFact label="Fecha" value={formatDateTime(response.createdAt)} />
              <MobileFact label="Mensaje" value={getResponseMessage(response) || "-"} />
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[#262626]/60">
          {pagination.totalItems > 0
            ? `${pagination.startIndex + 1}-${pagination.endIndex} de ${totalFiltered}`
            : `0 de ${totalFiltered}`}
        </p>
        <PaginationControls pagination={pagination} onPageChange={onPageChange} />
      </div>
    </>
  );
}

function MobileFact({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[#262626]/50">{label}</span>
      <span className="text-right text-[#262626]">{value}</span>
    </div>
  );
}

function HistoricSummary({ summary }) {
  const items = [
    ["Personas confirmadas", summary?.confirmedGuests || 0],
    ["Vegetarianos", summary?.vegetarianCount || 0],
    ["Veganos", summary?.veganCount || 0],
    ["Ninos", summary?.childrenCount || 0],
    ["Con restricciones", summary?.dietaryRestrictionsCount || 0],
    ["Requieren transporte", summary?.transportCount || 0],
  ];

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(([label, value]) => (
        <article key={label} className="rounded-2xl border border-[#EFDBFF] bg-[#FAF5FF] p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-[#692B9A]">{label}</p>
          <div className="mt-2 text-2xl font-semibold text-[#262626]">{value}</div>
        </article>
      ))}
    </div>
  );
}

function PaginationControls({ pagination, onPageChange, className = "", compact = false }) {
  const canGoPrev = pagination.page > 1;
  const canGoNext = pagination.page < pagination.totalPages;
  const pageNumbers = Array.from({ length: pagination.totalPages })
    .map((_, index) => index + 1)
    .filter((page) => {
      if (pagination.totalPages <= 5) return true;
      if (page === 1 || page === pagination.totalPages) return true;
      return Math.abs(page - pagination.page) <= 1;
    });

  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => onPageChange(pagination.page - 1)}
        disabled={!canGoPrev}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#EFDBFF] text-[#692B9A] disabled:cursor-not-allowed disabled:text-[#262626]/25"
        aria-label="Pagina anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {!compact
        ? pageNumbers.map((page, index) => {
            const previous = pageNumbers[index - 1];
            const needsDots = previous && page - previous > 1;
            return (
              <span key={page} className="inline-flex items-center gap-2">
                {needsDots ? <span className="text-[#262626]/45">...</span> : null}
                <button
                  type="button"
                  onClick={() => onPageChange(page)}
                  className={`h-9 min-w-9 rounded-lg px-3 text-sm font-semibold ${
                    page === pagination.page
                      ? "bg-[#692B9A] text-white"
                      : "text-[#262626]/70 hover:bg-[#FAF5FF]"
                  }`}
                >
                  {page}
                </button>
              </span>
            );
          })
        : (
          <span className="min-w-[76px] text-center text-sm text-[#262626]/70">
            {pagination.page} de {pagination.totalPages}
          </span>
        )}
      <button
        type="button"
        onClick={() => onPageChange(pagination.page + 1)}
        disabled={!canGoNext}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#EFDBFF] text-[#692B9A] disabled:cursor-not-allowed disabled:text-[#262626]/25"
        aria-label="Pagina siguiente"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function EstadoPill({ valor }) {
  const base = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold";
  const styles = {
    Activa: "border border-[#bce8ca] bg-[#ECFDF3] text-[#027A48]",
    Finalizada: "border border-[#E5E5E5] bg-[#FBF7F9] text-[#262626]/70",
    Pausada: "border border-[#FFE7D4] bg-[#FFF6EF] text-[#D95700]",
    Papelera: "border border-[#FFDADA] bg-[#fff7f7] text-[#B3261E]",
    Expirada: "border border-[#E5E5E5] bg-[#FBF7F9] text-[#262626]/60",
    "Sin URL": "border border-[#FFDADA] bg-[#fff7f7] text-[#B3261E]",
  };

  const cls = styles[valor] || "border border-[#E5E5E5] bg-[#FBF7F9] text-[#262626]/70";
  return <span className={`${base} ${cls}`}>{valor}</span>;
}

function ResponseStatusPill({ response }) {
  const key = getResponseAttendanceKey(response);
  const cls =
    key === "confirmed"
      ? "border-[#bce8ca] bg-[#ECFDF3] text-[#027A48]"
      : key === "declined"
        ? "border-[#FFE7D4] bg-[#FFF6EF] text-[#D95700]"
        : "border-[#EFDBFF] bg-[#FAF5FF] text-[#692B9A]";
  const Icon =
    key === "confirmed" ? CheckCircle2 : key === "declined" ? XCircle : Clock3;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {getResponseAttendanceLabel(response)}
    </span>
  );
}

async function copiar(texto) {
  try {
    await copyPublicationUrlToClipboard(texto);
  } catch (error) {
    console.warn("No se pudo copiar al portapapeles", error);
  }
}
