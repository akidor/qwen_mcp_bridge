export type NodeKind = "interface" | "bridge" | "model" | "policy" | "tooling" | "domain" | "data" | "render";

export interface ArchNode {
  id: string;
  label: string;
  caption: string;
  kind: NodeKind;
  position: [number, number, number];
  details: string[];
}

export interface ArchLink {
  from: string;
  to: string;
  label: string;
  curve?: number;
}

export const KIND_COLORS: Record<NodeKind, string> = {
  interface: "#38bdf8",
  bridge: "#f59e0b",
  model: "#a78bfa",
  policy: "#22c55e",
  tooling: "#fb7185",
  domain: "#2dd4bf",
  data: "#f97316",
  render: "#e5e7eb",
};

export const MAP_RENDERER_NODE_IDS = [
  "toolResultParser",
  "intentVisualFilter",
  "mapFailureGuards",
  "autoLayerManager",
  "popupCardBuilder",
  "viewportController",
  "mapState",
] as const;

export const MCP_POOL_NODE_IDS = [
  "poolToolCatalog",
  "poolDomainSpawner",
  "poolDispatchRouter",
  "poolArgCoercer",
  "poolHealthMonitor",
  "poolUiTools",
] as const;

export const FLOW_NODE_IDS = [
  "user",
  "web",
  "bridge",
  "policy",
  "qwen",
  "loop",
  "poolDispatchRouter",
  "poolArgCoercer",
  "pool",
  "analyze",
  "polygon",
  "toolResultParser",
  "autoLayerManager",
  "map",
] as const;

