function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase();
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function isCountdownObject(value) {
  return normalizeLowerText(asObject(value).tipo) === "countdown";
}

function isDateLikeFieldType(value) {
  const type = normalizeLowerText(value);
  return type === "date" || type === "datetime";
}

function isCountdownVisible(countdown) {
  return asObject(countdown).mostrarCuentaRegresiva !== false;
}

function resolveCountdownTargetValue(countdown) {
  const safeCountdown = asObject(countdown);
  return (
    normalizeText(safeCountdown.fechaObjetivo) ||
    normalizeText(safeCountdown.targetISO) ||
    normalizeText(safeCountdown.fechaISO)
  );
}

function forEachRenderObject(objetos, visitor) {
  if (typeof visitor !== "function") return;

  function visit(value) {
    const object = asObject(value);
    if (!Object.keys(object).length) return;
    visitor(object);
    if (
      normalizeLowerText(object.tipo) === "grupo" &&
      Array.isArray(object.children)
    ) {
      object.children.forEach(visit);
    }
  }

  (Array.isArray(objetos) ? objetos : []).forEach(visit);
}

function collectCountdownObjects(objetos) {
  const countdowns = [];
  forEachRenderObject(objetos, (object) => {
    if (isCountdownObject(object)) countdowns.push(object);
  });
  return countdowns;
}

function splitCountdownTargetIso(value) {
  const raw = normalizeText(value);
  if (!raw) return { date: "", time: "" };

  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    return {
      date: `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}`,
      time: "",
    };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "" };

  return {
    date: `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`,
    time: `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`,
  };
}

function parseDatePart(date) {
  const match = normalizeText(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function parseTimePart(time) {
  const match = normalizeText(time).match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
  };
}

function buildCountdownTargetIsoFromLocalParts({ date, time } = {}) {
  const dateParts = parseDatePart(date);
  const timeParts = parseTimePart(time);
  if (!dateParts || !timeParts) return "";

  const { year, month, day } = dateParts;
  const { hours, minutes } = timeParts;
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return "";
  }

  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day ||
    localDate.getHours() !== hours ||
    localDate.getMinutes() !== minutes
  ) {
    return "";
  }

  return localDate.toISOString();
}

function mergeCountdownTargetLocalParts({
  currentTargetValue,
  currentDate,
  currentTime,
  patch,
} = {}) {
  const safePatch = asObject(patch);
  const currentTargetParts = splitCountdownTargetIso(currentTargetValue);
  const hasDatePatch = Object.prototype.hasOwnProperty.call(safePatch, "date");
  const hasTimePatch = Object.prototype.hasOwnProperty.call(safePatch, "time");
  const date = hasDatePatch
    ? normalizeText(safePatch.date)
    : normalizeText(currentDate) || currentTargetParts.date;
  const time = hasTimePatch
    ? normalizeText(safePatch.time)
    : normalizeText(currentTime) || currentTargetParts.time;

  return {
    date,
    time,
    targetISO: buildCountdownTargetIsoFromLocalParts({ date, time }),
  };
}

function findObjectById(objetos, id) {
  const safeId = normalizeText(id);
  if (!safeId) return null;

  let found = null;
  forEachRenderObject(objetos, (objeto) => {
    if (!found && normalizeText(objeto.id) === safeId) found = objeto;
  });
  return found;
}

function normalizeFieldKeyFilter(value) {
  if (Array.isArray(value)) {
    return new Set(value.map((entry) => normalizeText(entry)).filter(Boolean));
  }
  const single = normalizeText(value);
  return single ? new Set([single]) : null;
}

function collectDynamicCountdownBindings({ fieldsSchema, objetos, fieldKey, fieldKeys } = {}) {
  const safeFields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const fieldKeyFilter = normalizeFieldKeyFilter(fieldKeys || fieldKey);
  const bindings = [];

  for (const field of safeFields) {
    const safeField = asObject(field);
    const fieldKey = normalizeText(safeField.key);
    if (!fieldKey || !isDateLikeFieldType(safeField.type)) continue;
    if (fieldKeyFilter && !fieldKeyFilter.has(fieldKey)) continue;

    const targets = Array.isArray(safeField.applyTargets)
      ? safeField.applyTargets
      : [];

    for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
      const target = asObject(targets[targetIndex]);
      const targetId = normalizeText(target.id);
      const targetPath = normalizeLowerText(target.path);
      if (normalizeLowerText(target.scope) !== "objeto") continue;
      if (!targetId || targetPath !== "fechaobjetivo") continue;

      const countdown = findObjectById(objetos, targetId);
      if (!isCountdownObject(countdown)) continue;

      bindings.push({
        field: safeField,
        fieldKey,
        fieldType: normalizeLowerText(safeField.type),
        target,
        targetIndex,
        countdown,
        countdownId: targetId,
      });
    }
  }

  return bindings;
}

