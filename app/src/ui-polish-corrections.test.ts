import { describe, expect, it } from "vitest";
import { formatBuildTime } from "./build-time";
import { advanceHeaderScroll, initialHeaderScroll } from "./ui/header-scroll";
import { navigationRoute } from "./ui/navigation-loading";

describe("build-time localization", () => {
  it.each([
    ["UTC", "2026-09-28 04:00:56 UTC+00:00"],
    ["Asia/Manila", "2026-09-28 12:00:56 UTC+08:00"],
    ["Asia/Kolkata", "2026-09-28 09:30:56 UTC+05:30"],
    ["America/New_York", "2026-09-28 00:00:56 UTC-04:00"],
    ["Pacific/Honolulu", "2026-09-27 18:00:56 UTC-10:00"],
  ])("converts the fixed build instant to %s with an explicit offset", (zone, expected) => {
    expect(formatBuildTime("2026-09-28 04:00:56", zone)).toBe(expected);
  });
  it("uses the offset at deployment time, including daylight saving", () => {
    expect(formatBuildTime("2026-06-01 12:00:00", "America/Los_Angeles")).toBe("2026-06-01 05:00:00 UTC-07:00");
    expect(formatBuildTime("2026-01-01 12:00:00", "America/Los_Angeles")).toBe("2026-01-01 04:00:00 UTC-08:00");
    expect(formatBuildTime("Local development")).toBe("Local development");
  });
});

describe("reliable scroll header", () => {
  const bounds = { maxY: 1000, topBoundary: 108 };
  it("ignores small reversals and uses distinct hide/reveal thresholds", () => {
    let state = initialHeaderScroll(200);
    state = advanceHeaderScroll(state, 220, bounds);
    expect(state.hidden).toBe(false);
    state = advanceHeaderScroll(state, 240, bounds);
    expect(state.hidden).toBe(true);
    state = advanceHeaderScroll(state, 236, bounds);
    expect(state.hidden).toBe(true);
    state = advanceHeaderScroll(state, 239, bounds);
    expect(state.hidden).toBe(true);
    state = advanceHeaderScroll(state, 228, bounds);
    expect(state.hidden).toBe(false);
  });
  it("clamps top/bottom rubber-band overscroll and pins open/focused headers", () => {
    const hidden = { y: 1000, travel: 32, hidden: true };
    expect(advanceHeaderScroll(hidden, 1080, bounds)).toEqual(hidden);
    expect(advanceHeaderScroll(hidden, -20, bounds)).toEqual(initialHeaderScroll(0));
    expect(advanceHeaderScroll(hidden, 900, { ...bounds, pinned: true }).hidden).toBe(false);
    expect(advanceHeaderScroll(hidden, 80, bounds).hidden).toBe(false);
  });
});

describe("native navigation skeleton eligibility", () => {
  it("keeps external destinations and same-document anchors out of loading feedback", () => {
    expect(navigationRoute("/models", "https://benchmarkregistry.org/")).toEqual({ kind: "models" });
    expect(navigationRoute("?sort=name", "https://benchmarkregistry.org/models")).toEqual({ kind: "models" });
    expect(navigationRoute("#main-content", "https://benchmarkregistry.org/models")).toBeNull();
    expect(navigationRoute("https://github.com/rolling7ho/benchmark-registry", "https://benchmarkregistry.org/")).toBeNull();
    expect(navigationRoute("/legal", "https://benchmarkregistry.org/")).toEqual({ kind: "legal" });
    expect(navigationRoute("/legal/arbitrary", "https://benchmarkregistry.org/")).toBeNull();
  });
});
