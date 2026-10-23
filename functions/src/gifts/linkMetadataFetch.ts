import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request as httpRequest } from "node:http";
import type { ClientRequest, IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { RequestOptions } from "node:https";
import { isIP } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { Readable } from "node:stream";
import { sanitizeGiftLinkUrl } from "./config";

export const GIFT_METADATA_FETCH_LIMITS = Object.freeze({
  timeoutMs: 8_000,
  maxBytes: 1_048_576,
  maxRedirects: 3,
  maxHeaderBytes: 16_384,
});

export class GiftMetadataFetchError extends Error {
  constructor() { super("Gift link metadata is unavailable."); }
}

const IPV4_SPECIAL_RANGES: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.31.196.0", 24], ["192.52.193.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["192.175.48.0", 24], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
];

const ipv4Number = (ip: string) => ip.split(".").reduce((value, octet) => value * 256 + Number(octet), 0);

function ipv6Number(ip: string): bigint {
  // URL canonicalization also expands dotted IPv4 suffixes before range checks.
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [left, right] = canonical.split("::");
  const head = left ? left.split(":") : [];
  const tail = right ? right.split(":") : [];
  const groups = right === undefined ? head : [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail];
  return groups.reduce((value, group) => value * 65_536n + BigInt(parseInt(group, 16)), 0n);
}

const IPV6_SPECIAL_RANGES: ReadonlyArray<readonly [bigint, number]> = [
  [ipv6Number("2001::"), 23], // Protocol assignments, Teredo, benchmarking and ORCHID.
  [ipv6Number("2001:db8::"), 32], [ipv6Number("2002::"), 16],
  [ipv6Number("2620:4f:8000::"), 48], [ipv6Number("3fff::"), 20],
];

export function isPublicGiftMetadataAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const numeric = ipv4Number(address);
    return !IPV4_SPECIAL_RANGES.some(([base, bits]) =>
      Math.floor(numeric / 2 ** (32 - bits)) === Math.floor(ipv4Number(base) / 2 ** (32 - bits)));
  }
  if (version !== 6 || address.includes("%")) return false;
  const numeric = ipv6Number(address);
  // Only global unicast: excludes mapped/compatible IPv4, NAT64, ULA, link-local and multicast.
  if ((numeric >> 125n) !== 1n) return false;
  return !IPV6_SPECIAL_RANGES.some(([base, bits]) => numeric >> BigInt(128 - bits) === base >> BigInt(128 - bits));
}

export function parsePublicGiftMetadataUrl(input: unknown): URL {
  const sanitized = sanitizeGiftLinkUrl(input);
  if (!sanitized) throw new GiftMetadataFetchError();
  const url = new URL(sanitized);
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (url.port || !host || url.username || url.password) throw new GiftMetadataFetchError();
  if (isIP(host)) {
    if (!isPublicGiftMetadataAddress(host)) throw new GiftMetadataFetchError();
  } else if (!host.includes(".") || host.length > 253 ||
      /(?:^|\.)(?:localhost|local|internal|home|lan|onion|invalid|test|example|arpa)$/.test(host) ||
      host.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new GiftMetadataFetchError();
  }
  url.hash = "";
  return url;
}

export type GiftMetadataTransport = (
  url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void
) => ClientRequest;

export type GiftMetadataFetchDependencies = {
  lookup?: (hostname: string) => Promise<LookupAddress[]>;
  request?: GiftMetadataTransport;
  // Tests may shorten the deadline; production always uses the fixed upper bound.
  timeoutMs?: number;
};

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new GiftMetadataFetchError());
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function resolvePublicAddress(url: URL, lookup: NonNullable<GiftMetadataFetchDependencies["lookup"]>, signal: AbortSignal) {
  if (signal.aborted) throw new GiftMetadataFetchError();
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await abortable(lookup(host), signal);
  if (!addresses.length || addresses.some(({ address, family }) =>
    isIP(address) !== family || !isPublicGiftMetadataAddress(address))) throw new GiftMetadataFetchError();
  if (signal.aborted) throw new GiftMetadataFetchError();
  return addresses[0];
}

type HopResult = { redirect: string } | { html: string };

