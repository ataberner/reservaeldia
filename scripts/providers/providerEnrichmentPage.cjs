"use strict";

const path = require("path");
const { performance } = require("perf_hooks");
const { createRequire } = require("module");

const functionsRequire = createRequire(
  path.resolve(__dirname, "../../functions/package.json")
);
const { JSDOM } = functionsRequire("jsdom");

const DESCRIPTION_KEYS = new Set([
  "description",
  "descripcion",
  "longdescription",
  "bio",
  "about",
  "aboutus",
]);
const SHORT_DESCRIPTION_KEYS = new Set([
  "shortdescription",
  "descripcioncorta",
  "summary",
  "resumen",
  "excerpt",
]);
const IMAGE_KEYS = new Set([
  "image",
  "images",
  "photo",
  "photos",
  "gallery",
  "galeria",
  "cover",
  "coverimage",
  "portada",
  "hero",
  "heroimage",
  "thumbnailurl",
  "contenturl",
]);
const COVER_KEYS = new Set([
  "cover",
  "coverimage",
  "portada",
  "hero",
  "heroimage",
  "thumbnailurl",
]);
const DESCRIPTION_MARKERS = [
  "description",
  "descripcion",
  "about",
  "nosotros",
  "acerca",
  "perfil",
  "detalle",
];
const IMAGE_MARKERS = [
  "gallery",
  "galeria",
  "portfolio",
  "fotos",
  "photos",
  "imagenes",
  "images",
  "carousel",
  "slider",
];
const COVER_MARKERS = [
  "cover",
  "portada",
  "hero",
  "banner",
];
const WORDPRESS_IMAGE_SIZE_SUFFIX =
  /-\d{2,5}x\d{2,5}(?=\.(?:jpe?g|png|webp|gif|avif)$)/i;

function normalizedKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeText(value) {
  if (typeof value !== "string") return "";
  const fragment = JSDOM.fragment(value);
  for (const element of fragment.querySelectorAll(
    "script,style,template,noscript"
  )) {
    element.remove();
  }
  return String(fragment.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function usefulDescription(value) {
  const normalized = normalizeText(value);
  if (normalized.length < 40) return "";
  if (/^(portal casamientos|inicio|contacto)$/i.test(normalized)) {
    return "";
  }
  return normalized;
}

function resolveHttpUrl(value, baseUrl) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return null;
  }
  try {
    const parsed = new URL(trimmed, baseUrl);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function canonicalMediaIdentity(value, baseUrl) {
  const resolved = resolveHttpUrl(value, baseUrl);
  if (!resolved) return null;
  const parsed = new URL(resolved);
  parsed.search = "";
  parsed.hash = "";
  if (
    /\/wp-content\/uploads\//i.test(parsed.pathname) &&
    WORDPRESS_IMAGE_SIZE_SUFFIX.test(parsed.pathname)
  ) {
    parsed.pathname = parsed.pathname.replace(
      WORDPRESS_IMAGE_SIZE_SUFFIX,
      ""
    );
  }
  parsed.hostname = parsed.hostname.toLowerCase();
  return parsed.toString();
}

function wordpressOriginalImageUrl(value, baseUrl) {
  const resolved = resolveHttpUrl(value, baseUrl);
  if (!resolved) return null;
  const parsed = new URL(resolved);
  if (!/\/wp-content\/uploads\//i.test(parsed.pathname)) {
    return null;
  }
  const originalPath = parsed.pathname.replace(
    WORDPRESS_IMAGE_SIZE_SUFFIX,
    ""
  );
  if (originalPath === parsed.pathname) return null;
  parsed.pathname = originalPath;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function uniqueResolvedUrls(values, baseUrl) {
  const urls = [];
  const seen = new Set();
  for (const value of values) {
    const url = resolveHttpUrl(value, baseUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function markerMatch(value, markers) {
  const normalized = normalizedKey(value);
  return markers.some((marker) => normalized.includes(marker));
}

function imageUrlsFromValue(value, baseUrl, inheritedAlt = "") {
  if (typeof value === "string") {
    const url = resolveHttpUrl(value, baseUrl);
    return url ? [{ url, alt: inheritedAlt }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) =>
      imageUrlsFromValue(entry, baseUrl, inheritedAlt)
    );
  }
  if (!value || typeof value !== "object") return [];

  const alt = normalizeText(
    value.caption ||
      value.alt ||
      value.name ||
      inheritedAlt
  );
  const directKeys = [
    "url",
    "contentUrl",
    "src",
    "image",
    "thumbnailUrl",
  ];
  const direct = [];
  for (const key of directKeys) {
    if (key in value) {
      direct.push(...imageUrlsFromValue(value[key], baseUrl, alt));
    }
  }
  return direct;
}

function parseJsonScript(text) {
  const normalized = String(text || "")
    .trim()
    .replace(/^<!--/, "")
    .replace(/-->$/, "")
    .trim();
  if (!normalized) return null;
  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

function balancedJsonFragment(text, startIndex) {
  const opening = text[startIndex];
  const closing = opening === "{" ? "}" : opening === "[" ? "]" : "";
  if (!closing) return null;
  const stack = [closing];
  let quote = "";
  let escaped = false;
  for (let index = startIndex + 1; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{" || character === "[") {
      stack.push(character === "{" ? "}" : "]");
      continue;
    }
    if (character === "}" || character === "]") {
      if (stack[stack.length - 1] !== character) return null;
      stack.pop();
      if (stack.length === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }
  return null;
}

function extractEmbeddedJsonValues(scriptText) {
  const text = String(scriptText || "");
  if (!text || text.length > 2 * 1024 * 1024) return [];
  const values = [];
  const assignmentPattern =
    /(?:window\.)?[A-Za-z_$][A-Za-z0-9_$.\[\]"']*\s*=\s*(\{|\[)/g;
  let match;
  while (
    values.length < 100 &&
    (match = assignmentPattern.exec(text)) !== null
  ) {
    const startIndex =
      match.index + match[0].length - 1;
    const fragment = balancedJsonFragment(text, startIndex);
    if (!fragment) continue;
    const parsed = parseJsonScript(fragment);
    if (parsed !== null) values.push(parsed);
    assignmentPattern.lastIndex =
      startIndex + fragment.length;
  }

  const jsonParsePattern =
    /JSON\.parse\(\s*("(?:\\.|[^"\\])*")\s*\)/g;
  while (
    values.length < 100 &&
    (match = jsonParsePattern.exec(text)) !== null
  ) {
    try {
      const decoded = JSON.parse(match[1]);
      const parsed = JSON.parse(decoded);
      values.push(parsed);
    } catch {
      // Ignore non-JSON JavaScript strings without evaluating source code.
    }
  }
  return values;
}

function analyzeJsonValue({
  value,
  source,
  priority,
  baseUrl,
  descriptionCandidates,
  shortDescriptionCandidates,
  imageCandidates,
  diagnostics,
}) {
  const seen = new Set();
  let visitedNodes = 0;
  let imageOrder = imageCandidates.length;

  function walk(node, depth, pathParts) {
    if (visitedNodes >= 50000 || depth > 30) return;
    if (!node || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    visitedNodes += 1;

    if (Array.isArray(node)) {
      node.forEach((entry, index) =>
        walk(entry, depth + 1, [...pathParts, String(index)])
      );
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      const normalized = normalizedKey(key);
      const candidatePath = [...pathParts, key].join(".");
      if (DESCRIPTION_KEYS.has(normalized)) {
        const description = usefulDescription(child);
        if (description) {
          descriptionCandidates.push({
            value: description,
            source,
            priority,
            path: candidatePath,
          });
        }
      }
      if (SHORT_DESCRIPTION_KEYS.has(normalized)) {
        const description = usefulDescription(child);
        if (description) {
          shortDescriptionCandidates.push({
            value: description,
            source,
            priority,
            path: candidatePath,
          });
        }
      }
      if (IMAGE_KEYS.has(normalized)) {
        const roleHint = COVER_KEYS.has(normalized)
          ? "portada"
          : "galeria";
        for (const image of imageUrlsFromValue(child, baseUrl)) {
          imageCandidates.push({
            ...image,
            source,
            priority,
            roleHint,
            path: candidatePath,
            order: imageOrder,
          });
          imageOrder += 1;
        }
      }
      walk(child, depth + 1, [...pathParts, key]);
    }
  }

  walk(value, 0, []);
  diagnostics.jsonNodesVisited += visitedNodes;
}

function elementDescriptor(element) {
  return [
    element.id || "",
    typeof element.className === "string" ? element.className : "",
    element.getAttribute?.("itemprop") || "",
    element.getAttribute?.("aria-label") || "",
  ].join(" ");
}

function semanticDescriptionCandidates(document) {
  const candidates = [];
  const seenText = new Set();

  function add(text, pathValue) {
    const description = usefulDescription(text);
    if (!description || seenText.has(description)) return;
    seenText.add(description);
    candidates.push({
      value: description,
      source: "html_visible",
      priority: 3,
      path: pathValue,
    });
  }

  for (const element of document.querySelectorAll("[id], [class]")) {
    if (!markerMatch(elementDescriptor(element), DESCRIPTION_MARKERS)) {
      continue;
    }
    const paragraphs = [...element.querySelectorAll("p")]
      .map((paragraph) => normalizeText(paragraph.textContent))
      .filter((text) => text.length >= 40);
    if (paragraphs.length > 0) {
      add(paragraphs.join("\n\n"), "semantic_description_container");
    } else {
      add(element.textContent, "semantic_description_container");
    }
  }

  for (const heading of document.querySelectorAll("h1,h2,h3,h4")) {
    if (!markerMatch(heading.textContent, DESCRIPTION_MARKERS)) continue;
    const section = heading.closest("section,article,main,div");
    if (!section) continue;
    const paragraphs = [...section.querySelectorAll("p")]
      .map((paragraph) => normalizeText(paragraph.textContent))
      .filter((text) => text.length >= 40);
    if (paragraphs.length > 0) {
      add(paragraphs.join("\n\n"), "semantic_heading_section");
    }
  }

  if (candidates.length === 0) {
    for (const paragraph of document.querySelectorAll(
      "main p, article p"
    )) {
      add(paragraph.textContent, "main_or_article_paragraph");
    }
  }
  return candidates;
}

function imageSourceFromElement(element) {
  const srcset =
    element.getAttribute("srcset") ||
    element.getAttribute("data-srcset") ||
    "";
  if (srcset) {
    const entries = srcset
      .split(",")
      .map((entry) => {
        const [url, descriptor = ""] = entry.trim().split(/\s+/);
        const width = descriptor.endsWith("w")
          ? Number(descriptor.slice(0, -1))
          : 0;
        const density = descriptor.endsWith("x")
          ? Number(descriptor.slice(0, -1)) * 10000
          : 0;
        return { url, score: width || density };
      })
      .filter((entry) => entry.url)
      .sort((left, right) => left.score - right.score);
    if (entries.length > 0) return entries[entries.length - 1].url;
  }
  return (
    element.getAttribute("data-original") ||
    element.getAttribute("src") ||
    element.getAttribute("data-src") ||
    element.getAttribute("data-lazy") ||
    element.getAttribute("data-lazy-src") ||
    ""
  );
}

function galleryCountFromText(value) {
  const text = normalizeText(value);
  const counter = text.match(/\b\d+\s*\/\s*(\d+)\b/);
  if (counter) return Number(counter[1]);
  const label = text.match(
    /(?:galer[ií]a|fotos?|im[aá]genes?)\s*\(\s*(\d+)\s*\)/i
  );
  return label ? Number(label[1]) : null;
}

function parseStructuredGalleryEntry(entry, baseUrl, order, source) {
  const object =
    typeof entry === "string" ? { url: entry } : entry;
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    return null;
  }
  const declaredUrls = uniqueResolvedUrls(
    [
      object.original_url,
      object.originalUrl,
      object.full_url,
      object.fullUrl,
      object.lightbox_url,
      object.url,
      object.src,
      object.lightbox_url_md,
      object.thumbnail_url,
    ],
    baseUrl
  );
  if (declaredUrls.length === 0) return null;
  const explicitOriginal = uniqueResolvedUrls(
    [
      object.original_url,
      object.originalUrl,
      object.full_url,
      object.fullUrl,
    ],
    baseUrl
  )[0];
  const derivedOriginal = wordpressOriginalImageUrl(
    declaredUrls[0],
    baseUrl
  );
  const downloadUrls = uniqueResolvedUrls(
    [
      explicitOriginal,
      derivedOriginal,
      ...declaredUrls,
    ],
    baseUrl
  );
  const stableIdentity = canonicalMediaIdentity(
    explicitOriginal || derivedOriginal || declaredUrls[0],
    baseUrl
  );
  if (!stableIdentity) return null;
  return {
    url: downloadUrls[0],
    downloadUrls,
    declaredUrl: declaredUrls[0],
    stableIdentity,
    alt: normalizeText(
      object.alt || object.caption || object.name || ""
    ),
    source,
    priority: 0,
    roleHint: "galeria",
    path: "gallery_authority",
    order,
  };
}

function deduplicateGalleryCandidates(candidates) {
  const byIdentity = new Map();
  let duplicateCount = 0;
  for (const candidate of candidates) {
    const identity =
      candidate.stableIdentity ||
      canonicalMediaIdentity(candidate.url, candidate.url);
    if (!identity || byIdentity.has(identity)) {
      duplicateCount += 1;
      continue;
    }
    byIdentity.set(identity, {
      ...candidate,
      stableIdentity: identity,
    });
  }
  return {
    candidates: [...byIdentity.values()].map((candidate, order) => ({
      ...candidate,
      order,
    })),
    duplicateCount,
  };
}

function extractAuthoritativeGallery(document, pageUrl) {
  const authorities = [];
  for (const script of document.querySelectorAll(
    'script[type="application/json"][data-gallery-all-images]'
  )) {
    const parsed = parseJsonScript(script.textContent);
    if (!Array.isArray(parsed)) continue;
    const parsedCandidates = parsed
      .map((entry, index) =>
        parseStructuredGalleryEntry(
          entry,
          pageUrl,
          index,
          "embedded_gallery_json"
        )
      )
      .filter(Boolean);
    const deduplicated = deduplicateGalleryCandidates(
      parsedCandidates
    );
    const container = script.closest("[data-gallery-display]");
    const declaredUiCount = galleryCountFromText(
      container?.textContent || ""
    );
    authorities.push({
      candidates: deduplicated.candidates,
      expectedCount:
        declaredUiCount === null ? parsed.length : declaredUiCount,
      detectedCount: parsedCandidates.length,
      invalidCount: parsed.length - parsedCandidates.length,
      duplicateCount: deduplicated.duplicateCount,
      completeEvidence:
        parsed.length === parsedCandidates.length &&
        (declaredUiCount === null ||
          declaredUiCount === parsed.length),
      extractionSource: "embedded_gallery_json",
      debug: parsed.map((entry, index) => ({
        index,
        url:
          typeof entry === "string"
            ? resolveHttpUrl(entry, pageUrl)
            : resolveHttpUrl(
                entry?.lightbox_url || entry?.url || "",
                pageUrl
              ),
      })),
    });
  }
  if (authorities.length > 0) {
    return authorities.sort(
      (left, right) =>
        right.expectedCount - left.expectedCount
    )[0];
  }

  const container = document.querySelector("[data-gallery-display]");
  if (!container) {
    return {
      candidates: [],
      expectedCount: 0,
      detectedCount: 0,
      invalidCount: 0,
      duplicateCount: 0,
      completeEvidence: true,
      extractionSource: "none",
      debug: [],
    };
  }
  const parsedCandidates = [];
  const seenElements = new Set();
  for (const item of container.querySelectorAll("[data-gallery-item]")) {
    const image =
      item.matches("img") ? item : item.querySelector("img");
    if (!image || seenElements.has(image)) continue;
    seenElements.add(image);
    const candidate = parseStructuredGalleryEntry(
      {
        url: imageSourceFromElement(image),
        original_url:
          image.getAttribute("data-original") ||
          item.getAttribute("data-original") ||
          item.getAttribute("data-full") ||
          item.getAttribute("data-lightbox") ||
          (/^https?:/i.test(item.getAttribute("href") || "")
            ? item.getAttribute("href")
            : ""),
        alt: image.getAttribute("alt"),
      },
      pageUrl,
      parsedCandidates.length,
      "gallery_html"
    );
    if (candidate) parsedCandidates.push(candidate);
  }
  const deduplicated = deduplicateGalleryCandidates(parsedCandidates);
  const declaredUiCount = galleryCountFromText(container.textContent);
  return {
    candidates: deduplicated.candidates,
    expectedCount:
      declaredUiCount === null
        ? deduplicated.candidates.length
        : declaredUiCount,
    detectedCount: parsedCandidates.length,
    invalidCount: 0,
    duplicateCount: deduplicated.duplicateCount,
    completeEvidence:
      declaredUiCount === null ||
      declaredUiCount === parsedCandidates.length,
    extractionSource: "gallery_html",
    debug: deduplicated.candidates.map((candidate, index) => ({
      index,
      url: candidate.declaredUrl,
    })),
  };
}

function visibleImageCandidates(document, baseUrl, startOrder) {
  const candidates = [];
  const semanticContainers = [
    ...document.querySelectorAll("[id], [class]"),
  ].filter((element) =>
    markerMatch(elementDescriptor(element), [
      ...IMAGE_MARKERS,
      ...COVER_MARKERS,
    ])
  );
  let elements = semanticContainers.flatMap((container) => [
    ...container.querySelectorAll("img"),
  ]);
  if (elements.length === 0) {
    elements = [
      ...document.querySelectorAll("main img, article img"),
    ];
  }
  const uniqueElements = [...new Set(elements)];
  uniqueElements.forEach((element, index) => {
    if (element.closest("header,footer,nav")) return;
    const rawUrl = imageSourceFromElement(element);
    const url = resolveHttpUrl(rawUrl, baseUrl);
    if (!url || /\.svg(?:$|[?#])/i.test(url)) return;
    const descriptor = [
      elementDescriptor(element),
      elementDescriptor(element.parentElement || {}),
    ].join(" ");
    candidates.push({
      url,
      alt: normalizeText(element.getAttribute("alt") || ""),
      source: "html_visible",
      priority: 3,
      roleHint: markerMatch(descriptor, COVER_MARKERS)
        ? "portada"
        : "galeria",
      path: "visible_image",
      order: startOrder + index,
    });
  });
  return candidates;
}

function selectDescription(candidates) {
  if (candidates.length === 0) return null;
  return [...candidates].sort(
    (left, right) =>
      left.priority - right.priority ||
      right.value.length - left.value.length
  )[0];
}

function deduplicateImages(candidates) {
  const byUrl = new Map();
  for (const candidate of [...candidates].sort(
    (left, right) =>
      left.priority - right.priority ||
      (left.roleHint === "portada" ? -1 : 1) -
        (right.roleHint === "portada" ? -1 : 1) ||
      left.order - right.order
  )) {
    if (!byUrl.has(candidate.url)) {
      byUrl.set(candidate.url, candidate);
    }
  }
  return [...byUrl.values()];
}

function extractProviderPage(html, pageUrl) {
  const extractionStartedAt = performance.now();
  const dom = new JSDOM(String(html || ""), { url: pageUrl });
  const { document } = dom.window;
  const galleryStartedAt = performance.now();
  const galleryAuthority = extractAuthoritativeGallery(
    document,
    pageUrl
  );
  const galleryAuthorityMs = Math.round(
    performance.now() - galleryStartedAt
  );
  const descriptionCandidates = [];
  const shortDescriptionCandidates = [];
  const imageCandidates = [];
  const diagnostics = {
    jsonLdScripts: 0,
    embeddedJsonScripts: 0,
    invalidJsonScripts: 0,
    jsonNodesVisited: 0,
  };

  for (const script of document.querySelectorAll(
    'script[type="application/ld+json"]'
  )) {
    diagnostics.jsonLdScripts += 1;
    const parsed = parseJsonScript(script.textContent);
    if (parsed === null) {
      diagnostics.invalidJsonScripts += 1;
      continue;
    }
    analyzeJsonValue({
      value: parsed,
      source: "json_ld",
      priority: 1,
      baseUrl: pageUrl,
      descriptionCandidates,
      shortDescriptionCandidates,
      imageCandidates,
      diagnostics,
    });
  }

  for (const script of document.querySelectorAll("script")) {
    const type = String(script.getAttribute("type") || "").toLowerCase();
    const id = String(script.id || "").toLowerCase();
    if (type === "application/ld+json") continue;
    if (
      type !== "application/json" &&
      !type.endsWith("+json") &&
      id !== "__next_data__"
    ) {
      continue;
    }
    diagnostics.embeddedJsonScripts += 1;
    const parsed = parseJsonScript(script.textContent);
    if (parsed === null) {
      diagnostics.invalidJsonScripts += 1;
      continue;
    }
    analyzeJsonValue({
      value: parsed,
      source: "embedded_json",
      priority: 2,
      baseUrl: pageUrl,
      descriptionCandidates,
      shortDescriptionCandidates,
      imageCandidates,
      diagnostics,
    });
  }

  for (const script of document.querySelectorAll("script")) {
    const type = String(script.getAttribute("type") || "").toLowerCase();
    const id = String(script.id || "").toLowerCase();
    if (
      type === "application/ld+json" ||
      type === "application/json" ||
      type.endsWith("+json") ||
      id === "__next_data__"
    ) {
      continue;
    }
    const embeddedValues = extractEmbeddedJsonValues(
      script.textContent
    );
    if (embeddedValues.length === 0) continue;
    diagnostics.embeddedJsonScripts += 1;
    for (const value of embeddedValues) {
      analyzeJsonValue({
        value,
        source: "embedded_json",
        priority: 2,
        baseUrl: pageUrl,
        descriptionCandidates,
        shortDescriptionCandidates,
        imageCandidates,
        diagnostics,
      });
    }
  }

  descriptionCandidates.push(
    ...semanticDescriptionCandidates(document)
  );
  imageCandidates.push(
    ...visibleImageCandidates(
      document,
      pageUrl,
      imageCandidates.length
    )
  );

  const ogDescription = usefulDescription(
    document
      .querySelector('meta[property="og:description"]')
      ?.getAttribute("content") || ""
  );
  if (ogDescription) {
    descriptionCandidates.push({
      value: ogDescription,
      source: "open_graph",
      priority: 4,
      path: "og:description",
    });
    shortDescriptionCandidates.push({
      value: ogDescription,
      source: "open_graph",
      priority: 4,
      path: "og:description",
    });
  }
  const ogImage = resolveHttpUrl(
    document
      .querySelector('meta[property="og:image"]')
      ?.getAttribute("content") || "",
    pageUrl
  );
  if (ogImage) {
    imageCandidates.push({
      url: ogImage,
      alt: "",
      source: "open_graph",
      priority: 4,
      roleHint: "portada",
      path: "og:image",
      order: imageCandidates.length,
    });
  }

  const metaDescription = usefulDescription(
    document
      .querySelector('meta[name="description"]')
      ?.getAttribute("content") || ""
  );
  if (metaDescription) {
    descriptionCandidates.push({
      value: metaDescription,
      source: "meta_description",
      priority: 5,
      path: "meta:description",
    });
    shortDescriptionCandidates.push({
      value: metaDescription,
      source: "meta_description",
      priority: 5,
      path: "meta:description",
    });
  }
  const twitterImage = resolveHttpUrl(
    document
      .querySelector('meta[name="twitter:image"]')
      ?.getAttribute("content") || "",
    pageUrl
  );
  if (twitterImage) {
    imageCandidates.push({
      url: twitterImage,
      alt: "",
      source: "twitter_card",
      priority: 5,
      roleHint: "portada",
      path: "twitter:image",
      order: imageCandidates.length,
    });
  }

  const descriptionSelectionStartedAt = performance.now();
  const selectedDescription = selectDescription(
    descriptionCandidates
  );
  const selectedShortDescription = selectDescription(
    shortDescriptionCandidates
  );
  const descriptionSelectionMs = Math.round(
    performance.now() - descriptionSelectionStartedAt
  );
  const imageSelectionStartedAt = performance.now();
  const images = deduplicateImages(imageCandidates);
  const explicitCoverIndex = images.findIndex(
    (image) => image.roleHint === "portada"
  );
  const coverIndex =
    explicitCoverIndex >= 0 ? explicitCoverIndex : images.length > 0 ? 0 : -1;
  const cover = coverIndex >= 0 ? images[coverIndex] : null;
  const fallbackGallery = images.filter(
    (_, index) => index !== coverIndex
  );
  const hasGalleryAuthority =
    galleryAuthority.extractionSource !== "none";
  const gallery = hasGalleryAuthority
    ? galleryAuthority.candidates
    : fallbackGallery.map((image, order) => ({
        ...image,
        downloadUrls: [image.url],
        declaredUrl: image.url,
        stableIdentity: canonicalMediaIdentity(
          image.url,
          pageUrl
        ),
        order,
      }));
  const galleryExpectedCount = hasGalleryAuthority
    ? galleryAuthority.expectedCount
    : gallery.length;
  const galleryDetectedCount = hasGalleryAuthority
    ? galleryAuthority.detectedCount
    : gallery.length;
  const galleryCompleteEvidence = hasGalleryAuthority
    ? galleryAuthority.completeEvidence
    : true;
  const galleryExtractionSource = hasGalleryAuthority
    ? galleryAuthority.extractionSource
    : gallery.length > 0
      ? gallery[0].source
      : "none";
  diagnostics.galleryAuthority = {
    extractionSource: galleryExtractionSource,
    expectedCount: galleryExpectedCount,
    detectedCount: galleryDetectedCount,
    invalidCount: hasGalleryAuthority
      ? galleryAuthority.invalidCount
      : 0,
    duplicateCount: hasGalleryAuthority
      ? galleryAuthority.duplicateCount
      : 0,
    completeEvidence: galleryCompleteEvidence,
  };
  diagnostics.timingsMs = {
    galleryAuthority: galleryAuthorityMs,
    descriptionSelection: descriptionSelectionMs,
    imageSelection: Math.round(
      performance.now() - imageSelectionStartedAt
    ),
    total: Math.round(
      performance.now() - extractionStartedAt
    ),
  };

  return {
    description: selectedDescription?.value || null,
    shortDescription:
      selectedShortDescription?.value ||
      selectedDescription?.value ||
      null,
    descriptionSource: selectedDescription?.source || null,
    shortDescriptionSource:
      selectedShortDescription?.source ||
      selectedDescription?.source ||
      null,
    cover,
    gallery,
    imageCandidatesFound: (cover ? 1 : 0) + gallery.length,
    galleryExpectedCount,
    galleryDetectedCount,
    galleryCompleteEvidence,
    galleryExtractionSource,
    gallerySourceDuplicateCount: hasGalleryAuthority
      ? galleryAuthority.duplicateCount
      : 0,
    gallerySourceInvalidCount: hasGalleryAuthority
      ? galleryAuthority.invalidCount
      : 0,
    debugGalleryItems: hasGalleryAuthority
      ? galleryAuthority.debug
      : gallery.map((image, index) => ({
          index,
          url: image.declaredUrl || image.url,
        })),
    diagnostics,
  };
}

module.exports = {
  canonicalMediaIdentity,
  extractAuthoritativeGallery,
  extractProviderPage,
  extractEmbeddedJsonValues,
  normalizeText,
  parseJsonScript,
  resolveHttpUrl,
  wordpressOriginalImageUrl,
};
