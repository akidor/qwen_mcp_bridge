/** Tool 결과 텍스트(JSON)를 파싱해 MapLibre source/layer로 자동 추가. */
import maplibregl from "maplibre-gl";

// 필지 popup용 글로벌 instance — 한 번에 1개만 노출.
let _parcelPopup: maplibregl.Popup | null = null;
let _parcelDetailPopup: maplibregl.Popup | null = null;
const _parcelPopupLayers = new Set<string>();
const _parcelDetailCache = new Map<string, Promise<ParcelExternalDetails>>();

type ParcelExternalDetails = {
  landuseplan?: any;
  landactions?: any;
  errors: string[];
};

function textOf(value: any): string {
  if (value == null) return "";
  return String(value).trim();
}

function compactPlanText(value: any): string {
  return textOf(value).replace(/\s+/g, " ");
}

function composeParcelAddress(props: any): string {
  const addrField = textOf(props.address ?? props.juso);
  const jibun = textOf(props.jibun);
  const usesServerComposed = addrField.endsWith(jibun) && jibun.length > 0;
  const composed = jibun && addrField && !usesServerComposed ? `${addrField} ${jibun}` : addrField || jibun;
  return composed || "(주소 미상)";
}

function parcelProperties(raw: any): Record<string, any> {
  if (!raw || typeof raw !== "object") return {};
  return {
    pnu: raw.pnu,
    address: raw.address,
    juso: raw.juso,
    jibun: raw.jibun,
    area_m2: raw.area_m2 ?? raw.area,
    jimok: raw.jimok,
    zone: raw.zone ?? raw.zone_name,
    land_use: raw.land_use ?? raw.landuse,
    bcr_ratio: raw.bcr_ratio ?? raw.bcr,
    far_ratio: raw.far_ratio ?? raw.far,
  };
}

function formatAreaM2(value: any): string {
  const area = Number(value);
  if (!Number.isFinite(area) || area <= 0) return "";
  return `${Math.round(area).toLocaleString()}㎡ (${Math.round(area / 3.3058).toLocaleString()}평)`;
}

