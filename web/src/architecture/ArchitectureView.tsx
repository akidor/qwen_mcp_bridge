import { Html, Line, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";

import {
  ARCH_CLUSTERS,
  ARCH_LINKS,
  ARCH_NODES,
  FLOW_NODE_IDS,
  KIND_COLORS,
  TOPOLOGY_CLUSTER_IDS,
  hexNumber,
  nodeById,
  type ArchCluster,
  type ArchLink,
  type ArchNode,
  type ClusterId,
  type NodeKind,
} from "./architectureData";
import {
  analyzeArchitectureGraph,
  type ArchitectureConnectivityReport,
  type ConnectivitySeverity,
  type NodeConnectivityStatus,
} from "./architectureGraph";

const CONNECTIVITY_COLORS: Record<ConnectivitySeverity, string> = {
  ok: "#22c55e",
  weak: "#f59e0b",
  broken: "#ef4444",
};

const CONNECTIVITY_LABELS: Record<ConnectivitySeverity, string> = {
  ok: "정상",
  weak: "취약",
  broken: "단절",
};

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

function LinkMesh({ link, index, dim }: { link: ArchLink; index: number; dim: boolean }) {
  const from = nodeById(link.from);
  const to = nodeById(link.to);
  const color = KIND_COLORS[to.kind];
  const points = useMemo(() => arcPoints(from, to, link.curve), [from, to, link.curve]);
  return (
    <group>
      <Line points={points} color={hexNumber(color)} lineWidth={dim ? 0.8 : 1.4} transparent opacity={dim ? 0.08 : 0.48} />
      {!dim && <Signal points={points} color={color} phase={(index * 0.19) % 1} />}
    </group>
  );
}

function HoloNode({
  node,
  selected,
  dim,
  connectivityStatus,
  onSelect,
}: {
  node: ArchNode;
  selected: boolean;
  dim: boolean;
  connectivityStatus: NodeConnectivityStatus;
  onSelect: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const color = KIND_COLORS[node.kind];
  const issueColor = CONNECTIVITY_COLORS[connectivityStatus.severity];
  const hasIssue = connectivityStatus.severity !== "ok";
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
            emissiveIntensity={dim ? 0.18 : selected ? 1.25 : 0.72}
            roughness={0.25}
            metalness={0.35}
            transparent
            opacity={dim ? 0.28 : 1}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[size * 1.65, 0.012, 10, 72]} />
          <meshBasicMaterial color={color} transparent opacity={dim ? 0.08 : selected ? 0.92 : 0.46} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[size * 1.35, 0.01, 10, 72]} />
          <meshBasicMaterial color="#f8fafc" transparent opacity={dim ? 0.04 : selected ? 0.72 : 0.22} />
        </mesh>
        {hasIssue && (
          <mesh rotation={[Math.PI / 2, Math.PI / 5, 0]}>
            <torusGeometry args={[size * 2.18, 0.018, 10, 96]} />
            <meshBasicMaterial color={issueColor} transparent opacity={dim ? 0.08 : selected ? 0.9 : 0.54} />
          </mesh>
        )}
      </group>
      <Html position={[0, -0.62, 0]} center distanceFactor={8.5} style={{ pointerEvents: "none" }}>
        <div className={`arch-node-label ${selected ? "selected" : ""} ${dim ? "dim" : ""} ${hasIssue ? connectivityStatus.severity : ""}`}>
          <strong>{node.label}</strong>
          <span>{node.caption}</span>
        </div>
      </Html>
    </group>
  );
}