function findDynamicCountdownBinding(options = {}) {
  return collectDynamicCountdownBindings(options)[0] || null;
}

function resolveCanonicalCountdownTargetIso({ dateValue, startTime } = {}) {
  const rawDateValue = normalizeText(dateValue);
  if (!rawDateValue) return "";

  const parts = splitCountdownTargetIso(rawDateValue);
  const explicitStartTime = normalizeText(startTime);
  if (parts.date && explicitStartTime) {
    return buildCountdownTargetIsoFromLocalParts({
      date: parts.date,
      time: explicitStartTime,
    });
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDateValue)) {
    return buildCountdownTargetIsoFromLocalParts({
      date: rawDateValue,
      time: "00:00",
    });
  }

  const parsed = new Date(rawDateValue);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function buildDynamicCountdownProjectionPatches(options = {}) {
  const bindings = collectDynamicCountdownBindings(options);
  const values = asObject(options.values);
  const startTimeByFieldKey = asObject(options.startTimeByFieldKey);
  const hasDateValue = Object.prototype.hasOwnProperty.call(options, "dateValue");
  const hasStartTime = Object.prototype.hasOwnProperty.call(options, "startTime");
  const patches = [];
  const patchedObjectIds = new Set();

  bindings.forEach((binding) => {
    if (patchedObjectIds.has(binding.countdownId)) return;
    const dateValue = hasDateValue
      ? options.dateValue
      : values[binding.fieldKey];
    const startTime = hasStartTime
      ? options.startTime
      : startTimeByFieldKey[binding.fieldKey];
    const targetISO = resolveCanonicalCountdownTargetIso({
      dateValue,
      startTime,
    });
    if (!targetISO) return;

    patchedObjectIds.add(binding.countdownId);
    patches.push({
      objectId: binding.countdownId,
      patch: { fechaObjetivo: targetISO },
    });
  });

  return patches;
}

function buildDynamicCountdownEventDetails({ fieldsSchema, objetos, fieldKey, fieldKeys } = {}) {
  const bindings = collectDynamicCountdownBindings({
    fieldsSchema,
    objetos,
    fieldKey,
    fieldKeys,
  });
  const binding = bindings[0] || null;
  if (!binding) {
    return {
      hasBinding: false,
      field: null,
      fieldKey: "",
      fieldType: "",
      target: null,
      countdown: null,
      countdownId: "",
      targetISO: "",
      date: "",
      time: "",
      visible: false,
      countdownIds: [],
      linkedCount: 0,
      visibleCount: 0,
    };
  }

  const targetISO = resolveCountdownTargetValue(binding.countdown);
  const parts = splitCountdownTargetIso(targetISO);
  const countdownsById = new Map();
  bindings.forEach((candidate) => {
    if (!countdownsById.has(candidate.countdownId)) {
      countdownsById.set(candidate.countdownId, candidate.countdown);
    }
  });
  const countdownIds = Array.from(countdownsById.keys());
  const visibleCount = Array.from(countdownsById.values()).filter(
    isCountdownVisible
  ).length;

  return {
    hasBinding: true,
    field: binding.field,
    fieldKey: binding.fieldKey,
    fieldType: binding.fieldType,
    target: binding.target,
    countdown: binding.countdown,
    countdownId: binding.countdownId,
    targetISO,
    date: parts.date,
    time: parts.time,
    visible: visibleCount > 0,
    countdownIds,
    linkedCount: countdownIds.length,
    visibleCount,
  };
}

module.exports = {
  buildCountdownTargetIsoFromLocalParts,
  buildDynamicCountdownProjectionPatches,
  buildDynamicCountdownEventDetails,
  collectCountdownObjects,
  collectDynamicCountdownBindings,
  findDynamicCountdownBinding,
  isCountdownVisible,
  mergeCountdownTargetLocalParts,
  resolveCanonicalCountdownTargetIso,
  resolveCountdownTargetValue,
  splitCountdownTargetIso,
};