function createNode(tag: string, className?: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function appendSection(parent: HTMLElement, title: string): HTMLElement {
  const section = createNode("section", "parcel-popup-section");
  section.appendChild(createNode("div", "parcel-popup-section-title", title));
  parent.appendChild(section);
  return section;
}

// === 지목 분류 — shared/jimok.py와 동일 ===
const NON_BUILDABLE_JIMOK = new Set([
  "도","도로","천","하천","구","구거","유","유지","제","제방","수","수도용지",
  "공","공원","체","체육용지","운","운동장","광","광천지","양","양어장","묘","묘지","사","사적지","종","종교용지",
]);
const DIFFICULT_JIMOK = new Set(["전","답","과","과수원","목","목장용지","임","임야"]);
const BUILDABLE_JIMOK = new Set(["대","대지","잡","잡종지"]);
function jimokTone(jimok: string): "ok" | "warn" | "bad" | "none" {
  const j = (jimok || "").trim();
  if (!j) return "none";
  if (BUILDABLE_JIMOK.has(j)) return "ok";
  if (DIFFICULT_JIMOK.has(j)) return "warn";
  if (NON_BUILDABLE_JIMOK.has(j)) return "bad";
  return "warn";
}
function jimokIcon(tone: "ok" | "warn" | "bad" | "none"): string {
  if (tone === "ok") return "✅";
  if (tone === "bad") return "❌";
  if (tone === "warn") return "⚠️";
  return "❓";
}

function buildJimokChip(jimok: string): HTMLElement | null {
  const j = (jimok || "").trim();
  if (!j) return null;
  const tone = jimokTone(j);
  const chip = createNode("span", `parcel-chip parcel-chip--build-${tone}`);
  chip.appendChild(createNode("span", "parcel-chip-icon", jimokIcon(tone)));
  chip.appendChild(createNode("span", "parcel-chip-text", j));
  return chip;
}

function buildZoneChip(zone: string): HTMLElement | null {
  const z = textOf(zone);
  if (!z) return null;
  const chip = createNode("span", "parcel-chip parcel-chip--zone", z);
  return chip;
}

function buildAreaChip(areaM2: any): HTMLElement | null {
  const area = Number(areaM2);
  if (!Number.isFinite(area) || area <= 0) return null;
  const chip = createNode(
    "span",
    "parcel-chip parcel-chip--area",
    `${Math.round(area).toLocaleString()}㎡ · ${Math.round(area / 3.3058).toLocaleString()}평`,
  );
  return chip;
}

/** 두 popup이 공유하는 헤더 — 주소 + chip row. */
function buildPopupHeader(props: any, variant: "hover" | "detail"): HTMLElement {
  const header = createNode("div", `parcel-popup-header parcel-popup-header--${variant}`);
  const addressRow = createNode("div", "parcel-popup-address-row");
  addressRow.appendChild(createNode("span", "parcel-popup-pin", "📍"));
  addressRow.appendChild(createNode("span", "parcel-popup-address", composeParcelAddress(props)));
  header.appendChild(addressRow);

  const chipRow = createNode("div", "parcel-popup-chip-row");
  const jimokChip = buildJimokChip(textOf(props.jimok));
  if (jimokChip) chipRow.appendChild(jimokChip);
  const zoneChip = buildZoneChip(textOf(props.zone ?? props.zone_name ?? props.land_use ?? props.landuse));
  if (zoneChip) chipRow.appendChild(zoneChip);
  const areaChip = buildAreaChip(props.area_m2 ?? props.area);
  if (areaChip) chipRow.appendChild(areaChip);
  if (chipRow.childElementCount > 0) header.appendChild(chipRow);
  return header;
}

/** 토지이용·규제 — plan은 bullet list, actions는 별도 카운트+chip+전체 details 섹션. */
function appendCombinedRegulation(
  root: HTMLElement,
  plan: any,
  actions: any,
): boolean {
  const planRows = summarizeLandUsePlan(plan);
  let any = false;
  if (planRows.length) {
    const section = appendSection(root, "📋 토지이용계획");
    const list = createNode("ul", "parcel-popup-bullets");
    for (const row of planRows) {
      const li = createNode("li", "parcel-popup-bullet");
      li.appendChild(createNode("span", "parcel-popup-bullet-label", row.label));
      li.appendChild(createNode("span", "parcel-popup-bullet-value", row.value));
      list.appendChild(li);
    }
    section.appendChild(list);
    any = true;
  }
  if (appendLandActions(root, actions)) any = true;
  return any;
}

function appendSkeleton(root: HTMLElement, lines: number = 3): HTMLElement {
  const section = appendSection(root, "📋 토지이용·규제");
  const sk = createNode("div", "parcel-popup-skeleton");
  for (let i = 0; i < lines; i += 1) {
    sk.appendChild(createNode("div", "parcel-popup-skeleton-bar"));
  }
  section.appendChild(sk);
  return section;
}

function appendMetaDetails(root: HTMLElement, props: any): void {
  const pnu = textOf(props.pnu);
  const meta = document.createElement("details");
  meta.className = "parcel-popup-meta";
  const summary = createNode("summary", "parcel-popup-meta-summary", "🛈 메타 정보");
  meta.appendChild(summary);
  if (pnu) {
    const row = createNode("div", "parcel-popup-meta-row");
    row.appendChild(createNode("span", "parcel-popup-meta-label", "PNU"));
    const codeWrap = createNode("span", "parcel-popup-meta-code-wrap");
    codeWrap.appendChild(createNode("code", "parcel-popup-meta-code", pnu));
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "parcel-popup-copy-btn";
    copyBtn.title = "PNU 복사";
    copyBtn.setAttribute("aria-label", "PNU 복사");
    copyBtn.textContent = "📋";
    copyBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await navigator.clipboard?.writeText(pnu);
        copyBtn.textContent = "✓";
        setTimeout(() => { copyBtn.textContent = "📋"; }, 1500);
      } catch {
        // clipboard API 미지원/권한 거부 — silent.
      }
    });
    codeWrap.appendChild(copyBtn);
    row.appendChild(codeWrap);
    meta.appendChild(row);
  }
  const disc = createNode("div", "parcel-popup-meta-disclaimer", "공공데이터 기반 · 매수·신축 전 현장·등기·건축물대장 확인 필요");
  meta.appendChild(disc);
  root.appendChild(meta);
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function fetchParcelExternalDetails(pnu: string): Promise<ParcelExternalDetails> {
  const cached = _parcelDetailCache.get(pnu);
  if (cached) return cached;
  const encoded = encodeURIComponent(pnu);
  const promise = Promise.allSettled([
    fetchJson(`/wmsapi/landuseplan?pnu=${encoded}`),
    fetchJson(`/wmsapi/landactions?pnu=${encoded}`),
  ]).then(([plan, actions]) => {
    const errors: string[] = [];
    if (plan.status === "rejected") errors.push(`토지이용계획 ${plan.reason?.message ?? "조회 실패"}`);
    if (actions.status === "rejected") errors.push(`행위제한 ${actions.reason?.message ?? "조회 실패"}`);
    return {
      landuseplan: plan.status === "fulfilled" ? plan.value : undefined,
      landactions: actions.status === "fulfilled" ? actions.value : undefined,
      errors,
    };
  });
  _parcelDetailCache.set(pnu, promise);
  return promise;
}

function summarizeLandUsePlan(plan: any): Array<{ label: string; value: string }> {
  if (!plan || typeof plan !== "object") return [];
  const rows: Array<{ label: string; value: string }> = [];
  for (const [group, rels] of Object.entries(plan).slice(0, 4)) {
    if (!rels || typeof rels !== "object") continue;
    for (const rel of ["포함", "접함", "저촉"]) {
      const raw = (rels as any)[rel];
      if (!raw || raw === "정보없음") continue;
      const items = Array.isArray(raw) ? raw : [raw];
      const value = items.map(compactPlanText).filter(Boolean).slice(0, 3).join("\n");
      if (value) rows.push({ label: `${group} · ${rel}`, value });
    }
  }
  return rows;
}

type ActionsZoneSummary = {
  zone: string;
  possibleCount: number;
  bannedCount: number;
  allPossible: string[];
  allBanned: string[];
};

/** backend의 landactions.{zone}.{가능|금지}는 list of {usetarget, action}.
 *  usetarget이 단일 시설명일 수도, 콤마-구분 거대 문자열일 수도 있어 둘 다 평탄화. */
function extractActionNames(items: any[]): string[] {
  const names: string[] = [];
  for (const it of items) {
    const raw = textOf(it?.usetarget);
    if (!raw) continue;
    if (raw.includes(",")) {
      for (const part of raw.split(/[,，]\s*/)) {
        const p = part.trim();
        if (p) names.push(p);
      }
    } else {
      names.push(raw);
    }
  }
  // dedup + 빈 string 제거
  return Array.from(new Set(names)).filter(Boolean);
}

