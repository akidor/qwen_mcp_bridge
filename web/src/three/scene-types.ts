/**
 * SceneData TypeScript 타입 정의
 *
 * POST /api/generate-scene 응답의 scene_data 필드 구조.
 * 프론트엔드(@react-three/fiber)에서 3D 렌더링에 사용.
 *
 * 좌표계: EPSG:5179 (미터), site centroid를 원점(0,0)으로 정규화.
 * Three.js 매핑: X = polygon X, Y = 높이(up), Z = -polygon Y
 */

export type Coord2D = [number, number];
export type Coord3D = [number, number, number];

export interface LayerState {
  visible: boolean;
  opacity: number;
}

export interface EdgeDim {
  length: number;
  mid: Coord2D;
  p0: Coord2D;
  p1: Coord2D;
}

export interface SiteData {
  coordinates: Coord2D[];
  area: number;
  width: number;
  length: number;
  edge_dims: EdgeDim[];
}

export interface BuildableData {
  coordinates: Coord2D[];
  area: number;
}

export interface FloorData {
  floor: number;
  z_bottom: number;
  z_top: number;
  coordinates: Coord2D[];
  holes: Coord2D[][];
  area: number;
  is_setback: boolean;
  is_piloti: boolean;
  is_basement: boolean;
  building_index?: number | null;
  purpose?: string;
}

export interface CandidateMetrics {
  floors: number;
  height: number;
  gfa: number;
  far: number;
  bcr: number;
}

export interface CandidateData {
  id: string;
  typology: string;
  mode?: string;
  metrics: CandidateMetrics;
  floors: FloorData[];
  parking?: {
    spaces: {
      center: Coord2D;
      width: number;
      length: number;
      rotation: number;
      coords: Coord2D[];
      z?: number;
      parking_type?: string;
      is_accessible?: boolean;
    }[];
    total_count: number;
    turning_paths?: {
      coords: Coord2D[];
      z?: number;
      blocked?: boolean;
    }[];
  };
  piloti_columns?: { center: Coord2D; size: number; height: number; rotation: number }[];
  piloti_core?: { coordinates: Coord2D[]; z_bottom: number; z_top: number }[];
  parking_accesses?: {
    kind: "ground_exit" | "basement_ramp";
    label: string;
    coords: [Coord2D, Coord2D];
  }[];
  ramp?: {
    slope_vertices: number[];
    slope_indices: number[];
    wall_vertices: number[];
    wall_indices: number[];
    ramp_2d_coords: Coord2D[];
    clearance_2d_coords?: Coord2D[];
    depth: number;
    width: number;
    turning_radius?: number;
  } | null;
}

export interface NorthSlopeFace {
  coords: Coord2D[];
  base_coords: Coord2D[];
  inward: Coord2D;
  ground_face: Coord3D[];
  vertical_face: Coord3D[];
  horizontal_face: Coord3D[];
  slope_face: Coord3D[];
  clipped_surface: Coord3D[];
}

export interface NorthSlopeData {
  enabled: boolean;
  slope_ratio: number;
  base_height: number;
  base_offset: number;
  north_edges: NorthSlopeFace[];
}

export interface TerrainData {
  points: Coord3D[];
  rows: number;
  cols: number;
  bounds: { min_z: number; max_z: number };
  mask: number[];
}

export interface NeighborData {
  pnu: string;
  jibun: string;
  jimok: string;
  coordinates: Coord2D[];
  area: number;
}

export interface NearbyBuildingData {
  name: string;
  floors: number;
  underground: number;
  height: number;
  use_code: string;
  use_label: string;
  category_id: string;
  category_label: string;
  color: string;
  area: number;
  label_point: Coord2D;
  footprints: Coord2D[][];
}

export interface RoadEdgeData {
  coords: [Coord2D, Coord2D];
  width: number;
  mid: Coord2D;
}

export interface SetbackLabel {
  position: "front" | "side" | "rear";
  setback: number;
  dynamic_extra?: number;
  reason?: string;
  mid: Coord2D;
  p0: Coord2D;
  p1: Coord2D;
  normal: Coord2D;
}

