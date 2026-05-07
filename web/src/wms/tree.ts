import type { WmsLayerItem, WmsTreeNode } from "./types";

const WMS_API_URL = "/wmsapi/wmsLayers";

export async function fetchWmsTree(): Promise<WmsTreeNode[]> {
  const resp = await fetch(WMS_API_URL);
  if (!resp.ok) {
    throw new Error(`WMS 트리 로드 실패: HTTP ${resp.status}`);
  }
  const raw = await resp.json();
  if (!Array.isArray(raw)) {
    throw new Error("WMS 트리 응답 형식 오류 (배열 아님)");
  }
  const items = (raw as WmsLayerItem[]).filter((it) => (it.use_at ?? "true") === "true");
  return buildTree(items, 0, 0);
}

export function buildTree(items: WmsLayerItem[], parentId: number, depth: number): WmsTreeNode[] {
  return items
    .filter((it) => it.parent_id === parentId)
    .map((it) => {
      const label = it.label || it.LABEL || `Node ${it.layer_id}`;
      const children = buildTree(items, it.layer_id, depth + 1);
      const node: WmsTreeNode = {
        id: String(it.layer_id),
        layerId: it.layer_id,
        parentId: it.parent_id,
        layer: it.layer || undefined,
        cqlFilter: it.cql_filter || undefined,
        label,
        depth,
        disabled: false,
        isLeaf: children.length === 0,
        children,
      };
      node.disabled = isNodeDisabled(node);
      return node;
    });
}

export function isNodeDisabled(node: WmsTreeNode): boolean {
  if (node.depth === 0 && node.label === "지구단위계획구역") return true;
  if (node.depth === 0 && countLeaves(node) >= 100) return true;
  return false;
}

function countLeaves(node: WmsTreeNode): number {
  if (node.isLeaf) return 1;
  let n = 0;
  for (const c of node.children) n += countLeaves(c);
  return n;
}
