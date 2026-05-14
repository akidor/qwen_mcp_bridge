import { Html, Line, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";

type NodeKind = "interface" | "bridge" | "model" | "policy" | "tooling" | "domain" | "data" | "render";

interface ArchNode {
  id: string;
  label: string;
  caption: string;
  kind: NodeKind;
  position: [number, number, number];
  details: string[];
}

interface ArchLink {
  from: string;
  to: string;
  label: string;
  curve?: number;
}

const KIND_COLORS: Record<NodeKind, string> = {
  interface: "#38bdf8",
  bridge: "#f59e0b",
  model: "#a78bfa",
  policy: "#22c55e",
  tooling: "#fb7185",
  domain: "#2dd4bf",
  data: "#f97316",
  render: "#e5e7eb",
};

const ARCH_NODES: ArchNode[] = [
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
    details: ["SSE 스트림을 받아 답변과 도구 상태를 표시", "도구 결과 GeoJSON을 지도 레이어로 변환"],
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
    details: ["locate/inspect/reach/simulate/estimate/design/export/analyze 서버를 spawn", "도메인별 도구를 OpenAI tool schema로 변환"],
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
    id: "map",
    label: "Map Renderer",
    caption: "MapLibre layers",
    kind: "render",
    position: [-4.0, -2.55, -0.6],
    details: ["tool result를 레이어, 카드, bbox focus로 렌더링", "지도 요청이면 geometry features가 반드시 있어야 함"],
  },
];

const ARCH_LINKS: ArchLink[] = [
  { from: "user", to: "web", label: "질의 입력", curve: 0.45 },
  { from: "web", to: "bridge", label: "SSE 요청", curve: -0.2 },
  { from: "bridge", to: "policy", label: "routing hint", curve: 0.35 },
  { from: "policy", to: "qwen", label: "tool chain guard", curve: -0.25 },
  { from: "bridge", to: "qwen", label: "messages + tools", curve: 0.15 },
  { from: "qwen", to: "loop", label: "tool_calls", curve: -0.25 },
  { from: "loop", to: "pool", label: "dispatch", curve: 0.2 },
  { from: "pool", to: "locate", label: "stdio", curve: 0.35 },
  { from: "pool", to: "analyze", label: "stdio", curve: 0.15 },
  { from: "pool", to: "inspect", label: "stdio", curve: -0.15 },
  { from: "pool", to: "design", label: "stdio", curve: -0.25 },
  { from: "pool", to: "otherDomains", label: "stdio", curve: -0.35 },
  { from: "locate", to: "polygon", label: "parcel data", curve: 0.2 },
  { from: "analyze", to: "polygon", label: "building stats", curve: -0.2 },
  { from: "inspect", to: "polygon", label: "regulation data", curve: 0.1 },
  { from: "loop", to: "web", label: "tool result", curve: -0.75 },
  { from: "web", to: "map", label: "GeoJSON layer", curve: 0.2 },
];

function nodeById(id: string) {
  const node = ARCH_NODES.find((n) => n.id === id);
  if (!node) throw new Error(`Unknown architecture node: ${id}`);
  return node;
}

function hexNumber(color: string) {
  return Number.parseInt(color.replace("#", ""), 16);
}

function arcPoints(from: ArchNode, to: ArchNode, curve = 0) {
  const start = new THREE.Vector3(...from.position);
  const end = new THREE.Vector3(...to.position);
  const mid = start.clone().lerp(end, 0.5);
  mid.y += curve;
  mid.z += curve * 0.45;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const a = start.clone().lerp(mid, t);
    const b = mid.clone().lerp(end, t);
    points.push(a.lerp(b, t));
  }
  return points;
}

function Signal({ points, color, phase }: { points: THREE.Vector3[]; color: string; phase: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = (clock.elapsedTime * 0.18 + phase) % 1;
    mesh.position.copy(curve.getPoint(t));
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.055, 18, 18]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

function LinkMesh({ link, index }: { link: ArchLink; index: number }) {
  const from = nodeById(link.from);
  const to = nodeById(link.to);
  const color = KIND_COLORS[to.kind];
  const points = useMemo(() => arcPoints(from, to, link.curve), [from, to, link.curve]);
  return (
    <group>
      <Line points={points} color={hexNumber(color)} lineWidth={1.4} transparent opacity={0.48} />
      <Signal points={points} color={color} phase={(index * 0.19) % 1} />
    </group>
  );
}

function HoloNode({
  node,
  selected,
  onSelect,
}: {
  node: ArchNode;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const color = KIND_COLORS[node.kind];
  const size = node.kind === "bridge" || node.kind === "model" || node.kind === "tooling" ? 0.31 : 0.24;
  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    group.rotation.y = clock.elapsedTime * (selected ? 0.9 : 0.45);
    const pulse = selected ? 1.18 + Math.sin(clock.elapsedTime * 3.2) * 0.04 : 1;
    group.scale.setScalar(pulse);
  });
  return (
    <group position={node.position}>
      <group ref={groupRef}>
        <mesh onClick={(event) => { event.stopPropagation(); onSelect(node.id); }}>
          <sphereGeometry args={[size, 32, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={selected ? 1.25 : 0.72}
            roughness={0.25}
            metalness={0.35}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[size * 1.65, 0.012, 10, 72]} />
          <meshBasicMaterial color={color} transparent opacity={selected ? 0.92 : 0.46} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[size * 1.35, 0.01, 10, 72]} />
          <meshBasicMaterial color="#f8fafc" transparent opacity={selected ? 0.72 : 0.22} />
        </mesh>
      </group>
      <Html position={[0, -0.62, 0]} center distanceFactor={8.5} style={{ pointerEvents: "none" }}>
        <div className={`arch-node-label ${selected ? "selected" : ""}`}>
          <strong>{node.label}</strong>
          <span>{node.caption}</span>
        </div>
      </Html>
    </group>
  );
}