export interface SceneData {
  site: SiteData;
  buildable: BuildableData | null;
  north_angle: number;
  north_slope: NorthSlopeData;
  origin: { x: number; y: number };
  candidates: CandidateData[];
  neighbors: NeighborData[];
  nearby_buildings: NearbyBuildingData[];
  road_edges: RoadEdgeData[];
  setback_labels: SetbackLabel[];
  terrain: TerrainData | null;
  wms_url: string | null;
  wms_zoning_url: string | null;
}

export interface NorthSlopeParams {
  enabled: boolean;
  slope_ratio?: number;
  low_height_threshold?: number;
  low_height_offset?: number;
  base_height?: number;
}

export interface ConstraintParams {
  bcr_max?: number;
  far_max?: number;
  setback_front?: number;
  setback_side?: number;
  setback_rear?: number;
  floor_height?: number;
  north_slope?: NorthSlopeParams;
}

export interface PlannedFloorProgramEntry {
  floor: number;
  label: string;
  use_id: string | null;
  use_name: string;
  area: number;
  is_piloti: boolean;
  building_index?: number | null;
  purpose?: "residential" | "commercial" | "office" | "piloti" | "unknown";
  estimated_units?: number | null;
}

export interface PlanningSeed {
  source: string;
  purpose_id?: string | null;
  purpose_label?: string | null;
  business_goal: "balanced" | "max_far" | "max_business";
  pricing_preset: "conservative" | "default" | "optimistic";
  cost_preset: "conservative" | "default" | "efficient";
  unit_size_profile: "small" | "medium" | "large";
  layout_pattern_preference: "auto" | "bar" | "corner_l" | "courtyard_u";
  piloti_suggested: boolean;
  note?: string | null;
  preferred_typologies?: string[];
  floors: PlannedFloorProgramEntry[];
  summary: {
    planned_above_ground_floors: number;
    planned_program_floors: number;
    mixed_use: boolean;
    piloti_floors: number;
    total_estimated_units?: number;
    count_by_purpose: Record<string, number>;
    area_by_purpose: Record<string, number>;
    area_by_use_id: Record<string, number>;
    target_floor_count?: number;
    lower_non_residential_floors?: number;
    upper_residential_floors?: number;
    generation_strategy?: string;
    strategy_note?: string;
    business_goal_note?: string;
    pricing_preset_note?: string;
    cost_preset_note?: string;
    planned_building_count?: number;
  };
}

export interface LargeSiteStrategySummary {
  profile_name: string;
  site_scale: "medium" | "large" | "very_large";
  preferred_typologies: string[];
  recommended_building_count_hint: number;
  rationale: string[];
  parameter_hints: Record<string, number | number[] | string | null>;
}

export interface LandscapeSummary {
  profile_name?: string;
  required_ratio?: number;
  required_area: number;
  provided_area: number;
  ratio: number;
  status: "sufficient" | "insufficient" | "unknown";
  shortage_area?: number;
  surplus_area?: number;
  notes: string[];
  parameter_hints?: Record<string, number | string | null>;
  footprint_area?: number;
  parking_area?: number;
  ramp_area?: number;
}

