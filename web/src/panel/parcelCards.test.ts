import { describe, expect, test } from "vitest";
import {
  parseParcelCards,
  collectParcelCards,
  type ToolEvent,
  type ParcelCard,
} from "./ChatTab";

const _polygon = {
  type: "Polygon",
  coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
};

describe("parseParcelCards", () => {
  test("evaluate_buildability 결과는 authoritative state + 단일 카드", () => {
    const result = JSON.stringify({
      pnu: "P1",
      address: "양재동 344-7",
      juso: "서울 양재동",
      jibun: "344-7",
      area_m2: 300,
      jimok: "대",
      zone: "제2종일반주거지역",
      state: "primary_candidate",
      state_reason: ["지목 대 통과", "용도지역 통과", "접면도로 6.0m 통과"],
      building: { use: "단독주택", floors: 2 },
      max_road_width_m: 6.0,
    });
    const cards = parseParcelCards("analyze__evaluate_buildability", result);
    expect(cards).toHaveLength(1);
    const c = cards![0];
    expect(c.pnu).toBe("P1");
    expect(c.state).toBe("primary_candidate");
    expect(c.stateReason).toEqual(["지목 대 통과", "용도지역 통과", "접면도로 6.0m 통과"]);
    expect(c.stateAuthoritative).toBe(true);
    expect(c.building).toEqual({ use: "단독주택", floors: 2 });
    expect(c.maxRoadWidthM).toBe(6.0);
    expect(c.zone).toBe("제2종일반주거지역");
  });

  test("find_existing_buildings FeatureCollection — matched_use + confirmed state 보존", () => {
    const result = JSON.stringify({
      total: 1,
      features: [
        {
          type: "Feature",
          geometry: _polygon,
          properties: {
            pnu: "P2",
            address: "역삼동 1",
            jimok: "대",
            area_m2: 250,
            matched_use: "다세대주택",
            state: "confirmed_existing_building",
            state_reason: ["건축물대장 use=다세대주택"],
            building: { use: "다세대주택" },
          },
        },
      ],
    });
    const cards = parseParcelCards("analyze__find_existing_buildings", result);
    expect(cards).toHaveLength(1);
    const c = cards![0];
    expect(c.state).toBe("confirmed_existing_building");
    expect(c.stateAuthoritative).toBe(true);
    expect(c.matchedUse).toBe("다세대주택");
    expect(c.building).toEqual({ use: "다세대주택" });
  });

  test("existing_building_statistics FeatureCollection — 통계 matched parcel 카드를 만든다", () => {
    const result = JSON.stringify({
      matched_buildings: 1,
      features: [
        {
          type: "Feature",
          geometry: _polygon,
          properties: {
            pnu: "P4",
            address: "문정동 118-17",
            jimok: "대",
            area_m2: 120,
            matched_use: "다세대주택",
            state: "confirmed_existing_building",
            state_reason: ["통계 매칭 용도: 다세대주택"],
            building: { main_purpose: "다세대주택" },
          },
        },
      ],
    });
    const cards = parseParcelCards("analyze__existing_building_statistics", result);
    expect(cards).toHaveLength(1);
    expect(cards![0].pnu).toBe("P4");
    expect(cards![0].state).toBe("confirmed_existing_building");
    expect(cards![0].stateAuthoritative).toBe(true);
    expect(cards![0].matchedUse).toBe("다세대주택");
  });

  test("find_parcels: backend state 없으면 inferState 사용, authoritative=false", () => {
    const result = JSON.stringify({
      features: [
        {
          type: "Feature",
          geometry: _polygon,
          properties: { pnu: "P3", address: "동", jibun: "1", area_m2: 100, jimok: "대" },
        },
      ],
    });
    const cards = parseParcelCards("analyze__find_parcels", result);
    expect(cards).toHaveLength(1);
    const c = cards![0];
    expect(c.state).toBe("primary_candidate"); // inferState
    expect(c.stateAuthoritative).toBe(false);
  });
});

describe("collectParcelCards merge authoritative protection", () => {
  function mkEnd(name: string, cards: ParcelCard[]): ToolEvent {
    return {
      kind: "end",
      name,
      durationMs: 0,
      resultSize: 0,
      error: false,
      parcelCards: cards,
    };
  }

  test("find_parcels(inferState)가 먼저, evaluate(authoritative)가 뒤 — authoritative가 덮음", () => {
    const inferCard: ParcelCard = {
      pnu: "P1",
      address: "동 1",
      jimok: "대",
      state: "primary_candidate",
      stateReason: ["지목 대 통과"],
      stateAuthoritative: false,
      geometry: _polygon,
    };
    const authCard: ParcelCard = {
      pnu: "P1",
      address: "동 1",
      jimok: "대",
      state: "unsuitable",
      stateReason: ["접면도로 3m — 4m 미만"],
      stateAuthoritative: true,
      geometry: { type: "Point", coordinates: [0, 0] },
    };
    const out = collectParcelCards([mkEnd("analyze__find_parcels", [inferCard]), mkEnd("analyze__evaluate_buildability", [authCard])]);
    expect(out).toHaveLength(1);
    expect(out[0].state).toBe("unsuitable");
    expect(out[0].stateReason).toEqual(["접면도로 3m — 4m 미만"]);
    // geometry는 polygon 유지 (placeholder Point가 덮으면 안 됨)
    expect(out[0].geometry.type).toBe("Polygon");
  });

  test("evaluate(authoritative)가 먼저, find_parcels(inferState)가 뒤 — authoritative 보호", () => {
    const authCard: ParcelCard = {
      pnu: "P1",
      address: "동 1",
      jimok: "대",
      state: "unsuitable",
      stateReason: ["접면도로 3m"],
      stateAuthoritative: true,
      geometry: { type: "Point", coordinates: [0, 0] },
    };
    const inferCard: ParcelCard = {
      pnu: "P1",
      address: "동 1",
      jimok: "대",
      state: "primary_candidate",
      stateReason: ["지목 대 통과"],
      stateAuthoritative: false,
      geometry: _polygon,
    };
    const out = collectParcelCards([mkEnd("analyze__evaluate_buildability", [authCard]), mkEnd("analyze__find_parcels", [inferCard])]);
    expect(out).toHaveLength(1);
    expect(out[0].state).toBe("unsuitable"); // authoritative 유지
    expect(out[0].stateReason).toEqual(["접면도로 3m"]);
    expect(out[0].geometry.type).toBe("Polygon"); // polygon으로 교체됨
  });

  test("matched_use·building 등 잔여 필드 빈 칸 채움", () => {
    const eval_: ParcelCard = {
      pnu: "P1",
      address: "동 1",
      state: "confirmed_existing_building",
      stateAuthoritative: true,
      matchedUse: "다세대주택",
      building: { use: "다세대주택", floors: 4 },
      geometry: _polygon,
    };
    const find_: ParcelCard = {
      pnu: "P1",
      address: "동 1",
      areaM2: 250,
      jimok: "대",
      stateAuthoritative: false,
      geometry: _polygon,
    };
    const out = collectParcelCards([mkEnd("analyze__find_existing_buildings", [eval_]), mkEnd("analyze__find_parcels", [find_])]);
    expect(out).toHaveLength(1);
    expect(out[0].areaM2).toBe(250);
    expect(out[0].jimok).toBe("대");
    expect(out[0].matchedUse).toBe("다세대주택");
    expect(out[0].building).toEqual({ use: "다세대주택", floors: 4 });
  });
});
