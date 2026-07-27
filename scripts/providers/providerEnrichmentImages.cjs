"use strict";

const crypto = require("crypto");
const dns = require("dns").promises;
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { performance } = require("perf_hooks");
const { createRequire } = require("module");

const functionsRequire = createRequire(
  path.resolve(__dirname, "../../functions/package.json")
);
const sharp = functionsRequire("sharp");

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 3;
const MAX_RETRY_DELAY_MS = 60000;
const MAX_REDIRECTS = 5;
const USER_AGENT =
  "ReservaElDiaProviderEnrichment/2.0 (+https://reservaeldia.com.ar; provider-enrichment-operator)";

class ProviderEnrichmentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProviderEnrichmentError";
    this.code = code;
  }
}

function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0
  );
}

function isPrivateIpv6(address) {
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice("::ffff:".length);
    if (net.isIP(mappedIpv4) === 4) {
      return isPrivateIpv4(mappedIpv4);
    }
  }
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("2001:db8:")
  );
}

function assertPublicAddress(address) {
  const family = net.isIP(address);
  if (
    family === 0 ||
    (family === 4 && isPrivateIpv4(address)) ||
    (family === 6 && isPrivateIpv6(address))
  ) {
    throw new ProviderEnrichmentError(
      "unsafe_remote_host",
      "La URL remota resuelve a una dirección no pública."
    );
  }
}

async function assertSafeRemoteUrl(
  rawUrl,
  { dnsLookup = dns.lookup } = {}
) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ProviderEnrichmentError(
      "invalid_remote_url",
      "La URL remota es inválida."
    );
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  ) {
    throw new ProviderEnrichmentError(
      "invalid_remote_url",
      "La URL remota debe usar HTTP(S) y no incluir credenciales."
    );
  }
  if (
    parsed.hostname === "localhost" ||
    parsed.hostname.endsWith(".localhost")
  ) {
    throw new ProviderEnrichmentError(
      "unsafe_remote_host",
      "No se permiten hosts locales."
    );
  }
  if (net.isIP(parsed.hostname)) {
    assertPublicAddress(parsed.hostname);
    return parsed;
  }
  let addresses;
  try {
    addresses = await dnsLookup(parsed.hostname, {
      all: true,
      verbatim: true,
    });
  } catch {
    throw new ProviderEnrichmentError(
      "remote_dns_failed",
      "No se pudo resolver el host remoto."
    );
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new ProviderEnrichmentError(
      "remote_dns_failed",
      "El host remoto no devolvió direcciones."
    );
  }
  addresses.forEach(({ address }) => assertPublicAddress(address));
  return parsed;
}

