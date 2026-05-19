type ToolResultPageEntry = {
  name: string;
  pageCount: number;
  pages: Record<number, unknown[]>;
};

export type ToolResultPageStore = Record<string, ToolResultPageEntry>;

export type ToolResultPageEvent = {
  type?: string;
  name?: string;
  tool_call_id?: string;
  page_index?: number;
  page_count?: number;
  result_text?: string;
};

export type ToolResultEndEvent = {
  name?: string;
  tool_call_id?: string;
  result_text?: string;
};

export function createToolResultPageStore(): ToolResultPageStore {
  return {};
}

export function rememberToolResultPage(store: ToolResultPageStore, event: ToolResultPageEvent) {
  const key = pageKey(event);
  if (!key || typeof event.name !== "string") return;
  const pageIndex = typeof event.page_index === "number" ? event.page_index : undefined;
  const pageCount = typeof event.page_count === "number" ? event.page_count : undefined;
  if (pageIndex === undefined || pageCount === undefined || pageCount <= 0) return;

  const page = parseJson(event.result_text);
  const features = Array.isArray(page?.features) ? page.features : undefined;
  if (!features) return;

  const entry = store[key] ?? { name: event.name, pageCount, pages: {} };
  entry.pageCount = pageCount;
  entry.pages[pageIndex] = features;
  store[key] = entry;
}

export function resolvePagedToolResultText(
  store: ToolResultPageStore,
  event: ToolResultEndEvent,
  fallbackResultText?: string,
) {
  const resultText = typeof event.result_text === "string" ? event.result_text : fallbackResultText ?? "";
  const key = pageKey(event);
  if (!key) return resultText;

  const entry = store[key];
  if (!entry) return resultText;

  const manifest = parseJson(resultText);
  const expectedPages = Number(manifest?.visual_payload_paged?.page_count ?? entry.pageCount);
  if (!expectedPages || Object.keys(entry.pages).length < expectedPages) return resultText;

  const features: unknown[] = [];
  for (let index = 0; index < expectedPages; index += 1) {
    const pageFeatures = entry.pages[index];
    if (!pageFeatures) return resultText;
    features.push(...pageFeatures);
  }
  delete store[key];

  const hydrated = {
    ...(manifest && typeof manifest === "object" ? manifest : {}),
    type: "FeatureCollection",
    features,
    visual_payload_paged: {
      ...(manifest?.visual_payload_paged && typeof manifest.visual_payload_paged === "object"
        ? manifest.visual_payload_paged
        : {}),
      hydrated: true,
    },
  };
  return JSON.stringify(hydrated);
}

function pageKey(event: ToolResultPageEvent | ToolResultEndEvent) {
  if (typeof event.tool_call_id === "string" && event.tool_call_id) return event.tool_call_id;
  if (typeof event.name === "string" && event.name) return event.name;
  return "";
}

function parseJson(value: unknown): any | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
