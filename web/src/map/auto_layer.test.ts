import { describe, expect, test } from "vitest";
import { applyToolResult } from "./auto_layer";

const polygon = {
  type: "Polygon",
  coordinates: [[[127, 37], [127, 37.001], [127.001, 37.001], [127.001, 37], [127, 37]]],
};

function makeMap() {
  const sources = new Map<string, any>();
  const layers: any[] = [];
  const handlers: any[] = [];
  return {
    sources,
    layers,
    handlers,
    addSource(id: string, source: any) {
      sources.set(id, source);
    },
    addLayer(layer: any) {
      layers.push(layer);
    },
    on(...args: any[]) {
      handlers.push(args);
    },
    getCanvas() {
      return { style: {} };
    },
  };
}

describe("applyToolResult", () => {
  test("renders existing_building_statistics matched features as a parcel layer", () => {
    const map = makeMap();
    const result = JSON.stringify({
      matched_buildings: 1,
      features: [
        {
          type: "Feature",
          geometry: polygon,
          properties: {
            pnu: "P1",
            address: "문정동 118-17",
            matched_use: "다세대주택",
            state: "confirmed_existing_building",
          },
        },
      ],
    });

    const applied = applyToolResult(map, "analyze__existing_building_statistics", result);

    expect(applied.layerId).toMatch(/^existing-stats-/);
    expect(applied.message).toContain("필지 1개");
    expect(map.sources.get(`${applied.layerId}-src`).data.features).toHaveLength(1);
    expect(map.layers.map((layer) => layer.id)).toContain(`${applied.layerId}-fill`);
    expect(map.handlers.some((args) => args[0] === "click" && args[1] === `${applied.layerId}-fill`)).toBe(true);
  });
});
