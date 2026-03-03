/**
 * Cloud base URL validation to prevent SSRF.
 *
 * Enforces HTTPS and blocks base URLs that resolve to internal/metadata ranges.
 */

import dns from "node:dns";
import net from "node:net";
import { promisify } from "node:util";
import {
  normalizeHostLike,
  normalizeIpForPolicy,
} from "../security/network-policy";

const dnsLookupAll = promisify(dns.lookup);

const BLOCKED_IPV4_CIDRS: Array<{ base: number; mask: number }> = [
  // "This" network / current host
  cidrV4("0.0.0.0", 8),
  // RFC 1918 private ranges
  cidrV4("10.0.0.0", 8),
  cidrV4("172.16.0.0", 12),
  cidrV4("192.168.0.0", 16),
  // RFC 6598 carrier-grade NAT
  cidrV4("100.64.0.0", 10),
  // Loopback
  cidrV4("127.0.0.0", 8),
  // Link-local / cloud metadata endpoints
  cidrV4("169.254.0.0", 16),
  // IETF protocol assignments (includes 192.0.0.0/24)
  cidrV4("192.0.0.0", 24),
  // Benchmark testing
  cidrV4("198.18.0.0", 15),
  // Documentation ranges
  cidrV4("192.0.2.0", 24),
  cidrV4("198.51.100.0", 24),
  cidrV4("203.0.113.0", 24),
  // Multicast / future-use / broadcast
  cidrV4("224.0.0.0", 4),
  cidrV4("240.0.0.0", 4),
];

function cidrV4(base: string, prefix: number): { base: number; mask: number } {
  const parsed = parseIpv4ToInt(base);
  if (parsed === null) {
    throw new Error(`Invalid CIDR base IPv4 address: ${base}`);
  }
  const shift = 32 - prefix;
  const mask = shift === 32 ? 0 : (0xffffffff << shift) >>> 0;
  return { base: parsed & mask, mask };
}

function parseIpv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number.parseInt(part, 10);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = (value << 8) | octet;
  }

  return value >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const asInt = parseIpv4ToInt(ip);
  if (asInt === null) return true;
  return BLOCKED_IPV4_CIDRS.some((cidr) => (asInt & cidr.mask) === cidr.base);
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::" || // unspecified address
    normalized === "::1" || // loopback
    /^fe[89ab][0-9a-f]:/.test(normalized) || // link-local fe80::/10
    /^f[cd][0-9a-f]{2}:/i.test(normalized) || // ULA (fc00::/7)
    normalized.startsWith("ff") // multicast (ff00::/8)
  );
}

function isBlockedIp(ip: string): boolean {
  const normalized = normalizeIpForPolicy(ip);
  const family = net.isIP(normalized);
  if (family === 4) return isBlockedIpv4(normalized);
  if (family === 6) return isBlockedIpv6(normalized);
  return false;
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

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    return `Cloud base URL "${rawUrl}" points to a blocked local hostname.`;
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
