export interface DrawnFeature {
  id: string;
  geometry: GeoJSON.Geometry;
  geometryType: "Polygon" | "LineString" | "Point";
  label: string;
  visible: boolean;
  ts: number;
}

interface Props {
  drawnFeatures: DrawnFeature[];
  toggleVisible: (id: string) => void;
  remove: (id: string) => void;
}

const ICON: Record<DrawnFeature["geometryType"], string> = {
  Polygon: "▰",
  LineString: "✕",
  Point: "•",
};

export default function DrawnFeatures({ drawnFeatures, toggleVisible, remove }: Props) {
  if (drawnFeatures.length === 0) {
    return <div className="layer-section-placeholder">아직 그리기 없음</div>;
  }
  return (
    <ul className="tree-children">
      {[...drawnFeatures].reverse().map((f) => (
        <li key={f.id} className="tree-item">
          <label className="tree-leaf-label">
            <input
              type="checkbox"
              checked={f.visible}
              onChange={() => toggleVisible(f.id)}
            />
            <span className="tree-item-name">
              {ICON[f.geometryType]} {f.label}
            </span>
          </label>
          <button
            className="tree-reload-btn"
            title="삭제"
            onClick={() => remove(f.id)}
            style={{ marginLeft: 6 }}
          >
            🗑️
          </button>
        </li>
      ))}
    </ul>
  );
}
