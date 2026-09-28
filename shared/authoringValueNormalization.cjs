// Existing authoring value normalization, shared by owners and AI projection.
function normalizeAuthoringText(value) { return String(value || "").trim(); }
function normalizeStoryTextValue(value) {
  if (value == null) return "";
  return String(value).replace(/\r\n/g, "\n");
}
module.exports = { normalizeAuthoringText, normalizeStoryTextValue };