export interface GenerateRequest {
  pnu: string;
  project_id?: number | null;
  constraints?: ConstraintParams;
  typologies?: string[];
  road_bias?: number;  // -1=이격, 0=중앙, 1=밀착
  road_position?: number;  // -1=선택 변 기준 좌, 0=중앙, 1=우
  bias_edge?: number | null;  // 배치 편향 기준 edge 인덱스
  piloti?: boolean;
  piloti_height?: number;  // 필로티 층고 (0=일반 층고, m)
  piloti_ratio?: number;   // 필로티 면적 비율 (0=코어만, 0.5=상층50%, 1=동일)
  piloti_width?: number;   // 필로티 가로 폭 (0=자동, m)
  piloti_depth?: number;   // 필로티 세로 깊이 (0=자동, m)
  core_type?: string;       // stairs_only|standard|corridor|auto
  core_width?: number;      // 사용자 지정 코어 폭 (0=프리셋)
  core_depth?: number;      // 사용자 지정 코어 깊이 (0=프리셋)
  core_placement?: string;  // road_side|center|rear_side
  core_orientation?: string;  // perpendicular|parallel|auto
  main_road_index?: number | null;  // 주출입 도로 edge 인덱스
  core_edge?: number | null;  // 코어 밀착 edge 인덱스 (edge_classifications 기준)
  parking_exit_edge?: number | null;
  parking_direction_preference?: "auto" | "road_aligned" | "core_aligned" | "dual";
  ground_parking_direction_preference?: "auto" | "road_aligned" | "core_aligned" | "dual";
  basement_parking_direction_preference?: "auto" | "road_aligned" | "core_aligned" | "dual";
  basement_enabled?: boolean;
  basement_floors?: number;
  basement_floor_height?: number;
  basement_ramp_edge?: number | null;
  basement_turning_radius?: number;
  parking_type_preference?: "auto" | "perpendicular" | "parallel" | "tandem";
  ground_parking_type_preference?: "auto" | "perpendicular" | "parallel" | "tandem";
  basement_parking_type_preference?: "auto" | "perpendicular" | "parallel" | "tandem";
  parking_offset_x?: number;  // 주차 좌우 오프셋 (m)
  parking_offset_y?: number;  // 주차 앞뒤 오프셋 (m)
  core_position?: number;     // -1~+1 선택 변 위 좌우 위치
  top_n?: number;
  seed?: number;
  purpose?: string;  // 용도 프리셋 ID (주차 계산용)
  business_goal?: "balanced" | "max_far" | "max_business";
  pricing_preset?: "conservative" | "default" | "optimistic";
  cost_preset?: "conservative" | "default" | "efficient";
  unit_size_profile?: "small" | "medium" | "large";
  layout_pattern_preference?: "bar" | "corner_l" | "courtyard_u" | "auto";
  planned_floor_program?: PlannedFloorProgramEntry[];
  assembly_pnus?: string[];  // 합필 PNU 목록
  building_count?: number;   // 동수 (0=자동)
  split_direction?: string;  // auto|long_axis|short_axis
  building_far_ratios?: number[];  // 동별 FAR 배분 비율 (합계 1.0)
  building_road_biases?: number[];  // 동별 배치 편향 (-1~1)
  building_road_positions?: number[];  // 동별 변 방향 위치 (-1~1)
  building_bias_edges?: (number | null)[];  // 동별 배치 기준 변
  building_core_edges?: (number | null)[];  // 동별 코어 밀착 변
  building_core_positions?: number[];  // 동별 코어 위치 (-1~1)
  building_core_types?: string[];  // 동별 코어 유형
  building_core_orientations?: string[];  // 동별 코어 방향
}

export interface CandidateScores {
  area_efficiency: number;
  regulation_fit: number;
  road_response: number;
  solar_exposure: number;
  simplicity: number;
  total_score: number;
  regulatory_fit_axis: number;
  program_fit_axis: number;
  circulation_fit_axis: number;
  operational_fit_axis: number;
}

