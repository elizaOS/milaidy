import { describe, expect, it } from "vitest";
import {
  isBlockedPrivateOrLinkLocalIp,
  isLoopbackHost,
  normalizeHostLike,
  normalizeIpForPolicy,
} from "../network-policy";

describe("network-policy", () => {
  it("normalizes host-like values", () => {
    expect(normalizeHostLike(" [LOCALHOST] ")).toBe("localhost");
    expect(normalizeHostLike("Example.COM")).toBe("example.com");
  });

  it("normalizes IPv4-mapped IPv6 addresses", () => {
    expect(normalizeIpForPolicy("::ffff:7f00:1")).toBe("127.0.0.1");
    expect(normalizeIpForPolicy("::ffff:192.168.1.5")).toBe("192.168.1.5");
    expect(normalizeIpForPolicy("::ffff:192.168.1.5%lo0")).toBe("192.168.1.5");
    expect(normalizeIpForPolicy("0:0:0:0:0:ffff:7f00:1")).toBe("127.0.0.1");
    expect(normalizeIpForPolicy("0:0:0:0:0:ffff:a9fe:a9fe")).toBe(
      "169.254.169.254",
    );
    expect(normalizeIpForPolicy("0:0:0:0:0:ffff:c0a8:101")).toBe("192.168.1.1");
    expect(normalizeIpForPolicy("0:0:0:0:0:ffff:c0a8")).toBe("0.0.192.168");
    expect(normalizeIpForPolicy("0:0:0:0:0:0:0:1")).toBe("::1");
    expect(normalizeIpForPolicy("0:0:0:0:0:0:0:0")).toBe("::");
  });

  it("detects blocked private/link-local targets", () => {
    expect(isBlockedPrivateOrLinkLocalIp("127.0.0.1")).toBe(true);
    expect(isBlockedPrivateOrLinkLocalIp("169.254.169.254")).toBe(true);
    expect(isBlockedPrivateOrLinkLocalIp("192.168.1.20")).toBe(true);
    expect(isBlockedPrivateOrLinkLocalIp("10.1.2.3")).toBe(true);
    expect(isBlockedPrivateOrLinkLocalIp("172.16.0.1")).toBe(true);
    expect(isBlockedPrivateOrLinkLocalIp("172.31.255.255")).toBe(true);
    expect(isBlockedPrivateOrLinkLocalIp("172.15.255.255")).toBe(false);
    expect(isBlockedPrivateOrLinkLocalIp("fe80::1")).toBe(true);
    expect(isBlockedPrivateOrLinkLocalIp("fea0::1")).toBe(true);
    expect(isBlockedPrivateOrLinkLocalIp("fc12::1")).toBe(true);
    expect(isBlockedPrivateOrLinkLocalIp("fd12::1")).toBe(true);
    expect(isBlockedPrivateOrLinkLocalIp("::")).toBe(true);
    expect(isBlockedPrivateOrLinkLocalIp("::1")).toBe(true);
    expect(isBlockedPrivateOrLinkLocalIp("0:0:0:0:0:ffff:7f00:1")).toBe(true);
    expect(isBlockedPrivateOrLinkLocalIp("0:0:0:0:0:ffff:a9fe:a9fe")).toBe(
      true,
    );
    expect(isBlockedPrivateOrLinkLocalIp("0:0:0:0:0:ffff:c0a8:101")).toBe(true);
    expect(isBlockedPrivateOrLinkLocalIp("0:0:0:0:0:ffff:c0a8")).toBe(true);
    expect(isBlockedPrivateOrLinkLocalIp("0:0:0:0:0:0:0:1")).toBe(true);
    expect(isBlockedPrivateOrLinkLocalIp("0:0:0:0:0:0:0:0")).toBe(true);
    expect(isBlockedPrivateOrLinkLocalIp("93.184.216.34")).toBe(false);
  });

  it("accepts only strict loopback hosts", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("127.99.88.77")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("0:0:0:0:0:0:0:1")).toBe(true);
    expect(isLoopbackHost("::ffff:7f00:1")).toBe(true);
    expect(isLoopbackHost("0:0:0:0:0:ffff:7f00:1")).toBe(true);
    expect(isLoopbackHost("[::1]")).toBe(true);
    expect(isLoopbackHost("[0:0:0:0:0:0:0:1]")).toBe(true);

    expect(isLoopbackHost("127.0.0.1.evil.com")).toBe(false);
    expect(isLoopbackHost("169.254.169.254")).toBe(false);
    expect(isLoopbackHost("example.com")).toBe(false);
    expect(isLoopbackHost("")).toBe(false);
  });
});
