import { describe, expect, test } from "vitest";
import { shouldRenderToolResult } from "./intentStore";

describe("shouldRenderToolResult", () => {
  test("existing_buildings → find_parcels는 skip", () => {
    expect(shouldRenderToolResult("analyze__find_parcels", "existing_buildings")).toBe(false);
    expect(shouldRenderToolResult("locate__parcels_in_boundary", "existing_buildings")).toBe(false);
  });

  test("existing_buildings → find_existing_buildings는 그린다", () => {
    expect(shouldRenderToolResult("analyze__find_existing_buildings", "existing_buildings")).toBe(true);
  });

  test("existing_building_stats → 후보 집합 도구는 모두 skip (통계가 본문)", () => {
    expect(shouldRenderToolResult("analyze__find_parcels", "existing_building_stats")).toBe(false);
    expect(shouldRenderToolResult("locate__parcels_in_boundary", "existing_building_stats")).toBe(false);
    expect(shouldRenderToolResult("analyze__find_existing_buildings", "existing_building_stats")).toBe(false);
  });

  test("existing_building_stats → 통계 도구 자체는 그린다(텍스트 답변용)", () => {
    expect(shouldRenderToolResult("analyze__existing_building_statistics", "existing_building_stats")).toBe(true);
  });

  test("new_build_candidates → find_parcels는 그린다", () => {
    expect(shouldRenderToolResult("analyze__find_parcels", "new_build_candidates")).toBe(true);
    expect(shouldRenderToolResult("analyze__evaluate_buildability", "new_build_candidates")).toBe(true);
  });

  test("parcel_detail / risk_check도 단일 결과는 그대로 그린다", () => {
    expect(shouldRenderToolResult("locate__get_parcel", "parcel_detail")).toBe(true);
    expect(shouldRenderToolResult("analyze__evaluate_buildability", "risk_check")).toBe(true);
  });

  test("intent 미설정(null)이면 기본 동작 — 그린다", () => {
    expect(shouldRenderToolResult("analyze__find_parcels", null)).toBe(true);
    expect(shouldRenderToolResult("locate__get_parcel", null)).toBe(true);
  });
});
