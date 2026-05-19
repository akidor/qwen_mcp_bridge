export type NodeKind = "interface" | "bridge" | "model" | "policy" | "tooling" | "domain" | "data" | "render";

export type ConnectivityRole = "source" | "sink" | "processor" | "guard" | "diagnostic";

export type ClusterId =
  | "interface"
  | "bridge"
  | "routing"
  | "model"
  | "tool-loop"
  | "mcp-pool"
  | "domains"
  | "data"
  | "rendering";

export interface ArchCluster {
  id: ClusterId;
  label: string;
  caption: string;
  color: string;
  center: [number, number, number];
  radius: number;
}

export interface ArchNode {
  id: string;
  label: string;
  caption: string;
  kind: NodeKind;
  cluster: ClusterId;
  connectivityRole?: ConnectivityRole;
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

export const TOPOLOGY_CLUSTER_IDS: readonly ClusterId[] = [
  "interface",
  "bridge",
  "routing",
  "model",
  "tool-loop",
  "mcp-pool",
  "domains",
  "data",
  "rendering",
];

export const ARCH_CLUSTERS: ArchCluster[] = [
  {
    id: "interface",
    label: "Interface",
    caption: "사용자 · React 화면",
    color: "#38bdf8",
    center: [-6.1, 0.45, 0.3],
    radius: 1.75,
  },
  {
    id: "bridge",
    label: "Bridge",
    caption: "OpenAI 호환 API",
    color: "#f59e0b",
    center: [-2.9, 0.2, 0],
    radius: 0.9,
  },
  {
    id: "routing",
    label: "Query Routing",
    caption: "anchor · intent · follow-up",
    color: "#22c55e",
    center: [-1.7, 2.55, 0],
    radius: 2.05,
  },
  {
    id: "model",
    label: "Model",
    caption: "Qwen / vLLM",
    color: "#a78bfa",
    center: [0.2, 0.05, 0.15],
    radius: 0.95,
  },
  {
    id: "tool-loop",
    label: "Tool Loop",
    caption: "streaming dispatch",
    color: "#fb7185",
    center: [0.8, -1.85, 0.35],
    radius: 0.95,
  },
  {
    id: "mcp-pool",
    label: "MCP Pool",
    caption: "catalog · spawn · dispatch",
    color: "#f43f5e",
    center: [3.1, 0.05, 0],
    radius: 2.35,
  },
  {
    id: "domains",
    label: "MCP Domains",
    caption: "locate · analyze · inspect",
    color: "#2dd4bf",
    center: [5.15, -0.35, 0],
    radius: 2.45,
  },
  {
    id: "data",
    label: "Data Source",
    caption: "Polygon API",
    color: "#f97316",
    center: [7.25, -0.3, 0.2],
    radius: 0.95,
  },
  {
    id: "rendering",
    label: "Map Renderer",
    caption: "parser · layer · popup",
    color: "#e5e7eb",
    center: [-3.75, -2.05, 0.25],
    radius: 2.55,
  },
];

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

export const QUERY_ROUTING_NODE_IDS = [
  "anchorExtractor",
  "intentClassifier",
  "statsDetector",
  "followupContext",
  "routingHintBuilder",
  "routingScenarioTests",
] as const;

export const CHAT_OBSERVABILITY_NODE_IDS = [
  "routingDebugPanel",
  "currentParcelContext",
] as const;

export const FLOW_NODE_IDS = [
  "user",
  "web",
  "currentParcelContext",
  "bridge",
  "anchorExtractor",
  "intentClassifier",
  "statsDetector",
  "followupContext",
  "routingHintBuilder",
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
    cluster: "interface",
    connectivityRole: "source",
    position: [-7.1, 1.1, 0],
    details: ["주소/주변/통계/시각화 같은 말을 입력", "후속 발화는 직전 기준지와 반경을 이어받아야 함"],
  },
  {
    id: "web",
    label: "React Web",
    caption: "지도 + 대화 UI",
    kind: "interface",
    cluster: "interface",
    position: [-5.3, -0.2, 0.6],
    details: ["SSE 스트림을 받아 답변과 도구 상태를 표시", "도구 결과와 intent event를 Map Renderer 파이프라인으로 넘김"],
  },
  {
    id: "routingDebugPanel",
    label: "Routing Debug Panel",
    caption: "routing_debug SSE",
    kind: "interface",
    cluster: "interface",
    connectivityRole: "diagnostic",
    position: [-6.65, -0.85, -0.6],
    details: [
      "routing_debug SSE event를 접이식 패널로 보여 intent, bucket, anchor, required_chain을 노출",
      "실제 tool_call_end 순서와 expected chain을 같은 assistant 메시지에서 비교",
    ],
  },
  {
    id: "currentParcelContext",
    label: "Current Parcel Context",
    caption: "metadata.current_parcel",
    kind: "interface",
    cluster: "interface",
    position: [-6.0, 1.35, -0.7],
    details: [
      "필지 카드 클릭 시 address, centroid, 내부 pnu를 compact context로 저장",
      "다음 chat request의 metadata.current_parcel로 보내 '여기/방금 그거' 후속질의를 기준 필지에 묶음",
    ],
  },
  {
    id: "bridge",
    label: "FastAPI Bridge",
    caption: "/v1/chat/completions",
    kind: "bridge",
    cluster: "bridge",
    position: [-2.9, 0.2, 0],
    details: ["OpenAI 호환 요청을 받고 system prompt와 routing hint를 병합", "MCP pool과 vLLM 사이의 실행 루프를 관리"],
  },
  {
    id: "policy",
    label: "Intent + Routing",
    caption: "query_policy / intent",
    kind: "policy",
    cluster: "routing",
    position: [-1.2, 1.9, -0.35],
    details: [
      "주소 anchor, 통계 질의, 후속 필터/시각화 의도를 먼저 고정",
      "Anchor → Intent → Follow-up → Routing Hint 하위 체인이 Qwen 도구 선택을 좁힘",
    ],
  },
  {
    id: "anchorExtractor",
    label: "Anchor Extractor",
    caption: "_JIBUN_RE / _ROAD_RE",
    kind: "policy",
    cluster: "routing",
    position: [-3.35, 1.45, 0.9],
    details: [
      "_JIBUN_RE, _ROAD_RE, _FACILITY_RE로 지번/도로명/시설명 anchor를 분리",
      "양재동 344-7 같은 지번은 locate__search_facility로 drift하지 않게 가드",
    ],
  },
  {
    id: "intentClassifier",
    label: "Intent Classifier",
    caption: "classify_intent",
    kind: "policy",
    cluster: "routing",
    position: [-2.55, 2.5, -0.1],
    details: [
      "locate_show, existing_buildings, existing_building_stats, new_build_candidates 등으로 분기",
      "streaming 시작 시 intent SSE event를 보내 frontend 시각화 필터가 참고",
    ],
  },
  {
    id: "statsDetector",
    label: "Stats Detector",
    caption: "_STATS_RE",
    kind: "policy",
    cluster: "routing",
    connectivityRole: "guard",
    position: [-2.0, 3.32, 0.78],
    details: [
      "통계치/몇 개/얼마나 있어/분포 같은 표현을 existing_building_statistics로 유도",
      "후보 6개 리스트로 답하지 않도록 answer_mode와 tool chain을 고정",
    ],
  },
  {
    id: "followupContext",
    label: "Follow-up Context",
    caption: "previous_context",
    kind: "policy",
    cluster: "routing",
    connectivityRole: "guard",
    position: [-0.92, 3.05, -0.82],
    details: [
      "다세대만 추려봐, 시각화만 해봐 같은 짧은 후속질의에 직전 기준지/반경/필터를 재사용",
      "주소가 없는 발화도 이전 user/assistant 문맥에서 anchor와 radius를 복원",
    ],
  },
  {
    id: "routingHintBuilder",
    label: "Routing Hint Builder",
    caption: "build_routing_hint",
    kind: "policy",
    cluster: "routing",
    position: [-0.08, 2.28, 0.4],
    details: [
      "build_routing_hint가 required_chain, radius_m, answer_guard, visual_required를 system prompt에 주입",
      "LLM이 감으로 도구를 고르는 폭을 줄이고 특정 tool call 체인을 강제",
    ],
  },
  {
    id: "routingScenarioTests",
    label: "Scenario Tests",
    caption: "routing regressions",
    kind: "policy",
    cluster: "routing",
    connectivityRole: "guard",
    position: [-3.18, 3.08, -0.95],
    details: [
      "양재동/문정동/다세대만/시각화만 같은 실패 사례를 회귀 테스트로 고정",
      "새 표현이 생기면 프롬프트보다 intent/query_policy 테스트로 먼저 흡수",
    ],
  },
  {
    id: "qwen",
    label: "Qwen / vLLM",
    caption: "tool-calling model",
    kind: "model",
    cluster: "model",
    position: [0.2, 0.05, 0.15],
    details: ["사용자 의도와 tool schema를 보고 도구 호출을 생성", "최종 응답은 도구 결과를 한국어로 요약"],
  },
  {
    id: "loop",
    label: "Tool Loop",
    caption: "streaming dispatch",
    kind: "tooling",
    cluster: "tool-loop",
    position: [0.8, -1.85, 0.35],
    details: [
      "tool_calls를 누적하고 MCP dispatch 후 다음 iteration으로 연결",
      "intent event와 tool_call event를 UI에 스트리밍",
      "existing_building_statistics는 모델용 stats-only JSON과 frontend용 GeoJSON-only result_text로 분리",
      "큰 FeatureCollection은 tool_result_page SSE로 나누고 tool_call_end에는 compact manifest만 전달",
    ],
  },
  {
    id: "pool",
    label: "MCP Pool",
    caption: "8 stdio domains",
    kind: "tooling",
    cluster: "mcp-pool",
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
    cluster: "mcp-pool",
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
    cluster: "mcp-pool",
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
    cluster: "mcp-pool",
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
    cluster: "mcp-pool",
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
    cluster: "mcp-pool",
    connectivityRole: "diagnostic",
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
    cluster: "mcp-pool",
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
    cluster: "domains",
    position: [5.0, 1.95, -0.9],
    details: ["search_address, get_parcel 등 기준지 확정", "지번이 있으면 시설명 검색으로 drift하지 않게 해야 함"],
  },
  {
    id: "analyze",
    label: "analyze",
    caption: "통계/후보",
    kind: "domain",
    cluster: "domains",
    position: [5.6, 0.8, 0.85],
    details: [
      "find_existing_buildings, existing_building_statistics",
      "distance_from_center probe, expanded_use_keywords, eligible coverage, detail_concurrency가 다세대 통계 정확도와 응답성에 직접 영향",
    ],
  },
  {
    id: "inspect",
    label: "inspect",
    caption: "규제/현황",
    kind: "domain",
    cluster: "domains",
    position: [5.8, -0.4, -0.95],
    details: ["토지이용, 규제, 주변 맥락 확인", "단일 필지 판단의 보조 정보"],
  },
  {
    id: "design",
    label: "design",
    caption: "매스/설계",
    kind: "domain",
    cluster: "domains",
    position: [5.2, -1.65, 0.7],
    details: ["mass 후보, 설계 시뮬레이션과 연결", "신축 가능성 검토 이후 단계에서 사용"],
  },
  {
    id: "otherDomains",
    label: "reach / simulate / estimate / export",
    caption: "접근성/시뮬/비용/출력",
    kind: "domain",
    cluster: "domains",
    position: [4.2, -2.55, -0.45],
    details: ["도보권, 대중교통, 비용, 내보내기 도구 묶음", "분석 결과를 후속 워크플로우로 확장"],
  },
  {
    id: "polygon",
    label: "Polygon API",
    caption: "공공/공간 데이터",
    kind: "data",
    cluster: "data",
    connectivityRole: "sink",
    position: [7.25, -0.3, 0.2],
    details: [
      "필지 geometry, 건축물대장, WMS/공간 데이터를 제공",
      "/api/parcels/details batch 상세 조회가 existing_building_statistics 응답성에 직접 영향",
      "누락/샘플링 여부를 validator가 확인해야 함",
    ],
  },
  {
    id: "toolResultParser",
    label: "Tool Result Parser",
    caption: "text/json → features",
    kind: "render",
    cluster: "rendering",
    position: [-6.15, -1.35, 1.15],
    details: [
      "MCP 결과 텍스트에서 JSON/FeatureCollection/bbox/properties를 추출",
      "geometry가 없으면 지도 레이어가 아니라 히스토리 메시지로만 남김",
      "통계 도구의 GeoJSON-only result_text를 받아 큰 probe 통계와 분리된 지도 레이어를 생성",
      "tool_call_id별 page store가 paged FeatureCollection을 다시 합쳐 applyToolResult로 넘김",
    ],
  },
  {
    id: "intentVisualFilter",
    label: "Intent Visual Filter",
    caption: "shouldRenderToolResult",
    kind: "render",
    cluster: "rendering",
    position: [-5.15, -2.15, 0.35],
    details: ["현재 intent 기준으로 중간 도구 결과 시각화를 억제", "예: 기존 건축물 조회 중 find_parcels 후보 레이어는 깔지 않음"],
  },
  {
    id: "mapFailureGuards",
    label: "Failure Guards",
    caption: "표시 전 검증",
    kind: "render",
    cluster: "rendering",
    position: [-4.35, -1.25, -0.75],
    details: ["지도 요청인데 geometry features가 없으면 말로 표시했다고 끝내면 안 됨", "bbox 없음, layer 생성 실패, parser 실패 같은 상태를 드러내야 함"],
  },
  {
    id: "autoLayerManager",
    label: "Auto Layer Manager",
    caption: "applyToolResult",
    kind: "render",
    cluster: "rendering",
    position: [-3.25, -2.05, 0.25],
    details: [
      "FeatureCollection을 MapLibre source/layer로 추가하고 toolHistory에 기록",
      "existing_building_statistics matched features도 통계 레이어로 렌더",
      "레이어 visibility, opacity, clearAllToolLayers와 연결",
    ],
  },
  {
    id: "popupCardBuilder",
    label: "Popup + Cards",
    caption: "properties → UI",
    kind: "render",
    cluster: "rendering",
    position: [-2.05, -1.2, 1.05],
    details: ["주소, 면적, 지목, matched_use, building, building_floors를 팝업/카드로 표시", "긴 주소와 규제 정보가 넘치지 않도록 레이아웃 제약 필요"],
  },
  {
    id: "viewportController",
    label: "Viewport Controller",
    caption: "fitToBbox / focusParcel",
    kind: "render",
    cluster: "rendering",
    position: [-2.15, -2.75, -0.55],
    details: ["bbox가 있으면 결과 범위로 지도 이동", "카드 클릭 시 선택 필지 geometry와 popup에 초점 이동"],
  },
  {
    id: "mapState",
    label: "Map State",
    caption: "layers / WMS / draw",
    kind: "render",
    cluster: "rendering",
    position: [-4.6, -2.85, 1.15],
    details: ["WMS 선택, 도구 레이어 히스토리, 그리기 객체, 투명도 상태를 App 레벨에서 관리", "모바일/데스크톱 패널이 같은 상태를 공유"],
  },
  {
    id: "map",
    label: "Map Renderer",
    caption: "MapLibre 화면",
    kind: "render",
    cluster: "rendering",
    connectivityRole: "sink",
    position: [-0.95, -1.85, 0.25],
    details: ["applyToolResult 결과를 최종 MapLibre source/layer/popup/focus로 렌더링", "시각화 실패는 LLM 답변이 아니라 Parser → Filter → Layer → Viewport 체인에서 추적"],
  },
];

