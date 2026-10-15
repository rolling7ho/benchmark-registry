// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecordCite } from "./cite";
import { recordPermalink } from "./citation";
import { result } from "./compare-fixtures";

const row = result();
let container: HTMLDivElement;
let root: Root | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.appendChild(container);
});
afterEach(async () => {
  if (root) await act(() => root?.unmount()); root = undefined;
  document.body.replaceChildren(); vi.unstubAllGlobals();
});

it("prerenders only a permalink per record, with no citation, badge or report markup", () => {
  const html = renderToString(<RecordCite result={row} />);
  const element = document.createElement("div"); element.innerHTML = html;
  const link = element.querySelector("a.record-cite");
  expect(link?.getAttribute("href")).toBe(recordPermalink(row));
  expect(html).not.toMatch(/@misc|cite-details|issues\/new|badge/u);
});

it("builds the citation dialog from the row on demand and returns focus on close", async () => {
  root = createRoot(container);
  await act(() => root?.render(<RecordCite result={row} />));
  const button = container.querySelector("button.record-cite");
  if (!(button instanceof HTMLButtonElement)) throw new Error("Missing Cite button");
  expect(button.getAttribute("aria-haspopup")).toBe("dialog");
  expect(container.querySelector("dialog")).toBeNull();
  await act(() => button.click());
  const dialog = container.querySelector("dialog.record-dialog");
  expect(dialog?.getAttribute("aria-labelledby")).toBe(`cite-${row.result_key}`);
  expect(dialog?.textContent).toContain(`Record No. ${row.result_key}`);
  expect(dialog?.textContent).toContain("@misc{");
  expect(dialog?.querySelector(`a[href="${recordPermalink(row)}"]`)).not.toBeNull();
  expect(dialog?.querySelector('a[href*="github.com/rolling7ho/benchmark-registry/issues/new?"]')).not.toBeNull();
  await act(() => { dialog?.dispatchEvent(new Event("close")); });
  expect(container.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(container.querySelector("button.record-cite"));
});