function parseLandActions(actions: any): ActionsZoneSummary[] {
  if (!actions || typeof actions !== "object") return [];
  const out: ActionsZoneSummary[] = [];
  for (const [zone, grouped] of Object.entries(actions).slice(0, 4)) {
    const possible = Array.isArray((grouped as any)?.가능) ? (grouped as any).가능 : [];
    const banned = Array.isArray((grouped as any)?.금지) ? (grouped as any).금지 : [];
    const allPossible = extractActionNames(possible);
    const allBanned = extractActionNames(banned);
    if (!allPossible.length && !allBanned.length) continue;
    out.push({
      zone: textOf(zone),
      possibleCount: allPossible.length,
      bannedCount: allBanned.length,
      allPossible,
      allBanned,
    });
  }
  return out;
}

/** 행위제한 — zone별 카운트 chip + 주요 금지 8개 chip cloud + 전체 details. */
function appendLandActions(root: HTMLElement, actions: any): boolean {
  const summaries = parseLandActions(actions);
  if (!summaries.length) return false;
  const section = appendSection(root, "🚫 행위제한");
  for (const s of summaries) {
    const block = createNode("div", "parcel-popup-action-block");
    if (s.zone) block.appendChild(createNode("div", "parcel-popup-action-zone", s.zone));
    const counts = createNode("div", "parcel-popup-action-counts");
    counts.appendChild(createNode("span", "parcel-action-count-chip ok", `🟢 가능 ${s.possibleCount.toLocaleString()}`));
    counts.appendChild(createNode("span", "parcel-action-count-chip bad", `🔴 금지 ${s.bannedCount.toLocaleString()}`));
    block.appendChild(counts);
    if (s.allBanned.length > 0) {
      const cloud = createNode("div", "parcel-popup-action-cloud");
      cloud.appendChild(createNode("div", "parcel-popup-action-cloud-title", "주요 금지 시설"));
      const chips = createNode("div", "parcel-popup-action-chip-row");
      for (const name of s.allBanned.slice(0, 8)) {
        chips.appendChild(createNode("span", "parcel-popup-action-chip bad", name));
      }
      cloud.appendChild(chips);
      block.appendChild(cloud);
    }
    const total = s.possibleCount + s.bannedCount;
    if (total > 8) {
      const details = document.createElement("details");
      details.className = "parcel-popup-action-details";
      const summaryEl = createNode(
        "summary",
        "parcel-popup-action-details-summary",
        `전체 ${total.toLocaleString()}건 보기`,
      );
      details.appendChild(summaryEl);
      const innerWrap = createNode("div", "parcel-popup-action-details-inner");
      if (s.allBanned.length) {
        const noSec = createNode("div", "parcel-popup-action-details-section");
        noSec.appendChild(createNode("div", "parcel-popup-action-details-title bad", `🔴 금지 ${s.bannedCount.toLocaleString()}`));
        const noRow = createNode("div", "parcel-popup-action-chip-row");
        for (const n of s.allBanned) noRow.appendChild(createNode("span", "parcel-popup-action-chip bad", n));
        noSec.appendChild(noRow);
        innerWrap.appendChild(noSec);
      }
      if (s.allPossible.length) {
        const okSec = createNode("div", "parcel-popup-action-details-section");
        okSec.appendChild(createNode("div", "parcel-popup-action-details-title ok", `🟢 가능 ${s.possibleCount.toLocaleString()}`));
        const okRow = createNode("div", "parcel-popup-action-chip-row");
        for (const n of s.allPossible) okRow.appendChild(createNode("span", "parcel-popup-action-chip ok", n));
        okSec.appendChild(okRow);
        innerWrap.appendChild(okSec);
      }
      details.appendChild(innerWrap);
      block.appendChild(details);
    }
    section.appendChild(block);
  }
  return true;
}

function buildParcelDetailContent(
  props: any,
  detail: { status: "loading" | "ready" | "error"; external?: ParcelExternalDetails; error?: string },
): HTMLElement {
  const root = createNode("div", "parcel-detail-popup");
  root.appendChild(buildPopupHeader(props, "detail"));

  const pnu = textOf(props.pnu);
  if (!pnu) {
    const sect = appendSection(root, "📋 토지이용·규제");
    sect.appendChild(createNode("div", "parcel-popup-muted", "PNU 정보가 없어 외부 상세 API를 조회할 수 없습니다."));
    appendMetaDetails(root, props);
    return root;
  }
  if (detail.status === "loading") {
    appendSkeleton(root, 3);
    appendMetaDetails(root, props);
    return root;
  }
  if (detail.status === "error") {
    const sect = appendSection(root, "📋 토지이용·규제");
    sect.appendChild(createNode("div", "parcel-popup-muted", `⚠️ ${detail.error ?? "상세정보 조회 실패"}`));
    appendMetaDetails(root, props);
    return root;
  }

  const hasRows = appendCombinedRegulation(root, detail.external?.landuseplan, detail.external?.landactions);
  const errors = detail.external?.errors ?? [];
  if (!hasRows) {
    const sect = appendSection(root, "📋 토지이용·규제");
    sect.appendChild(createNode("div", "parcel-popup-muted", "해당 필지에 표시할 규제 정보가 없습니다."));
  } else if (errors.length) {
    // 부분 실패: 섹션 끝에 muted 추가
    const last = root.lastElementChild;
    if (last) last.appendChild(createNode("div", "parcel-popup-muted parcel-popup-partial-error", `⚠️ ${errors.join(" · ")}`));
  }
  appendMetaDetails(root, props);
  return root;
}

