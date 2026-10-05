// Existing authoring value normalization, shared by owners and AI projection.
function normalizeAuthoringText(value) { return String(value || "").trim(); }
function normalizeStoryTextValue(value) {
  if (value == null) return "";
  return String(value).replace(/\r\n/g, "\n");
}
// Date-only normalization shared with the event editor. No timezone conversion.
function buildDateInputValue({ year, month, day } = {}) {
  const safeYear = Number(year), safeMonth = Number(month), safeDay = Number(day);
  if (!Number.isInteger(safeYear) || !Number.isInteger(safeMonth) || !Number.isInteger(safeDay) ||
      safeYear < 1000 || safeMonth < 1 || safeMonth > 12 || safeDay < 1 || safeDay > 31) return "";
  const parsed = new Date(safeYear, safeMonth - 1, safeDay);
  if (parsed.getFullYear() !== safeYear || parsed.getMonth() + 1 !== safeMonth || parsed.getDate() !== safeDay) return "";
  return `${safeYear}-${String(safeMonth).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

// null = not this format; "" = recognized numeric format with invalid calendar.
function normalizeNumericEventDateValue(value, { allowTrailingText = true } = {}) {
  const match = /^(\d{1,2})\s*([|/.])\s*(\d{1,2})\s*\2\s*(\d{4}|\d{2})(\D.*)?$/.exec(normalizeAuthoringText(value));
  if (!match || (!allowTrailingText && match[5])) return null;
  return buildDateInputValue({ day: match[1], month: match[3],
    year: match[4].length === 2 ? 2000 + Number(match[4]) : match[4] });
}

module.exports = { normalizeAuthoringText, normalizeStoryTextValue, buildDateInputValue, normalizeNumericEventDateValue };
