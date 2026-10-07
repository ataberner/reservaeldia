// Attendance interpretation shared by the dashboard and administrative summaries.
function normalizeAttendanceValue(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["yes", "si", "sí", "true", "1"].includes(raw)) return "yes";
  if (["no", "false", "0"].includes(raw)) return "no";
  return "unknown";
}

function getLegacyAttendance(record = {}) {
  if (typeof record.confirma === "boolean") return record.confirma ? "yes" : "no";
  if (typeof record.confirmado === "boolean") return record.confirmado ? "yes" : "no";
  return normalizeAttendanceValue(record.asistencia);
}

function resolveRsvpResponseAttendance(record = {}) {
  const metric = normalizeAttendanceValue(record?.metrics?.attendance);
  if (metric !== "unknown") return metric;
  const legacy = getLegacyAttendance(record);
  const hasAnswers = Number(record.version) === 2 &&
    record.answers && typeof record.answers === "object";
  return normalizeAttendanceValue(hasAnswers ? record.answers.attendance || legacy : legacy);
}

module.exports = { getLegacyAttendance, resolveRsvpResponseAttendance };