function attachParcelPopup(map: any, fillLayerId: string) {
  if (_parcelPopupLayers.has(fillLayerId)) return;
  _parcelPopupLayers.add(fillLayerId);

  const onMove = (e: any) => {
    const f = e.features?.[0];
    if (!f) return;
    const props = f.properties ?? {};
    map.getCanvas().style.cursor = "pointer";
    if (!_parcelPopup) {
      _parcelPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
    }
    // setDOMContent로 chip이 들어간 glass-card 헤더 그대로 사용. 모든 텍스트는 createElement+textContent라 XSS 안전.
    const wrap = createNode("div", "parcel-hover-popup");
    wrap.appendChild(buildPopupHeader(props, "hover"));
    _parcelPopup.setLngLat(e.lngLat).setDOMContent(wrap).addTo(map);
    const popupEl = _parcelPopup.getElement();
    popupEl?.classList.add("parcel-popup-wrap");
    popupEl?.classList.add("parcel-hover-popup-wrap");
  };
  const onLeave = () => {
    map.getCanvas().style.cursor = "";
    _parcelPopup?.remove();
  };
  const onClick = (e: any) => {
    const f = e.features?.[0];
    if (!f) return;
    const props = f.properties ?? {};
    e.originalEvent?.stopPropagation?.();
    _parcelPopup?.remove();
    if (!_parcelDetailPopup) {
      _parcelDetailPopup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        offset: 10,
        maxWidth: "380px",
      });
    }
    const popup = _parcelDetailPopup;
    popup
      .setLngLat(e.lngLat)
      .setDOMContent(buildParcelDetailContent(props, { status: "loading" }))
      .addTo(map);
    popup.getElement()?.classList.add("parcel-popup-wrap");
    popup.getElement()?.classList.add("parcel-detail-popup-wrap");

    const pnu = textOf(props.pnu);
    if (!pnu) return;
    fetchParcelExternalDetails(pnu)
      .then((external) => {
        if (_parcelDetailPopup !== popup) return;
        popup.setDOMContent(buildParcelDetailContent(props, { status: "ready", external }));
        popup.getElement()?.classList.add("parcel-popup-wrap");
        popup.getElement()?.classList.add("parcel-detail-popup-wrap");
      })
      .catch((err) => {
        if (_parcelDetailPopup !== popup) return;
        popup.setDOMContent(buildParcelDetailContent(props, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        }));
        popup.getElement()?.classList.add("parcel-popup-wrap");
        popup.getElement()?.classList.add("parcel-detail-popup-wrap");
      });
  };
  map.on("mousemove", fillLayerId, onMove);
  map.on("mouseleave", fillLayerId, onLeave);
  map.on("click", fillLayerId, onClick);
}


const COLOR_PARCEL_FILL = "#7c3aed";
const COLOR_PARCEL_OUTLINE = "#5b21b6";
const COLOR_PARCEL_LABEL = "#5b21b6";
const COLOR_ISOCHRONE = "#22c55e";
const COLOR_ISOCHRONE_LABEL = "#15803d";
const COLOR_POI = "#0ea5e9";
const COLOR_POI_LABEL = "#0c4a6e";
const COLOR_ROUTE = "#f59e0b";
const COLOR_BUFFER = "#a8a29e";
const COLOR_AGGREGATION = "#737373";

// POI 좌표 jitter — 동일 좌표 점들이 겹치지 않게 미세 흐트림 (~0.0001° ≈ 11m).
const POI_JITTER_DEG = 0.0001;

type Geom = { type: string; coordinates: any };

interface ApplyResult {
  layerId: string | null;
  message: string;
  bbox?: [number, number, number, number];
}

let _seq = 0;
function uniqueId(prefix: string): string {
  _seq += 1;
  return `${prefix}-${_seq}`;
}

function isGeometry(g: any): g is Geom {
  return g && typeof g === "object" && typeof g.type === "string" && "coordinates" in g;
}

function bboxOfPolygon(coords: any): [number, number, number, number] | undefined {
  try {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const ring = coords[0]; // outer ring of Polygon
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return [minX, minY, maxX, maxY];
  } catch {
    return undefined;
  }
}

/** Point coordinates 미세 jitter — 같은 좌표 POI들이 한 점에 겹치는 걸 흐트림. */
function jitterPointFc(fc: any): any {
  if (fc?.type !== "FeatureCollection" || !Array.isArray(fc.features)) return fc;
  const features = fc.features.map((f: any) => {
    if (f?.geometry?.type !== "Point") return f;
    const c = f.geometry.coordinates;
    if (!Array.isArray(c) || c.length < 2) return f;
    const dx = (Math.random() - 0.5) * 2 * POI_JITTER_DEG;
    const dy = (Math.random() - 0.5) * 2 * POI_JITTER_DEG;
    return {
      ...f,
      geometry: { ...f.geometry, coordinates: [c[0] + dx, c[1] + dy, ...c.slice(2)] },
    };
  });
  return { ...fc, features };
}

/** 라벨 layer 추가 (overlap 허용 — 모든 POI 항상 보이게). */
function addLabelLayer(
  map: any,
  layerId: string,
  sourceId: string,
  textField: any,
  color: string,
  options: { offset?: [number, number]; size?: number } = {},
): void {
  map.addLayer({
    id: `${layerId}-label`,
    type: "symbol",
    source: sourceId,
    layout: {
      "text-field": textField,
      "text-size": options.size ?? 11,
      "text-anchor": "top",
      "text-offset": options.offset ?? [0, 0.6],
      "text-allow-overlap": true,        // 겹쳐도 표시
      "text-ignore-placement": true,     // 다른 라벨 placement 영향 X
      "text-padding": 0,
      "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
    },
    paint: {
      "text-color": color,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
      "text-halo-blur": 0.5,
    },
  });
}

