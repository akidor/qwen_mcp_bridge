import { BasemapKind } from "../map/basemaps";

interface FloatingPanelProps {
  map: any;
  basemap: BasemapKind;
  setBasemap: (b: BasemapKind) => void;
}

export default function FloatingPanel({ map, basemap, setBasemap }: FloatingPanelProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: 14,
        right: 14,
        width: 380,
        maxHeight: "calc(100vh - 28px)",
        background: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(10px)",
        borderRadius: 14,
        border: "1px solid rgba(0, 0, 0, 0.08)",
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.08)",
        zIndex: 10,
        padding: 16,
        fontSize: 13,
        color: "#1c1917",
      }}
    >
      <p style={{ margin: 0, fontSize: 11, letterSpacing: "0.06em", color: "#7c3aed", fontWeight: 600 }}>
        URBAN-CHAT
      </p>
      <p style={{ marginTop: 8 }}>지도 + panel 골격 OK. 다음 task에서 탭(대화/설정/디버그) 구현 예정.</p>
      <p style={{ marginTop: 8, fontSize: 11, color: "#a8a29e" }}>
        map ready: {map ? "✓" : "..."} · basemap: {basemap}
      </p>
    </div>
  );
}