export interface CandidateSummary {
  id: string;
  typology: string;
  mode?: string;
  floors: number;
  height: number;
  gfa: number;
  far: number;
  bcr: number;
  arch_area?: number;
  scores?: CandidateScores;
  parking_required?: number;
  parking_available?: number;
  ground_parking_available?: number;
  basement_parking_available?: number;
  parking_status?: "sufficient" | "insufficient" | "uncertain";
  building_index?: number;
  parking_breakdown?: { label: string; use_category: string; calc_mode: string; count: number; formula: string }[];
  parking_level_summary?: {
    label: string;
    count: number;
    mix_counts: Record<string, number>;
    accessible_count: number;
    is_basement: boolean;
  }[];
  parking_layout_info?: {
    status?: "passed" | "warning" | "failed" | null;
    direction_policy?: string | null;
    parking_type?: string | null;
    hard_fails: string[];
    warnings: string[];
    checks: Record<string, boolean>;
    mix_counts?: Record<string, number>;
    accessible_count?: number;
    required_accessible_count?: number;
    access_labels?: string[];
    turning_radius?: number | null;
    decision_note?: string | null;
    access_role_note?: string | null;
    parking_type_note?: string | null;
    score?: {
      components: Record<string, number>;
      total: number;
    } | null;
  };
  refined_unit_estimate?: {
    estimated_units: number;
    total_usable_area: number;
    target_unit_area: number;
    unit_size_profile: string;
    total_exclusive_area?: number;
    assumptions: string[];
  };
  floor_unit_breakdown?: {
    floor: number;
    label: string;
    building_index?: number | null;
    purpose?: string | null;
    area: number;
    estimated_units: number;
    total_exclusive_area: number;
    corridor_type?: string | null;
    layout_pattern?: string | null;
    source: "testfit" | "estimator";
  }[];
  unit_testfit?: {
    total_units: number;
    total_exclusive_area: number;
    efficiency_ratio: number;
    corridor_type: string;
    layout_pattern: string;
    branch_count: number;
    max_egress_distance: number;
    mix_counts: Record<string, number>;
    score: number;
    layout_rank: number;
    variant_count: number;
    use_category: string;
    unit_size_profile: string;
    units: { x: number; y: number; width: number; depth: number; rotation: number; type: string }[];
    corridor_coords: number[][];
    variants?: {
      rank: number;
      total_units: number;
      total_exclusive_area: number;
      efficiency_ratio: number;
      corridor_type: string;
      layout_pattern: string;
      branch_count: number;
      mix_counts: Record<string, number>;
      score: number;
    }[];
  };
  program_fit?: {
    usable_area: number;
    estimated_units?: number;
    estimated_bays?: number;
    corridor_type: string;
    efficiency_ratio: number;
    band_depth: number;
    score: number;
    hard_fail: boolean;
    hard_fail_reason?: string;
  };
  core_info?: {
    status: string;
    notes: string[];
    requested_type?: string | null;
    resolved_type?: string | null;
    has_core: boolean;
  };
  business_metrics?: {
    estimated_revenue: number;
    estimated_construction_cost: number;
    estimated_basement_cost: number;
    estimated_piloti_cost: number;
    estimated_land_cost: number;
    estimated_financing_penalty: number;
    estimated_total_cost: number;
    estimated_profit: number;
    profit_rate: number;
    far_efficiency: number;
    parking_supply_ratio: number;
    basement_parking_share: number;
    business_score: number;
  };
  business_sensitivity?: {
    pricing: Record<string, {
      estimated_profit: number;
      profit_rate: number;
      business_score: number;
    }>;
    cost: Record<string, {
      estimated_profit: number;
      profit_rate: number;
      business_score: number;
    }>;
  };
  recommendation_labels?: string[];
  assembly_info?: {
    buildable_gain_ratio: number;
    recommended_building_count?: number | null;
    applied_building_count?: number | null;
    multi_combo_score?: number | null;
  };
  planning_info?: {
    alignment_score: number;
    purpose_match_score: number;
    floor_count_score: number;
    area_match_score: number;
    unit_match_score?: number | null;
    pattern_match?: boolean | null;
  };
  planning_generation_info?: {
    fit_score: number;
    target_floor_score: number;
    typology_priority_score: number;
    strategy_fit_score: number;
    piloti_match_score: number;
    lower_non_residential_target: number;
    lower_non_residential_actual: number;
    lower_non_residential_match_score: number;
    upper_residential_target: number;
    upper_residential_actual: number;
    upper_residential_match_score: number;
    floor_gap: number;
    generation_strategy: string;
    strategy_note?: string | null;
    decision_note?: string | null;
    reason_badges?: {
      label: string;
      tone: "positive" | "warning" | "neutral";
      detail: string;
    }[];
  };
  landscape_info?: LandscapeSummary;
}

export interface GenerateSceneResponse {
  address: string;
  jibun: string;
  pnu: string;
  site_area: number;
  buildable_area: number;
  zone_name: string;
  is_residential: boolean;
  bcr_max: number;
  far_max: number;
  candidates: CandidateSummary[];
  recommendations?: {
    max_far_candidate_id?: string | null;
    max_business_candidate_id?: string | null;
    balanced_candidate_id?: string | null;
    requested_goal?: "balanced" | "max_far" | "max_business" | null;
    requested_candidate_id?: string | null;
  };
  scene_data: SceneData;
  planning_seed?: PlanningSeed;
  site_strategy?: LargeSiteStrategySummary | null;
  landscape_precheck?: LandscapeSummary | null;
  warnings?: string[];
  rejected_summary?: { typology: string; reason: string }[];
}