function addPolygonLayer(
  map: any,
  geom: Geom,
  layerId: string,
  fillColor: string,
  outlineColor: string,
  options: {
    outlineDash?: number[];
    labelText?: string;
    properties?: Record<string, any>;
    attachParcelInfo?: boolean;
  } = {},
): ApplyResult {
  const sourceId = `${layerId}-src`;
  if (map.getSource(sourceId)) return { layerId, message: "이미 존재" };
  const properties: Record<string, any> = { ...(options.properties ?? {}) };
  if (options.labelText) properties.label = options.labelText;
  map.addSource(sourceId, {
    type: "geojson",
    data: { type: "Feature", properties, geometry: geom },
  });
  map.addLayer({
    id: `${layerId}-fill`,
    type: "fill",
    source: sourceId,
    paint: { "fill-color": fillColor, "fill-opacity": 0.25 },
  });
  map.addLayer({
    id: `${layerId}-line`,
    type: "line",
    source: sourceId,
    paint: {
      "line-color": outlineColor,
      "line-width": 1.5,
      ...(options.outlineDash ? { "line-dasharray": options.outlineDash } : {}),
    },
  });
  if (options.labelText) {
    addLabelLayer(map, layerId, sourceId, ["get", "label"], COLOR_PARCEL_LABEL, {
      offset: [0, 0],
      size: 12,
    });
  }
  if (options.attachParcelInfo) {
    attachParcelPopup(map, `${layerId}-fill`);
  }
  const bbox = geom.type === "Polygon" ? bboxOfPolygon(geom.coordinates) : undefined;
  return { layerId, message: `polygon 추가됨 (${layerId})`, bbox };
}

function addPointsLayer(map: any, fc: any, layerId: string, color: string): ApplyResult {
  const sourceId = `${layerId}-src`;
  if (map.getSource(sourceId)) return { layerId, message: "이미 존재" };
  const jittered = jitterPointFc(fc);
  map.addSource(sourceId, { type: "geojson", data: jittered });
  map.addLayer({
    id: `${layerId}-pt`,
    type: "circle",
    source: sourceId,
    paint: {
      "circle-color": color,
      "circle-radius": 5,
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 1,
    },
  });
  // POI 라벨: poi_nm > label > big_category 순 우선. 모두 없으면 빈 문자열.
  addLabelLayer(
    map,
    layerId,
    sourceId,
    [
      "coalesce",
      ["get", "poi_nm"],
      ["get", "label"],
      ["get", "big_category"],
      "",
    ],
    COLOR_POI_LABEL,
    { offset: [0, 0.8], size: 11 },
  );
  return { layerId, message: `points ${jittered.features?.length ?? 0}개 추가됨 (${layerId})` };
}

function addLineLayer(map: any, fc: any, layerId: string, color: string): ApplyResult {
  const sourceId = `${layerId}-src`;
  if (map.getSource(sourceId)) return { layerId, message: "이미 존재" };
  map.addSource(sourceId, { type: "geojson", data: fc });
  // dlof_landing 스타일 — 흰 outline 5px + 색 dashed 3px (가독성)
  map.addLayer({
    id: `${layerId}-ln-bg`,
    type: "line",
    source: sourceId,
    paint: { "line-color": "#ffffff", "line-width": 5, "line-opacity": 0.95 },
  });
  map.addLayer({
    id: `${layerId}-ln`,
    type: "line",
    source: sourceId,
    paint: {
      "line-color": color,
      "line-width": 3,
      "line-dasharray": [2, 2],
    },
  });
  // duration / distance 라벨 (LineString placement)
  addLabelLayer(
    map,
    layerId,
    sourceId,
    [
      "case",
      ["has", "duration"],
      ["concat", ["to-string", ["round", ["get", "duration"]]], "분"],
      "",
    ],
    color,
    { offset: [0, 0], size: 12 },
  );
  return { layerId, message: `route 추가됨 (${layerId})` };
}

function addIsochroneFc(map: any, fc: any, layerId: string): ApplyResult {
  const sourceId = `${layerId}-src`;
  if (map.getSource(sourceId)) return { layerId, message: "이미 존재" };
  map.addSource(sourceId, { type: "geojson", data: fc });
  map.addLayer({
    id: `${layerId}-fill`,
    type: "fill",
    source: sourceId,
    paint: { "fill-color": COLOR_ISOCHRONE, "fill-opacity": 0.18 },
  });
  map.addLayer({
    id: `${layerId}-line`,
    type: "line",
    source: sourceId,
    paint: { "line-color": COLOR_ISOCHRONE, "line-width": 2, "line-dasharray": [2, 2] },
  });
  // 라벨: feature.properties.tobreak (초)을 분으로 표기 — "5분 내 도달"
  addLabelLayer(
    map,
    layerId,
    sourceId,
    [
      "case",
      ["has", "tobreak"],
      ["concat", ["to-string", ["round", ["/", ["get", "tobreak"], 60]]], "분 내 도달"],
      ["coalesce", ["get", "name"], ""],
    ],
    COLOR_ISOCHRONE_LABEL,
    { offset: [0, 0], size: 13 },
  );
  return { layerId, message: `등시선 추가됨 (${layerId})` };
}

