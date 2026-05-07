import { useEffect, useRef } from "react";
import type { WmsTreeNode } from "../wms/types";

interface Props {
  node: WmsTreeNode;
  selectedKeys: Set<string>;
  toggleSelect: (key: string, layerName: string, cqlFilter?: string) => void;
  bulkSetSelected: (keys: string[], select: boolean) => void;
  opacity: Record<string, number>;
  setOpacity: (key: string, op: number) => void;
}

function collectSelectableLeafKeys(node: WmsTreeNode, out: string[]): void {
  if (node.disabled) return;
  if (node.isLeaf) {
    if (node.layer) out.push(node.id);
    return;
  }
  for (const c of node.children) collectSelectableLeafKeys(c, out);
}

export default function WmsTreeNodeView(props: Props) {
  const { node, selectedKeys, toggleSelect, bulkSetSelected, opacity, setOpacity } = props;

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

  // 폴더 노드 — cascading checkbox
  const leafKeys: string[] = [];
  collectSelectableLeafKeys(node, leafKeys);
  const selectedCount = leafKeys.reduce((n, k) => n + (selectedKeys.has(k) ? 1 : 0), 0);
  const allChecked = leafKeys.length > 0 && selectedCount === leafKeys.length;
  const someChecked = selectedCount > 0 && !allChecked;
  const noSelectableChildren = leafKeys.length === 0;

  const checkboxRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = someChecked;
  }, [someChecked]);

  function handleFolderToggle() {
    bulkSetSelected(leafKeys, !allChecked);
  }

  return (
    <li className={`tree-folder${node.disabled ? " disabled" : ""}`}>
      <details open={node.depth === 0} style={{ paddingLeft: node.depth * 12 }}>
        <summary className="tree-folder-summary">
          <input
            ref={checkboxRef}
            type="checkbox"
            disabled={node.disabled || noSelectableChildren}
            checked={allChecked}
            onChange={handleFolderToggle}
            onClick={(e) => e.stopPropagation()}
            className="tree-folder-checkbox"
          />
          <span className="tree-folder-icon">{node.disabled ? "⊘" : "📁"}</span>
          <span className="tree-folder-label">{node.label}</span>
        </summary>
        <ul className="tree-children">
          {node.children.map((c) => (
            <WmsTreeNodeView
              key={c.id}
              node={c}
              selectedKeys={selectedKeys}
              toggleSelect={toggleSelect}
              bulkSetSelected={bulkSetSelected}
              opacity={opacity}
              setOpacity={setOpacity}
            />
          ))}
        </ul>
      </details>
    </li>
  );
}
