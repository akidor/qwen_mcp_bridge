/** SSE `intent` event로 받은 최근 의도 라벨을 보관.
 *
 *  지도 시각화 분기·카드 스타일 분기에서 참조한다.
 *  storage는 1개 슬롯 — 한 회 대화 turn 동안 유효한 latest intent.
 */
export type IntentLabel =
  | "locate_show"
  | "existing_buildings"
  | "existing_building_stats"
  | "new_build_candidates"
  | "parcel_detail"
  | "risk_check"
  | "nearby_context"
  | "general";

let _current: IntentLabel | null = null;
const _listeners = new Set<(label: IntentLabel | null) => void>();

export function setCurrentIntent(label: IntentLabel | null): void {
  _current = label;
  for (const cb of _listeners) {
    try { cb(label); } catch (e) { console.warn("intent listener failed", e); }
  }
}

export function getCurrentIntent(): IntentLabel | null {
  return _current;
}

export function subscribeIntent(cb: (label: IntentLabel | null) => void): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

/** intent label이 도구 결과를 지도에 그릴지 결정.
 *
 *  existing_buildings: find_parcels의 중간 후보들은 지도에 깔지 않는다 — 확인된 건축물만 후속 단계에서.
 *  locate_show / parcel_detail: 단일 필지 도구 결과는 그대로 그림.
 *  new_build_candidates / nearby_context: find_parcels 결과를 1차 후보로 그림.
 *  general / risk_check / null: 기본 동작 (그림).
 */
export function shouldRenderToolResult(
  toolName: string,
  intent: IntentLabel | null,
): boolean {
  if (intent === "existing_buildings") {
    // 중간 후보 집합 도구는 skip — 확인된 기존 건축물만 chat 카드/지도로.
    if (toolName === "analyze__find_parcels" || toolName === "locate__parcels_in_boundary") {
      return false;
    }
  }
  if (intent === "existing_building_stats") {
    // 통계 의도는 지도 위 후보 리스트가 본문이 아님.
    // find_parcels / find_existing_buildings의 features는 시각화를 억제.
    // examples 5건 정도는 backend에서 따로 보내므로 카드/팝업으로만 노출.
    if (
      toolName === "analyze__find_parcels" ||
      toolName === "locate__parcels_in_boundary" ||
      toolName === "analyze__find_existing_buildings"
    ) {
      return false;
    }
  }
  return true;
}