/** 도구 결과 텍스트를 MapLibre layer로 자동 변환. 인식 못 하면 silent (null). */
export function applyToolResult(map: any, toolName: string, resultText: string): ApplyResult {
  if (!map || !resultText) return { layerId: null, message: "map/result 없음" };
  let raw: any;
  try {
    raw = JSON.parse(resultText);
  } catch {
    return { layerId: null, message: "JSON 파싱 실패" };
  }
  // urban_mcp 도구 결과는 {ok:true, result:{...}} envelope. 일부는 bare(passthrough)도 가능 — 둘 다 처리.
  const parsed: any = raw && raw.ok === true && raw.result ? raw.result : raw;

  // locate__get_parcel — geometry: Polygon (라벨 없음, 위치만 강조)
  if (toolName === "locate__get_parcel") {
    const geom = parsed?.geometry;
    if (isGeometry(geom)) {
      return addPolygonLayer(map, geom, uniqueId("parcel"), COLOR_PARCEL_FILL, COLOR_PARCEL_OUTLINE, {
        properties: parcelProperties(parsed),
        attachParcelInfo: true,
      });
    }
  }
  // locate__parcels_union — { geometry: Polygon }
  if (toolName === "locate__parcels_union") {
    const geom = parsed?.geometry;
    if (isGeometry(geom)) {
      return addPolygonLayer(map, geom, uniqueId("parcels-union"), COLOR_PARCEL_FILL, COLOR_PARCEL_OUTLINE, {
        properties: parcelProperties(parsed),
        attachParcelInfo: true,
      });
    }
  }
  // locate__parcel_at_point — { found: bool, feature: { geometry } } (라벨 없음)
  if (toolName === "locate__parcel_at_point") {
    const geom = parsed?.feature?.geometry;
    if (isGeometry(geom)) {
      return addPolygonLayer(map, geom, uniqueId("parcel-pt"), COLOR_PARCEL_FILL, COLOR_PARCEL_OUTLINE, {
        properties: parcelProperties(parsed?.feature?.properties ?? parsed),
        attachParcelInfo: true,
      });
    }
  }
  // locate__parcels_in_boundary / analyze__find_parcels / analyze__find_existing_buildings
  // — FeatureCollection 또는 {features: [...]}
  if (
    toolName === "locate__parcels_in_boundary" ||
    toolName === "analyze__find_parcels" ||
    toolName === "analyze__find_existing_buildings"
  ) {
    const fc =
      parsed?.type === "FeatureCollection"
        ? parsed
        : Array.isArray(parsed?.features)
        ? { type: "FeatureCollection", features: parsed.features }
        : null;
    if (fc && fc.features && fc.features.length > 0) {
      const idPrefix =
        toolName === "analyze__find_existing_buildings"
          ? "find-existing"
          : toolName === "analyze__find_parcels"
          ? "find-parcels"
          : "parcels-boundary";
      const id = uniqueId(idPrefix);
      const sourceId = `${id}-src`;
      map.addSource(sourceId, { type: "geojson", data: fc });
      map.addLayer({
        id: `${id}-fill`,
        type: "fill",
        source: sourceId,
        paint: { "fill-color": COLOR_AGGREGATION, "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: `${id}-line`,
        type: "line",
        source: sourceId,
        paint: { "line-color": COLOR_AGGREGATION, "line-width": 1.5 },
      });
      attachParcelPopup(map, `${id}-fill`);
      // bbox 계산해 모든 필지가 보이게 fit
      let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
      for (const f of fc.features) {
        const geom = f?.geometry;
        if (!geom || geom.type !== "Polygon") continue;
        for (const ring of geom.coordinates) {
          for (const [lng, lat] of ring) {
            if (lng < minLng) minLng = lng;
            if (lat < minLat) minLat = lat;
            if (lng > maxLng) maxLng = lng;
            if (lat > maxLat) maxLat = lat;
          }
        }
      }
      const bbox: [number, number, number, number] | undefined =
        isFinite(minLng) && minLng <= maxLng && minLat <= maxLat
          ? [minLng, minLat, maxLng, maxLat]
          : undefined;
      return { layerId: id, message: `필지 ${fc.features.length}개 추가됨`, bbox };
    }
  }
  // reach__isochrone_walk/bike/transit/car — { feature_collection: FeatureCollection }
  if (/^reach__isochrone_(walk|bike|transit|car)$/.test(toolName)) {
    const fc = parsed?.feature_collection;
    if (fc?.type === "FeatureCollection") {
      return addIsochroneFc(map, fc, uniqueId(toolName.replace("reach__", "")));
    }
  }
  // reach__poi_in_radius / poi_in_isochrone — { result: { points: FeatureCollection } } or { points: ... }
  if (toolName === "reach__poi_in_radius" || toolName === "reach__poi_in_isochrone") {
    const points = parsed?.result?.points ?? parsed?.points;
    if (points?.type === "FeatureCollection") {
      return addPointsLayer(map, points, uniqueId("poi"), COLOR_POI);
    }
  }
  // reach__shortest_trip — FeatureCollection (LineString features)
  if (toolName === "reach__shortest_trip" && parsed?.type === "FeatureCollection") {
    return addLineLayer(map, parsed, uniqueId("route"), COLOR_ROUTE);
  }
  // analyze__make_buffer — Polygon (raw geometry)
  if (toolName === "analyze__make_buffer" && isGeometry(parsed)) {
    return addPolygonLayer(map, parsed, uniqueId("buffer"), "transparent", COLOR_BUFFER, {
      outlineDash: [3, 3],
    });
  }
  // analyze__parcel_aggregation — FeatureCollection
  if (toolName === "analyze__parcel_aggregation" && parsed?.type === "FeatureCollection") {
    const id = uniqueId("parcels-agg");
    const sourceId = `${id}-src`;
    map.addSource(sourceId, { type: "geojson", data: parsed });
    map.addLayer({
      id: `${id}-fill`,
      type: "fill",
      source: sourceId,
      paint: { "fill-color": COLOR_AGGREGATION, "fill-opacity": 0.12 },
    });
    map.addLayer({
      id: `${id}-line`,
      type: "line",
      source: sourceId,
      paint: { "line-color": COLOR_AGGREGATION, "line-width": 1 },
    });
    return { layerId: id, message: `필지 집계 추가됨 (${id})` };
  }

  if (toolName === "design__generate_scene") {
    try {
      const parsedDesign = JSON.parse(resultText);
      const result = parsedDesign?.result ?? parsedDesign;
      const sceneData = result?.scene_data;
      const candidates = sceneData?.candidates ?? [];
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return { layerId: null, message: "design.generate_scene: candidates 없음" };
      }
      const layerKey = `${Date.now()}`;
      const r = addMassExtrusion(map, layerKey, candidates);
      if (!r.added) {
        return { layerId: null, message: "design.generate_scene: footprint 누락 — 지도 시각화 skip" };
      }
      return {
        layerId: `mass-${layerKey}`,
        message: `design 매스 ${candidates.length}개 fill-extrusion`,
        bbox: r.bbox,
      };
    } catch (e) {
      return { layerId: null, message: `design 결과 파싱 실패: ${e instanceof Error ? e.message : e}` };
    }
  }

  return { layerId: null, message: `'${toolName}'은 자동 layer 매핑 없음` };
}

