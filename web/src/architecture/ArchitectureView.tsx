import { Html, Line, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";

import {
  ARCH_LINKS,
  ARCH_NODES,
  FLOW_NODE_IDS,
  KIND_COLORS,
  hexNumber,
  nodeById,
  type ArchLink,
  type ArchNode,
  type NodeKind,
} from "./architectureData";

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
  return (
    <div className="arch-flow-strip">
      {FLOW_NODE_IDS.map((id, index) => {
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