export const ARCH_NODES: ArchNode[] = [
  {
    id: "user",
    label: "User",
    caption: "자연어 요청",
    kind: "interface",
    position: [-7.1, 1.1, 0],
    details: ["주소/주변/통계/시각화 같은 말을 입력", "후속 발화는 직전 기준지와 반경을 이어받아야 함"],
  },
  {
    id: "web",
    label: "React Web",
    caption: "지도 + 대화 UI",
    kind: "interface",
    position: [-5.3, -0.2, 0.6],
    details: ["SSE 스트림을 받아 답변과 도구 상태를 표시", "도구 결과와 intent event를 Map Renderer 파이프라인으로 넘김"],
  },
  {
    id: "bridge",
    label: "FastAPI Bridge",
    caption: "/v1/chat/completions",
    kind: "bridge",
    position: [-2.9, 0.2, 0],
    details: ["OpenAI 호환 요청을 받고 system prompt와 routing hint를 병합", "MCP pool과 vLLM 사이의 실행 루프를 관리"],
  },
  {
    id: "policy",
    label: "Intent + Routing",
    caption: "query_policy / intent",
    kind: "policy",
    position: [-1.2, 1.9, -0.35],
    details: ["주소 anchor, 통계 질의, 후속 필터/시각화 의도를 먼저 고정", "프롬프트가 아니라 deterministic hint로 도구 체인을 좁힘"],
  },
  {
    id: "qwen",
    label: "Qwen / vLLM",
    caption: "tool-calling model",
    kind: "model",
    position: [0.2, 0.05, 0.15],
    details: ["사용자 의도와 tool schema를 보고 도구 호출을 생성", "최종 응답은 도구 결과를 한국어로 요약"],
  },
  {
    id: "loop",
    label: "Tool Loop",
    caption: "streaming dispatch",
    kind: "tooling",
    position: [0.8, -1.85, 0.35],
    details: ["tool_calls를 누적하고 MCP dispatch 후 다음 iteration으로 연결", "intent event와 tool_call event를 UI에 스트리밍"],
  },
  {
    id: "pool",
    label: "MCP Pool",
    caption: "8 stdio domains",
    kind: "tooling",
    position: [3.1, 0.1, 0],
    details: [
      "locate/inspect/reach/simulate/estimate/design/export/analyze 서버를 spawn",
      "list_openai_tools, dispatch, health를 통해 모델-도구 경계면을 관리",
    ],
  },
  {
    id: "poolToolCatalog",
    label: "Tool Catalog",
    caption: "MCP → OpenAI schema",
    kind: "tooling",
    position: [1.85, 1.25, -0.85],
    details: [
      "각 domain의 list_tools 결과를 mcp_tool_to_openai로 변환",
      "in-process ui tools까지 합쳐 Qwen/vLLM에 tool schema로 제공",
    ],
  },
  {
    id: "poolDomainSpawner",
    label: "Domain Spawner",
    caption: "uv stdio servers",
    kind: "tooling",
    position: [3.55, 1.55, 0.85],
    details: [
      "StdioServerParameters로 uv --directory urban_mcp run python -m urban_mcp_<domain> 실행",
      "도메인 일부가 실패해도 나머지 세션은 ready 상태로 유지",
    ],
  },
  {
    id: "poolDispatchRouter",
    label: "Dispatch Router",
    caption: "prefix → session",
    kind: "tooling",
    position: [1.85, -0.85, 0.85],
    details: [
      "parse_prefixed_name으로 analyze__find_existing_buildings 같은 이름을 domain/tool로 분해",
      "준비되지 않은 domain이면 available 목록과 함께 KeyError로 실패를 드러냄",
    ],
  },
  {
    id: "poolArgCoercer",
    label: "Arg Coercer",
    caption: "_coerce_args",
    kind: "tooling",
    position: [2.75, -1.45, -0.75],
    details: [
      "_coerce_args가 inputSchema를 보고 문자열 숫자/불리언을 안전하게 캐스팅",
      "Qwen이 \"300\"처럼 보낸 값을 number/integer/boolean 도구 인자로 보정",
    ],
  },
  {
    id: "poolHealthMonitor",
    label: "Pool Health",
    caption: "ready / failed domains",
    kind: "tooling",
    position: [4.35, 0.95, -0.35],
    details: [
      "healthz에 ready_domains, failed_domains, stdio_tool_count, ui_tool_count를 노출",
      "서버 재시작 후 MCP 도메인이 실제로 붙었는지 확인하는 운영 진단점",
    ],
  },
  {
    id: "poolUiTools",
    label: "UI Tools Adapter",
    caption: "in-process ui actions",
    kind: "tooling",
    position: [1.55, -1.95, -0.1],
    details: [
      "stdio MCP가 아닌 ui__set_basemap, ui__clear_layers 같은 화면 제어 도구를 함께 노출",
      "도구 호출 결과는 ChatTab의 ui_action으로 들어와 React 상태를 직접 갱신",
    ],
  },
  {
    id: "locate",
    label: "locate",
    caption: "주소/필지",
    kind: "domain",
    position: [5.0, 1.95, -0.9],
    details: ["search_address, get_parcel 등 기준지 확정", "지번이 있으면 시설명 검색으로 drift하지 않게 해야 함"],
  },
  {
    id: "analyze",
    label: "analyze",
    caption: "통계/후보",
    kind: "domain",
    position: [5.6, 0.8, 0.85],
    details: ["find_existing_buildings, existing_building_statistics", "probe_n/top_n/coverage가 정확도에 직접 영향"],
  },
  {
    id: "inspect",
    label: "inspect",
    caption: "규제/현황",
    kind: "domain",
    position: [5.8, -0.4, -0.95],
    details: ["토지이용, 규제, 주변 맥락 확인", "단일 필지 판단의 보조 정보"],
  },
  {
    id: "design",
    label: "design",
    caption: "매스/설계",
    kind: "domain",
    position: [5.2, -1.65, 0.7],
    details: ["mass 후보, 설계 시뮬레이션과 연결", "신축 가능성 검토 이후 단계에서 사용"],
  },
  {
    id: "otherDomains",
    label: "reach / simulate / estimate / export",
    caption: "접근성/시뮬/비용/출력",
    kind: "domain",
    position: [4.2, -2.55, -0.45],
    details: ["도보권, 대중교통, 비용, 내보내기 도구 묶음", "분석 결과를 후속 워크플로우로 확장"],
  },
  {
    id: "polygon",
    label: "Polygon API",
    caption: "공공/공간 데이터",
    kind: "data",
    position: [7.25, -0.3, 0.2],
    details: ["필지 geometry, 건축물대장, WMS/공간 데이터를 제공", "누락/샘플링 여부를 validator가 확인해야 함"],
  },
  {
    id: "toolResultParser",
    label: "Tool Result Parser",
    caption: "text/json → features",
    kind: "render",
    position: [-6.15, -1.35, 1.15],
    details: ["MCP 결과 텍스트에서 JSON/FeatureCollection/bbox/properties를 추출", "geometry가 없으면 지도 레이어가 아니라 히스토리 메시지로만 남김"],
  },
  {
    id: "intentVisualFilter",
    label: "Intent Visual Filter",
    caption: "shouldRenderToolResult",
    kind: "render",
    position: [-5.15, -2.15, 0.35],
    details: ["현재 intent 기준으로 중간 도구 결과 시각화를 억제", "예: 기존 건축물 조회 중 find_parcels 후보 레이어는 깔지 않음"],
  },
  {
    id: "mapFailureGuards",
    label: "Failure Guards",
    caption: "표시 전 검증",
    kind: "render",
    position: [-4.35, -1.25, -0.75],
    details: ["지도 요청인데 geometry features가 없으면 말로 표시했다고 끝내면 안 됨", "bbox 없음, layer 생성 실패, parser 실패 같은 상태를 드러내야 함"],
  },
  {
    id: "autoLayerManager",
    label: "Auto Layer Manager",
    caption: "applyToolResult",
    kind: "render",
    position: [-3.25, -2.05, 0.25],
    details: ["FeatureCollection을 MapLibre source/layer로 추가하고 toolHistory에 기록", "레이어 visibility, opacity, clearAllToolLayers와 연결"],
  },
  {
    id: "popupCardBuilder",
    label: "Popup + Cards",
    caption: "properties → UI",
    kind: "render",
    position: [-2.05, -1.2, 1.05],
    details: ["주소, 면적, 지목, matched_use, building, building_floors를 팝업/카드로 표시", "긴 주소와 규제 정보가 넘치지 않도록 레이아웃 제약 필요"],
  },
  {
    id: "viewportController",
    label: "Viewport Controller",
    caption: "fitToBbox / focusParcel",
    kind: "render",
    position: [-2.15, -2.75, -0.55],
    details: ["bbox가 있으면 결과 범위로 지도 이동", "카드 클릭 시 선택 필지 geometry와 popup에 초점 이동"],
  },
  {
    id: "mapState",
    label: "Map State",
    caption: "layers / WMS / draw",
    kind: "render",
    position: [-4.6, -2.85, 1.15],
    details: ["WMS 선택, 도구 레이어 히스토리, 그리기 객체, 투명도 상태를 App 레벨에서 관리", "모바일/데스크톱 패널이 같은 상태를 공유"],
  },
  {
    id: "map",
    label: "Map Renderer",
    caption: "MapLibre 화면",
    kind: "render",
    position: [-0.95, -1.85, 0.25],
    details: ["applyToolResult 결과를 최종 MapLibre source/layer/popup/focus로 렌더링", "시각화 실패는 LLM 답변이 아니라 Parser → Filter → Layer → Viewport 체인에서 추적"],
  },
];

