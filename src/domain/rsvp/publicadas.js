import { normalizeRsvpConfig } from "@/domain/rsvp/config";

const FALLBACK_QUESTION_MAP = Object.freeze({
  full_name: { id: "full_name", label: "Invitado", type: "short_text" },
  attendance: {
    id: "attendance",
    label: "Asistencia",
    type: "single_select",
    options: [
      { id: "yes", label: "Si" },
      { id: "no", label: "No" },
    ],
  },
  party_size: { id: "party_size", label: "Personas", type: "number" },
  menu_type: { id: "menu_type", label: "Menu", type: "single_select" },
  children_count: { id: "children_count", label: "Ninos", type: "number" },
  dietary_notes: {
    id: "dietary_notes",
    label: "Restricciones",
    type: "long_text",
  },
  needs_transport: {
    id: "needs_transport",
    label: "Transporte",
    type: "boolean",
  },
  host_message: {
    id: "host_message",
    label: "Mensaje",
    type: "long_text",
  },
  phone_whatsapp: {
    id: "phone_whatsapp",
    label: "Telefono",
    type: "phone",
  },
});

function sanitizeText(value) {
  if (value === null || typeof value === "undefined") return "";
  return String(value).trim();
}

function normalizeAttendanceValue(value) {
  const raw = sanitizeText(value).toLowerCase();
  if (!raw) return "unknown";
  if (["yes", "si", "sí", "true", "1"].includes(raw)) return "yes";
  if (["no", "false", "0"].includes(raw)) return "no";
  return "unknown";
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  const raw = sanitizeText(value).toLowerCase();
  if (!raw) return false;
  if (["si", "sí", "yes", "true", "1"].includes(raw)) return true;
  if (["no", "false", "0"].includes(raw)) return false;
  return false;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

export function toDateFromTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "number") return new Date(value);
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  return null;
}

function getLegacyAttendance(record = {}) {
  if (typeof record.confirma === "boolean") return record.confirma ? "yes" : "no";
  if (typeof record.confirmado === "boolean") return record.confirmado ? "yes" : "no";
  return normalizeAttendanceValue(record.asistencia);
}

function buildLegacyAnswers(record = {}) {
  const fullName =
    sanitizeText(record.nombre) ||
    sanitizeText(record.nombreCompleto) ||
    sanitizeText(record.invitado) ||
    sanitizeText(record.email) ||
    sanitizeText(record.telefono) ||
    "";

  const attendance = getLegacyAttendance(record);
  const partySize = normalizeNumber(
    record.cantidad ?? record.invitados ?? record.asistentes ?? 0
  );

  const hostMessage =
    sanitizeText(record.mensaje) || sanitizeText(record.comentarios) || "";

  return {
    full_name: fullName,
    attendance: attendance === "unknown" ? null : attendance,
    party_size: partySize || null,
    host_message: hostMessage || null,
    phone_whatsapp: sanitizeText(record.telefono) || null,
    dietary_notes: sanitizeText(record.dietary_notes || record.alergias || "") || null,
    menu_type: sanitizeText(record.menu_type || record.menu || "") || null,
    children_count: normalizeNumber(record.children_count || record.ninos || 0) || null,
    needs_transport:
      typeof record.needs_transport === "boolean"
        ? record.needs_transport
        : normalizeBoolean(record.transporte),
  };
}

function normalizeMenuMetricId(value) {
  const raw = sanitizeText(value).toLowerCase();
  if (!raw) return null;
  if (raw.includes("vegano") || raw === "vegan") return "vegan";
  if (raw.includes("vegetar")) return "vegetarian";
  if (raw.includes("tacc") || raw.includes("celia")) return "celiac";
  if (raw === "standard" || raw === "clasico") return "standard";
  return raw;
}

function computeMetrics(record, answers) {
  const metricsRaw = record?.metrics && typeof record.metrics === "object" ? record.metrics : {};
  const attendance =
    normalizeAttendanceValue(metricsRaw.attendance) !== "unknown"
      ? normalizeAttendanceValue(metricsRaw.attendance)
      : normalizeAttendanceValue(answers.attendance || getLegacyAttendance(record));

  const partySize = normalizeNumber(answers.party_size);
  const confirmedGuestsRaw = normalizeNumber(metricsRaw.confirmedGuests);
  const confirmedGuests =
    confirmedGuestsRaw > 0
      ? confirmedGuestsRaw
      : attendance === "yes"
        ? (partySize || 1)
        : 0;

  const childrenCountRaw = normalizeNumber(metricsRaw.childrenCount);
  const childrenCount = childrenCountRaw || normalizeNumber(answers.children_count);

  const menuTypeId =
    sanitizeText(metricsRaw.menuTypeId) || normalizeMenuMetricId(answers.menu_type);

  const hasDietaryRestrictions =
    typeof metricsRaw.hasDietaryRestrictions === "boolean"
      ? metricsRaw.hasDietaryRestrictions
      : Boolean(sanitizeText(answers.dietary_notes));

  const needsTransport =
    typeof metricsRaw.needsTransport === "boolean"
      ? metricsRaw.needsTransport
      : normalizeBoolean(answers.needs_transport);

  return {
    attendance,
    confirmedGuests,
    menuTypeId: menuTypeId || null,
    childrenCount,
    hasDietaryRestrictions,
    needsTransport,
  };
}

