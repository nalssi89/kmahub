import { BASE_URL, ENDPOINTS, findEndpoint } from "./endpoints.js";
import { Agent, fetch as undiciFetch } from "undici";

const DEFAULT_TIMEOUT_MS = 15000;
const TEXT_PREVIEW_LIMIT = 4000;
const KMA_TLS_DISPATCHER = new Agent({
  connect: {
    rejectUnauthorized: process.env.KMA_API_STRICT_TLS === "1",
  },
});

export class KmaClientError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "KmaClientError";
    this.details = details;
  }
}

export function redactAuthKey(url) {
  const parsed = new URL(url);
  const redacted = parsed.toString().replace(/([?&]authKey=)[^&]*/u, "$1<redacted>");
  return redacted;
}

export function buildUrl(endpoint, params, authKey) {
  const merged = { ...params, authKey };
  const url = new URL(endpoint.path, BASE_URL);

  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }

  return url;
}

function getAuthKey(explicitAuthKey) {
  const authKey = explicitAuthKey || process.env.KMA_API_AUTH_KEY;
  if (!authKey) {
    throw new KmaClientError("KMA API key is required. Set KMA_API_AUTH_KEY or pass authKey explicitly.");
  }
  return authKey;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await undiciFetch(url, { signal: controller.signal, dispatcher: KMA_TLS_DISPATCHER });
    const elapsedMs = Math.round(performance.now() - startedAt);
    return { response, elapsedMs };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new KmaClientError(`Request timed out after ${timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeApiError(body) {
  const lower = body.toLowerCase();
  return (
    lower.includes("error") ||
    lower.includes("service key") ||
    lower.includes("authkey") ||
    lower.includes("인증") ||
    lower.includes("권한")
  );
}

function decodeBody(arrayBuffer, contentType) {
  const buffer = Buffer.from(arrayBuffer);
  const charset = contentType.match(/charset=([^;\s]+)/i)?.[1]?.toLowerCase();

  if (charset?.includes("euc-kr")) {
    return new TextDecoder("euc-kr").decode(buffer);
  }

  return buffer.toString("utf8");
}

export async function callEndpoint(endpointId, options = {}) {
  const endpoint = findEndpoint(endpointId);
  if (!endpoint) {
    throw new KmaClientError(`Unknown endpointId: ${endpointId}`);
  }

  const authKey = getAuthKey(options.authKey);
  const params = { ...endpoint.defaultParams, ...(options.params || {}) };
  const url = buildUrl(endpoint, params, authKey);
  const { response, elapsedMs } = await fetchWithTimeout(url, options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const contentType = response.headers.get("content-type") || "";
  const arrayBuffer = await response.arrayBuffer();
  const bytes = arrayBuffer.byteLength;

  let body = "";
  let base64 = "";
  if (endpoint.format === "image" || contentType.startsWith("image/")) {
    base64 = Buffer.from(arrayBuffer).toString("base64");
  } else {
    body = decodeBody(arrayBuffer, contentType);
  }

  const preview = body ? body.slice(0, options.previewChars || TEXT_PREVIEW_LIMIT) : "";
  const ok = response.ok && (endpoint.format === "image" || !looksLikeApiError(preview));

  return {
    endpointId: endpoint.id,
    title: endpoint.title,
    ok,
    status: response.status,
    contentType,
    elapsedMs,
    bytes,
    url: redactAuthKey(url),
    params,
    body: options.includeBody ? body : undefined,
    preview,
    base64: options.includeBody ? base64 : undefined,
  };
}

export async function testEndpoints(options = {}) {
  const endpointIds = options.endpointIds?.length ? options.endpointIds : ENDPOINTS.map((endpoint) => endpoint.id);
  const results = [];

  for (const endpointId of endpointIds) {
    try {
      results.push(await callEndpoint(endpointId, { ...options, includeBody: false, previewChars: 700 }));
    } catch (error) {
      results.push({
        endpointId,
        ok: false,
        error: error.message,
        details: error.details,
      });
    }
  }

  return results;
}
