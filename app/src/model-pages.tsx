import { Cite, RecordCite } from "./cite";
import { recordAnchor } from "./citation";
import { ReportIssue } from "./report-issue";
import { comparisonHref, parseComparisonState } from "./compare";
import { ResultSource, ResultDetails } from "./result-source";
import { effortDisplay, OTHER_SETTINGS, pivotResults, providerLabel, usesEffortLayout, type PivotRow } from "./result-pivot";
import { RelatedModels, RelatedLinks } from "./seo-content";
import { ResultScoreLink } from "./result-score-link";
import type { ResultRow } from "../worker/api";
import { ModelBenchmarkScore } from "./model-benchmark-score";
import { BenchmarkLink } from "./benchmark-link";
import {
  DataTable,
  EmptyState,
  MetadataRows,
  PageContainer,
  PageHeader,
  PageSizeSelector,
  Pagination,
  SourceLink,
  Tabs,
  type SortDirection,
  type TableColumn,
} from "./ui/components";
import {
  formatRegistryDate,
  queryHref,
  type ModelDetailResponse,
  type ModelListResponse,
  type ModelListEntry,
} from "./registry";

const PRESERVED_QUERY_KEYS = ["q", "company", "sort", "order", "view", "limit", "layout"];

function resultCount(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "result" : "results"}`;
}

function modelCount(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "model" : "models"}`;
}

function HiddenQueryFields({
  search,
  exclude,
}: {
  search: string;
  exclude: string[];
}) {
  const params = new URLSearchParams(search);
  return (
    <>
      {PRESERVED_QUERY_KEYS.filter((key) => !exclude.includes(key)).flatMap((key) =>
        params.getAll(key).map((value) => (
          <input key={`${key}-${value}`} type="hidden" name={key} value={value} />
        )),
      )}
    </>
  );
}

function LocalSearch({
  action,
  currentSearch,
  label,
  placeholder,
}: {
  action: string;
  currentSearch: string;
  label: string;
  placeholder: string;
}) {
  const params = new URLSearchParams(currentSearch);
  const query = params.get("q") ?? "";
  const clearHref = queryHref(action, currentSearch, { q: null, page: null });

  return (
    <form className="local-search" role="search" aria-label={label} method="get" action={action}>
      <div className="local-search__field">
        <label className="local-search__label" htmlFor="local-search-input">
          {label}
        </label>
        <span className="local-search__controls">
          <input
            id="local-search-input"
            name="q"
            type="search"
            maxLength={50}
            defaultValue={query}
            placeholder={placeholder}
            autoComplete="off"
            required
          />
          <button type="submit" data-focus-key="local-search-submit">Search</button>
        </span>
      </div>
      <HiddenQueryFields search={currentSearch} exclude={["q"]} />
      {query ? (
        <a className="local-search__clear" data-focus-key="clear-search" href={clearHref}>
          Clear search
        </a>
      ) : null}
    </form>
  );
}

function PageSizeForm({
  action,
  currentSearch,
  value,
}: {
  action: string;
  currentSearch: string;
  value: 50 | 100 | 500;
}) {
  return (
    <form className="page-size-form" method="get" action={action}>
      <HiddenQueryFields search={currentSearch} exclude={["limit"]} />
      <PageSizeSelector value={value} id="results-page-size" autoSubmit />
      <noscript><button type="submit" data-focus-key="page-size-apply">Apply</button></noscript>
    </form>
  );
}

function sortLink(
  pathname: string,
  currentSearch: string,
  key: string,
  defaultDirection?: SortDirection,
): { href: string; direction?: SortDirection } {
  const params = new URLSearchParams(currentSearch);
  const explicitDirection = params.get("sort") === key
    ? (params.get("order") ?? "asc") as SortDirection
    : undefined;
  const direction = explicitDirection ?? (params.has("sort") ? undefined : defaultDirection);
  const nextDirection = direction === "asc" ? "desc" : "asc";
  return {
    href: queryHref(pathname, currentSearch, {
      sort: key,
      order: nextDirection,
      page: null,
    }),
    direction,
  };
}

function PaginationFor({
  pathname,
  currentSearch,
  page,
  totalPages,
  limit,
  totalItems,
}: {
  pathname: string;
  currentSearch: string;
  page: number;
  totalPages: number;
  limit: 50 | 100 | 500;
  totalItems: number;
}) {
  // Rows per page sits with pagination under the table, so results start higher on phones.
  const sizes = totalItems > 50;
  if (!sizes && totalPages <= 1 && page <= 1) return null;
  return (
    <div className="results-footer">
      {sizes ? <PageSizeForm action={pathname} currentSearch={currentSearch} value={limit} /> : null}
      <Pagination
        page={page}
        totalPages={totalPages}
        getHref={(nextPage) => queryHref(pathname, currentSearch, { page: nextPage })}
      />
    </div>
  );
}

