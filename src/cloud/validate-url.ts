/**
 * Cloud base URL validation to prevent SSRF.
 *
 * Enforces HTTPS and blocks base URLs that resolve to internal/metadata ranges.
 */

import dns from "node:dns";
import net from "node:net";
import { promisify } from "node:util";

const dnsLookupAll = promisify(dns.lookup);

const ALWAYS_BLOCKED_IP_PATTERNS: RegExp[] = [
  /^169\.254\./, // Link-local / cloud metadata endpoints
  /^0\./, // "This" network
  /^fe80:/i, // IPv6 link-local
];

const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./, // IPv4 loopback
  /^10\./, // RFC 1918 Class A
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC 1918 Class B
  /^192\.168\./, // RFC 1918 Class C
  /^::1$/, // IPv6 loopback
  /^f[cd][0-9a-f]{2}:/i, // IPv6 ULA (fc00::/7)
];

function normalizeHostLike(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
}

function decodeIpv6MappedHex(mapped: string): string | null {
  const match = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(mapped);
  if (!match) return null;
  const hi = Number.parseInt(match[1], 16);
  const lo = Number.parseInt(match[2], 16);
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  const octets = [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
  return octets.join(".");
}

function normalizeIpForPolicy(ip: string): string {
  const base = normalizeHostLike(ip).split("%")[0];
  if (!base.startsWith("::ffff:")) return base;

  const mapped = base.slice("::ffff:".length);
  if (net.isIP(mapped) === 4) return mapped;
  return decodeIpv6MappedHex(mapped) ?? mapped;
}

function isBlockedIp(ip: string): boolean {
  const normalized = normalizeIpForPolicy(ip);
  return (
    ALWAYS_BLOCKED_IP_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

export async function validateCloudBaseUrl(
  rawUrl: string,
): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return `Invalid cloud base URL: "${rawUrl}"`;
  }

  if (parsed.protocol !== "https:") {
    return `Cloud base URL must use HTTPS, got "${parsed.protocol}" in "${rawUrl}"`;
  }

  const hostname = normalizeHostLike(parsed.hostname);
  if (!hostname) {
    return `Invalid cloud base URL: "${rawUrl}"`;
  }

  if (isBlockedIp(hostname)) {
    return `Cloud base URL "${rawUrl}" points to a blocked address.`;
  }

  try {
    const results = await dnsLookupAll(hostname, { all: true });
    const addresses = Array.isArray(results) ? results : [results];
    for (const entry of addresses) {
      const ip =
        typeof entry === "string"
          ? entry
          : (entry as { address: string }).address;
      if (isBlockedIp(ip)) {
        return (
          `Cloud base URL "${rawUrl}" resolves to ${ip}, ` +
          "which is a blocked internal/metadata address."
        );
      }
    }
  } catch {
    // For cloud routing, fail closed on DNS errors.
    return `Cloud base URL "${rawUrl}" could not be resolved via DNS.`;
  }

  return null;
}
