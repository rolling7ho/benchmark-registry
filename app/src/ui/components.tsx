import { DATA_LICENSE } from "../data-license";
import { sourceLabel } from "../source-label";
import { BreadcrumbContext } from "../breadcrumb-context";
import { VisibleBreadcrumbs } from "../breadcrumbs";
import {
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { navigateRegistry } from "../navigation";
import { BUILD_TIMESTAMP, IS_STAGING } from "../build";
import { formatBuildTime, viewerTimeZone } from "../build-time";
import { advanceHeaderScroll, initialHeaderScroll } from "./header-scroll";
import { useNavigationLoading } from "./navigation-loading";
import { diagnoseTheme } from "../diagnostics";
import { ExternalIcon, GitHubIcon, MenuIcon, RegistryMark, SortIcon } from "./icons";
import { benchmarkDisplayName } from "../benchmark-names";
import {
  RegistryClientError,
  searchRegistry,
  type SearchResponse,
  type RegistryRoute,
} from "../registry";
import { staticFetch } from "../static-api";
import {
  readStoredTheme,
  resolveTheme,
  storeTheme,
  SYSTEM_DARK_THEME_QUERY,
  type ThemePreference,
} from "../theme";

export type SortDirection = "asc" | "desc";

export interface NavigationItem {
  href: string;
  label: string;
}

export interface AppShellProps {
  children: ReactNode;
  dataUpdated?: string;
  navigation: NavigationItem[];
  activeHref?: string;
  busy?: boolean;
  announcement?: string;
  renderPending?: (route: RegistryRoute) => ReactNode;
}

export function AppShell({
  children,
  dataUpdated,
  navigation,
  activeHref,
  renderPending,
  busy,
  announcement,
}: AppShellProps) {
  const { preference, selectTheme } = useThemePreference();
  const [showBuildTime, setShowBuildTime] = useState(false);
  const buildTime = useLocalizedBuildTime();
  const pending = useNavigationLoading(Boolean(renderPending));

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content" onClick={() => document.getElementById("main-content")?.focus({ preventScroll: true })}>
        Skip to main content
      </a>
      <Header
        navigation={navigation}
        activeHref={activeHref}
      />
      <main id="main-content" tabIndex={-1} aria-busy={pending || busy ? true : undefined} style={pending ? { minHeight: pending.height } : undefined}>
        {pending && renderPending ? renderPending(pending.route) : children}
      </main>
      <p className="visually-hidden" role="status" aria-atomic="true" data-route-status>{announcement}</p>
      <footer className="site-footer">
        <PageContainer className="site-footer__inner">
          <div className="site-footer__dates"><p>
            © 2026 Benchmark Registry
          </p>
          <button data-nosnippet className="last-updated" type="button" aria-pressed={showBuildTime} aria-describedby="last-updated-help" onClick={() => setShowBuildTime((shown) => !shown)}>
            {showBuildTime ? `Application build: ${buildTime}` : dataUpdated ? `Last updated: ${dataUpdated.slice(0,10)}` : "Application build details"}
          </button><span id="last-updated-help" className="visually-hidden">Toggle between the data update date and the application build time.</span><p>Data licensed under <a href={DATA_LICENSE.url} rel="noopener noreferrer">{DATA_LICENSE.name}</a></p></div>
          <nav className="site-footer__links" aria-label="Footer navigation"><a href="/recent">Recently added</a><a href="/feed.xml">Atom feed</a><a href="/coverage">Coverage</a><a href="/corrections">Corrections</a><a href="/about">About</a><a href="/contact">Contact</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/legal">Legal</a></nav>
          <div className="site-footer__controls">
            <ThemeToggle theme={preference} onSelectTheme={selectTheme} />
            <a className="github-link" href="https://github.com/rolling7ho/benchmark-registry" aria-label="Benchmark Registry on GitHub"><GitHubIcon /></a>
          </div>
        </PageContainer>
      </footer>
    </div>
  );
}