export interface ShadowAtTimeData {
  time: string;
  altitude: number;
  azimuth: number;
  shadow_area: number;
  shadow_polygons: Coord2D[][];
}

export interface NeighborSunlightData {
  pnu: string;
  sunlit_hours: number[];
  total_sunlit: number;
  max_continuous: number;
  pass_continuous: boolean;
  pass_total: boolean;
}

export interface ShadowData {
  date: string;
  shadows: ShadowAtTimeData[];
  neighbor_sunlight: NeighborSunlightData[];
  pass_continuous: boolean;
  pass_total: boolean;
  notes: string[];
}

export interface StructuralCostData {
  structural_system: string;
  structural_label: string;
  column_spacing: number;
  cost_factor: number;
  gfa: number;
  above_ground_gfa: number;
  basement_gfa: number;
  cost_per_m2: Record<string, number>;
  breakdown: {
    structure: number;
    foundation: number;
    finishing: number;
    mep: number;
    exterior: number;
    basement_extra: number;
    piloti_extra: number;
    indirect: number;
    contingency: number;
  };
  schedule: {
    design_months: number;
    permit_months: number;
    construction_months: number;
    total_months: number;
  };
  notes: string[];
}

export interface EarthworkData {
  gl_elevation: number;
  max_elevation: number;
  min_elevation: number;
  slope_pct: number;
  cut_volume: number;
  fill_volume: number;
  net_volume: number;
  retaining_wall_length: number;
  estimated_cost: number;
  notes: string[];
}

export interface UnitLayoutFloorData {
  floor_number: number;
  floor_area: number;
  unit_count: number;
  exclusive_area: number;
  common_area: number;
  efficiency: number;
  unit_mix: Record<string, number>;
  is_piloti: boolean;
}

export interface UnitLayoutData {
  candidate_id: string;
  total_units: number;
  total_exclusive_area: number;
  total_common_area: number;
  avg_efficiency: number;
  unit_mix: Record<string, number>;
  floors: UnitLayoutFloorData[];
  layout_pattern: string;
  notes: string[];
}

export interface ScenarioCompareRow {
  name: string;
  candidate_id: string;
  floors: number;
  height: number;
  gfa: number;
  far: number;
  bcr: number;
  parking: number;
  typology: string;
  mode: string;
  bcr_max: number | null;
  far_max: number | null;
  piloti: boolean;
  core_type: string;
}

export interface ScenarioCompareData {
  pnu: string;
  group_name: string;
  group_id: number;
  scenarios: ScenarioCompareRow[];
}

export interface AssemblyCandidateResult {
  pnu: string;
  jibun: string;
  area_m2: number;
  shared_boundary_length: number;
  zone_name: string;
  zone_compatible: boolean;
  road_separated: boolean;
  site_coords?: Coord2D[];
  merged?: {
    union_area: number;
    buildable_area: number;
    buildable_area_delta: number;
    compactness_score: number;
    frontage_maintained: boolean;
    recommended_building_count: number;
  };
}

export interface AssemblySplitOption {
  building_count: number;
  split_direction: string;
  separation: number;
  total_score: number;
  zone_areas: number[];
  fill_ratios: number[];
  rationale: string;
  zone_coords: Coord2D[][];
}

export interface AssemblyResponse {
  root_pnu: string;
  root_area: number;
  root_site_coords?: Coord2D[];
  candidates: AssemblyCandidateResult[];
}

export interface AssemblyPreviewResponse {
  pnus: string[];
  area_m2: number;
  site_coords: Coord2D[];
  edge_classifications: EdgeClassification[];
  road_faces?: RoadFace[];
  road_face_count?: number;
  buildable_area?: number;
  buildable_area_delta?: number;
  recommended_building_count?: number;
  split_options?: AssemblySplitOption[];
  recommended_split?: AssemblySplitOption | null;
  zone_name?: string;
  bcr?: number | null;
  far?: number | null;
  original_parcels?: Coord2D[][] | null;
}

