import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Poi, LngLat, PoiCategory } from "@travel/shared";

const AMAP_BASE = "https://restapi.amap.com";

interface AmapRawPoi {
  id: string;
  name: string;
  type?: string;
  typecode?: string;
  address?: string;
  location?: string;
  cityname?: string;
  adname?: string;
  rating?: string;
  cost?: string;
  tel?: string;
  photos?: { title?: string; url: string }[];
  tag?: string;
  biz_ext?: {
    rating?: string;
    cost?: string;
    open_time?: string;
  };
}

interface AmapResponse {
  status: string;
  info: string;
  count?: string;
  pois?: AmapRawPoi[];
  geocodes?: Array<{
    adcode?: string;
    city?: string;
    location?: string;
    formatted_address?: string;
  }>;
}

function mapCategory(type?: string, typecode?: string): PoiCategory {
  const t = type ?? "";
  const tc = typecode ?? "";
  if (tc.startsWith("05")) return "food";
  if (tc.startsWith("06")) return "shopping";
  if (tc.startsWith("10")) return "hotel";
  if (tc.startsWith("08") || tc.startsWith("11") || tc.startsWith("14"))
    return "attraction";
  if (
    t.includes("餐饮") ||
    t.includes("美食") ||
    t.includes("餐厅") ||
    t.includes("快餐")
  )
    return "food";
  if (t.includes("购物") || t.includes("商场") || t.includes("步行街"))
    return "shopping";
  if (t.includes("酒店") || t.includes("宾馆") || t.includes("民宿") || t.includes("住宿"))
    return "hotel";
  if (
    t.includes("风景") ||
    t.includes("景点") ||
    t.includes("公园") ||
    t.includes("景区") ||
    t.includes("名胜") ||
    t.includes("博物馆") ||
    t.includes("故居") ||
    t.includes("寺") ||
    t.includes("塔") ||
    t.includes("湖") ||
    t.includes("山") ||
    t.includes("古镇")
  )
    return "attraction";
  return "other";
}

function parseLocation(loc?: string): LngLat | undefined {
  if (!loc) return undefined;
  const [lng, lat] = loc.split(",").map((n) => parseFloat(n));
  if (Number.isNaN(lng) || Number.isNaN(lat)) return undefined;
  return { lng, lat };
}

function parseTags(tag?: string): string[] | undefined {
  if (!tag) return undefined;
  const arr = [...new Set(tag.split(/[,，]/).map((s) => s.trim()).filter(Boolean))];
  return arr.length > 0 ? arr : undefined;
}

@Injectable()
export class AmapService {
  private key: string;

  constructor(config: ConfigService) {
    this.key = config.get<string>("AMAP_KEY") ?? "";
  }

  private async get<T extends AmapResponse>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
    const qs = new URLSearchParams({ key: this.key });
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    }
    const url = `${AMAP_BASE}${path}?${qs.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const data = (await res.json()) as T;
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  private mapPois(pois: AmapRawPoi[] = []): Poi[] {
    return pois
      .filter((p) => p.id && p.name && p.location)
      .map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        typecode: p.typecode,
        address: p.address,
        location: parseLocation(p.location)!,
        cityname: p.cityname,
        adname: p.adname,
        category: mapCategory(p.type, p.typecode),
        rating: p.biz_ext?.rating ?? p.rating,
        cost: p.biz_ext?.cost ?? p.cost,
        tel: p.tel,
        photos: p.photos,
        tag: parseTags(p.tag),
      }));
  }

  /** 关键字搜索 POI */
  async searchText(keywords: string, city?: string, offset = 10): Promise<Poi[]> {
    const data = await this.get<AmapResponse>("/v3/place/text", {
      keywords,
      city,
      offset,
      extensions: "all",
    });
    return this.mapPois(data.pois);
  }

  /** 周边搜索 */
  async searchAround(
    location: LngLat,
    keywords?: string,
    radius = 5000,
    offset = 10,
  ): Promise<Poi[]> {
    const data = await this.get<AmapResponse>("/v3/place/around", {
      location: `${location.lng},${location.lat}`,
      keywords,
      radius,
      offset,
      extensions: "all",
    });
    return this.mapPois(data.pois);
  }

  /** 地理编码：城市/地址 -> adcode + 坐标 */
  async geocode(address: string, city?: string): Promise<{ adcode?: string; city?: string; location?: LngLat; formatted?: string }> {
    const data = await this.get<AmapResponse>("/v3/geocode/geo", {
      address,
      city,
    });
    const g = data.geocodes?.[0];
    if (!g) return {};
    return {
      adcode: g.adcode,
      city: g.city,
      location: parseLocation(g.location),
      formatted: g.formatted_address,
    };
  }

  /** 路径规划（驾车/步行），返回距离与时长 */
  async route(origin: LngLat, destination: LngLat, type: "driving" | "walking" = "driving"): Promise<{ distance?: string; duration?: string; polyline?: string }> {
    const path = type === "driving" ? "/v3/direction/driving" : "/v3/direction/walking";
    const data = await this.get<AmapResponse & { route?: { paths?: Array<{ distance?: string; duration?: string; polyline?: string }> } }>(
      path,
      {
        origin: `${origin.lng},${origin.lat}`,
        destination: `${destination.lng},${destination.lat}`,
        extensions: "base",
      },
    );
    const p = data.route?.paths?.[0];
    return {
      distance: p?.distance,
      duration: p?.duration,
      polyline: p?.polyline,
    };
  }
}