function fetchHop(url: URL, pinned: LookupAddress, signal: AbortSignal, transport?: GiftMetadataTransport): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    let response: IncomingMessage | undefined;
    let decoded: Readable | undefined;
    let settled = false;
    let request: ClientRequest | undefined;
    const finish = (error?: Error, result?: HopResult) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      if (error) reject(new GiftMetadataFetchError());
      else resolve(result!);
      // Redirect and error bodies must not continue reading in the background.
      decoded?.destroy();
      response?.destroy();
      request?.destroy();
    };
    const abort = () => finish(new GiftMetadataFetchError());
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    try {
      request = (transport || (url.protocol === "https:" ? httpsRequest : httpRequest))(url, {
        method: "GET",
        agent: false,
        maxHeaderSize: GIFT_METADATA_FETCH_LIMITS.maxHeaderBytes,
        // DNS cannot be resolved again between validation and connection. Keep the
        // original URL hostname for Host, TLS SNI and certificate verification.
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [pinned]);
          else callback(null, pinned.address, pinned.family);
        },
        headers: {
          Accept: "text/html, application/xhtml+xml;q=0.9",
          "Accept-Encoding": "gzip, br, deflate",
          "User-Agent": "ReservaElDia-LinkPreview/1.0",
        },
      }, (incoming) => {
        response = incoming;
        incoming.on("error", abort);
        incoming.on("aborted", abort);
        if (settled || signal.aborted) { incoming.destroy(); return; }
        const status = incoming.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = incoming.headers.location;
          if (!location || location.length > 2048) { abort(); return; }
          finish(undefined, { redirect: location });
          return;
        }
        const contentType = String(incoming.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
        const contentLength = Number(incoming.headers["content-length"] || 0);
        if (status < 200 || status >= 300 || !["text/html", "application/xhtml+xml"].includes(contentType) ||
            !Number.isFinite(contentLength) || contentLength < 0 || contentLength > GIFT_METADATA_FETCH_LIMITS.maxBytes) {
          abort(); return;
        }
        const encoding = String(incoming.headers["content-encoding"] || "identity").trim().toLowerCase();
        const decoder = encoding === "gzip" ? createGunzip() : encoding === "br" ? createBrotliDecompress()
          : encoding === "deflate" ? createInflate() : null;
        if (encoding !== "identity" && !decoder) { abort(); return; }
        let wireBytes = 0;
        let decodedBytes = 0;
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => {
          wireBytes += chunk.length;
          if (wireBytes > GIFT_METADATA_FETCH_LIMITS.maxBytes) abort();
        });
        decoded = decoder || incoming;
        decoded.on("error", abort);
        decoded.on("data", (chunk: Buffer) => {
          if (settled) return;
          decodedBytes += chunk.length;
          if (decodedBytes > GIFT_METADATA_FETCH_LIMITS.maxBytes) { abort(); return; }
          chunks.push(Buffer.from(chunk));
        });
        decoded.on("end", () => finish(undefined, { html: Buffer.concat(chunks).toString("utf8") }));
        if (decoder) incoming.pipe(decoder);
      });
      request.on("error", abort);
      request.end();
    } catch { abort(); }
  });
}

export async function fetchGiftLinkHtml(input: string, dependencies: GiftMetadataFetchDependencies = {}): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timeoutMs = Math.min(dependencies.timeoutMs ?? GIFT_METADATA_FETCH_LIMITS.timeoutMs, GIFT_METADATA_FETCH_LIMITS.timeoutMs);
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  const lookup = dependencies.lookup || ((hostname: string) => dnsLookup(hostname, { all: true, verbatim: true }));
  try {
    let url = parsePublicGiftMetadataUrl(input);
    for (let hop = 0; hop <= GIFT_METADATA_FETCH_LIMITS.maxRedirects; hop++) {
      const pinned = await resolvePublicAddress(url, lookup, controller.signal);
      const result = await fetchHop(url, pinned, controller.signal, dependencies.request);
      if ("html" in result) return { html: result.html, finalUrl: url.href };
      if (hop === GIFT_METADATA_FETCH_LIMITS.maxRedirects) throw new GiftMetadataFetchError();
      url = parsePublicGiftMetadataUrl(new URL(result.redirect, url).href);
    }
    throw new GiftMetadataFetchError();
  } finally { clearTimeout(timer); }
}
