import type { WmsTreeNode } from "../wms/types";

interface Props {
  node: WmsTreeNode;
  selectedKeys: Set<string>;
  toggleSelect: (key: string, layerName: string, cqlFilter?: string) => void;
  opacity: Record<string, number>;
  setOpacity: (key: string, op: number) => void;
}

export default function WmsTreeNodeView({ node, selectedKeys, toggleSelect, opacity, setOpacity }: Props) {
  if (node.isLeaf) {
    const checked = selectedKeys.has(node.id);
    const op = opacity[node.id] ?? 0.8;
    return (
      <li
        className={`tree-item${node.disabled ? " disabled" : ""}`}
        style={{ paddingLeft: node.depth * 12 }}
      >
        <label className="tree-leaf-label">
          <input
            type="checkbox"
            disabled={node.disabled || !node.layer}
            checked={checked}
            onChange={() => node.layer && toggleSelect(node.id, node.layer, node.cqlFilter)}
          />
          <span className="tree-item-name" title={node.layer ?? ""}>{node.label}</span>
        </label>
        {checked && (
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={op}
            onChange={(e) => setOpacity(node.id, parseFloat(e.target.value))}
            className="tree-opacity-slider"
            title={`불투명도 ${Math.round(op * 100)}%`}
          />
        )}
      </li>
    );
  }
  return (
    <li className={`tree-folder${node.disabled ? " disabled" : ""}`}>
      <details open={node.depth === 0} style={{ paddingLeft: node.depth * 12 }}>
        <summary className="tree-folder-summary">
          {node.disabled ? "⊘" : "📁"} {node.label}
        </summary>
        <ul className="tree-children">
          {node.children.map((c) => (
            <WmsTreeNodeView
              key={c.id}
              node={c}
              selectedKeys={selectedKeys}
              toggleSelect={toggleSelect}
              opacity={opacity}
              setOpacity={setOpacity}
            />
          ))}
        </ul>
      </details>
    </li>
  );
}