export function ModelsPage({
  response,
  currentSearch,
}: {
  response: ModelListResponse;
  currentSearch: string;
}) {
  const pathname = "/models";
  const nameSort = sortLink(pathname, currentSearch, "name");
  const releasedSort = sortLink(pathname, currentSearch, "released", "desc");
  const companySort = sortLink(pathname, currentSearch, "company");
  const columns: TableColumn<ModelListEntry>[] = [
    {
      key: "model",
      label: "Model",
      className: "data-table__primary",
      sortHref: nameSort.href,
      sortDirection: nameSort.direction,
      render: (model) => <a href={`/models/${model.registry_no}`}>{model.name}</a>,
    },
    {
      key: "company",
      label: "Provider",
      sortHref: companySort.href,
      sortDirection: companySort.direction,
      render: (model) => (
        <a href={`/companies/${model.company.slug}`}>{model.company.name}</a>
      ),
    },
    {
      key: "released",
      label: "Released",
      sortHref: releasedSort.href,
      sortDirection: releasedSort.direction,
      render: (model) => formatRegistryDate(model.released_at, model.release_precision),
    },
    {
      key: "status",
      label: "Status",
      render: (model) => <span className="model-status" data-status={model.status.toLowerCase()}>{model.status}</span>,
    },
    {
      key: "benchmark-score",
      label: "Benchmark score",
      className: "numeric",
      render: (model) => <ModelBenchmarkScore result={model.featured_result} />,
    },
  ];
  const query = new URLSearchParams(currentSearch).get("q");

  return (
    <PageContainer className="registry-page">
      <PageHeader title="Models" description={modelCount(response.page.total_items)} />

      <section className="results-section" aria-labelledby="models-heading">
        {/* The page header already shows the count; the section keeps a heading for navigation. */}
        <h2 id="models-heading" className="visually-hidden">Registry models</h2>
          <LocalSearch
            action={pathname}
            currentSearch={currentSearch}
            label="Search models"
            placeholder="Search model names, aliases, or Registry Nos."
          />
        {response.data.length === 0 ? (
          <EmptyState
            title={query ? "No matching models" : "No models found"}
            description={query ? "Try a different model name, alias, or Registry No." : "The registry does not contain any models."}
          />
        ) : (
          <DataTable
            caption="Registry models"
            columns={columns}
            rows={response.data}
            getRowKey={(model) => model.registry_no}
          />
        )}
        <PaginationFor
          pathname={pathname}
          currentSearch={currentSearch}
          page={response.page.number}
          totalPages={response.page.total_pages}

          limit={response.page.limit}

          totalItems={response.page.total_items}
        />
      </section>
    </PageContainer>
  );
}