interface HeaderProps {
  navigation: NavigationItem[];
  activeHref?: string;
  theme?: ThemePreference;
}

export function Header({
  navigation,
  activeHref,
}: HeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const scrollState = useRef(initialHeaderScroll());
  const buildTime = useLocalizedBuildTime();
  const mobile = useSyncExternalStore(subscribeMobileViewport, isMobileViewport, () => false);

  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener("registry:navigated",close);
    return () => window.removeEventListener("registry:navigated",close);
  }, []);

  const reveal = () => {
    scrollState.current = initialHeaderScroll(window.scrollY);
    setHidden(false);
  };

  useEffect(() => {
    scrollState.current = initialHeaderScroll(window.scrollY);
    let frame: number | undefined;
    const sample = () => {
      frame = undefined;
      const focused = document.activeElement;
      const pinned = menuOpen || Boolean(focused?.matches(":focus-visible") && headerRef.current?.contains(focused));
      const next = advanceHeaderScroll(scrollState.current, window.scrollY, {
        maxY: document.documentElement.scrollHeight - window.innerHeight,
        topBoundary: (headerRef.current?.offsetHeight ?? 60) + 48,
        pinned,
      });
      if (next.hidden !== scrollState.current.hidden) setHidden(next.hidden);
      scrollState.current = next;
    };
    const handleScroll = () => {
      if (frame === undefined) frame = requestAnimationFrame(sample);
    };
    const reset = () => {
      scrollState.current = initialHeaderScroll(window.scrollY);
      setHidden(false);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", reset);
    window.addEventListener("pageshow", reset);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", reset);
      window.removeEventListener("pageshow", reset);
    };
  }, [menuOpen]);

  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 62rem)");
    const update = () => { if (!viewport.matches) setMenuOpen(false); };
    viewport.addEventListener("change", update);
    return () => viewport.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const primaryNavigation = <nav className="primary-nav" aria-label="Primary navigation">
    {navigation.map((item) => <a key={item.href} href={item.href} aria-current={activeHref === item.href ? "page" : undefined}>{item.label}</a>)}
  </nav>;

  return (
    <div className="site-header-shell">
      {IS_STAGING ? <section className="staging-banner" aria-label="Staging environment">STAGING | Last update: {buildTime}</section> : null}
    <header
      className={hidden && !menuOpen ? "site-header site-header--hidden" : "site-header"}
      ref={headerRef}
      onFocusCapture={reveal}
    >
      <PageContainer className="site-header__inner">
        <a className="wordmark" href="/" aria-label="Benchmark Registry home">
          <RegistryMark />
          <span>Benchmark Registry</span>
        </a>
        <button className="mobile-menu-toggle" type="button" ref={menuButton}
          aria-expanded={menuOpen} aria-controls="header-menu" aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => { reveal(); setMenuOpen((open) => !open); }}><MenuIcon open={menuOpen} /></button>
        <div id="header-menu" className={`header-menu${menuOpen ? " header-menu--open" : ""}`}
          inert={mobile && !menuOpen ? true : undefined}
          onClickCapture={(event) => {
            if ((event.target as Element).closest("a[href]")) {
              setMenuOpen(false);
              if (mobile) menuButton.current?.focus();
            }
          }}>
        <div className="header-menu__content"><div className="header-menu__body">
        {!mobile ? primaryNavigation : null}
        <GlobalSearch />
        {mobile ? primaryNavigation : null}
        </div></div>
        </div>
      </PageContainer>
    </header>
    </div>
  );
}

function isMobileViewport() { return window.matchMedia("(max-width: 62rem)").matches; }
function subscribeMobileViewport(notify: () => void) {
  const viewport = window.matchMedia("(max-width: 62rem)");
  viewport.addEventListener("change", notify);
  return () => viewport.removeEventListener("change", notify);
}