/** layer 표시/숨김 토글. */
export function toggleLayer(map: any, layerId: string, visible: boolean): void {
  // sub-layer 접미사 (-fill / -line / -pt / -ln / -ln-bg / -label)를 한꺼번에 토글.
  const suffixes = ["-fill", "-line", "-pt", "-ln", "-ln-bg", "-label"];
  const visibility = visible ? "visible" : "none";
  for (const sfx of suffixes) {
    const id = `${layerId}${sfx}`;
    if (map.getLayer(id)) {
      try { map.setLayoutProperty(id, "visibility", visibility); } catch {}
    }
  }
}

/** layer를 fitBounds로 zoom. bbox는 호출자가 보관. */
export function fitToBbox(map: any, bbox: [number, number, number, number]): void {
  map.fitBounds(bbox, { padding: 60, duration: 600 });
}

/** Layer의 fill opacity 변경 (0~1). fill sub-layer 있는 경우만 적용. */
export function setLayerOpacity(map: any, layerId: string, opacity: number): void {
  const safe = Math.max(0, Math.min(1, opacity));
  const fillLayer = `${layerId}-fill`;
  if (map.getLayer(fillLayer)) {
    try { map.setPaintProperty(fillLayer, "fill-opacity", safe); } catch {}
  }
}

/** Layer가 fill sub-layer를 가지고 있는지 — opacity slider 표시 여부 결정용. */
export function hasFillLayer(map: any, layerId: string): boolean {
  if (!map) return false;
  return !!map.getLayer(`${layerId}-fill`);
}

// === WMS raster helpers (P13) ===

const WMS_BASE_URL = "/geoserver";

function wmsTileUrl(layerName: string, cqlFilter?: string, styles?: string): string {
  const ws = layerName.startsWith("dlof:") ? "/dlof/wms" : "/wms";
  const params = new URLSearchParams({
    service: "WMS",
    version: "1.1.0",
    request: "GetMap",
    layers: layerName,
    styles: styles ?? "",
    format: "image/png",
    transparent: "true",
    srs: "EPSG:3857",
    width: "256",
    height: "256",
    bbox: "{bbox-epsg-3857}",
  });
  if (cqlFilter) params.set("cql_filter", cqlFilter);
  // URLSearchParams가 {bbox-epsg-3857}의 중괄호를 percent-encode하므로 디코드 복원
  const qs = params.toString().replace("%7Bbbox-epsg-3857%7D", "{bbox-epsg-3857}");
  return `${WMS_BASE_URL}${ws}?${qs}`;
}

export function addWmsLayer(
  map: any,
  layerKey: string,
  layerName: string,
  cqlFilter?: string,
  styles?: string,
): void {
  if (!map) return;
  const sourceId = `wms-${layerKey}`;
  const layerId = `wms-${layerKey}`;
  if (map.getLayer(layerId)) return;
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "raster",
      tiles: [wmsTileUrl(layerName, cqlFilter, styles)],
      tileSize: 256,
    });
  }
  map.addLayer({
    id: layerId,
    type: "raster",
    source: sourceId,
    paint: { "raster-opacity": 0.8 },
  });
}

export function removeWmsLayer(map: any, layerKey: string): void {
  if (!map) return;
  const sourceId = `wms-${layerKey}`;
  const layerId = `wms-${layerKey}`;
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

export function setWmsOpacity(map: any, layerKey: string, opacity: number): void {
  if (!map) return;
  const layerId = `wms-${layerKey}`;
  if (!map.getLayer(layerId)) return;
  const clamped = Math.max(0, Math.min(1, opacity));
  map.setPaintProperty(layerId, "raster-opacity", clamped);
}

export function hasWmsLayer(map: any, layerKey: string): boolean {
  if (!map) return false;
  return !!map.getLayer(`wms-${layerKey}`);
}

// === P16 Design mass extrusion ===

const MASS_COLORS = ["#e74c3c", "#3498db", "#2ecc71"]; // 후보별 색상 (반투명)

function _candidateFootprintGeoJSON(candidate: any): GeoJSON.Polygon | null {
  // candidate에 직접 GeoJSON Polygon 형태의 footprint가 있으면 사용. 없으면 null.
  if (candidate?.geometry?.type === "Polygon") return candidate.geometry as GeoJSON.Polygon;
  return null;
}

function _candidateMaxHeight(candidate: any): number {
  return candidate?.metrics?.height ?? 0;
}

export function addMassExtrusion(
  map: any,
  layerKey: string,
  candidates: any[],
): { added: boolean; bbox?: [number, number, number, number] } {
  if (!map) return { added: false };
  const sourceId = `mass-${layerKey}`;
  const layerId = `mass-${layerKey}`;
  if (map.getLayer(layerId)) {
    map.removeLayer(layerId);
  }
  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }

  const features: GeoJSON.Feature[] = [];
  let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
  candidates.forEach((c, idx) => {
    const fp = _candidateFootprintGeoJSON(c);
    if (!fp) return;
    const height = _candidateMaxHeight(c);
    features.push({
      type: "Feature",
      geometry: fp,
      properties: {
        candidate_id: c.id,
        height,
        color: MASS_COLORS[idx % MASS_COLORS.length],
      },
    });
    for (const ring of fp.coordinates) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
    }
  });

  if (features.length === 0) return { added: false };

  map.addSource(sourceId, {
    type: "geojson",
    data: { type: "FeatureCollection", features },
  });
  map.addLayer({
    id: layerId,
    type: "fill-extrusion",
    source: sourceId,
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.5,
    },
  });

  return { added: true, bbox: [minLng, minLat, maxLng, maxLat] };
}

