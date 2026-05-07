import { Html, Line, OrbitControls, PerspectiveCamera, Text } from "@react-three/drei";
import { Canvas, useFrame, useLoader, useThree, createPortal } from "@react-three/fiber";
import * as THREE from "three";
import { memo, useMemo, useRef, useState } from "react";

import { formatNumber } from "./format";
import {
  coord2DToVector3,
  coord3DToVector3,
  createShape,
  getSceneBounds,
  proxifyGeoserverUrl,
} from "./scene-utils";
import type { CandidateData, Coord2D, Coord3D, LayerState, NearbyBuildingData, SceneData } from "./scene-types";

// --- 색상 상수 ---
const NORMAL_COLOR = "#4a90d9";
const SETBACK_COLOR = "#d9944a";
const SITE_COLOR = "#66cc66";
const BUILDABLE_COLOR = "#6699ff";
const NEIGHBOR_COLOR = "#aaaaaa";
const SLOPE_COLOR = "#ff6666";
const SLOPE_LINE_COLOR = "#ff4444";
const ROAD_COLOR = "#44aa44";

export interface LayerVisibility {
  site: LayerState;
  buildable: LayerState;
  neighbors: LayerState;
  nearbyBuildings: LayerState;
  building: LayerState;
  northSlope: LayerState;
  terrain: LayerState;
  parcelMap: LayerState;
  zoningMap: LayerState;
  roads: LayerState;
  edgeDims: LayerState;
  floorDims: LayerState;
  slopeDims: LayerState;
  setbackDims: LayerState;
  labelAlwaysOnTop: LayerState;
  parking: LayerState;
  colDistances: LayerState;
  basement: LayerState;
}

interface SceneViewerProps {
  sceneData: SceneData | null;
  selectedCandidateId: string | null;
  layers: LayerVisibility;
}

// --- 메인 카메라 quaternion 공유 (나침반용) ---
const _mainCameraQuat = new THREE.Quaternion();

// --- 라벨 Html 래퍼 (occlude 지원) ---
// labelAlwaysOnTop=false일 때 occlude="blending"으로 건물 뒤 라벨 반투명
let _labelAlwaysOnTop = true;
function setLabelMode(alwaysOnTop: boolean) { _labelAlwaysOnTop = alwaysOnTop; }

function LabelHtml({ children, position, ...rest }: React.ComponentProps<typeof Html>) {
  if (_labelAlwaysOnTop) {
    return <Html position={position} center zIndexRange={[100, 0]} style={{ pointerEvents: "none" }} {...rest}>{children}</Html>;
  }
  return (
    <Html
      position={position}
      center
      occlude
      style={{ pointerEvents: "none", transition: "opacity 0.15s" }}
      {...rest}
    >
      {children}
    </Html>
  );
}

// --- 기본 컴포넌트 ---