const subscribeTimeZone = (notify: () => void) => {
  window.addEventListener("focus", notify);
  return () => window.removeEventListener("focus", notify);
};
function useLocalizedBuildTime() {
  const zone = useSyncExternalStore(subscribeTimeZone, viewerTimeZone, () => "UTC");
  return formatBuildTime(BUILD_TIMESTAMP, zone);
}

function useThemePreference() {
  const preference = useSyncExternalStore(subscribeTheme, currentThemePreference, () => "system" as ThemePreference);
  const lastThemeReport = useRef("");

  useEffect(() => {
    const system = window.matchMedia(SYSTEM_DARK_THEME_QUERY);
    const report = () => {
      const current = currentThemePreference();
      const resolved = resolveTheme(current === "system" ? null : current, system.matches);
      const key = `${current}:${resolved}`;
      if (lastThemeReport.current !== key) {
        diagnoseTheme(current, resolved);
        lastThemeReport.current = key;
      }
    };
    report();
    system.addEventListener("change", report);
    return () => system.removeEventListener("change", report);
  }, [preference]);

  const selectTheme = (next: ThemePreference) => {
    try { storeTheme(next, document.documentElement, window.localStorage); }
    catch { if (next === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = next; }
    window.dispatchEvent(new Event("registry-theme-change"));
  };
  return { preference, selectTheme };
}

function currentThemePreference(): ThemePreference {
  const theme = document.documentElement.dataset.theme;
  return theme === "light" || theme === "dark" ? theme : "system";
}

function subscribeTheme(notify: () => void) {
  const storedChanged = () => {
    try {
      const stored = readStoredTheme(window.localStorage);
      if (stored) document.documentElement.dataset.theme = stored;
      else delete document.documentElement.dataset.theme;
    } catch { /* Keep this page's current preference. */ }
    notify();
  };
  window.addEventListener("registry-theme-change", notify);
  window.addEventListener("storage", storedChanged);
  return () => {
    window.removeEventListener("registry-theme-change", notify);
    window.removeEventListener("storage", storedChanged);
  };
}

interface ThemeToggleProps {
  theme: ThemePreference;
  onSelectTheme: (theme: ThemePreference) => void;
}

export function ThemeToggle({ theme, onSelectTheme }: ThemeToggleProps) {
  return (
    <fieldset className="theme-toggle">
      <legend className="visually-hidden">Color theme</legend>
      <div className="theme-toggle__options">
        {(["system", "light", "dark"] as const).map((choice) => <span key={choice}>
          <input className="theme-toggle__input visually-hidden" id={`theme-${choice}`} name="color-theme"
            type="radio" value={choice} checked={theme === choice} onChange={() => onSelectTheme(choice)} />
          <label htmlFor={`theme-${choice}`}>{choice.charAt(0).toUpperCase() + choice.slice(1)}</label>
        </span>)}
      </div>
    </fieldset>
  );
}

interface GlobalSearchProps {
  defaultValue?: string;
}

export type GlobalSearchState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "results"; query: string; response: SearchResponse }
  | { status: "error"; query: string; message: string };

const entityLabels: Record<SearchResponse["data"][number]["entity_type"], string> = {
  model: "Model",
  benchmark: "Benchmark",
  company: "Company",
  result: "Result",
};