export interface SearchResult {
  pnu: string;
  juso: string;
  jibun: string;
  area_m2: number;
}

export interface BuildingInfo {
  name: string;
  main_purpose: string;
  structure: string;
  roof: string;
  ground_floors: number;
  underground_floors: number;
  height: number | null;
  plat_area: number | null;
  arch_area: number | null;
  total_area: number | null;
  bcr: number | null;
  far: number | null;
  permit_date: string | null;
  approval_date: string | null;
  households: number;
  families: number;
  elevators: number;
}

export interface FloorUsage {
  floor: string;
  purpose: string;
  area: number;
}

export interface RoadFace {
  index: number;
  length: number;
  road_width: number;
  mid: Coord2D;
  p0: Coord2D;
  p1: Coord2D;
  direction: string;
  position: string;
}

export interface EdgeClassification {
  p0: Coord2D;
  p1: Coord2D;
  position: string;   // front | side | rear
  adjacency: string;  // road | parcel | unknown
}

export interface ParcelDetail {
  pnu: string;
  juso: string;
  jibun: string;
  area_m2: number;
  jimok: string;
  zone_name: string;
  bcr: number | null;
  far: number | null;
  owntype?: string;
  zone2_name?: string;
  landuse?: string;
  road_side?: string;
  official_price?: number | null;
  official_area?: number | null;
  road_face_count?: number;
  road_faces?: RoadFace[];
  site_coords?: Coord2D[];
  edge_classifications?: EdgeClassification[];
  building?: BuildingInfo | null;
  building_floors?: FloorUsage[];
}

export interface RoadWidthEdge {
  edge_index: number;
  edge_mid: Coord2D;
  edge_length: number;
  adjacency: "road" | "parcel" | "unknown";
  road_width: number;
  direction: string;
  bearing: number;
  side: string;
  frontage_ratio: number;
}

export interface RoadWidthResponse {
  pnu: string;
  juso: string;
  jibun: string;
  edges: RoadWidthEdge[];
}

export interface LandUsePlan {
  code: string;
  name: string;
  detail: string;
  category: string;
  conflict: string;
}

export interface LandUseActionItem {
  action: string;
  restrict: string;
  target: string;
  detail: string;
}

export interface LandUseZoneData {
  ok: number;
  no: number;
  etc: number;
  items: LandUseActionItem[];
}

export interface LandUseData {
  pnu: string;
  plans: LandUsePlan[];
  zones: Record<string, LandUseZoneData>;
  limits: {
    max_floors: number | null;
    max_height: number | null;
  };
}