export const ARCH_LINKS: ArchLink[] = [
  { from: "user", to: "web", label: "질의 입력", curve: 0.45 },
  { from: "web", to: "bridge", label: "SSE 요청", curve: -0.2 },
  { from: "bridge", to: "policy", label: "routing hint", curve: 0.35 },
  { from: "policy", to: "qwen", label: "tool chain guard", curve: -0.25 },
  { from: "bridge", to: "qwen", label: "messages + tools", curve: 0.15 },
  { from: "qwen", to: "loop", label: "tool_calls", curve: -0.25 },
  { from: "pool", to: "poolToolCatalog", label: "list_tools", curve: 0.22 },
  { from: "poolToolCatalog", to: "qwen", label: "tool schema", curve: 0.45 },
  { from: "pool", to: "poolDomainSpawner", label: "spawn", curve: 0.25 },
  { from: "loop", to: "poolDispatchRouter", label: "dispatch", curve: -0.24 },
  { from: "poolDispatchRouter", to: "poolArgCoercer", label: "schema lookup", curve: -0.2 },
  { from: "poolArgCoercer", to: "pool", label: "call_tool args", curve: 0.18 },
  { from: "pool", to: "poolHealthMonitor", label: "health", curve: 0.18 },
  { from: "pool", to: "poolUiTools", label: "ui tools", curve: -0.35 },
  { from: "poolUiTools", to: "web", label: "ui_action", curve: -0.65 },
  { from: "poolDomainSpawner", to: "locate", label: "stdio", curve: 0.35 },
  { from: "poolDomainSpawner", to: "analyze", label: "stdio", curve: 0.15 },
  { from: "poolDomainSpawner", to: "inspect", label: "stdio", curve: -0.05 },
  { from: "poolDomainSpawner", to: "design", label: "stdio", curve: -0.25 },
  { from: "poolDomainSpawner", to: "otherDomains", label: "stdio", curve: -0.45 },
  { from: "locate", to: "polygon", label: "parcel data", curve: 0.2 },
  { from: "analyze", to: "polygon", label: "building stats", curve: -0.2 },
  { from: "inspect", to: "polygon", label: "regulation data", curve: 0.1 },
  { from: "loop", to: "web", label: "tool result event", curve: -0.75 },
  { from: "web", to: "toolResultParser", label: "raw tool result", curve: 0.28 },
  { from: "toolResultParser", to: "intentVisualFilter", label: "parsed features", curve: -0.18 },
  { from: "intentVisualFilter", to: "mapFailureGuards", label: "render decision", curve: 0.22 },
  { from: "mapFailureGuards", to: "autoLayerManager", label: "validated result", curve: -0.2 },
  { from: "autoLayerManager", to: "popupCardBuilder", label: "properties", curve: 0.2 },
  { from: "autoLayerManager", to: "viewportController", label: "bbox/focus", curve: -0.2 },
  { from: "autoLayerManager", to: "mapState", label: "layer state", curve: 0.12 },
  { from: "popupCardBuilder", to: "map", label: "popup/card", curve: 0.22 },
  { from: "viewportController", to: "map", label: "camera", curve: -0.18 },
  { from: "mapState", to: "map", label: "visible layers", curve: 0.24 },
];

export function nodeById(id: string) {
  const node = ARCH_NODES.find((n) => n.id === id);
  if (!node) throw new Error(`Unknown architecture node: ${id}`);
  return node;
}

export function hexNumber(color: string) {
  return Number.parseInt(color.replace("#", ""), 16);
}
