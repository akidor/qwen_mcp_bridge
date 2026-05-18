import { describe, expect, it } from "vitest";

import { buildRoutingDebugRows, routingDebugFromEvent } from "./routingDebug";

describe("routing debug panel helpers", () => {
  it("normalizes routing_debug SSE events and keeps expected route fields", () => {
    const debug = routingDebugFromEvent({
      type: "routing_debug",
      intent: "existing_building_stats",
      bucket: "기존 건축물 통계 조회",
      anchor_type: "address",
      anchor_text: "문정동 118-15",
      required_chain: "locate__search_address -> analyze__existing_building_statistics",
      visual_suppress: "intermediate_parcel_candidates",
      routing_hint: "### 브릿지 라우팅 힌트",
    });

    expect(debug).toEqual({
      intent: "existing_building_stats",
      bucket: "기존 건축물 통계 조회",
      anchorType: "address",
      anchorText: "문정동 118-15",
      requiredChain: "locate__search_address -> analyze__existing_building_statistics",
      radiusM: undefined,
      visualRequired: undefined,
      visualSuppress: "intermediate_parcel_candidates",
      answerMode: undefined,
      answerGuard: undefined,
      routingHint: "### 브릿지 라우팅 힌트",
    });
  });

  it("builds compact rows with actual tool order", () => {
    const rows = buildRoutingDebugRows(
      {
        intent: "existing_building_stats",
        bucket: "기존 건축물 통계 조회",
        anchorType: "address",
        anchorText: "문정동 118-15",
        requiredChain: "locate__search_address -> analyze__existing_building_statistics",
        visualSuppress: "intermediate_parcel_candidates",
        routingHint: "",
      },
      [
        { kind: "start", name: "locate__search_address" },
        { kind: "end", name: "locate__search_address", error: false },
        { kind: "end", name: "analyze__existing_building_statistics", error: false },
      ],
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        { label: "intent", value: "existing_building_stats" },
        { label: "bucket", value: "기존 건축물 통계 조회" },
        { label: "anchor", value: "address · 문정동 118-15" },
        { label: "actual tools", value: "locate__search_address -> analyze__existing_building_statistics" },
        { label: "visual", value: "suppress: intermediate_parcel_candidates" },
      ]),
    );
  });

  it("adds no chain warning when completed tools contain the required chain in order", () => {
    const rows = buildRoutingDebugRows(
      {
        intent: "existing_building_stats",
        requiredChain: "locate__search_address -> analyze__existing_building_statistics",
        routingHint: "",
      },
      [
        { kind: "end", name: "locate__search_address", error: false },
        { kind: "end", name: "analyze__existing_building_statistics", error: false },
      ],
    );

    expect(rows.find((row) => row.label === "chain warning")).toBeUndefined();
  });

  it("compares only executable tool names when required chain includes context anchors and args", () => {
    const rows = buildRoutingDebugRows(
      {
        intent: "existing_building_stats",
        requiredChain:
          "current_parcel_centroid -> analyze__find_parcels(lng, lat, radius_m=300) -> analyze__existing_building_statistics(lng, lat, radius_m=300, use_keywords=[\"다세대\"])",
        routingHint: "",
      },
      [
        { kind: "end", name: "analyze__find_parcels", error: false },
        { kind: "end", name: "analyze__existing_building_statistics", error: false },
      ],
    );

    expect(rows.find((row) => row.label === "chain warning")).toBeUndefined();
  });

  it("warns when a completed tool is missing from the required chain", () => {
    const rows = buildRoutingDebugRows(
      {
        intent: "existing_building_stats",
        requiredChain: "locate__search_address -> analyze__existing_building_statistics",
        routingHint: "",
      },
      [{ kind: "end", name: "locate__search_address", error: false }],
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        {
          label: "chain warning",
          value: "missing required tool: analyze__existing_building_statistics",
        },
      ]),
    );
  });

  it("warns when completed tools contain the required chain out of order", () => {
    const rows = buildRoutingDebugRows(
      {
        intent: "existing_building_stats",
        requiredChain: "locate__search_address -> analyze__existing_building_statistics",
        routingHint: "",
      },
      [
        { kind: "end", name: "analyze__existing_building_statistics", error: false },
        { kind: "end", name: "locate__search_address", error: false },
      ],
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        {
          label: "chain warning",
          value:
            "order mismatch: expected locate__search_address -> analyze__existing_building_statistics; actual analyze__existing_building_statistics -> locate__search_address",
        },
      ]),
    );
  });
});
