const DEFAULT_PAGE_SIZE = 6;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeSearchToken(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function toNonNegativeInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

export function getInvitationStatusKey(row) {
  if (row?.isFinalized || row?.estado === "Finalizada") return "finalized";
  if (row?.isPaused || row?.estado === "Pausada") return "paused";
  if (row?.isActive || row?.estado === "Activa") return "active";
  if (row?.isTrashed || row?.estado === "Papelera") return "trash";
  return "other";
}

export function filterInvitationRows(rows = [], { search = "", status = "all" } = {}) {
  const token = normalizeSearchToken(search);
  const normalizedStatus = normalizeText(status).toLowerCase() || "all";

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (normalizedStatus !== "all" && getInvitationStatusKey(row) !== normalizedStatus) {
      return false;
    }

    if (!token) return true;

    const haystack = normalizeSearchToken(
      [
        row?.nombre,
        row?.publicSlug,
        row?.estado,
        row?.tipoLabel,
        row?.url,
      ].join(" ")
    );
    return haystack.includes(token);
  });
}

export function getResponseAttendanceKey(response) {
  const attendance = normalizeText(response?.metrics?.attendance).toLowerCase();
  if (attendance === "yes") return "confirmed";
  if (attendance === "no") return "declined";
  return "pending";
}

export function getResponseAttendanceLabel(response) {
  const key = getResponseAttendanceKey(response);
  if (key === "confirmed") return "Confirmado";
  if (key === "declined") return "No asiste";
  return "Pendiente";
}

export function getResponseShortAttendanceLabel(response) {
  const key = getResponseAttendanceKey(response);
  if (key === "confirmed") return "Si";
  if (key === "declined") return "No";
  return "-";
}

export function getResponsePartySize(response) {
  const value = toNonNegativeInteger(response?.answers?.party_size);
  if (value > 0) return value;
  const confirmedGuests = toNonNegativeInteger(response?.metrics?.confirmedGuests);
  return confirmedGuests > 0 ? confirmedGuests : 0;
}

export function getResponseMessage(response) {
  return (
    normalizeText(response?.answers?.host_message) ||
    normalizeText(response?.answers?.message) ||
    normalizeText(response?.raw?.mensaje) ||
    normalizeText(response?.raw?.comentarios) ||
    ""
  );
}

export function filterResponseRows(
  rows = [],
  { search = "", attendanceFilter = "all" } = {}
) {
  const token = normalizeSearchToken(search);
  const normalizedFilter = normalizeText(attendanceFilter).toLowerCase() || "all";

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const attendanceKey = getResponseAttendanceKey(row);
    if (normalizedFilter !== "all" && attendanceKey !== normalizedFilter) {
      return false;
    }

    if (!token) return true;

    const answerText = Object.values(row?.answers || {}).join(" ");
    const haystack = normalizeSearchToken(
      [
        row?.displayName,
        getResponseAttendanceLabel(row),
        getResponseShortAttendanceLabel(row),
        getResponsePartySize(row),
        getResponseMessage(row),
        answerText,
      ].join(" ")
    );
    return haystack.includes(token);
  });
}

export function computeResponseMetrics(rows = [], { invitedCount = 0 } = {}) {
  let confirmedResponses = 0;
  let declinedResponses = 0;
  let pendingFromRows = 0;
  let confirmedGuests = 0;

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = getResponseAttendanceKey(row);
    if (key === "confirmed") confirmedResponses += 1;
    if (key === "declined") declinedResponses += 1;
    if (key === "pending") pendingFromRows += 1;
    confirmedGuests += toNonNegativeInteger(row?.metrics?.confirmedGuests);
  });

  const normalizedInvitedCount = toNonNegativeInteger(invitedCount);
  const totalExpected =
    normalizedInvitedCount > 0 ? normalizedInvitedCount : rows.length;
  const pendingResponses =
    normalizedInvitedCount > 0
      ? Math.max(totalExpected - confirmedResponses - declinedResponses, 0)
      : pendingFromRows;

  return {
    confirmedResponses,
    declinedResponses,
    pendingResponses,
    confirmedGuests,
    totalResponses: rows.length,
    totalExpected,
  };
}

export function computeHistoricResponseMetrics(summary = {}, { invitedCount = 0 } = {}) {
  const confirmedResponses = toNonNegativeInteger(summary?.confirmedResponses);
  const declinedResponses = toNonNegativeInteger(summary?.declinedResponses);
  const confirmedGuests = toNonNegativeInteger(summary?.confirmedGuests);
  const summaryTotalResponses = toNonNegativeInteger(summary?.totalResponses);
  const normalizedInvitedCount = toNonNegativeInteger(invitedCount);
  const totalExpected =
    normalizedInvitedCount > 0
      ? normalizedInvitedCount
      : Math.max(summaryTotalResponses, confirmedResponses + declinedResponses);
  const pendingResponses =
    normalizedInvitedCount > 0 || summaryTotalResponses > 0
      ? Math.max(totalExpected - confirmedResponses - declinedResponses, 0)
      : 0;

  return {
    confirmedResponses,
    declinedResponses,
    pendingResponses,
    confirmedGuests,
    totalResponses: summaryTotalResponses,
    totalExpected,
  };
}

export function paginateItems(items = [], page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  const safeItems = Array.isArray(items) ? items : [];
  const safePageSize = Math.max(1, toNonNegativeInteger(pageSize) || DEFAULT_PAGE_SIZE);
  const totalItems = safeItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.min(Math.max(1, toNonNegativeInteger(page) || 1), totalPages);
  const startIndex = totalItems > 0 ? (safePage - 1) * safePageSize : 0;
  const endIndex = Math.min(startIndex + safePageSize, totalItems);

  return {
    items: safeItems.slice(startIndex, endIndex),
    page: safePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
  };
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (!/[;"\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function formatCsvDate(value) {
  if (!(value instanceof Date)) return "";
  return value.toLocaleString("es-AR");
}

function formatAnswer(column, response, formatter) {
  if (typeof formatter === "function") {
    return formatter(column, response?.answers?.[column.id]);
  }
  return String(response?.answers?.[column.id] ?? "");
}

export function buildResponsesCsv(rows = [], columns = [], formatter = null) {
  const fixedColumnIds = new Set([
    "full_name",
    "attendance",
    "party_size",
    "host_message",
  ]);
  const extraColumns = (Array.isArray(columns) ? columns : []).filter(
    (column) => column?.id && !fixedColumnIds.has(column.id)
  );
  const header = [
    "Invitado",
    "Estado",
    "Asistio",
    "Cant. personas",
    "Fecha",
    "Mensaje",
    ...extraColumns.map((column) => column.label || column.id),
  ];

  const lines = [
    header.map(escapeCsvCell).join(";"),
    ...(Array.isArray(rows) ? rows : []).map((row) => {
      const values = [
        row?.displayName || "",
        getResponseAttendanceLabel(row),
        getResponseShortAttendanceLabel(row),
        getResponsePartySize(row) || "",
        formatCsvDate(row?.createdAt),
        getResponseMessage(row),
        ...extraColumns.map((column) => formatAnswer(column, row, formatter)),
      ];
      return values.map(escapeCsvCell).join(";");
    }),
  ];

  return `\uFEFF${lines.join("\r\n")}`;
}