async function readResponseBuffer(response, maximumBytes) {
  const declaredLength = Number(
    response.headers?.get?.("content-length") || 0
  );
  if (declaredLength > maximumBytes) {
    throw new ProviderEnrichmentError(
      "remote_payload_too_large",
      "El recurso remoto supera el tamaño máximo permitido."
    );
  }

  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maximumBytes) {
      throw new ProviderEnrichmentError(
        "remote_payload_too_large",
        "El recurso remoto supera el tamaño máximo permitido."
      );
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new ProviderEnrichmentError(
        "remote_payload_too_large",
        "El recurso remoto supera el tamaño máximo permitido."
      );
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

async function fetchRemote({
  url,
  maximumBytes,
  acceptedContentTypes,
  fetchImpl = globalThis.fetch,
  dnsLookup = dns.lookup,
  timeoutMs = REQUEST_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  requestDelayMs = 0,
  pauseOn429 = false,
  requestController = null,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  if (typeof fetchImpl !== "function") {
    throw new ProviderEnrichmentError(
      "fetch_unavailable",
      "El runtime no dispone de fetch."
    );
  }
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1000 ||
    timeoutMs > 300000
  ) {
    throw new ProviderEnrichmentError(
      "invalid_timeout",
      "El timeout remoto debe estar entre 1000 y 300000 ms."
    );
  }
  if (
    !Number.isInteger(maxRetries) ||
    maxRetries < 0 ||
    maxRetries > 10
  ) {
    throw new ProviderEnrichmentError(
      "invalid_max_retries",
      "La cantidad de reintentos debe estar entre 0 y 10."
    );
  }

  const retryAfterMilliseconds = (response) => {
    const raw = response.headers?.get?.("retry-after");
    if (!raw) return 0;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(
        MAX_RETRY_DELAY_MS,
        Math.ceil(seconds * 1000)
      );
    }
    const date = Date.parse(raw);
    return Number.isFinite(date)
      ? Math.min(
          MAX_RETRY_DELAY_MS,
          Math.max(0, date - Date.now())
        )
      : 0;
  };
  const retryableCodes = new Set([
    "remote_http_transient",
    "remote_network_error",
    "remote_timeout",
  ]);

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let currentUrl = String(url);
    try {
      for (
        let redirectCount = 0;
        redirectCount <= MAX_REDIRECTS;
        redirectCount += 1
      ) {
        await assertSafeRemoteUrl(currentUrl, { dnsLookup });
        if (requestController?.beforeRequest) {
          await requestController.beforeRequest({
            url: currentUrl,
            attempt,
          });
        } else if (requestDelayMs > 0) {
          await sleep(requestDelayMs);
        }
        let response;
        try {
          response = await fetchImpl(currentUrl, {
            redirect: "manual",
            headers: {
              "user-agent": USER_AGENT,
              accept: acceptedContentTypes.join(","),
            },
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (error) {
          const timedOut =
            error?.name === "TimeoutError" ||
            error?.name === "AbortError";
          const wrapped = new ProviderEnrichmentError(
            timedOut
              ? "remote_timeout"
              : "remote_network_error",
            timedOut
              ? "La solicitud remota superó el timeout configurado."
              : "La solicitud remota falló antes de recibir una respuesta."
          );
          wrapped.cause = error;
          throw wrapped;
        }
        const retryAfterMs =
          retryAfterMilliseconds(response);
        await requestController?.onResponse?.({
          url: currentUrl,
          status: response.status,
          retryAfterMs,
          attempt,
        });
        if (
          response.status >= 300 &&
          response.status < 400 &&
          response.headers?.get?.("location")
        ) {
          if (redirectCount === MAX_REDIRECTS) {
            throw new ProviderEnrichmentError(
              "too_many_redirects",
              "El recurso remoto excedió el máximo de redirecciones."
            );
          }
          currentUrl = new URL(
            response.headers.get("location"),
            currentUrl
          ).toString();
          continue;
        }
        if (!response.ok) {
          const error = new ProviderEnrichmentError(
            response.status === 404
              ? "page_not_found"
              : response.status === 429 ||
                  response.status >= 500
                ? "remote_http_transient"
                : "remote_http_error",
            `El recurso remoto respondió HTTP ${response.status}.`
          );
          error.httpStatus = response.status;
          error.retryAfterMs = retryAfterMs;
          throw error;
        }
        const contentType = String(
          response.headers?.get?.("content-type") || ""
        )
          .split(";")[0]
          .trim()
          .toLowerCase();
        if (
          contentType &&
          !acceptedContentTypes.includes(contentType)
        ) {
          throw new ProviderEnrichmentError(
            "unexpected_content_type",
            `Tipo de contenido remoto no permitido: ${contentType}.`
          );
        }
        const buffer = await readResponseBuffer(
          response,
          maximumBytes
        );
        return {
          buffer,
          contentType: contentType || null,
          finalUrl: currentUrl,
          status: response.status,
          retries: attempt,
        };
      }
    } catch (error) {
      lastError = error;
      if (
        !retryableCodes.has(error.code) ||
        attempt >= maxRetries
      ) {
        if (error.code === "remote_http_transient") {
          error.code = "remote_http_error";
        }
        throw error;
      }
      const exponentialDelay = Math.min(
        MAX_RETRY_DELAY_MS,
        500 * 2 ** attempt
      );
      const retryDelay = Math.max(
        exponentialDelay,
        pauseOn429 && error.httpStatus === 429
          ? error.retryAfterMs || 60000
          : error.retryAfterMs || 0
      );
      await requestController?.onRetry?.({
        url: currentUrl,
        attempt: attempt + 1,
        delayMs: retryDelay,
        code: error.code,
        httpStatus: error.httpStatus || null,
      });
      await sleep(retryDelay);
    }
  }
  throw lastError;
}

async function fetchProviderPage(options) {
  const result = await fetchRemote({
    ...options,
    maximumBytes: MAX_HTML_BYTES,
    acceptedContentTypes: [
      "text/html",
      "application/xhtml+xml",
    ],
  });
  return {
    html: result.buffer.toString("utf8"),
    finalUrl: result.finalUrl,
    bytes: result.buffer.length,
    status: result.status,
    retries: result.retries || 0,
  };
}

function detectImageType(buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (
    buffer.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))
  ) {
    return { mimeType: "image/gif", extension: "gif" };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mimeType: "image/webp", extension: "webp" };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString("ascii") === "ftyp" &&
    ["avif", "avis"].includes(buffer.subarray(8, 12).toString("ascii"))
  ) {
    return { mimeType: "image/avif", extension: "avif" };
  }
  return null;
}