export function GlobalSearchPanel({ state, activeIndex = -1 }: {
  state: Exclude<GlobalSearchState, { status: "idle" }>;
  activeIndex?: number;
}) {
  if (state.status === "loading") {
    return (
      <div className="global-search-panel global-search-panel--status global-search-panel--loading" id="global-search-results">
        <ul className="global-search-loading" aria-hidden="true">{[0, 1, 2].map((row) =>
          <li key={row}><span className="skeleton skeleton--label" /><span className="skeleton skeleton--value" /></li>
        )}</ul>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="global-search-panel global-search-panel--status" id="global-search-results">
        <p role="alert">{state.message}</p>
      </div>
    );
  }

  if (state.response.data.length === 0) {
    return (
      <div className="global-search-panel global-search-panel--status" id="global-search-results">
        <p>No registry entries found for “{state.query}”.</p>
      </div>
    );
  }

  return (
    <div className="global-search-panel" id="global-search-results">
      <ul className="global-search-results">
        {state.response.data.map((result, index) => {
          const displayName = result.entity_type === "benchmark"
            ? benchmarkDisplayName({ name: result.canonical_name, aliases: result.aliases })
            : result.canonical_name;
          const description = result.entity_type === "result" ? result.matched_text : displayName !== result.canonical_name
            ? result.canonical_name
            : result.matched_text !== result.canonical_name
              ? `Matched ${result.matched_text}`
              : undefined;
          return (
            <li key={`${result.entity_type}:${result.href}`}>
              <a href={result.href} data-active={index === activeIndex ? "true" : undefined}>
                <span className="global-search-result__type">
                  {entityLabels[result.entity_type]}
                </span>
                <span className="global-search-result__name">
                  {displayName}
                </span>
                {description ? (
                  <span className="global-search-result__match">
                    {description}
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function GlobalSearch({ defaultValue }: GlobalSearchProps) {
  const [state, setState] = useState<GlobalSearchState>({ status: "idle" });
  const request = useRef<AbortController | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const close = () => {request.current?.abort();setState({status:"idle"});setActiveIndex(-1);};
    window.addEventListener("registry:navigated",close);
    return () => {request.current?.abort();window.removeEventListener("registry:navigated",close);};
  }, []);

  const closeResults = () => {
    request.current?.abort();
    request.current = null;
    setState({ status: "idle" });
    setActiveIndex(-1);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("q");
    if (!(input instanceof HTMLInputElement)) return;
    const query = input.value.trim();
    if (query.length === 0) return;

    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setActiveIndex(-1);
    setState({ status: "loading", query });
    void searchRegistry(query, staticFetch, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        if (response.direct_href) {
          navigateRegistry(response.direct_href);
          return;
        }
        setState({ status: "results", query, response });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          query,
          message: error instanceof RegistryClientError
            ? error.message
            : "The registry search could not be completed.",
        });
      });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && state.status !== "idle") {
      event.preventDefault();
      closeResults();
      shell.current?.querySelector<HTMLInputElement>("input")?.focus();
    } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && state.status === "results" && state.response.data.length) {
      event.preventDefault();
      const links = shell.current?.querySelectorAll<HTMLAnchorElement>(".global-search-results a");
      const focused = links ? [...links].indexOf(document.activeElement as HTMLAnchorElement) : -1;
      const current = focused >= 0 ? focused : activeIndex;
      const next = event.key === "ArrowDown"
        ? (current + 1) % state.response.data.length
        : (current <= 0 ? state.response.data.length : current) - 1;
      setActiveIndex(next);
      links?.[next]?.focus();
    }
  };

  return (
    <div className="global-search-shell" ref={shell} onKeyDown={handleKeyDown}>
      <form
        action="/search" method="get"
        className="global-search"
        role="search"
        aria-label="Global registry search"
        aria-busy={state.status === "loading" ? "true" : undefined}
        onSubmit={handleSubmit}
      >
        <label className="visually-hidden" htmlFor="global-search-input">
          Search the registry
        </label>
        <input
          id="global-search-input"
          name="q"
          type="search"
          maxLength={50}
          required
          defaultValue={defaultValue}
          placeholder="Search models, benchmarks, companies"
          autoComplete="off"
          aria-controls={state.status === "idle" ? undefined : "global-search-results"}
          onFocus={() => setActiveIndex(-1)}
          onChange={closeResults}
        />
        <button type="submit" disabled={state.status === "loading"}>Search</button>
      </form>
      <p className="visually-hidden" role="status" aria-atomic="true">
        {state.status === "loading" ? "Searching the registry…" : state.status === "results" ? state.response.data.length === 0
          ? `No registry entries found for “${state.query}”.` : `${state.response.page.total_items} search results found.` : ""}
      </p>
      {state.status === "idle" ? null : <GlobalSearchPanel state={state} activeIndex={activeIndex} />}
    </div>
  );
}

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={["page-container", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  kicker?: string;
  children?: ReactNode;
}

export function PageHeader({ title, description, kicker, children }: PageHeaderProps) {
  const breadcrumb=useContext(BreadcrumbContext);
  const updated = breadcrumb && ["model", "benchmark", "benchmark-version"].includes(breadcrumb.kind)
    && breadcrumb.updated && Number.isFinite(Date.parse(breadcrumb.updated)) ? breadcrumb.updated : undefined;
  return (
    <header className="page-header">
      {breadcrumb ? <VisibleBreadcrumbs loaded={breadcrumb} /> : null}
      {kicker ? <p className="kicker">{kicker}</p> : null}
      <h1 tabIndex={-1}>{title}</h1>
      {description ? <p className="page-header__description">{description}</p> : null}
      {updated && !description?.includes(`Updated ${updated.slice(0, 10)}`) ? <p className="page-header__description">Updated <time dateTime={updated}>{updated.slice(0, 10)}</time></p> : null}
      {children}
    </header>
  );
}

export interface MetadataItem {
  label: string;
  value: ReactNode;
}

export function MetadataRows({ items, loading = false, inline = false }: { items: MetadataItem[]; loading?: boolean; inline?: boolean }) {
  return (
    <dl className={inline ? "metadata-inline" : "metadata-rows"}>
      {items.map((item) => (
        <div className="metadata-row" key={item.label}>
          <dt>{loading ? <span className="skeleton skeleton--label" /> : item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface SourceLinkProps {
  href: string;
  children?: ReactNode;
  context?: string;
}

export function SourceLink({ href, children, context }: SourceLinkProps) {
  return (
    <a className="source-link" href={href} target="_blank" rel="noopener noreferrer">
      <span>{children ?? sourceLabel(href)}</span>
      <ExternalIcon />
      {context ? <span className="visually-hidden"> for {context}</span> : null}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

interface SortableHeaderProps {
  href: string;
  label: string;
  direction?: SortDirection;
}

export function SortableHeader({ href, label, direction }: SortableHeaderProps) {
  const nextDirection = direction === "asc" ? "descending" : "ascending";

  return (
    <a
      className={[
        "sortable-header",
        direction ? "sortable-header--active" : undefined,
      ]
        .filter(Boolean)
        .join(" ")}
      href={href}
      data-focus-key={`sort-${label}`}
      aria-label={`Sort by ${label} ${nextDirection}`}
    >
      <span>{label}</span>
      <SortIcon direction={direction} />
    </a>
  );
}

export interface TableColumn<Row> {
  key: string;
  label: string;
  render: (row: Row) => ReactNode;
  className?: string;
  sortHref?: string;
  sortDirection?: SortDirection;
  /** Show the column label beside the value when phone rows drop the header. */
  phoneLabel?: boolean;
}

interface DataTableProps<Row> {
  caption: string;
  columns: TableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  getRowId?: (row: Row) => string;
}

export function DataTable<Row>({
  caption,
  columns,
  rows,
  getRowKey,
  getRowId,
}: DataTableProps<Row>) {
  return (
    <div className="table-scroll" role="region" tabIndex={0} aria-label={`${caption}, scrollable`}>
      <table className="data-table" data-columns={columns.length}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={[column.className, column.sortHref ? "data-table__sortable" : undefined].filter(Boolean).join(" ")}
                aria-sort={
                  column.sortDirection
                    ? column.sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                {column.sortHref ? (
                  <SortableHeader
                    href={column.sortHref}
                    label={column.label}
                    direction={column.sortDirection}
                  />
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)} id={getRowId?.(row)}>
              {columns.map((column) => (
                <td key={column.key} className={column.className} data-label={column.phoneLabel ? column.label : undefined}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PaginationProps {
  page: number;
  totalPages: number;
  getHref: (page: number) => string;
}

export function Pagination({ page, totalPages, getHref }: PaginationProps) {
  // A single page has nowhere to go; an out-of-range page still shows the way back.
  if (totalPages <= 1 && page <= 1) return null;
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav className="pagination" aria-label="Pagination">
      {hasPrevious ? (
        <a href={getHref(page - 1)} rel="prev" data-focus-key="page-previous" aria-label="Previous page">
          Previous
        </a>
      ) : (
        <button type="button" disabled>Previous</button>
      )}
      <span className="pagination__status">
        Page <strong>{page}</strong> of <strong>{totalPages}</strong>
      </span>
      {hasNext ? (
        <a href={getHref(page + 1)} rel="next" data-focus-key="page-next" aria-label="Next page">
          Next
        </a>
      ) : (
        <button type="button" disabled>Next</button>
      )}
    </nav>
  );
}

interface PageSizeSelectorProps {
  value: 50 | 100 | 500;
  id?: string;
  autoSubmit?: boolean;
}

export function PageSizeSelector({ value, id = "page-size", autoSubmit = false }: PageSizeSelectorProps) {
  return (
    <label className="page-size" htmlFor={id}>
      <span>Rows per page</span>
      <select id={id} name="limit" defaultValue={value} onChange={autoSubmit ? event => event.currentTarget.form?.requestSubmit() : undefined}>
        <option value="50">50</option>
        <option value="100">100</option>
        <option value="500">500</option>
      </select>
    </label>
  );
}

export interface TabItem {
  href: string;
  label: string;
  active?: boolean;
}

export function Tabs({ label, items }: { label: string; items: TabItem[] }) {
  return (
    <nav className="tabs" aria-label={label}>
      {items.map((item) => (
        <a
          key={item.href}
              href={item.href}
              data-focus-key={`tab-${label}-${item.label}`}
          aria-current={item.active ? "page" : undefined}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function LoadingState({ columns = 5, rows = 4, labels }: { columns?: number; rows?: number; labels?: string[] }) {
  const headers = labels ?? Array.from({ length: columns }, () => "");
  const cellClass = (label: string) => label === "Score" || label === "Registry No." ? "numeric"
    : ["Model", "Benchmark", "Organization", "Version"].includes(label) ? "data-table__primary" : undefined;
  return (
    <div className="loading-state" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">Loading registry results</span>
      <div className="table-scroll" aria-hidden="true"><table className="data-table" data-columns={headers.length}>
        <thead><tr>{headers.map((label, index) => <th key={index} className={cellClass(label)}><span className="skeleton skeleton--label" style={{ width: `${Math.max(label.length, 4)}ch` }} /></th>)}</tr></thead>
        <tbody>{Array.from({ length: rows }, (_, rowIndex) => <tr key={rowIndex}>{headers.map((label, index) =>
          <td key={index} className={cellClass(label)}><span className="skeleton skeleton--cell" /></td>)}</tr>)}</tbody>
      </table></div>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <section className="state-message" role="status">
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="state-message__action">{action}</div> : null}
    </section>
  );
}

export function ErrorState({ title, description, primary = false }: Omit<EmptyStateProps, "action"> & { primary?: boolean }) {
  const Heading = primary ? "h1" : "h2";
  return (
    <section className="state-message state-message--error" role="alert">
      <Heading tabIndex={-1}>{title}</Heading>
      <p>{description}</p>
    </section>
  );
}

export function NotFoundState() {
  return (
    <section className="state-message state-message--not-found">
      <p className="state-code">404</p>
      <h1 tabIndex={-1}>Registry entry not found</h1>
      <p>Check the address or return to the registry index.</p>
      <div className="state-message__action">
        <a className="button-link" href="/models">
          Browse models
        </a>
      </div>
    </section>
  );
}
