// @vitest-environment jsdom
import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString, renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, RegistryDocument } from "./App";
import { readInitialDocument, serializeInitialDocument } from "./bootstrap";
import { AppShell, Header, LoadingState, SortableHeader } from "./ui/components";
import { RouteLoadingState } from "./ui/route-loading";
import { HomeLoadingState } from "./home-page";
import { resolveRegistryRoute, type LoadedRegistryRoute } from "./registry";
import { BUILD_TIMESTAMP } from "./build";
import { formatBuildTime } from "./build-time";
import { readFileSync } from "node:fs";
const styles = readFileSync("src/styles.css", "utf8");

const navigation = [{ href: "/models", label: "Models" }, { href: "/benchmarks", label: "Benchmarks" }, { href: "/companies", label: "Organizations" }];
let root: Root | undefined;
let container: HTMLDivElement;
beforeEach(() => {
  root = undefined;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  container = document.createElement("div");
  document.body.appendChild(container);
});
afterEach(async () => {
  if (root) await act(() => root?.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function mount(element: React.ReactNode) {
  root = createRoot(container);
  await act(() => root?.render(element));
}
async function click(element: Element) { await act(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))); }

describe("P11.8 visible interactions", () => {
  it("preserves the full wordmark and opens a search-first menu with SVG icons", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    await mount(<Header navigation={navigation} activeHref="/models" />);
    const button = container.querySelector("button.mobile-menu-toggle")!;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".wordmark")?.textContent).toBe("Benchmark Registry");
    expect(button.querySelector("svg path")?.getAttribute("d")).toContain("h16");
    await click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".header-menu__body")?.firstElementChild?.className).toBe("global-search-shell");
    expect([...container.querySelectorAll(".primary-nav a")].map((a) => a.textContent)).toEqual(["Models", "Benchmarks", "Organizations"]);
    expect(button.querySelector("svg path")?.getAttribute("d")).toContain("l12 12");
    expect(container.querySelector('.primary-nav a[aria-current="page"]')?.textContent).toBe("Models");
    await act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });
  it("closes the menu when an ordinary navigation anchor is selected", async () => {
    await mount(<Header navigation={navigation} />);
    const button = container.querySelector(".mobile-menu-toggle")!;
    await click(button);
    const link = container.querySelector<HTMLAnchorElement>('a[href="/benchmarks"]')!;
    link.addEventListener("click", (event) => event.preventDefault());
    await click(link);
    expect(link.getAttribute("href")).toBe("/benchmarks");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
  it("keeps exactly one Light/Dark/System choice active and restores OS control", async () => {
    await mount(<AppShell navigation={navigation}><p>Registry</p></AppShell>);
    expect(container.querySelector<HTMLInputElement>("#theme-system")?.checked).toBe(true);
    expect([...container.querySelectorAll('.theme-toggle label')].map(label => label.textContent)).toEqual(["System", "Light", "Dark"]);
    for (const choice of ["light", "dark", "system"]) {
      await click(container.querySelector(`#theme-${choice}`)!);
      expect(container.querySelectorAll('input[name="color-theme"]:checked')).toHaveLength(1);
      expect(window.localStorage.getItem("benchmark-registry-theme")).toBe(choice);
      expect(document.documentElement.dataset.theme).toBe(choice === "system" ? undefined : choice);
    }
  });
  it.each([false, true])("defaults to System when OS dark=%s without saving an implicit choice", async (dark) => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: query.includes("prefers-color-scheme") && dark, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    await mount(<AppShell navigation={navigation}><p>Registry</p></AppShell>);
    expect(container.querySelector<HTMLInputElement>("#theme-system")?.checked).toBe(true);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem("benchmark-registry-theme")).toBeNull();
  });
  it("synchronizes a persisted explicit theme after hydration without changing markup", async () => {
    document.documentElement.dataset.theme = "dark";
    window.localStorage.setItem("benchmark-registry-theme", "dark");
    container.innerHTML = renderToString(<AppShell navigation={navigation}><p>Registry</p></AppShell>);
    const errors = vi.fn();
    await act(() => { root = hydrateRoot(container, <AppShell navigation={navigation}><p>Registry</p></AppShell>, { onRecoverableError: errors }); });
    expect(errors).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLInputElement>("#theme-dark")?.checked).toBe(true);
  });
  it("renders footer links and distinguishes a persisted data date from the fixed build timestamp", async () => {
    await mount(<AppShell navigation={navigation} dataUpdated="2026-10-02T00:00:00Z"><p>Registry</p></AppShell>);
    expect(container.querySelector('.site-footer__links a[href="/legal"]')?.getAttribute("href")).toBe("/legal");
    const github = container.querySelector(".github-link")!;
    expect(github.getAttribute("href")).toBe("https://github.com/rolling7ho/benchmark-registry");
    expect(github.getAttribute("aria-label")).toBeTruthy();
    expect(github.textContent).toBe("");
    expect(github.querySelector("svg")).toBeTruthy();
    const updated = container.querySelector(".last-updated")!;
    expect(updated.textContent).toBe("Last updated: 2026-10-02");
    await click(updated);
    expect(updated.textContent).toBe(`Application build: ${formatBuildTime(BUILD_TIMESTAMP)}`);
    await click(updated);
    expect(updated.textContent).toBe("Last updated: 2026-10-02");
    expect(updated.tagName).toBe("BUTTON");
    expect(styles).toContain("cursor: default");
  });
  it("shows skeletons only during a genuine native GET navigation wait and restores on return/cancel", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    await mount(<AppShell navigation={navigation} renderPending={(route) => <RouteLoadingState route={route} />}>
      <form method="get" action="/models"><input name="q" defaultValue="gpt" /></form><p>Loaded page</p>
    </AppShell>);
    await act(() => {
      const submission = new Event("submit", { bubbles: true, cancelable: true });
      expect(container.querySelector("main form")!.dispatchEvent(submission)).toBe(true);
      expect(submission.defaultPrevented).toBe(false);
      vi.advanceTimersByTime(119);
    });
    expect(container.querySelector(".skeleton")).toBeNull();
    await act(() => { vi.advanceTimersByTime(1); });
    expect(container.querySelector("main")?.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector(".skeleton")).toBeTruthy();
    expect(container.querySelector("h1 .skeleton")).toBeTruthy();
    expect(container.querySelector("h1")?.textContent).toBe("");
    expect(fetcher).not.toHaveBeenCalled();
    await act(() => window.dispatchEvent(new Event("pageshow")));
    expect(container.querySelector(".skeleton")).toBeNull();
    expect(container.textContent).toContain("Loaded page");
    await act(() => {
      container.querySelector("main form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      vi.advanceTimersByTime(120);
    });
    await act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(container.querySelector(".skeleton")).toBeNull();
  });
});