export function ModelDetailPage({
  response,
  currentSearch,
}: {
  response: ModelDetailResponse;
  currentSearch: string;
}) {
  const { model, result_page: page } = response.data;
  const allResults = response.data.all_results ?? response.data.results;
  const pathname = `/models/${model.registry_no}`;
  const benchmarkSort = sortLink(pathname, currentSearch, "benchmark", "asc");
  const sourceSort = sortLink(pathname, currentSearch, "source");
  const params = new URLSearchParams(currentSearch);
  const view = params.get("view") === "history" ? "history" : "latest";
  const query = params.get("q");
  const pivot = pivotResults(allResults);
  const usePivot = view === "latest" && usesEffortLayout(currentSearch, pivot);
  const offset = (page.number - 1) * page.limit;
  const fullSet = response.data.all_results !== undefined;
  const results = fullSet ? allResults.slice(offset, offset + page.limit) : allResults;
  const pivotRows = fullSet ? pivot.rows.slice(offset, offset + page.limit) : pivot.rows;
  const totalRows = usePivot ? pivot.rows.length : page.total_items;
  const totalPages = Math.ceil(totalRows / page.limit);
  const benchmarks = new Set(allResults.map(result => result.benchmark.slug)).size;
  const pivotColumns: TableColumn<PivotRow>[] = [
    { key: "benchmark", label: "Benchmark", className: "data-table__primary", sortHref: benchmarkSort.href, sortDirection: benchmarkSort.direction,
      render: ({ result }) => <span className="table-cell-stack"><BenchmarkLink benchmark={result.benchmark} version={result.benchmark_version} versionSlug={result.benchmark_version_slug} />
        {result.metric.name ? <span>{result.metric.name}</span> : null}
        {result.configuration ? <span>Configuration: {result.configuration.label}</span> : null}</span> },
    ...pivot.variants.map(variant => ({
      key: `effort-${variant}`, label: variant === OTHER_SETTINGS ? "Other settings" : effortDisplay(variant), className: "numeric pivot-score", phoneLabel: true,
      render: (row: PivotRow) => row.cells.has(variant) ? <div className="pivot-cell">{row.cells.get(variant)!.map(result =>
        <span key={result.result_key} className="pivot-observation" id={recordAnchor(result)}>
          <SourceLink href={result.primary_source_url} context={`${model.name}${result.reasoning_level ? ` (${result.reasoning_level})` : ""} on ${result.benchmark.name} ${result.benchmark_version}`}>{result.score.display}</SourceLink>
          {providerLabel(result) ? <span className="result-details"><span>Reported as: {providerLabel(result)}</span></span> : null}
          <ResultDetails result={result} compact showEvaluator />
          <RecordCite result={result} />
        </span>)} </div> : "–",
    })),
    { key: "source", label: "Source", sortHref: sourceSort.href, sortDirection: sourceSort.direction,
      render: row => <span className="table-cell-stack">{[...new Set([...row.cells.values()].flat().map(result => result.primary_source_url))].map(href => <SourceLink key={href} href={href} />)}</span> },
  ];
  const columns: TableColumn<ResultRow>[] = [
    {
      key: "benchmark",
      label: "Benchmark",
      className: "data-table__primary",
      sortHref: benchmarkSort.href,
      sortDirection: benchmarkSort.direction,
      render: (result) => (
        <span className="table-cell-stack">
          <BenchmarkLink benchmark={result.benchmark} version={result.benchmark_version} versionSlug={result.benchmark_version_slug} />
          {result.effort ? <span>Effort: {effortDisplay(result.effort)}</span> : null}
          {providerLabel(result) ? <span>Reported as: {providerLabel(result)}</span> : null}
          {result.configuration ? <span>Configuration: {result.configuration.label}</span> : null}
        </span>
      ),
    },
    {
      key: "score",
      label: "Score",
      className: "numeric",
      render: (result) => <ResultScoreLink result={result} />,
    },
    {
      key: "source",
      label: "Source",
      sortHref: sourceSort.href,
      sortDirection: sourceSort.direction,
      render: (result) => <ResultSource result={result} />,
    },
  ];

  return (
    <PageContainer className="registry-page">
      <PageHeader title={model.name} description={response.data.seo?.sentence}>

      <section className="model-metadata" aria-label="Model metadata">
        <MetadataRows
          inline
          items={[
            {
              label: "Released",
              value: formatRegistryDate(model.released_at, model.release_precision),
            },
            {
              label: "Provider",
              value: <a href={`/companies/${model.company.slug}`}>{model.company.name}</a>,
            },
            {
              label: "Source",
              value: <SourceLink href={model.source_url} />,
            },
            {
              label: "Registry No.",
              value: <a className="registry-number" href="https://github.com/rolling7ho/benchmark-registry#registry-numbers"
                title="Stable ID composed of a developer namespace and an assigned sequence.">
                {model.registry_no}<span className="visually-hidden"> — Stable ID composed of a developer namespace and an assigned sequence. Read about Registry numbering.</span>
              </a>,
            },
          ]}
        />
      </section>
        <a className="model-compare" href={comparisonHref({ ...parseComparisonState(""), models: [model.registry_no, ""] })}>Compare<span className="visually-hidden"> {model.name} with another model</span></a>
        <Cite input={{title:`${model.name} benchmark results`,path:pathname,registryNumber:model.registry_no}} />
        <ReportIssue page={pathname} model={model.name} source={model.source_url} />
      </PageHeader>

      <section className="results-section" aria-labelledby="benchmarks-heading">
        <div className="results-section__header">
          <div>
            <h2 id="benchmarks-heading">Benchmarks</h2>
            <p>{resultCount(page.total_items)} across {benchmarks.toLocaleString("en-US")} {benchmarks === 1 ? "benchmark" : "benchmarks"}</p>
          </div>
        </div>
        {totalRows > 25 || query ? <LocalSearch
          action={pathname}
          currentSearch={currentSearch}
          label="Search benchmarks"
          placeholder="Search benchmark names or aliases"
        /> : null}
        <Tabs
          label="Result view"
          items={[
            {
              href: queryHref(pathname, currentSearch, { view: "latest", page: null }),
              label: "Latest",
              active: view === "latest",
            },
            {
              href: queryHref(pathname, currentSearch, { view: "history", page: null }),
              label: "History",
              active: view === "history",
            },
          ]}
        />
        {view === "latest" && pivot.multiple ? <Tabs
          label="Table layout"
          items={[
            { href: queryHref(pathname, currentSearch, { layout: null, page: null }), label: "List", active: !usePivot },
            { href: queryHref(pathname, currentSearch, { layout: "effort", page: null }), label: "By effort", active: usePivot },
          ]}
        /> : null}
        {results.length === 0 ? (
          <EmptyState
            title={query ? "No matching benchmarks" : "No benchmark results"}
            description={query ? "Try a different benchmark name or alias." : "No results are available in this view."}
          />
        ) : (
          usePivot ? <DataTable
            caption={`Benchmark results by effort for ${model.name}`}
            columns={pivotColumns} rows={pivotRows} getRowKey={row => row.key}
          /> : <DataTable
            caption={`Benchmark results for ${model.name}`}
            columns={columns} rows={results} getRowKey={result => result.result_key} getRowId={recordAnchor}
          />
        )}
        <PaginationFor
          pathname={pathname}
          currentSearch={currentSearch}
          page={page.number}
          totalPages={totalPages}

          limit={page.limit}

          totalItems={totalRows}
        />
      </section>
      <RelatedModels models={response.data.seo?.related ?? []} label="Related models" />
      <RelatedLinks links={response.data.seo?.links} label="Benchmarks covered" />
    </PageContainer>
  );
}
