function normalizeText(value) {
  return String(value || "").trim();
}

export async function copyPublicationUrlToClipboard(url) {
  const safeUrl = normalizeText(url);
  if (!safeUrl) return false;
  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard?.writeText
  ) {
    throw new Error("clipboard-unavailable");
  }

  await navigator.clipboard.writeText(safeUrl);
  return true;
}