function ClusterHalo({
  cluster,
  dim,
  severity,
}: {
  cluster: ArchCluster;
  dim: boolean;
  severity: ConnectivitySeverity;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.12;
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.2 + cluster.center[0]) * 0.035;
  });
  const color = severity === "ok" ? cluster.color : CONNECTIVITY_COLORS[severity];
  return (
    <group ref={ref} position={cluster.center}>
      <mesh>
        <sphereGeometry args={[cluster.radius, 24, 24]} />
        <meshBasicMaterial color={color} transparent opacity={dim ? 0.01 : severity === "ok" ? 0.035 : 0.06} wireframe />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[cluster.radius * 0.92, 0.008, 8, 96]} />
        <meshBasicMaterial color={color} transparent opacity={dim ? 0.035 : severity === "ok" ? 0.28 : 0.48} />
      </mesh>
      <Html position={[0, cluster.radius * 0.9, 0]} center distanceFactor={10.5} style={{ pointerEvents: "none" }}>
        <div className={`arch-cluster-label ${dim ? "dim" : ""} ${severity !== "ok" ? severity : ""}`} style={{ borderColor: color, color }}>
          <strong>{cluster.label}</strong>
          <span>{cluster.caption}</span>
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
  activeClusters,
  connectivityReport,
  onSelect,
}: {
  selectedId: string;
  activeClusters: Set<ClusterId>;
  connectivityReport: ArchitectureConnectivityReport;
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
        {ARCH_CLUSTERS.map((cluster) => {
          const status = connectivityReport.clusterStatusById[cluster.id];
          return (
            <ClusterHalo
              key={cluster.id}
              cluster={cluster}
              dim={!activeClusters.has(cluster.id)}
              severity={status?.severity ?? "ok"}
            />
          );
        })}
        {ARCH_LINKS.map((link, index) => {
          const from = nodeById(link.from);
          const to = nodeById(link.to);
          const visible = activeClusters.has(from.cluster) && activeClusters.has(to.cluster);
          return (
            <LinkMesh key={`${link.from}-${link.to}`} link={link} index={index} dim={!visible} />
          );
        })}
        {ARCH_NODES.map((node) => (
          <HoloNode
            key={node.id}
            node={node}
            selected={node.id === selectedId}
            dim={!activeClusters.has(node.cluster)}
            connectivityStatus={connectivityReport.nodeStatusById[node.id]}
            onSelect={onSelect}
          />
        ))}
      </group>
      <gridHelper args={[18, 18, "#38bdf8", "#273449"]} position={[0, -3.15, 0]} />
      <OrbitControls enablePan={false} minDistance={7.5} maxDistance={16} autoRotate={false} />
    </>
  );
}