export interface PlanningPrecheckSummary {
  pnu?: string | null;
  site_area: number;
  buildable_area_cap: number;
  floor_area_cap: number;
  top_floor_area_cap: number | null;
  far_area_cap: number;
  recommended_ground_floors: number;
  recommended_underground_floors: number;
  recommended_area_per_floor: number;
  max_ground_floors: number;
  first_floor_height: number;
  floor_height: number;
  effective_max_height: number | null;
  north_slope_max_height: number | null;
  north_slope_conservative_height?: number | null;
  north_slope_best_height?: number | null;
  massing_floor_areas?: number[];
  massing_gfa?: number | null;
  massing_far?: number | null;
  alt_no_piloti_floors?: number | null;
  alt_no_piloti_gfa?: number | null;
  alt_no_piloti_far?: number | null;
  land_use_max_floors: number | null;
  land_use_max_height: number | null;
  building_count?: number;
  split_direction?: "auto" | "long_axis" | "short_axis";
  limiting_factors: string[];
  notes: string[];
  warnings: string[];
  is_feasible: boolean;
  blocked_reason: string | null;
  core_candidates?: {
    edge_index: number | null;
    position: number;
    label: string;
    estimated_floors: number;
    estimated_far: number;
    far_achievement_ratio: number;
    north_height_limit?: number | null;
    effective_height_limit?: number | null;
    top_floor_area_cap?: number | null;
    north_distance: number;
    score: number;
    reasons: string[];
    is_recommended: boolean;
  }[];
  recommended_core?: {
    edge_index: number | null;
    position: number;
    label: string;
    estimated_floors: number;
    estimated_far: number;
    far_achievement_ratio: number;
    north_height_limit?: number | null;
    effective_height_limit?: number | null;
    top_floor_area_cap?: number | null;
    north_distance: number;
    score: number;
    reasons: string[];
    is_recommended: boolean;
  } | null;
  edge_utilization?: {
    edge_index: number;
    label: string;
    estimated_floors: number;
    estimated_far: number;
    far_achievement_ratio: number;
    effective_height_limit?: number | null;
    score: number;
    reasons: string[];
  }[];
  building_summaries?: {
    building_index: number;
    label: string;
    zone_area: number;
    fill_ratio: number;
    split_direction: "auto" | "long_axis" | "short_axis" | string;
    rationale: string;
    floor_area_cap: number;
    top_floor_area_cap?: number | null;
    far_area_cap: number;
    recommended_ground_floors: number;
    recommended_area_per_floor: number;
    max_ground_floors: number;
    effective_max_height?: number | null;
    north_slope_max_height?: number | null;
    north_slope_conservative_height?: number | null;
    recommended_core?: {
      edge_index: number | null;
      position: number;
      label: string;
      estimated_floors: number;
      estimated_far: number;
      far_achievement_ratio: number;
      north_height_limit?: number | null;
      effective_height_limit?: number | null;
      top_floor_area_cap?: number | null;
      north_distance: number;
      score: number;
      reasons: string[];
      is_recommended: boolean;
    } | null;
    core_candidates?: {
      edge_index: number | null;
      position: number;
      label: string;
      estimated_floors: number;
      estimated_far: number;
      far_achievement_ratio: number;
      north_height_limit?: number | null;
      effective_height_limit?: number | null;
      top_floor_area_cap?: number | null;
      north_distance: number;
      score: number;
      reasons: string[];
      is_recommended: boolean;
    }[];
    notes?: string[];
  }[];
  site_strategy?: LargeSiteStrategySummary | null;
  landscape_info?: LandscapeSummary | null;
}

export type PlanningGuardLevel = "recommended" | "warning" | "required";

export interface PlanningSettingCheck {
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
  guard_level: PlanningGuardLevel;
}

export interface PlanningUpperFloorAdjustment {
  applies: boolean;
  affected_upper_floors: number;
  current_area_per_floor: number;
  top_floor_area_cap: number;
  shrink_area_per_floor: number;
  shrink_ratio: number;
}

export interface PlanningWorkbenchStatus {
  is_feasible: boolean;
  has_fail: boolean;
  has_warn: boolean;
  checks: PlanningSettingCheck[];
  blocked_reason: string | null;
  upper_floor_adjustment: PlanningUpperFloorAdjustment | null;
  guard_summary: {
    recommended: number;
    warning: number;
    required: number;
  };
  highest_guard_level: PlanningGuardLevel;
}

export interface GenerationHistoryItem {
  id: number;
  pnu: string;
  project_id: number | null;
  project_name: string | null;
  purpose_id: string | null;
  selected_candidate_id: string | null;
  created_at: string;
  summary: {
    candidate_count: number;
    first_candidate_id: string | null;
    purpose_label?: string | null;
    business_goal?: "balanced" | "max_far" | "max_business" | null;
    recommendation_labels: {
      max_far?: string | null;
      max_business?: string | null;
      balanced?: string | null;
      requested?: string | null;
    };
  };
  request_json?: GenerateRequest;
  response_json?: GenerateSceneResponse;
}

export interface GenerationHistoryResponse {
  pnu: string;
  project_id?: number | null;
  items: GenerationHistoryItem[];
}

export interface ProjectSummary {
  id: number;
  pnu: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
  generation_count: number;
}

export interface ProjectListResponse {
  pnu: string;
  items: ProjectSummary[];
}

export interface ProjectSnapshotResponse {
  id: number;
  pnu?: string | null;
  project_key?: string | null;
  project_name?: string | null;
  snapshot_json: Record<string, unknown>;
  metadata_json?: Record<string, unknown> | null;
  source?: string | null;
  created_at: string;
  updated_at: string;
}