describe("P11.8 presentation contracts", () => {
  it.each(["/", "/models", "/models/10001", "/benchmarks", "/benchmarks/example", "/benchmarks/example/1-0", "/companies", "/companies/example"])("renders only silhouettes for %s loading content", (pathname) => {
    const route = resolveRegistryRoute(pathname);
    container.innerHTML = renderToStaticMarkup(route.kind === "home" ? <HomeLoadingState /> : <RouteLoadingState route={route} />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(container.querySelector('[role="status"]')).toBeTruthy();
    container.querySelectorAll(".visually-hidden").forEach((announcement) => announcement.remove());
    expect(container.textContent?.trim()).toBe("");
  });
  it.each([undefined, "asc", "desc"] as const)("renders currentColor SVG sorting for %s", (direction) => {
    container.innerHTML = renderToStaticMarkup(<SortableHeader href="?sort=model" label="Model" direction={direction} />);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("?sort=model");
    expect(container.querySelector("svg")?.getAttribute("data-sort")).toBe(direction ?? "none");
    expect(container.querySelector("svg")?.getAttribute("stroke")).toBe("currentColor");
    expect(container.querySelectorAll("svg path")).toHaveLength(direction ? 1 : 2);
    expect(container.textContent).not.toMatch(/[↑↓↕]/u);
  });
  it("uses loaded table geometry for route skeletons and a shared reduced-motion shimmer", () => {
    const org = renderToStaticMarkup(<RouteLoadingState route={{ kind: "company", slug: "openai" }} />);
    container.innerHTML = org;
    expect([...container.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["", "", "", "", ""]);
    expect(container.querySelectorAll("thead .skeleton")).toHaveLength(5);
    expect(container.querySelectorAll(".metadata-row")).toHaveLength(2);
    expect(container.querySelectorAll("thead .data-table__primary")).toHaveLength(2);
    const home = renderToStaticMarkup(<HomeLoadingState />);
    expect(home).toContain('class="home-sections"');
    expect(home.match(/class="home-model-list"/gu)).toHaveLength(2);
    expect(home).toContain("skeleton");
    expect(renderToStaticMarkup(<LoadingState columns={3} />)).toContain('data-columns="3"');
    expect(styles).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(styles).toContain("animation: skeleton-loading");
    expect(styles.match(/animation: skeleton-loading/gu)).toHaveLength(1);
    expect(styles).toContain('.route-loading [aria-hidden="true"] *,\n.home-page--loading [aria-hidden="true"] * { border-color: transparent; box-shadow: none; }');
    expect(styles).toContain("height: 1.15em");
    expect(styles).not.toContain("position: sticky;\n    left: 0");
  });
  it("escapes bootstrap text safely and hydrates visible initial content without a loader flash", async () => {
    const loaded: LoadedRegistryRoute = { kind: "models", payload: { data: [], page: { number: 1, limit: 50, total_items: 0, total_pages: 0 } } };
    const initial = { loaded, currentSearch: "?q=</script>" };
    expect(serializeInitialDocument(initial)).not.toContain("</script>");
    const script = document.createElement("script");
    script.id = "registry-initial-document";
    script.type = "application/json";
    script.textContent = serializeInitialDocument(initial);
    document.body.appendChild(script);
    expect(readInitialDocument(document)).toEqual(initial);
    container.innerHTML = renderToString(<RegistryDocument {...initial} />);
    const heading = container.querySelector("h1");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const errors = vi.fn();
    history.replaceState(null, "", "/models?q=%3C/script%3E");
    const served = { ...initial, currentSearch: window.location.search };
    container.innerHTML = renderToString(<RegistryDocument {...served} />);
    const servedHeading = container.querySelector("h1");
    await act(() => { root = hydrateRoot(container, <App initial={served} />, { onRecoverableError: errors }); });
    expect(errors).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(heading).not.toBeNull();
    expect(container.querySelector("h1")).toBe(servedHeading);
    expect(container.querySelector(".loading-state")).toBeNull();
  });
});
