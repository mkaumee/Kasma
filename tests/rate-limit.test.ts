import { beforeEach, describe, expect, test } from "vitest";

import {
  clientIp,
  rateLimit,
  resetRateLimits,
} from "@/lib/security/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => resetRateLimits());

  test("allows up to the limit, then blocks within the window", () => {
    const opts = { limit: 3, windowMs: 1000 };
    expect(rateLimit("k", opts, 0).ok).toBe(true);
    expect(rateLimit("k", opts, 100).ok).toBe(true);
    expect(rateLimit("k", opts, 200).ok).toBe(true);
    const blocked = rateLimit("k", opts, 300);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(700);
  });

  test("resets after the window elapses", () => {
    const opts = { limit: 1, windowMs: 1000 };
    expect(rateLimit("k", opts, 0).ok).toBe(true);
    expect(rateLimit("k", opts, 500).ok).toBe(false);
    expect(rateLimit("k", opts, 1000).ok).toBe(true); // new window
  });

  test("keys are independent", () => {
    const opts = { limit: 1, windowMs: 1000 };
    expect(rateLimit("a", opts, 0).ok).toBe(true);
    expect(rateLimit("b", opts, 0).ok).toBe(true);
  });
});

describe("clientIp", () => {
  test("prefers the first x-forwarded-for entry", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(clientIp(h)).toBe("1.2.3.4");
  });
  test("falls back to unknown", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