export function normalizeRsvpSnapshot(rawSnapshot) {
  if (!rawSnapshot || typeof rawSnapshot !== "object") return null;
  return normalizeRsvpConfig(rawSnapshot, { forceEnabled: false });
}

export function adaptRsvpResponse(record = {}, snapshot = null) {
  const isVersion2 = Number(record.version) === 2 && record.answers && typeof record.answers === "object";
  const answers = isVersion2
    ? { ...record.answers }
    : buildLegacyAnswers(record);

  const metrics = computeMetrics(record, answers);

  const fallbackName =
    sanitizeText(answers.full_name) ||
    sanitizeText(record.nombre) ||
    sanitizeText(record.nombreCompleto) ||
    "(sin nombre)";

  const createdAt = toDateFromTimestamp(
    record.creadoEn ||
      record.createdAt ||
      record.fecha ||
      record.fechaCreacion ||
      record.enviadoEn ||
      record.timestamp ||
      null
  );

  return {
    id: record.id,
    raw: record,
    version: isVersion2 ? 2 : 1,
    answers,
    metrics,
    displayName: fallbackName,
    createdAt,
  };
}

function deriveFallbackQuestions(rows = []) {
  const priority = [
    "full_name",
    "attendance",
    "party_size",
    "menu_type",
    "children_count",
    "dietary_notes",
    "needs_transport",
    "host_message",
    "phone_whatsapp",
  ];

  const present = new Set();
  rows.forEach((row) => {
    Object.keys(row?.answers || {}).forEach((key) => {
      const value = row.answers[key];
      if (value === null || typeof value === "undefined" || value === "") return;
      present.add(key);
    });
  });

  return priority
    .filter((id) => present.has(id) || id === "full_name" || id === "attendance")
    .map((id, index) => ({
      ...(FALLBACK_QUESTION_MAP[id] || {
        id,
        label: id,
        type: "short_text",
      }),
      order: index,
      active: true,
    }));
}

export function getActiveQuestionsForGrid(snapshot, rows = []) {
  if (snapshot && Array.isArray(snapshot.questions)) {
    return [...snapshot.questions]
      .filter((question) => question.active)
      .sort((a, b) => a.order - b.order);
  }
  return deriveFallbackQuestions(rows);
}

export function buildColumns(snapshot, rows = []) {
  const questions = getActiveQuestionsForGrid(snapshot, rows);
  return questions.map((question) => ({
    id: question.id,
    label: question.label,
    type: question.type,
    options: question.options,
  }));
}

export function formatAnswerValue(column, value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return "(sin respuesta)";
  }

  if (column.type === "boolean") {
    return normalizeBoolean(value) ? "Si" : "No";
  }

  if (column.type === "single_select" && Array.isArray(column.options)) {
    const option = column.options.find((item) => item.id === value);
    if (option?.label) return option.label;
  }

  if (column.type === "number") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return String(parsed);
  }

  return String(value);
}

export function computeSummaryCards(rows = [], snapshot = null) {
  const activeIds = new Set(getActiveQuestionsForGrid(snapshot, rows).map((question) => question.id));

  let confirmed = 0;
  let declined = 0;
  let confirmedGuests = 0;
  let vegetarian = 0;
  let vegan = 0;
  let children = 0;
  let restrictions = 0;
  let transport = 0;

  rows.forEach((row) => {
    if (row.metrics.attendance === "yes") confirmed += 1;
    if (row.metrics.attendance === "no") declined += 1;
    confirmedGuests += row.metrics.confirmedGuests;

    if (row.metrics.menuTypeId === "vegetarian") vegetarian += 1;
    if (row.metrics.menuTypeId === "vegan") vegan += 1;

    children += row.metrics.childrenCount;
    if (row.metrics.hasDietaryRestrictions) restrictions += 1;
    if (row.metrics.needsTransport) transport += 1;
  });

  const cards = [
    {
      id: "confirmed",
      label: "Confirmados",
      value: confirmed,
      visible: activeIds.has("attendance") || rows.length > 0,
    },
    {
      id: "declined",
      label: "No asisten",
      value: declined,
      visible: activeIds.has("attendance") || rows.length > 0,
    },
    {
      id: "confirmed_guests",
      label: "Personas confirmadas",
      value: confirmedGuests,
      visible: activeIds.has("party_size") || rows.length > 0,
    },
    {
      id: "vegetarian",
      label: "Vegetarianos",
      value: vegetarian,
      visible: activeIds.has("menu_type"),
    },
    {
      id: "vegan",
      label: "Veganos",
      value: vegan,
      visible: activeIds.has("menu_type"),
    },
    {
      id: "children",
      label: "Total ninos",
      value: children,
      visible: activeIds.has("children_count"),
    },
    {
      id: "restrictions",
      label: "Con restricciones",
      value: restrictions,
      visible: activeIds.has("dietary_notes"),
    },
    {
      id: "transport",
      label: "Requieren transporte",
      value: transport,
      visible: activeIds.has("needs_transport"),
    },
  ];

  return cards.filter((card) => card.visible);
}

export function computeConfirmedGuestsFromRaw(record) {
  const adapted = adaptRsvpResponse(record, null);
  return adapted.metrics.confirmedGuests;
}
