export interface DiscoveredModel {
  id: string;
  created?: number;
  ownedBy?: string;
}
export interface ModelDiscoveryResult {
  provider: string;
  models: DiscoveredModel[];
  fetchedAt: string;
  rateLimit?: { limit?: number; remaining?: number; reset?: string };
}
export interface ModelDiscoveryOptions {
  provider: string;
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
  maxModels?: number;
  fetchImpl?: typeof fetch;
}
function parseHeaderNumber(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name);
  if (raw === null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}
export async function discoverModels(options: ModelDiscoveryOptions): Promise<ModelDiscoveryResult> {
  if (!options.provider.trim() || !options.apiKey.trim()) throw new Error("Provider and API key are required.");
  const base = new URL(options.baseUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && local)) throw new Error("Remote model discovery requires HTTPS.");
  if (base.username || base.password || base.search || base.hash) throw new Error("Base URL cannot contain credentials, query parameters, or fragments.");
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxModels = options.maxModels ?? 2000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60_000) throw new Error("timeoutMs must be between 1000 and 60000.");
  if (!Number.isInteger(maxModels) || maxModels < 1 || maxModels > 10_000) throw new Error("maxModels must be between 1 and 10000.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(base.toString().replace(/\/+$/, "") + "/models", {
      method: "GET", redirect: "error", signal: controller.signal,
      headers: { authorization: "Bearer " + options.apiKey, accept: "application/json" }
    });
    if (response.status === 401 || response.status === 403) throw new Error("Provider rejected credentials or permissions.");
    if (!response.ok) throw new Error("Model discovery failed with HTTP " + response.status + ".");
    const reader = response.body?.getReader();
    let raw = "";
    if (reader) {
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("Model discovery response exceeded 2 MiB."); }
          raw += new TextDecoder().decode(part.value, { stream: true });
        }
      } finally { reader.releaseLock(); }
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as Record<string, unknown>).data)) throw new Error("Provider returned an unsupported model list schema.");
    const models: DiscoveredModel[] = [];
    for (const item of (parsed as { data: unknown[] }).data.slice(0, maxModels)) {
      if (!item || typeof item !== "object") continue;
      const value = item as Record<string, unknown>;
      if (typeof value.id !== "string" || !value.id.trim()) continue;
      models.push({
        id: value.id,
        ...(typeof value.created === "number" && Number.isFinite(value.created) ? { created: value.created } : {}),
        ...(typeof value.owned_by === "string" ? { ownedBy: value.owned_by } : {})
      });
    }
    models.sort((a, b) => a.id.localeCompare(b.id));
    const limit = parseHeaderNumber(response.headers, "x-ratelimit-limit-requests");
    const remaining = parseHeaderNumber(response.headers, "x-ratelimit-remaining-requests");
    const rateLimit = {
      ...(limit !== undefined ? { limit } : {}),
      ...(remaining !== undefined ? { remaining } : {}),
      ...(response.headers.get("x-ratelimit-reset-requests") ? { reset: response.headers.get("x-ratelimit-reset-requests")! } : {})
    };
    return { provider: options.provider, models, fetchedAt: new Date().toISOString(), ...(Object.keys(rateLimit).length ? { rateLimit } : {}) };
  } finally { clearTimeout(timer); }
}
