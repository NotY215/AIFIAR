export interface RemoteConfig {
  host: string;
  port: number;
  path: string;
  publicUrl: URL;
  allowedHosts: Set<string>;
  allowedOrigins: Set<string>;
  maxBodyBytes: number;
  maxRequestsPerMinute: number;
  trustProxy: boolean;
}

function parseList(value: string | undefined): string[] {
  return (value ?? "").split(",").map(item => item.trim()).filter(Boolean);
}

function parseAllowedHosts(value: string | undefined, publicHost: string): Set<string> {
  const hosts = new Set(parseList(value).map(host => host.toLowerCase()));
  hosts.add(publicHost.toLowerCase());
  for (const host of hosts) {
    if (
      host === "*" ||
      host.includes("/") ||
      host.includes("@") ||
      host.includes(" ") ||
      host.includes("\\")
    ) throw new Error("AIFIAR_REMOTE_ALLOWED_HOSTS must contain exact host[:port] values.");
    let parsed: URL;
    try {
      parsed = new URL("https://" + host);
    } catch {
      throw new Error("AIFIAR_REMOTE_ALLOWED_HOSTS contains an invalid host.");
    }
    if (parsed.host.toLowerCase() !== host || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("AIFIAR_REMOTE_ALLOWED_HOSTS must contain exact host[:port] values.");
    }
  }
  return hosts;
}

function parseAllowedOrigins(value: string | undefined): Set<string> {
  const origins = new Set<string>();
  for (const item of parseList(value)) {
    let origin: URL;
    try {
      origin = new URL(item);
    } catch {
      throw new Error("AIFIAR_REMOTE_ALLOWED_ORIGINS must contain valid HTTPS origins.");
    }
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      origin.origin !== item.replace(/\/$/, "")
    ) throw new Error("AIFIAR_REMOTE_ALLOWED_ORIGINS must contain exact HTTPS origins without paths or credentials.");
    origins.add(origin.origin.toLowerCase());
  }
  return origins;
}

export function loadRemoteConfig(env = process.env): RemoteConfig {
  const raw = env.AIFIAR_REMOTE_PUBLIC_URL;
  if (!raw) throw new Error("AIFIAR_REMOTE_PUBLIC_URL is required.");

  let publicUrl: URL;
  try {
    publicUrl = new URL(raw);
  } catch {
    throw new Error("AIFIAR_REMOTE_PUBLIC_URL must be an absolute URL.");
  }

  if (
    publicUrl.protocol !== "https:" ||
    publicUrl.username ||
    publicUrl.password ||
    publicUrl.search ||
    publicUrl.hash
  ) throw new Error("AIFIAR_REMOTE_PUBLIC_URL must be HTTPS and contain no credentials, query, or fragment.");

  const path = env.AIFIAR_REMOTE_PATH ?? "/mcp";
  if (!path.startsWith("/") || path.includes("?") || path.includes("#") || path.includes("..") || path.includes("\\\\")) {
    throw new Error("AIFIAR_REMOTE_PATH must be a safe absolute path.");
  }
  if (publicUrl.pathname.replace(/\/$/, "") !== path.replace(/\/$/, "")) {
    throw new Error("Public URL path must exactly match AIFIAR_REMOTE_PATH.");
  }

  const allowedHosts = parseAllowedHosts(env.AIFIAR_REMOTE_ALLOWED_HOSTS, publicUrl.host);
  const allowedOrigins = parseAllowedOrigins(env.AIFIAR_REMOTE_ALLOWED_ORIGINS);
  const port = Number(env.AIFIAR_REMOTE_PORT ?? 8787);
  const maxBodyBytes = Number(env.AIFIAR_REMOTE_MAX_BODY_BYTES ?? 1048576);
  const maxRequestsPerMinute = Number(env.AIFIAR_REMOTE_MAX_REQUESTS_PER_MINUTE ?? 120);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Remote port must be an integer from 1 to 65535.");
  }
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1024 || maxBodyBytes > 10485760) {
    throw new Error("Remote body limit must be 1 KiB to 10 MiB.");
  }
  if (!Number.isInteger(maxRequestsPerMinute) || maxRequestsPerMinute < 1 || maxRequestsPerMinute > 10000) {
    throw new Error("Remote global rate limit must be 1 to 10000 requests per minute.");
  }

  return {
    host: env.AIFIAR_REMOTE_HOST ?? "127.0.0.1",
    port,
    path,
    publicUrl,
    allowedHosts,
    allowedOrigins,
    maxBodyBytes,
    maxRequestsPerMinute,
    trustProxy: false
  };
}