function HoloRings() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.18;
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.25) * 0.08;
  });
  return (
    <group ref={ref} position={[0.2, -0.35, 0]}>
      {[1.9, 2.75, 3.65].map((radius, index) => (
        <mesh key={radius} rotation={[Math.PI / 2, 0, index * 0.35]}>
          <torusGeometry args={[radius, 0.008, 8, 128]} />
          <meshBasicMaterial
            color={index === 1 ? "#f59e0b" : "#38bdf8"}
            transparent
            opacity={index === 1 ? 0.18 : 0.12}
          />
        </mesh>
      ))}
    </group>
  );
}

function ArchitectureScene({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const networkRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!networkRef.current) return;
    networkRef.current.rotation.y += delta * 0.035;
  });
  return (
    <>
      <PerspectiveCamera makeDefault position={[0.2, 4.6, 11.4]} fov={45} />
      <ambientLight intensity={0.52} />
      <pointLight position={[-5, 5, 4]} intensity={1.25} color="#38bdf8" />
      <pointLight position={[5, 3, -4]} intensity={0.85} color="#f59e0b" />
      <group ref={networkRef}>
        <HoloRings />
        {ARCH_LINKS.map((link, index) => (
          <LinkMesh key={`${link.from}-${link.to}`} link={link} index={index} />
        ))}
        {ARCH_NODES.map((node) => (
          <HoloNode key={node.id} node={node} selected={node.id === selectedId} onSelect={onSelect} />
        ))}
      </group>
      <gridHelper args={[18, 18, "#38bdf8", "#273449"]} position={[0, -3.15, 0]} />
      <OrbitControls enablePan={false} minDistance={7.5} maxDistance={16} autoRotate={false} />
    </>
  );
}

function FlowList({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  const flow = ["user", "web", "bridge", "policy", "qwen", "loop", "pool", "analyze", "polygon", "map"];
  return (
    <div className="arch-flow-strip">
      {flow.map((id, index) => {
        const node = nodeById(id);
        return (
          <button
            key={id}
            className={`arch-flow-step ${selectedId === id ? "active" : ""}`}
            onClick={() => onSelect(id)}
            style={{ borderColor: KIND_COLORS[node.kind] }}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {node.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ArchitectureView({ onClose }: { onClose: () => void }) {
  const [selectedId, setSelectedId] = useState("bridge");
  const selected = nodeById(selectedId);
  const inbound = ARCH_LINKS.filter((link) => link.to === selectedId).length;
  const outbound = ARCH_LINKS.filter((link) => link.from === selectedId).length;

  return (
    <main className="architecture-page">
      <Canvas className="architecture-canvas" dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#081018"]} />
        <ArchitectureScene selectedId={selectedId} onSelect={setSelectedId} />
      </Canvas>

      <header className="arch-topbar">
        <div>
          <p className="arch-eyebrow">qwen_mcp_bridge live architecture</p>
          <h1>현재 구조 3D 맵</h1>
        </div>
        <button className="arch-close-button" onClick={onClose}>지도 화면</button>
      </header>

      <section className="arch-info-panel" aria-label="선택된 구조 노드 설명">
        <p className="arch-panel-kicker" style={{ color: KIND_COLORS[selected.kind] }}>{selected.kind}</p>
        <h2>{selected.label}</h2>
        <p className="arch-caption">{selected.caption}</p>
        <div className="arch-metrics">
          <span>in {inbound}</span>
          <span>out {outbound}</span>
          <span>{selected.position.map((v) => v.toFixed(1)).join(" / ")}</span>
        </div>
        <ul>
          {selected.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      </section>

      <section className="arch-legend-panel" aria-label="구조 레이어 범례">
        <h2>레이어</h2>
        <div className="arch-legend-grid">
          {(Object.keys(KIND_COLORS) as NodeKind[]).map((kind) => (
            <span key={kind}>
              <i style={{ background: KIND_COLORS[kind] }} />
              {kind}
            </span>
          ))}
        </div>
      </section>

      <FlowList selectedId={selectedId} onSelect={setSelectedId} />
    </main>
  );
}
