import { normalizeGiftConfig, sanitizeGiftImageUrl } from "./config";
import { fetchGiftLinkHtml, GIFT_METADATA_FETCH_LIMITS, parsePublicGiftMetadataUrl } from "./linkMetadataFetch";

export type GiftLinkMetadata = {
  title: string;
  imageUrl: string;
  status: "found" | "empty" | "unavailable";
};

const emptyMetadata = (status: "empty" | "unavailable"): GiftLinkMetadata => ({ title: "", imageUrl: "", status });

function productMetadata(document: Document): { title: string; images: string[] } {
  let visited = 0;
  const result = { title: "", images: [] as string[] };
  function visit(value: unknown, depth: number): void {
    if (visited++ >= 500 || depth > 8 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const child of value.slice(0, 50)) visit(child, depth + 1);
      return;
    }
    const record = value as Record<string, unknown>;
    const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
    if (types.some((type) => typeof type === "string" && /^(?:https?:\/\/schema\.org\/)?Product$/i.test(type))) {
      if (!result.title && typeof record.name === "string") result.title = record.name;
      const candidates = Array.isArray(record.image) ? record.image.slice(0, 8) : [record.image];
      for (const candidate of candidates) {
        const image = typeof candidate === "string" ? candidate
          : candidate && typeof candidate === "object"
            ? (candidate as Record<string, unknown>).url || (candidate as Record<string, unknown>).contentUrl
            : null;
        if (typeof image === "string" && result.images.length < 8) result.images.push(image);
      }
    }
    for (const child of Object.values(record).slice(0, 50)) visit(child, depth + 1);
  }
  for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 20)) {
    const json = script.textContent || "";
    if (json.length > 65_536 || visited >= 500) continue;
    try { visit(JSON.parse(json), 0); } catch { /* Invalid structured data cannot block manual entry. */ }
  }
  return result;
}

function safeImageUrl(value: string, finalUrl: string): string {
  if (!value || value.length > 2048) return "";
  try {
    const sanitized = sanitizeGiftImageUrl(new URL(value.trim(), finalUrl).href);
    return sanitized ? parsePublicGiftMetadataUrl(sanitized).href : "";
  } catch { return ""; }
}

export async function extractGiftLinkMetadata(html: string, finalUrl: string): Promise<GiftLinkMetadata> {
  // Bound parser allocation as well as network bytes; a hostile page can otherwise
  // turn a small body into hundreds of thousands of DOM nodes.
  if (Buffer.byteLength(html, "utf8") > GIFT_METADATA_FETCH_LIMITS.maxBytes ||
      (html.match(/</g)?.length || 0) > 10_000) return emptyMetadata("unavailable");
  if (/suspicious-traffic-frontend|gz-account-verification-index|cf-chl-|\/cdn-cgi\/challenge-platform\//i.test(html)) {
    return emptyMetadata("unavailable");
  }
  const { JSDOM, VirtualConsole } = await import("jsdom");
  // No runScripts or resources option: scripts, frames, images and stylesheets
  // cannot execute or make requests. An untrusted <base> never resolves images.
  const dom = new JSDOM(html, { url: finalUrl, virtualConsole: new VirtualConsole() });
  try {
    const document = dom.window.document;
    if (/^(?:just a moment(?:\.{3})?|access denied|robot check|attention required!?|verifica(?:r|ción de) (?:tu )?identidad)$/i.test(document.title.trim())) {
      return emptyMetadata("unavailable");
    }
    const metadata = new Map<string, string[]>();
    for (const tag of [...document.querySelectorAll("meta[property], meta[name]")].slice(0, 200)) {
      const key = (tag.getAttribute("property") || tag.getAttribute("name") || "").toLowerCase().trim();
      const value = (tag.getAttribute("content") || "").trim();
      if (!value) continue;
      metadata.set(key, [...(metadata.get(key) || []).slice(0, 7), value]);
    }
    const product = productMetadata(document);
    const title = metadata.get("og:title")?.[0] || metadata.get("twitter:title")?.[0] || product.title || document.title;
    const images = [
      ...(metadata.get("og:image:secure_url") || []), ...(metadata.get("og:image") || []),
      ...(metadata.get("twitter:image") || []), ...(metadata.get("twitter:image:src") || []), ...product.images,
    ];
    const imageUrl = images.map((image) => safeImageUrl(image, finalUrl)).find(Boolean) || "";
    // Reuse the stored gift-link contract for title whitespace/length and URL limits.
    const normalized = normalizeGiftConfig({ giftLinks: [{ id: "metadata", url: finalUrl, title, imageUrl, visible: true }] }).giftLinks[0];
    if (!normalized?.title && !normalized?.imageUrl) return emptyMetadata("empty");
    return { title: normalized.title, imageUrl: normalized.imageUrl, status: "found" };
  } finally { dom.window.close(); }
}

export async function resolveGiftLinkMetadata(
  url: string,
  fetchHtml: typeof fetchGiftLinkHtml = fetchGiftLinkHtml
): Promise<GiftLinkMetadata> {
  try {
    const page = await fetchHtml(url);
    return await extractGiftLinkMetadata(page.html, page.finalUrl);
  } catch {
    // Site errors, blocks and timeouts do not disclose URLs/HTML or prevent saving
    // the link. The editor preserves its manual title/image fields.
    return emptyMetadata("unavailable");
  }
}
