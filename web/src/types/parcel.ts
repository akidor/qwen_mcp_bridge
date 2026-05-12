/** 필지 판단 상태 모델 — 채팅 카드·지도 시각화 분기 공통 키.
 *
 *  - confirmed_existing_building: backend가 building.use 또는 building_floors raw에서
 *    사용자가 찾는 기존 건축물 유형(예: 다세대)을 직접 확인한 경우.
 *  - primary_candidate: 신축 후보 1차 — 지목·용도지역 기준은 통과했으나 토지이용계획·
 *    행위제한·접도·기존 건축물까지는 미확인.
 *  - unsuitable: 도로·하천·공원·학교 등 부적합 지목 또는 자연녹지·보전 등 강한 규제.
 *  - needs_verification: 일부 단계 통과했지만 핵심 단계(도로·규제 등) 미확인 — 사용자 추가 확인 필요.
 *  - insufficient_data: backend 응답에 핵심 필드 누락(building null + jimok 누락 등) — 판정 불가.
 */
export type ParcelState =
  | "confirmed_existing_building"
  | "primary_candidate"
  | "unsuitable"
  | "needs_verification"
  | "insufficient_data";

export interface ParcelBuilding {
  mainUse?: string;        // 주용도 (예: "다세대주택")
  floors?: number;          // 지상 층수
  totalAreaM2?: number;     // 연면적
  approvalDate?: string;    // 사용승인일 (ISO 또는 YYYY-MM-DD)
}

export interface ParcelRegulationSummary {
  landusePlanLabels?: string[];   // ["제2종일반주거지역", "토지거래허가구역", ...]
  bannedTop?: string[];            // 행위제한 금지 상위 N
  roadFaceWidthM?: number;         // 최광로 폭(m)
}

export interface ParcelRecord {
  pnu?: string;
  address: string;
  jibun?: string;
  areaM2?: number;
  jimok?: string;
  zone?: string;                  // 용도지역
  buildability?: string;          // 기존 ✅/⚠️/❌ 라벨(legacy)
  building?: ParcelBuilding;
  regulation?: ParcelRegulationSummary;
  state?: ParcelState;
  stateReason?: string[];         // 왜 그 state인지 — UI에 한 줄씩 노출 가능
  /** state가 backend 결정인지 frontend 1차 추론(inferState by jimok)인지 구분.
   *  true면 권위 있는 결정 — merge 시 authoritative하지 않은 state로 덮이지 않음.
   *  evaluate_buildability 결과와 features properties.state(find_existing_buildings 등)는 true,
   *  jimok-only inferState는 false. */
  stateAuthoritative?: boolean;
  geometry: any;
  bbox?: [number, number, number, number];
}

/** ParcelState → 사용자 친화 라벨 + tone.
 *  tone은 chip·outline 색상 분기 key.
 */
export function parcelStateLabel(state: ParcelState | undefined): {
  text: string;
  tone: "ok" | "warn" | "bad" | "neutral";
} {
  switch (state) {
    case "confirmed_existing_building":
      return { text: "기존 건축물 확인", tone: "ok" };
    case "primary_candidate":
      return { text: "1차 후보 (추가 확인 필요)", tone: "warn" };
    case "unsuitable":
      return { text: "부적합", tone: "bad" };
    case "needs_verification":
      return { text: "추가 확인 필요", tone: "warn" };
    case "insufficient_data":
      return { text: "정보 부족", tone: "neutral" };
    default:
      return { text: "", tone: "neutral" };
  }
}
