export interface LngLat {
  lng: number;
  lat: number;
}

export type PoiCategory =
  | "attraction"
  | "food"
  | "hotel"
  | "transport"
  | "shopping"
  | "other";

export interface PoiPhoto {
  title?: string;
  url: string;
}

/** 真实 POI（来自高德搜索） */
export interface Poi {
  id: string;
  name: string;
  type?: string;
  typecode?: string;
  address?: string;
  location: LngLat;
  cityname?: string;
  adname?: string;
  category: PoiCategory;
  rating?: string;
  cost?: string;
  tel?: string;
  photos?: PoiPhoto[];
  tag?: string[];
}

/** 行程中的单个条目 */
export interface ItineraryItem {
  time: string;
  title: string;
  kind: PoiCategory;
  poiId?: string;
  poiName?: string;
  address?: string;
  location?: LngLat;
  note?: string;
  cost?: string;
  rating?: string;
  tag?: string[];
}

/** 一天的行程 */
export interface DayPlan {
  day: number;
  title?: string;
  items: ItineraryItem[];
}

/** 完整行程方案 */
export interface TripPlan {
  destination: string;
  city?: string;
  days: DayPlan[];
  summary?: string;
  meta: TripMeta;
}

export interface TripMeta {
  people?: number;
  budget?: string;
  startDate?: string;
  interests?: string[];
  transport?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Agent 抽取的结构化出行需求 */
export interface TripRequirements {
  destination?: string;
  days?: number;
  people?: number;
  budget?: string;
  interests?: string[];
  startDate?: string;
  complete: boolean;
}

/** Agent 状态里暂存的一次工具调用计划 */
export interface SearchPlanItem {
  kind: PoiCategory;
  keyword: string;
  city?: string;
  location?: LngLat;
  radius?: number;
}