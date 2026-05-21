type ToolResultPageEntry = {
  name: string;
  pageCount: number;
  pages: Record<number, unknown[]>;
  totalFeatures?: number;
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

export type ToolResultPageProgress = {
  key: string;
  name: string;
  receivedPages: number;
  pageCount: number;
  receivedFeatures: number;
  totalFeatures?: number;
};

export type PagedToolResultResolution = {
  status: "unpaged" | "complete" | "missing_pages";
  resultText: string;
  progress?: ToolResultPageProgress;
  missingPages?: number[];
  warning?: string;
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
  const totalFeatures = Number(page?.visual_payload_page?.total_features);
  if (Number.isFinite(totalFeatures) && totalFeatures >= 0) {
    entry.totalFeatures = totalFeatures;
  }
  store[key] = entry;
  return getToolResultPageProgress(store, event);
}

export function getToolResultPageProgress(
  store: ToolResultPageStore,
  event: Pick<ToolResultPageEvent, "name" | "tool_call_id">,
): ToolResultPageProgress | undefined {
  const key = pageKey(event);
  const entry = key ? store[key] : undefined;
  if (!key || !entry) return undefined;
  return progressForEntry(key, entry);
}

export function resolvePagedToolResultText(
  store: ToolResultPageStore,
  event: ToolResultEndEvent,
  fallbackResultText?: string,
) {
  return resolvePagedToolResult(store, event, fallbackResultText).resultText;
}

export function resolvePagedToolResult(
  store: ToolResultPageStore,
  event: ToolResultEndEvent,
  fallbackResultText?: string,
): PagedToolResultResolution {
  const resultText = typeof event.result_text === "string" ? event.result_text : fallbackResultText ?? "";
  const key = pageKey(event);
  if (!key) return { status: "unpaged", resultText };

  const entry = store[key];
  const manifest = parseJson(resultText);
  const expectedPages = Number(manifest?.visual_payload_paged?.page_count ?? entry?.pageCount);
  if (!expectedPages) return { status: "unpaged", resultText };
  if (!entry) {
    return {
      status: "missing_pages",
      resultText,
      progress: {
        key,
        name: typeof event.name === "string" ? event.name : key,
        receivedPages: 0,
        pageCount: expectedPages,
        receivedFeatures: 0,
        totalFeatures: Number(manifest?.visual_payload_paged?.feature_count) || undefined,
      },
      missingPages: Array.from({ length: expectedPages }, (_value, index) => index),
      warning: `시각화 페이지 수신 불완전: 0/${expectedPages} pages`,
    };
  }

  const features: unknown[] = [];
  const missingPages: number[] = [];
  for (let index = 0; index < expectedPages; index += 1) {
    const pageFeatures = entry.pages[index];
    if (!pageFeatures) {
      missingPages.push(index);
      continue;
    }
    features.push(...pageFeatures);
  }
  if (missingPages.length > 0) {
    const progress = progressForEntry(key, entry);
    return {
      status: "missing_pages",
      resultText,
      progress,
      missingPages,
      warning: `시각화 페이지 수신 불완전: ${progress.receivedPages}/${expectedPages} pages`,
    };
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
  return { status: "complete", resultText: JSON.stringify(hydrated), progress: progressForEntry(key, entry) };
}

function pageKey(event: ToolResultPageEvent | ToolResultEndEvent) {
  if (typeof event.tool_call_id === "string" && event.tool_call_id) return event.tool_call_id;
  if (typeof event.name === "string" && event.name) return event.name;
  return "";
}

function progressForEntry(key: string, entry: ToolResultPageEntry): ToolResultPageProgress {
  return {
    key,
    name: entry.name,
    receivedPages: Object.keys(entry.pages).length,
    pageCount: entry.pageCount,
    receivedFeatures: Object.values(entry.pages).reduce((sum, features) => sum + features.length, 0),
    totalFeatures: entry.totalFeatures,
  };
}

function parseJson(value: unknown): any | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
