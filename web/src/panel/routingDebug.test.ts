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
});