function QuadFace({ points, color, opacity }: { points: THREE.Vector3[]; color: string; opacity: number }) {
  const geometry = useMemo(() => {
    if (points.length < 4) return null;
    const positions = new Float32Array(points.flatMap((p) => [p.x, p.y, p.z]));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  }, [points]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color={color} opacity={opacity} transparent side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function PolygonSurface({ coordinates, color, opacity, height = 0 }: {
  coordinates: Coord2D[]; color: string; opacity: number; height?: number;
}) {
  const geometry = useMemo(() => {
    const shape = createShape(coordinates);
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    g.translate(0, height, 0);
    return g;
  }, [coordinates, height]);

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color={color} opacity={opacity} transparent side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function ClosedLine({ coordinates, height = 0.03, color, lineWidth = 1 }: {
  coordinates: Coord2D[]; height?: number; color: number; lineWidth?: number;
}) {
  const points = useMemo(() => {
    const pts = coordinates.map((c) => coord2DToVector3(c, height));
    if (pts.length > 0) pts.push(pts[0].clone());
    return pts;
  }, [coordinates, height]);

  return <Line points={points} color={color} lineWidth={lineWidth} />;
}

// --- 건물 ---

function ExtrudedFloor({ coordinates, holes, zBottom, zTop, color, opacity, edgeColor = "#1f2937", edgeOpacity = 0.32 }: {
  coordinates: Coord2D[]; holes: Coord2D[][]; zBottom: number; zTop: number; color: string; opacity?: number; edgeColor?: string; edgeOpacity?: number;
}) {
  const { meshGeom, edgeGeom } = useMemo(() => {
    const shape = createShape(coordinates, holes);
    const g = new THREE.ExtrudeGeometry(shape, { depth: zTop - zBottom, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, zBottom, 0);
    g.computeVertexNormals();
    const e = new THREE.EdgesGeometry(g);
    return { meshGeom: g, edgeGeom: e };
  }, [coordinates, holes, zBottom, zTop]);

  return (
    <group>
      <mesh geometry={meshGeom} castShadow receiveShadow>
        <meshPhongMaterial color={color} transparent={(opacity ?? 0.85) < 1} opacity={opacity ?? 0.85} />
      </mesh>
      <lineSegments geometry={edgeGeom}>
        <lineBasicMaterial color={edgeColor} transparent opacity={edgeOpacity} />
      </lineSegments>
    </group>
  );
}

const PILOTI_COLOR = "#888888";

function PilotiColumnMesh({ column }: { column: { center: Coord2D; size: number; height: number; coords?: number[][]; y_offset?: number } }) {
  const { meshGeom, edgeGeom, position } = useMemo(() => {
    const coords = column.coords;
    const yOff = column.y_offset ?? 0;
    if (!coords || coords.length < 4) {
      const box = new THREE.BoxGeometry(column.size, column.height, column.size);
      return {
        meshGeom: box,
        edgeGeom: new THREE.EdgesGeometry(box),
        position: [column.center[0], yOff + column.height / 2, -column.center[1]] as [number, number, number],
      };
    }

    const verts = new Float32Array(8 * 3);
    for (let vi = 0; vi < 4; vi++) {
      verts[vi * 3] = coords[vi][0];
      verts[vi * 3 + 1] = yOff;
      verts[vi * 3 + 2] = -coords[vi][1];
      verts[(vi + 4) * 3] = coords[vi][0];
      verts[(vi + 4) * 3 + 1] = yOff + column.height;
      verts[(vi + 4) * 3 + 2] = -coords[vi][1];
    }
    const idx = [
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4,
      1, 2, 6, 1, 6, 5,
      2, 3, 7, 2, 7, 6,
      3, 0, 4, 3, 4, 7,
    ];
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    geom.setIndex(idx);
    geom.computeVertexNormals();
    return {
      meshGeom: geom,
      edgeGeom: new THREE.EdgesGeometry(geom),
      position: [0, 0, 0] as [number, number, number],
    };
  }, [column]);

  return (
    <group position={position}>
      <mesh geometry={meshGeom} castShadow>
        <meshPhongMaterial color="#888888" />
      </mesh>
      <lineSegments geometry={edgeGeom}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.95} />
      </lineSegments>
    </group>
  );
}

function CandidateMesh({ candidate, layers }: { candidate: CandidateData; layers: LayerVisibility }) {
  return (
    <group>
      {candidate.floors.map((floor) => {
        const isPiloti = (floor as any).is_piloti;
        const isBasement = (floor as any).is_basement;
        // 레이어 제어: 지하=basement, 지상=building
        if (isBasement && !layers.basement.visible) return null;
        if (!isBasement && !layers.building.visible) return null;
        const color = isBasement ? "#554433" : isPiloti ? PILOTI_COLOR : floor.is_setback ? SETBACK_COLOR : NORMAL_COLOR;
        return (
          <ExtrudedFloor
            key={`${candidate.id}-${floor.floor}`}
            coordinates={floor.coordinates}
            holes={floor.holes}
            zBottom={floor.z_bottom}
            zTop={floor.z_top}
            color={color}
            opacity={isBasement ? 0.35 : isPiloti ? 0.4 : undefined}
          />
        );
      })}
    </group>
  );
}

function NearbyBuildingMesh({ building, opacity = 0.35 }: { building: NearbyBuildingData; opacity?: number }) {
  const shouldLabel = building.floors >= 3 || building.area >= 200;
  return (
    <group>
      {building.footprints.map((footprint, index) => (
        <ExtrudedFloor
          key={`${building.name}-${index}`}
          coordinates={footprint}
          holes={[]}
          zBottom={0}
          zTop={building.height}
          color={building.color || "#9E9E9E"}
          opacity={opacity}
          edgeColor="#475569"
          edgeOpacity={0.45}
        />
      ))}
      {shouldLabel && (
        <LabelHtml position={[building.label_point[0], building.height + 1.5, -building.label_point[1]]}>
          <div style={{
            whiteSpace: "nowrap",
            fontSize: 12,
            fontWeight: 700,
            color: "#f8fafc",
            background: "rgba(15,23,42,0.85)",
            padding: "3px 8px",
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.18)",
            textShadow: "0 1px 4px rgba(0,0,0,1)",
          }}>
            {building.name}
          </div>
        </LabelHtml>
      )}
    </group>
  );
}

// --- 층높이 라벨 + 최고높이 화살표 ---

function FloorDimensionLabels({ candidate }: { candidate: CandidateData }) {
  const { labelX, midZ, topH } = useMemo(() => {
    let maxX = -Infinity;
    let sumZ = 0;
    let count = 0;
    for (const fl of candidate.floors) {
      for (const c of fl.coordinates) {
        if (c[0] > maxX) maxX = c[0];
        sumZ += -c[1];
        count++;
      }
    }
    return {
      labelX: maxX + 3,
      midZ: count > 0 ? sumZ / count : 0,
      topH: candidate.floors.length > 0 ? candidate.floors[candidate.floors.length - 1].z_top : 0,
    };
  }, [candidate]);

  return (
    <group>
      {/* 수직 기준선 (흰색, 굵게) */}
      <Line
        points={[new THREE.Vector3(labelX, 0, midZ), new THREE.Vector3(labelX, topH, midZ)]}
        color={0xffffff}
        lineWidth={2}
      />
      {/* 각 층별 틱(가로선) + 라벨 */}
      {candidate.floors.map((floor) => {
        const midH = (floor.z_bottom + floor.z_top) / 2;
        const color = floor.is_setback ? SETBACK_COLOR : NORMAL_COLOR;
        return (
          <group key={`fl-${floor.floor}`}>
            {/* 층 구분 틱 (가로선) */}
            <Line
              points={[
                new THREE.Vector3(labelX - 1, floor.z_top, midZ),
                new THREE.Vector3(labelX + 1, floor.z_top, midZ),
              ]}
              color={new THREE.Color(color).getHex()}
              lineWidth={2}
            />
            {/* 층 라벨 */}
            <LabelHtml position={[labelX + 2.5, midH, midZ]}>
              <div style={{ color, fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", textShadow: "0 1px 8px rgba(0,0,0,1)" }}>
                F{floor.floor + 1} {floor.z_top.toFixed(1)}m
              </div>
            </LabelHtml>
          </group>
        );
      })}
      {/* 최고높이 빨간 화살표 */}
      <arrowHelper
        args={[
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(labelX + 5, 0, midZ),
          topH, 0xff4444, 1.5, 0.8
        ]}
      />
      <LabelHtml position={[labelX + 5, topH + 2, midZ]}>
        <div style={{ color: "#ff4444", fontSize: 18, fontWeight: 800, whiteSpace: "nowrap", textShadow: "0 1px 8px rgba(0,0,0,1)" }}>
          H={topH.toFixed(1)}m
        </div>
      </LabelHtml>
    </group>
  );
}

// --- 지형 ---

function TerrainMesh({ sceneData, opacity = 1 }: { sceneData: SceneData; opacity?: number }) {
  const geometry = useMemo(() => {
    if (!sceneData.terrain) return null;
    const { rows, cols, points, mask, bounds } = sceneData.terrain;
    const zRange = (bounds.max_z - bounds.min_z) || 1;

    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);

    for (let i = 0; i < points.length; i++) {
      const m = mask?.[i] ?? 0;
      const elev = m === 1 ? 0 : points[i][2]; // site = 평탄화
      positions[i * 3] = points[i][0];
      positions[i * 3 + 1] = elev;
      positions[i * 3 + 2] = -points[i][1];

      const t = zRange > 0 ? (points[i][2] - bounds.min_z) / zRange : 0.5;
      if (m === 1) {
        colors[i*3] = 0.15; colors[i*3+1] = 0.55+t*0.15; colors[i*3+2] = 0.2;
      } else {
        colors[i*3] = 0.4+t*0.25; colors[i*3+1] = 0.5-t*0.15; colors[i*3+2] = 0.25+t*0.1;
      }
    }

    const indices: number[] = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c;
        indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [sceneData.terrain]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshPhongMaterial vertexColors side={THREE.DoubleSide} transparent opacity={opacity} />
    </mesh>
  );
}

// --- WMS 이미지 오버레이 ---

function ImageOverlay({ url, sceneData, altitude, opacity }: {
  url: string; sceneData: SceneData; altitude: number; opacity: number;
}) {
  const texture = useLoader(THREE.TextureLoader, url);
  const bounds = getSceneBounds(sceneData);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bounds.center.x, altitude, -bounds.center.y]}>
      <planeGeometry args={[bounds.maxX - bounds.minX, bounds.maxY - bounds.minY]} />
      <meshBasicMaterial map={texture} transparent={opacity < 1} opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

// --- 치수 라벨 ---

function DimensionLabels({ sceneData, layers }: { sceneData: SceneData; layers: LayerVisibility }) {
  return (
    <group>
      {/* 변 길이 */}
      {sceneData.site.edge_dims.map((edge, i) => (
        <LabelHtml key={`edge-${i}`} position={coord2DToVector3(edge.mid, 0.5)}>
          <div style={{ whiteSpace: "nowrap", fontSize: 14, fontWeight: 600, color: "#fff", background: "rgba(15,20,30,0.85)", padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.5)", textShadow: "0 1px 4px rgba(0,0,0,1)" }}>
            {formatNumber(edge.length)}m
          </div>
        </LabelHtml>
      ))}
      {/* 도로폭 */}
      {layers.roads.visible && sceneData.road_edges.map((road, i) => {
        const mid = road.mid;
        const p0 = road.coords[0];
        const p1 = road.coords[1];
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.1) return null;
        let nx = -dy / len, ny = dx / len;
        if (nx * mid[0] + ny * mid[1] < 0) { nx = -nx; ny = -ny; }
        const cx = mid[0] + nx * road.width / 2;
        const cy = mid[1] + ny * road.width / 2;

        return (
          <group key={`road-${i}`}>
            <LabelHtml position={[cx, 1.5, -cy]}>
              <div style={{ whiteSpace: "nowrap", fontSize: 14, fontWeight: 700, color: "#fff", background: "rgba(20,100,70,0.9)", padding: "2px 8px", borderRadius: 20, textShadow: "0 1px 4px rgba(0,0,0,1)" }}>
                도로 {road.width.toFixed(1)}m
              </div>
            </LabelHtml>
            <Line
              points={[coord2DToVector3(mid, 0.2), new THREE.Vector3(mid[0] + nx * road.width, 0.2, -(mid[1] + ny * road.width))]}
              color={0x44aa44}
              lineWidth={1.5}
            />
          </group>
        );
      })}
    </group>
  );
}

// --- 셋백 거리 라벨 ---
const SETBACK_LABEL_COLORS: Record<string, string> = {
  front: "#44aa44",
  side: "#cc8833",
  rear: "#cc4444",
};
const SETBACK_POSITION_KR: Record<string, string> = {
  front: "전면",
  side: "측면",
  rear: "후면",
};

function SetbackLabels({ sceneData }: { sceneData: SceneData }) {
  const labels = sceneData.setback_labels;
  if (!labels || labels.length === 0) return null;

  return (
    <group>
      {labels.map((sb, i) => {
        const bg = SETBACK_LABEL_COLORS[sb.position] || "#888";
        const colorHex = new THREE.Color(bg).getHex();
        const y = 0.3;
        // 시작점 (edge 중점)과 끝점 (법선 방향 setback 거리)
        const startPt = new THREE.Vector3(sb.mid[0], y, -sb.mid[1]);
        const endPt = new THREE.Vector3(
          sb.mid[0] + sb.normal[0] * sb.setback,
          y,
          -(sb.mid[1] + sb.normal[1] * sb.setback),
        );
        // 화살표 방향 벡터
        const dir = endPt.clone().sub(startPt);
        const len = dir.length();
        if (len < 0.1) return null;
        const unit = dir.clone().normalize();
        // 화살표 머리 크기 (셋백 길이의 15%, 최대 0.5m)
        const headLen = Math.min(len * 0.15, 0.5);
        // 수직 벡터 (XZ 평면)
        const perp = new THREE.Vector3(-unit.z, 0, unit.x);
        const headW = headLen * 0.6;
        // 시작 화살표 (◁)
        const a1 = startPt.clone().add(unit.clone().multiplyScalar(headLen));
        const arrowStart = [
          startPt,
          a1.clone().add(perp.clone().multiplyScalar(headW)),
          a1.clone().sub(perp.clone().multiplyScalar(headW)),
          startPt,
        ];
        // 끝 화살표 (▷)
        const a2 = endPt.clone().sub(unit.clone().multiplyScalar(headLen));
        const arrowEnd = [
          endPt,
          a2.clone().add(perp.clone().multiplyScalar(headW)),
          a2.clone().sub(perp.clone().multiplyScalar(headW)),
          endPt,
        ];
        // 라벨 위치 (중간)
        const labelX = sb.mid[0] + sb.normal[0] * sb.setback * 0.5;
        const labelZ = sb.mid[1] + sb.normal[1] * sb.setback * 0.5;

        return (
          <group key={`sb-${i}`}>
            {/* 양방향 화살표 실선 */}
            <Line points={[a1, a2]} color={colorHex} lineWidth={2} />
            {/* 시작 화살표 머리 */}
            <Line points={arrowStart} color={colorHex} lineWidth={2} />
            {/* 끝 화살표 머리 */}
            <Line points={arrowEnd} color={colorHex} lineWidth={2} />
            {/* 라벨 */}
            <LabelHtml position={[labelX, 1.5, -labelZ]}>
              <div style={{
                whiteSpace: "nowrap", fontSize: 13, fontWeight: 700,
                color: "#fff", background: `${bg}dd`, padding: "2px 8px",
                borderRadius: 20, textShadow: "0 1px 4px rgba(0,0,0,1)",
              }}>
                {SETBACK_POSITION_KR[sb.position]} {sb.setback}m
                {sb.dynamic_extra && sb.dynamic_extra > 0 ? ` · 중심후퇴 +${sb.dynamic_extra}m` : ""}
              </div>
            </LabelHtml>
          </group>
        );
      })}
    </group>
  );
}

// --- 정북사선면 ---

function NorthSlopeEnvelope({ sceneData, layers }: { sceneData: SceneData; layers: LayerVisibility }) {
  if (!sceneData.north_slope.enabled) return null;
  const slopeOpacity = Math.max(0.05, layers.northSlope.opacity);

  return (
    <group>
      {sceneData.north_slope.north_edges.map((edge, i) => (
        <group key={`ns-${i}`}>
          {edge.ground_face?.length >= 4 && <QuadFace points={edge.ground_face.map(coord3DToVector3)} color={SLOPE_COLOR} opacity={0.2 * slopeOpacity} />}
          {edge.vertical_face?.length >= 4 && <QuadFace points={edge.vertical_face.map(coord3DToVector3)} color={SLOPE_COLOR} opacity={0.2 * slopeOpacity} />}
          {edge.horizontal_face?.length >= 4 && <QuadFace points={edge.horizontal_face.map(coord3DToVector3)} color={SLOPE_COLOR} opacity={0.2 * slopeOpacity} />}
          {edge.slope_face?.length >= 4 && <QuadFace points={edge.slope_face.map(coord3DToVector3)} color={SLOPE_COLOR} opacity={0.2 * slopeOpacity} />}
          {/* 각 면 엣지 */}
          {[edge.ground_face, edge.vertical_face, edge.horizontal_face, edge.slope_face]
            .filter((f) => f && f.length >= 4)
            .map((f, j) => (
              <Line
                key={`ns-line-${i}-${j}`}
                points={[...f!.map(coord3DToVector3), coord3DToVector3(f![0])]}
                color={0xff4444} lineWidth={1} transparent opacity={0.6}
              />
            ))}
          {/* 사선면 최고높이 라벨 */}
          {layers.slopeDims.visible && edge.slope_face?.length >= 4 && (() => {
            let maxPt = edge.slope_face[0];
            for (const pt of edge.slope_face) { if (pt[2] > maxPt[2]) maxPt = pt; }
            const v = coord3DToVector3(maxPt);
            return (
              <LabelHtml position={[v.x, v.y + 1, v.z]}>
                <div style={{ whiteSpace: "nowrap", fontSize: 14, fontWeight: 700, color: "#ffcc00", background: "rgba(30,10,0,0.85)", padding: "2px 8px", borderRadius: 20, textShadow: "0 1px 4px rgba(0,0,0,1)" }}>
                  {maxPt[2].toFixed(1)}m
                </div>
              </LabelHtml>
            );
          })()}
          {/* base_height 라벨 */}
          {layers.slopeDims.visible && edge.vertical_face?.length >= 4 && (() => {
            const baseH = sceneData.north_slope.base_height;
            const bc = edge.base_coords;
            if (!bc || bc.length < 2) return null;
            const mx = (bc[0][0] + bc[1][0]) / 2;
            const my = (bc[0][1] + bc[1][1]) / 2;
            return (
              <LabelHtml position={[mx, baseH / 2, -my]}>
                <div style={{ whiteSpace: "nowrap", fontSize: 14, fontWeight: 600, color: "#ffcc00", background: "rgba(30,10,0,0.8)", padding: "1px 6px", borderRadius: 16, textShadow: "0 1px 4px rgba(0,0,0,1)" }}>
                  {baseH}m
                </div>
              </LabelHtml>
            );
          })()}
        </group>
      ))}
    </group>
  );
}

// --- 메인 씬 ---

function CameraTracker() {
  const { camera } = useThree();
  useFrame(() => { _mainCameraQuat.copy(camera.quaternion); });
  return null;
}

function SceneMeshes({ sceneData, selectedCandidateId, layers }: SceneViewerProps & { sceneData: SceneData }) {
  setLabelMode(layers.labelAlwaysOnTop.visible);
  const bounds = getSceneBounds(sceneData);
  const selectedCandidate = sceneData.candidates.find((c) => c.id === selectedCandidateId);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        castShadow intensity={1.2}
        position={[bounds.center.x + bounds.size, bounds.size * 1.2, -bounds.center.y + bounds.size]}
      />
      <PerspectiveCamera
        makeDefault fov={50}
        position={[
          (bounds.siteCenter?.x ?? 0) + bounds.size * 0.5,
          bounds.size * 0.7,
          -(bounds.siteCenter?.y ?? 0) - bounds.size * 0.4
        ]}
      />
      <OrbitControls
        makeDefault
        target={[(bounds.siteCenter?.x ?? 0), 0, -(bounds.siteCenter?.y ?? 0)]}
        maxPolarAngle={Math.PI / 2.02}
        enableDamping={false}
      />

      {/* 지형 */}
      {layers.terrain.visible && sceneData.terrain && <TerrainMesh sceneData={sceneData} opacity={layers.terrain.opacity} />}

      {/* WMS 타일 */}
      {layers.parcelMap.visible && proxifyGeoserverUrl(sceneData.wms_url) && (
        <ImageOverlay url={proxifyGeoserverUrl(sceneData.wms_url)!} sceneData={sceneData} altitude={0.02} opacity={0.6 * layers.parcelMap.opacity} />
      )}
      {layers.zoningMap.visible && proxifyGeoserverUrl(sceneData.wms_zoning_url) && (
        <ImageOverlay url={proxifyGeoserverUrl(sceneData.wms_zoning_url)!} sceneData={sceneData} altitude={-0.1} opacity={1.0 * layers.zoningMap.opacity} />
      )}

      {/* 대지 경계 */}
      {layers.site.visible && (
        <>
          <PolygonSurface coordinates={sceneData.site.coordinates} color={SITE_COLOR} opacity={0.25 * layers.site.opacity} height={0.01} />
          <ClosedLine coordinates={sceneData.site.coordinates} height={0.02} color={0x66cc66} lineWidth={2} />
        </>
      )}

      {/* 건축가능영역 */}
      {layers.buildable.visible && sceneData.buildable && (
        <>
          <PolygonSurface coordinates={sceneData.buildable.coordinates} color={BUILDABLE_COLOR} opacity={0.2 * layers.buildable.opacity} height={0.03} />
          <ClosedLine coordinates={sceneData.buildable.coordinates} height={0.04} color={0x6699ff} lineWidth={1.5} />
        </>
      )}

      {/* 인접필지 */}
      {layers.neighbors.visible && sceneData.neighbors.map((nb) => (
        <group key={nb.pnu}>
          <PolygonSurface coordinates={nb.coordinates} color={NEIGHBOR_COLOR} opacity={0.15 * layers.neighbors.opacity} height={0.005} />
          <ClosedLine coordinates={nb.coordinates} height={0.006} color={0x888888} lineWidth={0.8} />
        </group>
      ))}

      {/* 주변 건물 */}
      {layers.nearbyBuildings.visible && sceneData.nearby_buildings.map((building, index) => (
        <NearbyBuildingMesh key={`${building.name}-${index}`} building={building} opacity={0.35 * layers.nearbyBuildings.opacity} />
      ))}

      {/* 도로 접면 라인 */}
      {layers.roads.visible && sceneData.road_edges.map((road, i) => (
        <Line
          key={`road-${i}`}
          points={road.coords.map((c) => coord2DToVector3(c, 0.1))}
          color={0x44aa44} lineWidth={2.5}
        />
      ))}

      {/* 정북사선 */}
      {layers.northSlope.visible && <NorthSlopeEnvelope sceneData={sceneData} layers={layers} />}

      {/* 건물 (선택 후보만) — key로 후보 전환 시 이전 geometry 정리 */}
      {(layers.building.visible || layers.basement.visible) && selectedCandidate && <CandidateMesh key={selectedCandidate.id} candidate={selectedCandidate} layers={layers} />}

      {/* 필로티 코어 (선택 후보별, 층별, 불투명) */}
      {layers.building.visible && selectedCandidate && (selectedCandidate as any).piloti_core?.map((cl: any, i: number) => (
        <ExtrudedFloor
          key={`core-${i}`}
          coordinates={cl.coordinates}
          holes={[]}
          zBottom={cl.z_bottom}
          zTop={cl.z_top}
          color="#666666"
          opacity={1}
          edgeColor="#2b2b2b"
          edgeOpacity={0.55}
        />
      ))}

      {/* 필로티 기둥 (흰색 모서리선 포함) */}
      {layers.building.visible && selectedCandidate && (selectedCandidate as any).piloti_columns?.map((col: any, i: number) => (
        <PilotiColumnMesh key={`col-${i}`} column={col} />
      ))}

      {/* 주차선 (흰색 바닥 — 외곽+칸막이 통합) */}
      {layers.parking.visible && selectedCandidate?.parking?.spaces?.map((space, idx) => {
        const parkingType = space.parking_type ?? "perpendicular";
        const color = space.is_accessible
          ? "#c026d3"
          : parkingType === "parallel"
            ? "#10b981"
            : parkingType === "tandem"
              ? "#f59e0b"
              : "#60a5fa";
        return space.coords?.length >= 3 ? (
          <PolygonSurface
            key={`parking-space-fill-${idx}`}
            coordinates={space.coords}
            color={color}
            opacity={0.08}
            height={(space.z ?? 0) + 0.05}
          />
        ) : null;
      })}
      {(() => {
        const allSpaces = (selectedCandidate as any)?.parking?.spaces ?? [];
        if (!layers.parking.visible || !selectedCandidate || allSpaces.length === 0) return null;

        const y = 0.1;
        const tOuter = 0.12; // 외곽선 12cm
        const tInner = 0.08; // 칸막이 8cm

        // 모든 변 수집 + 공유 변 감지
        const edgeKey = (a: number[], b: number[]) =>
          `${Math.round(a[0]*100)},${Math.round(a[1]*100)}-${Math.round(b[0]*100)},${Math.round(b[1]*100)}`;
        const edgeCount = new Map<string, { x1: number; y1: number; x2: number; y2: number }>();

        for (const s of allSpaces) {
          const coords: number[][] = s.coords ?? [];
          if (coords.length < 4) continue;
          const sz = (s.z ?? 0) + 0.1;  // 지하면 -2.9 등
          for (let ei = 0; ei < coords.length; ei++) {
            const p1 = coords[ei], p2 = coords[(ei + 1) % coords.length];
            const fwd = edgeKey(p1, p2);
            const rev = edgeKey(p2, p1);
            if (edgeCount.has(rev)) {
              edgeCount.get(rev)!.x1 = -999;
            } else {
              edgeCount.set(fwd, { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], sz } as any);
            }
          }
        }

        const verts: number[] = [];
        const indices: number[] = [];

        edgeCount.forEach((e: any) => {
          if (e.x1 === -999 || e.x1 === -998) return;
          const t = tOuter;
          const eY = e.sz ?? y;
          const dx = e.x2 - e.x1, dy = e.y2 - e.y1;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = -dy / len * t / 2, ny = dx / len * t / 2;
          const vi = verts.length / 3;
          verts.push(e.x1 + nx, eY, -(e.y1 + ny));
          verts.push(e.x1 - nx, eY, -(e.y1 - ny));
          verts.push(e.x2 + nx, eY, -(e.y2 + ny));
          verts.push(e.x2 - nx, eY, -(e.y2 - ny));
          indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
        });

        // 칸막이: 공유 변을 원본 좌표로 다시 수집
        for (const s of allSpaces) {
          const coords: number[][] = s.coords ?? [];
          if (coords.length < 4) continue;
          const sz = (s.z ?? 0) + 0.1;
          for (let ei = 0; ei < coords.length; ei++) {
            const p1 = coords[ei], p2 = coords[(ei + 1) % coords.length];
            const rev = edgeKey(p2, p1);
            if (edgeCount.has(rev) && edgeCount.get(rev)!.x1 === -999) {
              edgeCount.get(rev)!.x1 = -998;
              const t = tInner;
              const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              const nx = -dy / len * t / 2, ny = dx / len * t / 2;
              const vi = verts.length / 3;
              verts.push(p1[0] + nx, sz, -(p1[1] + ny));
              verts.push(p1[0] - nx, sz, -(p1[1] - ny));
              verts.push(p2[0] + nx, sz, -(p2[1] + ny));
              verts.push(p2[0] - nx, sz, -(p2[1] - ny));
              indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
            }
          }
        }

        if (verts.length === 0) return null;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
        geom.setIndex(indices);
        return (
          <mesh geometry={geom}>
            <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
          </mesh>
        );
      })()}

      {/* 주차 회전 경로 overlay */}
      {layers.parking.visible && selectedCandidate?.parking?.turning_paths?.map((path, idx) => (
        path.coords?.length >= 3 ? (
          <group key={`turning-path-${idx}`}>
            <PolygonSurface
              coordinates={path.coords}
              color={path.blocked ? "#f59e0b" : "#22c55e"}
              opacity={path.blocked ? 0.18 : 0.10}
              height={(path.z ?? 0) + 0.12}
            />
            <ClosedLine
              coordinates={path.coords}
              height={(path.z ?? 0) + 0.13}
              color={path.blocked ? 0xf59e0b : 0x22c55e}
              lineWidth={1.1}
            />
          </group>
        ) : null
      ))}

      {/* 차량 경사로 */}
      {layers.building.visible && selectedCandidate && (selectedCandidate as any).ramp && (() => {
        const ramp = (selectedCandidate as any).ramp;
        const rampAngle = (() => {
          const coords = ramp.ramp_2d_coords as [number, number][] | undefined;
          if (!coords || coords.length < 2) return null;
          let bestAngle: number | null = null;
          let bestLength = 0;
          for (let i = 0; i < coords.length; i += 1) {
            const a = coords[i];
            const b = coords[(i + 1) % coords.length];
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const length = Math.hypot(dx, dy);
            if (length > bestLength) {
              bestLength = length;
              let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
              if (angle < 0) angle += 180;
              if (angle > 90) angle = 180 - angle;
              bestAngle = angle;
            }
          }
          return bestAngle == null ? null : Math.round(bestAngle);
        })();
        const slopeGeom = new THREE.BufferGeometry();
        slopeGeom.setAttribute("position", new THREE.Float32BufferAttribute(ramp.slope_vertices, 3));
        slopeGeom.setIndex(ramp.slope_indices);
        slopeGeom.computeVertexNormals();
        const wallGeom = new THREE.BufferGeometry();
        wallGeom.setAttribute("position", new THREE.Float32BufferAttribute(ramp.wall_vertices, 3));
        wallGeom.setIndex(ramp.wall_indices);
        wallGeom.computeVertexNormals();
        return (
          <group>
            <mesh geometry={slopeGeom}>
              <meshPhongMaterial color="#555555" side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={wallGeom}>
              <meshPhongMaterial color="#444444" side={THREE.DoubleSide} />
            </mesh>
            {ramp.clearance_2d_coords?.length >= 3 && (
              <>
                <PolygonSurface coordinates={ramp.clearance_2d_coords} color="#f59e0b" opacity={0.12} height={0.05} />
                <ClosedLine coordinates={ramp.clearance_2d_coords} height={0.06} color={0xf59e0b} lineWidth={1.2} />
                <LabelHtml
                  position={coord2DToVector3(
                    ramp.clearance_2d_coords[Math.floor(ramp.clearance_2d_coords.length / 2)] ?? ramp.ramp_2d_coords[0],
                    0.3,
                  ).toArray()}
                >
                  <div style={{ whiteSpace: "nowrap", fontSize: 11, fontWeight: 700, color: "#fff7ed", background: "rgba(180,90,0,0.75)", padding: "2px 7px", borderRadius: 14 }}>
                    회전 여유 {typeof ramp.turning_radius === "number" ? `${ramp.turning_radius.toFixed(1)}m` : ""}{rampAngle != null ? ` · ${rampAngle}°` : ""}
                  </div>
                </LabelHtml>
              </>
            )}
          </group>
        );
      })()}

      {/* 지상/지하 출입 라인 */}
      {layers.parking.visible && selectedCandidate?.parking_accesses?.map((access, idx) => {
        const color = access.kind === "basement_ramp" ? 0xf59e0b : 0x22c55e;
        const midX = (access.coords[0][0] + access.coords[1][0]) / 2;
        const midY = (access.coords[0][1] + access.coords[1][1]) / 2;
        return (
          <group key={`parking-access-${idx}`}>
            <Line
              points={[
                coord2DToVector3(access.coords[0], 0.18),
                coord2DToVector3(access.coords[1], 0.18),
              ]}
              color={color}
              lineWidth={3}
            />
            <LabelHtml position={[midX, 1.2, -midY]}>
              <div style={{ whiteSpace: "nowrap", fontSize: 11, fontWeight: 700, color: "#fff", background: access.kind === "basement_ramp" ? "rgba(180,90,0,0.88)" : "rgba(20,120,60,0.88)", padding: "2px 7px", borderRadius: 14 }}>
                {access.kind === "basement_ramp" ? `${access.label} · B1 진입` : `${access.label} · 1층/필로티`}
              </div>
            </LabelHtml>
          </group>
        );
      })}

      {/* 기둥 간 거리 — 양방향 화살표 + 라벨 */}
      {layers.colDistances.visible && selectedCandidate && (selectedCandidate as any).col_distances?.map((cd: any, i: number) => {
        const y = 0.5;
        const s0 = new THREE.Vector3(cd.p0[0], y, -cd.p0[1]);
        const s1 = new THREE.Vector3(cd.p1[0], y, -cd.p1[1]);
        const dir = s1.clone().sub(s0);
        const len = dir.length();
        if (len < 0.1) return null;
        const unit = dir.clone().normalize();
        const headLen = Math.min(len * 0.12, 0.3);
        const perp = new THREE.Vector3(-unit.z, 0, unit.x);
        const hw = headLen * 0.5;
        // 화살촉 시작/끝
        const a0 = s0.clone().add(unit.clone().multiplyScalar(headLen));
        const a1 = s1.clone().sub(unit.clone().multiplyScalar(headLen));
        return (
          <group key={`coldist-${i}`}>
            <Line points={[a0, a1]} color={0xffff88} lineWidth={1.5} />
            <Line points={[s0, a0.clone().add(perp.clone().multiplyScalar(hw)), a0.clone().sub(perp.clone().multiplyScalar(hw)), s0]} color={0xffff88} lineWidth={1.5} />
            <Line points={[s1, a1.clone().add(perp.clone().multiplyScalar(hw)), a1.clone().sub(perp.clone().multiplyScalar(hw)), s1]} color={0xffff88} lineWidth={1.5} />
            <LabelHtml position={[cd.mid[0], y + 0.3, -cd.mid[1]]}>
              <div style={{ whiteSpace: "nowrap", fontSize: 11, fontWeight: 600, color: "#ff8", background: "rgba(0,0,0,0.7)", padding: "1px 5px", borderRadius: 8 }}>
                {cd.distance}m
              </div>
            </LabelHtml>
          </group>
        );
      })}

      {/* 층높이 라벨 + 최고높이 */}
      {layers.floorDims.visible && selectedCandidate && <FloorDimensionLabels key={`fdl-${selectedCandidate.id}`} candidate={selectedCandidate} />}

      {/* 변길이 + 가로세로 + 도로폭 라벨 */}
      {layers.edgeDims.visible && <DimensionLabels sceneData={sceneData} layers={layers} />}

      {/* 셋백 거리 라벨 */}
      {layers.setbackDims.visible && <SetbackLabels sceneData={sceneData} />}
    </>
  );
}

// --- 3축 자이로 나침반 HUD ---

function CompassHUD() {
  const gyroRef = useRef<THREE.Group>(null);

  // 자이로 링 + 축 + N/S 콘 + 라벨
  const gyro = useMemo(() => {
    const g = new THREE.Group();

    // 3축 링
    const ringGeo = new THREE.TorusGeometry(1.2, 0.02, 8, 48);
    const ring1 = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x44aaff, wireframe: true, transparent: true, opacity: 0.3 }));
    const ring2 = new THREE.Mesh(ringGeo.clone(), new THREE.MeshBasicMaterial({ color: 0xff4444, wireframe: true, transparent: true, opacity: 0.3 }));
    ring2.rotation.x = Math.PI / 2;
    const ring3 = new THREE.Mesh(ringGeo.clone(), new THREE.MeshBasicMaterial({ color: 0x44ff44, wireframe: true, transparent: true, opacity: 0.3 }));
    ring3.rotation.y = Math.PI / 2;
    g.add(ring1, ring2, ring3);

    // 축 화살표
    g.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1.0, 0xff4444, 0.15, 0.08));
    g.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 1.0, 0x44ff44, 0.15, 0.08));
    g.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 1.0, 0x4488ff, 0.15, 0.08));

    // N 콘 (Z- = 북쪽)
    const nCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.4, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3333 }),
    );
    nCone.position.set(0, 0, -1.3);
    nCone.rotation.x = -Math.PI / 2;
    g.add(nCone);

    // S 콘
    const sCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.25, 8),
      new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.5 }),
    );
    sCone.position.set(0, 0, 1.3);
    sCone.rotation.x = Math.PI / 2;
    g.add(sCone);

    // 방위 라벨 (스프라이트)
    function makeLabel(text: string, color: string, pos: THREE.Vector3) {
      const canvas = document.createElement("canvas");
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = color;
      ctx.font = "bold 40px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 32, 32);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
      s.position.copy(pos);
      s.scale.set(0.4, 0.4, 1);
      return s;
    }
    g.add(makeLabel("N", "#ff4444", new THREE.Vector3(0, 0, -1.6)));
    g.add(makeLabel("S", "#888888", new THREE.Vector3(0, 0, 1.6)));
    g.add(makeLabel("E", "#888888", new THREE.Vector3(1.5, 0, 0)));
    g.add(makeLabel("W", "#888888", new THREE.Vector3(-1.5, 0, 0)));

    g.add(new THREE.AmbientLight(0xffffff, 0.8));
    return g;
  }, []);

  // 메인 카메라 quaternion 역방향으로 자이로 회전
  useFrame(() => {
    const q = _mainCameraQuat.clone().invert();
    gyro.quaternion.copy(q);
  });

  return <primitive object={gyro} />;
}