export const ARCH_LINKS: ArchLink[] = [
  { from: "user", to: "web", label: "질의 입력", curve: 0.45 },
  { from: "web", to: "bridge", label: "SSE 요청", curve: -0.2 },
  { from: "bridge", to: "policy", label: "routing hint", curve: 0.35 },
  { from: "bridge", to: "anchorExtractor", label: "latest messages", curve: 0.28 },
  { from: "anchorExtractor", to: "intentClassifier", label: "anchor type", curve: 0.16 },
  { from: "statsDetector", to: "intentClassifier", label: "stats signal", curve: 0.16 },
  { from: "intentClassifier", to: "routingHintBuilder", label: "intent label", curve: -0.12 },
  { from: "followupContext", to: "routingHintBuilder", label: "previous anchor", curve: 0.2 },
  { from: "routingScenarioTests", to: "routingHintBuilder", label: "regression guard", curve: -0.18 },
  { from: "routingHintBuilder", to: "policy", label: "system hint", curve: 0.12 },
  { from: "intentClassifier", to: "web", label: "intent event", curve: -0.7 },
  { from: "routingHintBuilder", to: "routingDebugPanel", label: "routing_debug fields", curve: -0.55 },
  { from: "popupCardBuilder", to: "currentParcelContext", label: "card focus context", curve: 0.42 },
  { from: "currentParcelContext", to: "bridge", label: "metadata.current_parcel", curve: -0.38 },
  { from: "currentParcelContext", to: "routingDebugPanel", label: "current anchor debug", curve: 0.24 },
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
  { from: "loop", to: "routingDebugPanel", label: "actual tool order", curve: -0.5 },
  { from: "routingDebugPanel", to: "web", label: "debug overlay", curve: 0.18 },
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
