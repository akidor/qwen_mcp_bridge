export interface WmsLayerItem {
  layer_id: number;
  parent_id: number;
  layer?: string | null;
  cql_filter?: string;
  label?: string;
  LABEL?: string;
  use_at?: string;
}

export interface WmsTreeNode {
  id: string;
  layerId: number;
  parentId: number;
  layer?: string;
  cqlFilter?: string;
  label: string;
  depth: number;
  disabled: boolean;
  isLeaf: boolean;
  children: WmsTreeNode[];
}