// --- 메인 뷰어 ---

export const SceneViewer = memo(function SceneViewer({ sceneData, selectedCandidateId, layers }: SceneViewerProps) {
  if (!sceneData) {
    return (
      <div className="flex h-full min-h-[540px] items-center justify-center rounded-[1.75rem] border border-dashed border-border bg-slate-950/80 p-8 text-center text-sm text-slate-300">
        주소를 검색하고 필지를 선택한 뒤 건물을 생성하세요.
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[540px] overflow-hidden rounded-[1.75rem] border border-slate-800/70 bg-[#09131d]">
      <Canvas shadows dpr={[1, 2]} style={{ touchAction: "none" }}>
        <color attach="background" args={["#09131d"]} />
        <fog attach="fog" args={["#09131d", 150, 400]} />
        <SceneMeshes sceneData={sceneData} selectedCandidateId={selectedCandidateId} layers={layers} />
        <CameraTracker />
      </Canvas>

      {/* 3축 자이로 나침반 — 별도 Canvas */}
      <div className="pointer-events-none absolute right-3 bottom-20 h-[120px] w-[120px]">
        <Canvas camera={{ position: [0, 0, 3.5], fov: 50 }} style={{ background: "transparent" }}>
          <CompassHUD />
        </Canvas>
      </div>

      {/* 대지 정보 HUD */}
      <div className="pointer-events-none absolute bottom-4 right-4 rounded-2xl border border-white/15 bg-slate-950/60 px-4 py-3 text-xs text-white/90 backdrop-blur">
        <div className="font-semibold">대지 정보</div>
        <div className="mt-1 space-y-0.5 text-white/70">
          <div>면적 {formatNumber(sceneData.site.area)}㎡</div>
          <div>{sceneData.site.width} × {sceneData.site.length}m</div>
        </div>
      </div>
    </div>
  );
});