function FlowList({
  selectedId,
  activeClusters,
  connectivityReport,
  onSelect,
}: {
  selectedId: string;
  activeClusters: Set<ClusterId>;
  connectivityReport: ArchitectureConnectivityReport;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="arch-flow-strip">
      {FLOW_NODE_IDS.map((id, index) => {
        const node = nodeById(id);
        const dim = !activeClusters.has(node.cluster);
        const severity = connectivityReport.nodeStatusById[id]?.severity ?? "ok";
        return (
          <button
            key={id}
            className={`arch-flow-step ${selectedId === id ? "active" : ""} ${dim ? "dim" : ""} ${severity !== "ok" ? severity : ""}`}
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
  const [activeClusters, setActiveClusters] = useState<Set<ClusterId>>(() => new Set(TOPOLOGY_CLUSTER_IDS));
  const connectivityReport = useMemo(() => analyzeArchitectureGraph(ARCH_NODES, ARCH_LINKS, ARCH_CLUSTERS), []);
  const selected = nodeById(selectedId);
  const selectedConnectivity = connectivityReport.nodeStatusById[selectedId];
  const inbound = ARCH_LINKS.filter((link) => link.to === selectedId).length;
  const outbound = ARCH_LINKS.filter((link) => link.from === selectedId).length;
  const activeKinds = useMemo(() => {
    const kinds = new Set<NodeKind>();
    for (const node of ARCH_NODES) {
      if (activeClusters.has(node.cluster)) kinds.add(node.kind);
    }
    return kinds;
  }, [activeClusters]);

  const toggleCluster = (id: ClusterId) => {
    setActiveClusters((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isolateCluster = (id: ClusterId) => {
    setActiveClusters((previous) => {
      if (previous.size === 1 && previous.has(id)) return new Set(TOPOLOGY_CLUSTER_IDS);
      return new Set([id]);
    });
  };

  const showAllClusters = () => setActiveClusters(new Set(TOPOLOGY_CLUSTER_IDS));

  return (
    <main className="architecture-page">
      <Canvas className="architecture-canvas" dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#081018"]} />
        <ArchitectureScene
          selectedId={selectedId}
          activeClusters={activeClusters}
          connectivityReport={connectivityReport}
          onSelect={setSelectedId}
        />
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
        <div className={`arch-connectivity-card ${selectedConnectivity.severity}`}>
          <div className="arch-connectivity-head">
            <span>연결성 분석</span>
            <strong style={{ color: CONNECTIVITY_COLORS[selectedConnectivity.severity] }}>
              {CONNECTIVITY_LABELS[selectedConnectivity.severity]}
            </strong>
          </div>
          <div className="arch-connectivity-stats">
            <span>role {selectedConnectivity.role}</span>
            <span>cross in {selectedConnectivity.crossInbound}</span>
            <span>cross out {selectedConnectivity.crossOutbound}</span>
          </div>
          {selectedConnectivity.reasons.length > 0 ? (
            <ul className="arch-connectivity-reasons">
              {selectedConnectivity.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p>역할 기준의 최소 연결 조건을 충족합니다.</p>
          )}
        </div>
        <ul>
          {selected.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      </section>

      <section className="arch-legend-panel" aria-label="구조 레이어 범례">
        <div className="arch-legend-head">
          <h2>레이어</h2>
          <button type="button" onClick={showAllClusters}>전체</button>
        </div>
        <div className="arch-cluster-list">
          {ARCH_CLUSTERS.map((cluster) => {
            const active = activeClusters.has(cluster.id);
            const nodeCount = ARCH_NODES.filter((node) => node.cluster === cluster.id).length;
            const clusterStatus = connectivityReport.clusterStatusById[cluster.id];
            const severity = clusterStatus?.severity ?? "ok";
            return (
              <div key={cluster.id} className={`arch-cluster-row ${active ? "is-on" : "is-off"} ${severity !== "ok" ? severity : ""}`}>
                <button
                  type="button"
                  className="arch-cluster-toggle"
                  onClick={() => toggleCluster(cluster.id)}
                  style={{ borderColor: cluster.color }}
                  aria-pressed={active}
                  aria-label={`${cluster.label} 레이어 ${active ? "끄기" : "켜기"}`}
                >
                  <i style={{ background: cluster.color, opacity: active ? 1 : 0.24 }} />
                  <span>
                    <strong>{cluster.label}</strong>
                    <em>{nodeCount} nodes · boundary {clusterStatus?.boundary ?? 0}</em>
                  </span>
                  {severity !== "ok" && <b>{CONNECTIVITY_LABELS[severity]}</b>}
                </button>
                <button
                  type="button"
                  className="arch-cluster-iso"
                  onClick={() => isolateCluster(cluster.id)}
                  aria-label={`${cluster.label} 레이어만 보기`}
                  title="이 레이어만 보기"
                >
                  solo
                </button>
              </div>
            );
          })}
        </div>
        <h3>종류</h3>
        <div className="arch-legend-grid">
          {(Object.keys(KIND_COLORS) as NodeKind[]).map((kind) => (
            <span key={kind} className={activeKinds.has(kind) ? "" : "dim"}>
              <i style={{ background: KIND_COLORS[kind] }} />
              {kind}
            </span>
          ))}
        </div>
        <h3>연결성 분석</h3>
        <div className="arch-connectivity-summary">
          <span>issues {connectivityReport.summary.issueCount}</span>
          <span>weak nodes {connectivityReport.summary.weakNodeIds.length}</span>
          <span>weak clusters {connectivityReport.summary.weakClusterIds.length}</span>
        </div>
        <div className="arch-weak-node-list">
          {connectivityReport.summary.weakNodeIds.slice(0, 5).map((id) => {
            const status = connectivityReport.nodeStatusById[id];
            return (
              <button key={id} type="button" onClick={() => setSelectedId(id)}>
                <i style={{ background: CONNECTIVITY_COLORS[status.severity] }} />
                <span>{status.label}</span>
              </button>
            );
          })}
          {connectivityReport.summary.weakClusterIds.map((id) => {
            const status = connectivityReport.clusterStatusById[id];
            if (!status) return null;
            return (
              <button key={id} type="button" onClick={() => isolateCluster(id)}>
                <i style={{ background: CONNECTIVITY_COLORS[status.severity] }} />
                <span>{status.label} cluster</span>
              </button>
            );
          })}
        </div>
      </section>

      <FlowList
        selectedId={selectedId}
        activeClusters={activeClusters}
        connectivityReport={connectivityReport}
        onSelect={setSelectedId}
      />
    </main>
  );
}
