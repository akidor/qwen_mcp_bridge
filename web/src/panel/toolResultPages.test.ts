import { describe, expect, test } from "vitest";

import {
  createToolResultPageStore,
  rememberToolResultPage,
  resolvePagedToolResultText,
} from "./toolResultPages";

const polygon = {
  type: "Polygon",
  coordinates: [[[127, 37], [127.001, 37], [127.001, 37.001], [127, 37.001], [127, 37]]],
};

describe("tool result page hydration", () => {
  test("reconstructs paged FeatureCollection result text for the matching tool call", () => {
    const store = createToolResultPageStore();
    rememberToolResultPage(store, {
      type: "tool_result_page",
      name: "analyze__existing_building_statistics",
      tool_call_id: "call_1",
      page_index: 1,
      page_count: 2,
      result_text: JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: polygon, properties: { pnu: "P2" } }] }),
    });
    rememberToolResultPage(store, {
      type: "tool_result_page",
      name: "analyze__existing_building_statistics",
      tool_call_id: "call_1",
      page_index: 0,
      page_count: 2,
      result_text: JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: polygon, properties: { pnu: "P1" } }] }),
    });
    const manifest = JSON.stringify({
      type: "FeatureCollection",
      features: [],
      matched_buildings: 2,
      visual_payload_paged: { feature_count: 2, page_count: 2 },
    });

    const resolved = JSON.parse(resolvePagedToolResultText(store, {
      name: "analyze__existing_building_statistics",
      tool_call_id: "call_1",
      result_text: manifest,
    }));

    expect(resolved.features.map((feature: any) => feature.properties.pnu)).toEqual(["P1", "P2"]);
    expect(resolved.matched_buildings).toBe(2);
    expect(resolved.visual_payload_paged.hydrated).toBe(true);
    expect(store["call_1"]).toBeUndefined();
  });

  test("leaves manifest unchanged until every page arrives", () => {
    const store = createToolResultPageStore();
    rememberToolResultPage(store, {
      type: "tool_result_page",
      name: "analyze__existing_building_statistics",
      tool_call_id: "call_2",
      page_index: 0,
      page_count: 2,
      result_text: JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: polygon, properties: { pnu: "P1" } }] }),
    });
    const manifest = JSON.stringify({
      type: "FeatureCollection",
      features: [],
      visual_payload_paged: { feature_count: 2, page_count: 2 },
    });

    expect(resolvePagedToolResultText(store, {
      name: "analyze__existing_building_statistics",
      tool_call_id: "call_2",
      result_text: manifest,
    })).toBe(manifest);
  });
});
