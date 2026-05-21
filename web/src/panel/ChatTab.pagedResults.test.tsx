import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import ChatTab from "./ChatTab";

const polygon = {
  type: "Polygon",
  coordinates: [[[127, 37], [127.001, 37], [127.001, 37.001], [127, 37.001], [127, 37]]],
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
});

describe("ChatTab paged tool result streaming", () => {
  test("hydrates multiple tool_result_page events before rendering the final map result", async () => {
    const onToolResult = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => makeStreamingResponse([
      sse({
        type: "tool_call_start",
        name: "analyze__existing_building_statistics",
        tool_call_id: "call_stats",
        args_preview: "{}",
      }),
      sse({
        type: "tool_result_page",
        name: "analyze__existing_building_statistics",
        tool_call_id: "call_stats",
        page_index: 1,
        page_count: 2,
        result_text: JSON.stringify({
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry: polygon, properties: { pnu: "P2", address: "문정동 118-17" } }],
          visual_payload_page: { page_index: 1, page_count: 2, total_features: 2 },
        }),
      }),
      sse({
        type: "tool_result_page",
        name: "analyze__existing_building_statistics",
        tool_call_id: "call_stats",
        page_index: 0,
        page_count: 2,
        result_text: JSON.stringify({
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry: polygon, properties: { pnu: "P1", address: "문정동 118-15" } }],
          visual_payload_page: { page_index: 0, page_count: 2, total_features: 2 },
        }),
      }),
      sse({
        type: "tool_call_end",
        name: "analyze__existing_building_statistics",
        tool_call_id: "call_stats",
        duration_ms: 42,
        result_size: 120,
        error: false,
        result_text: JSON.stringify({
          type: "FeatureCollection",
          matched_buildings: 2,
          features: [],
          visual_payload_paged: { feature_count: 2, page_count: 2 },
        }),
      }),
      sse({
        id: "final",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { content: "시각화했습니다." }, finish_reason: null }],
      }),
      "data: [DONE]\n\n",
    ])));

    renderChatTab(onToolResult);
    const textarea = container!.querySelector("textarea")!;
    await act(async () => {
      setTextareaValue(textarea, "문정동 118-15 근처 다세대주택 시각화");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      container!.querySelector<HTMLButtonElement>("button[type='submit']")!.click();
    });
    await waitFor(() => expect(onToolResult).toHaveBeenCalledTimes(1));

    const [toolName, resultText] = onToolResult.mock.calls[0];
    const result = JSON.parse(resultText);
    expect(toolName).toBe("analyze__existing_building_statistics");
    expect(result.features.map((feature: any) => feature.properties.pnu)).toEqual(["P1", "P2"]);
    expect(result.visual_payload_paged.hydrated).toBe(true);
    await act(async () => {
      container!.querySelector<HTMLButtonElement>(".tool-badge-row")!.click();
    });
    expect(container!.textContent).toContain("2/2 pages");
    expect(container!.textContent).toContain("2/2 features");
  });
});

function renderChatTab(onToolResult: (toolName: string, resultText: string) => void) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <ChatTab
        model="fake-model"
        systemPrompt=""
        disableThinking={false}
        onToolResult={onToolResult}
      />,
    );
  });
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
}

function makeStreamingResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    text: async () => "",
  } as Response;
}

function sse(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function waitFor(assertion: () => void) {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < 1000) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }
  throw lastError;
}