function createTemporaryDirectory() {
  return fs.mkdtempSync(
    path.join(os.tmpdir(), "reservaeldia-provider-enrichment-")
  );
}

function removeTemporaryDirectory(directoryPath) {
  if (!directoryPath) return;
  fs.rmSync(directoryPath, {
    recursive: true,
    force: true,
  });
}

async function downloadAndValidateImage({
  candidate,
  index,
  temporaryDirectory,
  maximumBytes,
  allowedMimeTypes,
  fetchImpl,
  dnsLookup,
  timeoutMs,
  maxRetries,
  requestDelayMs,
  pauseOn429,
  requestController,
  sleep,
}) {
  const downloadStartedAt = performance.now();
  const downloadUrls = [
    ...new Set(
      (Array.isArray(candidate.downloadUrls)
        ? candidate.downloadUrls
        : [candidate.url]
      ).filter(Boolean)
    ),
  ];
  let result;
  let lastRecoverableError;
  for (const url of downloadUrls) {
    try {
      result = await fetchRemote({
        url,
        maximumBytes,
        acceptedContentTypes: allowedMimeTypes,
        fetchImpl,
        dnsLookup,
        timeoutMs,
        maxRetries,
        requestDelayMs,
        pauseOn429,
        requestController,
        sleep,
      });
      break;
    } catch (error) {
      if (
        ![
          "page_not_found",
          "remote_http_error",
          "remote_payload_too_large",
          "unexpected_content_type",
        ].includes(error.code)
      ) {
        throw error;
      }
      lastRecoverableError = error;
    }
  }
  if (!result) {
    throw (
      lastRecoverableError ||
      new ProviderEnrichmentError(
        "image_download_failed",
        "No se pudo descargar ninguna variante declarada de la imagen."
      )
    );
  }
  const downloadDurationMs = Math.round(
    performance.now() - downloadStartedAt
  );
  const validationStartedAt = performance.now();
  const detected = detectImageType(result.buffer);
  if (!detected || !allowedMimeTypes.includes(detected.mimeType)) {
    throw new ProviderEnrichmentError(
      "invalid_image_mime",
      "Los bytes descargados no corresponden a una imagen permitida."
    );
  }
  if (
    result.contentType &&
    result.contentType !== detected.mimeType
  ) {
    throw new ProviderEnrichmentError(
      "image_mime_mismatch",
      "El MIME declarado no coincide con los bytes de la imagen."
    );
  }

  let metadata;
  try {
    metadata = await sharp(result.buffer, {
      animated: true,
      limitInputPixels: 100000000,
    }).metadata();
  } catch {
    throw new ProviderEnrichmentError(
      "invalid_image_dimensions",
      "No se pudieron validar las dimensiones de la imagen."
    );
  }
  if (
    !Number.isInteger(metadata.width) ||
    metadata.width < 1 ||
    !Number.isInteger(metadata.height) ||
    metadata.height < 1
  ) {
    throw new ProviderEnrichmentError(
      "invalid_image_dimensions",
      "La imagen no contiene dimensiones válidas."
    );
  }

  const hashSha256 = crypto
    .createHash("sha256")
    .update(result.buffer)
    .digest("hex");
  const temporaryPath = path.join(
    temporaryDirectory,
    `${String(index).padStart(3, "0")}-${hashSha256.slice(0, 16)}.${detected.extension}`
  );
  fs.writeFileSync(temporaryPath, result.buffer);

  return {
    ...candidate,
    finalUrl: result.finalUrl,
    buffer: result.buffer,
    temporaryPath,
    hashSha256,
    mimeType: detected.mimeType,
    extension: detected.extension,
    width: metadata.width,
    height: metadata.height,
    bytes: result.buffer.length,
    retries: result.retries || 0,
    downloadDurationMs,
    validationDurationMs: Math.round(
      performance.now() - validationStartedAt
    ),
  };
}

module.exports = {
  DEFAULT_MAX_RETRIES,
  MAX_HTML_BYTES,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
  ProviderEnrichmentError,
  assertSafeRemoteUrl,
  createTemporaryDirectory,
  detectImageType,
  downloadAndValidateImage,
  fetchProviderPage,
  fetchRemote,
  removeTemporaryDirectory,
};