// === 개별 필지 focus highlight (chat 카드 클릭) ===
const PARCEL_FOCUS_SRC = "parcel-focus-src";
const PARCEL_FOCUS_FILL = "parcel-focus-fill";
const PARCEL_FOCUS_LINE = "parcel-focus-line";
let _focusPopup: maplibregl.Popup | null = null;

/** 채팅 parcel-card 클릭 → bbox로 flyTo + 강조 outline + 주소 popup. 이전 focus는 교체. */
export function focusParcel(
  map: any,
  feature: {
    geometry: any;
    bbox?: [number, number, number, number];
    address?: string;
    areaM2?: number;
    jimok?: string;
    pnu?: string;
  },
): void {
  if (!map || !feature?.geometry) return;
  // 기존 focus layer 정리
  try { if (map.getLayer(PARCEL_FOCUS_LINE)) map.removeLayer(PARCEL_FOCUS_LINE); } catch {}
  try { if (map.getLayer(PARCEL_FOCUS_FILL)) map.removeLayer(PARCEL_FOCUS_FILL); } catch {}
  try { if (map.getSource(PARCEL_FOCUS_SRC)) map.removeSource(PARCEL_FOCUS_SRC); } catch {}
  try {
    map.addSource(PARCEL_FOCUS_SRC, {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry: feature.geometry },
    });
    map.addLayer({
      id: PARCEL_FOCUS_FILL,
      type: "fill",
      source: PARCEL_FOCUS_SRC,
      paint: { "fill-color": "#f97316", "fill-opacity": 0.25 },
    });
    map.addLayer({
      id: PARCEL_FOCUS_LINE,
      type: "line",
      source: PARCEL_FOCUS_SRC,
      paint: { "line-color": "#ea580c", "line-width": 2.5 },
    });
  } catch (e) {
    console.warn("[focusParcel] layer add failed:", e);
  }
  // bbox로 fit. bbox 없으면 geometry에서 계산.
  let bbox = feature.bbox;
  if (!bbox && feature.geometry?.type === "Polygon") {
    bbox = bboxOfPolygon(feature.geometry.coordinates);
  }
  if (bbox) {
    try {
      map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 80, maxZoom: 18, duration: 700 });
    } catch (e) {
      console.warn("[focusParcel] fitBounds failed:", e);
    }
  }
  // 주소 popup — hover popup과 동일 glass-card 헤더(chip 포함).
  try {
    if (_focusPopup) _focusPopup.remove();
    if (feature.address && bbox) {
      const cx = (bbox[0] + bbox[2]) / 2;
      const cy = (bbox[1] + bbox[3]) / 2;
      const props = {
        address: feature.address,
        area_m2: feature.areaM2,
        jimok: feature.jimok,
        pnu: feature.pnu,
      };
      const wrap = createNode("div", "parcel-hover-popup");
      wrap.appendChild(buildPopupHeader(props, "hover"));
      _focusPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 8 })
        .setLngLat([cx, cy])
        .setDOMContent(wrap)
        .addTo(map);
      const el = _focusPopup.getElement();
      el?.classList.add("parcel-popup-wrap");
      el?.classList.add("parcel-hover-popup-wrap");
    }
  } catch (e) {
    console.warn("[focusParcel] popup failed:", e);
  }
}

/** 도구 결과로 추가된 모든 layer 정리 (clear_layers tools/all 용). */
export function clearAllToolLayers(map: any): number {
  if (!map?.getStyle) return 0;
  const style = map.getStyle();
  const layers: any[] = style?.layers ?? [];
  // 실제 prefix: parcel- / parcels- (parcel-pt-, parcels-union-, parcels-agg-, parcels-boundary- 포함),
  // isochrone_walk- / isochrone_bike- / isochrone_transit- / isochrone_car- (uniqueId가 underscore 보존),
  // poi- / route- / buffer- / find-parcels- / mass- .
  const targets = layers.filter((l) =>
    typeof l.id === "string" &&
    (l.id.startsWith("parcel-") ||
     l.id.startsWith("parcels-") ||
     l.id.startsWith("isochrone_") ||
     l.id.startsWith("poi-") ||
     l.id.startsWith("route-") ||
     l.id.startsWith("buffer-") ||
     l.id.startsWith("find-parcels") ||
     l.id.startsWith("find-existing") ||
     l.id.startsWith("mass-") ||
     l.id.startsWith("parcel-focus-"))
  );
  // -fill / -line / -label 등 sub-layer가 같은 source를 공유 — source 제거는 dedup 후 한 번만.
  const sourcesToRemove = new Set<string>();
  for (const l of targets) {
    try { map.removeLayer(l.id); } catch {}
    if (typeof l.source === "string") sourcesToRemove.add(l.source);
  }
  for (const src of sourcesToRemove) {
    try { map.removeSource(src); } catch {}
  }
  return targets.length;
}
