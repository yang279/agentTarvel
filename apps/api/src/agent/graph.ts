import type { ChatOpenAI } from "@langchain/openai";
import type {
  ChatMessage,
  TripPlan,
  TripRequirements,
  Poi,
  SearchPlanItem,
} from "@travel/shared";
import type { AmapService } from "../amap/amap.service";
import {
  EXTRACT_PROMPT,
  CLARIFY_PROMPT,
  PLAN_SEARCH_PROMPT,
  GENERATE_PROMPT,
} from "./prompts";
import { callJson, callText } from "./llm";

export interface AgentStateShape {
  messages: ChatMessage[];
  requirements: TripRequirements;
  needClarify: boolean;
  reply: string;
  think: string;
  searchPlan: SearchPlanItem[];
  pois: Poi[];
  itinerary: TripPlan | null;
}

function normalizeRequirements(data: any): TripRequirements {
  const toInt = (v: any): number | undefined => {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? undefined : n;
  };
  return {
    destination: data?.destination || undefined,
    days: typeof data?.days === "number" ? data.days : toInt(data?.days),
    people: typeof data?.people === "number" ? data.people : toInt(data?.people),
    budget: data?.budget || undefined,
    interests: Array.isArray(data?.interests)
      ? data.interests.filter((x: any) => typeof x === "string")
      : undefined,
    startDate: data?.startDate || undefined,
    complete: !!data?.complete,
  };
}

function normalizeItinerary(
  data: any,
  req: TripRequirements,
  pois: Poi[],
): TripPlan {
  const poiMap = new Map(pois.map((p) => [p.id, p]));
  return {
    destination: data?.destination || req.destination || "",
    city: req.destination,
    summary: data?.summary,
    days: Array.isArray(data?.days)
      ? data.days.map((d: any) => ({
          day: d?.day,
          title: d?.title,
          items: Array.isArray(d?.items)
            ? d.items.map((it: any) => {
                const poi = it?.poiId ? poiMap.get(it.poiId) : undefined;
                return {
                  time: it?.time,
                  title: poi?.name || it?.title || "",
                  kind: poi?.category || it?.kind || "other",
                  poiId: it?.poiId || poi?.id,
                  poiName: poi?.name,
                  address: poi?.address,
                  location: poi?.location,
                  note: it?.note,
                  cost: poi?.cost,
                  rating: poi?.rating,
                  tag: poi?.tag,
                };
              })
            : [],
        }))
      : [],
    meta: {
      people: req.people,
      budget: req.budget,
      startDate: req.startDate,
      interests: req.interests,
    },
  };
}

function defaultPlan(r: TripRequirements): SearchPlanItem[] {
  const d = r.destination || "";
  return [
    { kind: "attraction", keyword: `${d} 热门景点` },
    { kind: "attraction", keyword: `${d} 必去` },
    { kind: "food", keyword: `${d} 特色美食` },
    { kind: "food", keyword: `${d} 小吃` },
    { kind: "hotel", keyword: `${d} 酒店` },
  ];
}

function resolveEnrichKeyword(item: any): string | null {
  const title = item?.title?.trim();
  if (!title) return null;
  let kw: string = title;
  if (item.kind === "transport") {
    const m = title.match(/前往\s*(.+)$/);
    if (m?.[1]) kw = m[1].trim();
  }
  kw = kw.replace(/[（(][^（）()]*[）)]/g, "").trim();
  const parts = kw
    .split(/[\/，,、或;；]/)
    .map((p: string) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts[0] : kw || null;
}

async function enrichItinerary(
  amap: AmapService,
  itinerary: TripPlan,
): Promise<TripPlan> {
  const city = itinerary.city || itinerary.destination;
  for (const day of itinerary.days) {
    for (const item of day.items) {
      if (item.location) continue;
      const keyword = resolveEnrichKeyword(item);
      if (!keyword) continue;
      try {
        const pois = await amap.searchText(keyword, city, 1);
        if (pois.length > 0) {
          const p = pois[0];
          item.poiId = p.id;
          item.poiName = p.name;
          item.location = p.location;
          if (!item.address) item.address = p.address;
          if (!item.rating) item.rating = p.rating;
          if (!item.cost) item.cost = p.cost;
          if (item.kind === "other" && p.category && p.category !== "other") {
            item.kind = p.category;
          }
        }
      } catch (e) {
        // ignore single POI enrich failure
      }
    }
  }
  return itinerary;
}

export async function createTravelGraph(amap: AmapService, model: ChatOpenAI) {
  const { Annotation, StateGraph, START, END } = await import("@langchain/langgraph");

  const AgentState = Annotation.Root({
    messages: Annotation<ChatMessage[]>({
      reducer: (x, y) => y ?? x,
      default: () => [],
    }),
    requirements: Annotation<TripRequirements>({
      reducer: (x, y) => y ?? x,
      default: () => ({ complete: false }),
    }),
    needClarify: Annotation<boolean>({
      reducer: (x, y) => y ?? x,
      default: () => false,
    }),
    reply: Annotation<string>({ reducer: (x, y) => y ?? x, default: () => "" }),
    think: Annotation<string>({ reducer: (x, y) => y ?? x, default: () => "" }),
    searchPlan: Annotation<SearchPlanItem[]>({
      reducer: (x, y) => y ?? x,
      default: () => [],
    }),
    pois: Annotation<Poi[]>({ reducer: (x, y) => y ?? x, default: () => [] }),
    itinerary: Annotation<TripPlan | null>({
      reducer: (x, y) => y ?? x,
      default: () => null,
    }),
  });

  const formatHistory = (messages: ChatMessage[]) =>
    messages
      .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
      .join("\n");

  const extract = async (state: any) => {
    try {
      const history = formatHistory(state.messages);
      const { data, reasoning } = await callJson(model, EXTRACT_PROMPT, history);
      return { requirements: normalizeRequirements(data), think: reasoning };
    } catch (e) {
      return { requirements: state.requirements, think: "" };
    }
  };

  const route = (state: any) => {
    const r: TripRequirements = state.requirements || {};
    const complete = !!(r.destination && r.days);
    return { needClarify: !complete, requirements: r };
  };

  const clarify = async (state: any) => {
    const r: TripRequirements = state.requirements || {};
    const missing: string[] = [];
    if (!r.destination) missing.push("目的地");
    if (!r.days) missing.push("游玩天数");
    if (!r.people) missing.push("出行人数");
    if (!r.budget) missing.push("预算");
    if (!r.interests?.length) missing.push("兴趣偏好");

    const system = CLARIFY_PROMPT.replace(
      "{destination}",
      r.destination || "未定",
    ).replace("{missing}", missing.join("、") || "更多信息");

    try {
      const { text, reasoning } = await callText(
        model,
        system,
        formatHistory(state.messages),
      );
      return { reply: text || "能再告诉我一些你的出行信息吗？", think: reasoning };
    } catch (e) {
      return { reply: "能再告诉我一些你的出行信息吗？", think: "" };
    }
  };

  const planSearch = async (state: any) => {
    const r: TripRequirements = state.requirements || {};
    const system = PLAN_SEARCH_PROMPT.replace(
      "{destination}",
      r.destination || "",
    )
      .replace("{days}", String(r.days ?? 2))
      .replace("{people}", String(r.people ?? 1))
      .replace("{interests}", (r.interests || []).join("、") || "不限")
      .replace("{budget}", r.budget || "不限");
    try {
      const { data, reasoning } = await callJson(model, system, "请生成搜索计划。");
      const searches = Array.isArray(data?.searches) ? data.searches : [];
      return { searchPlan: searches.slice(0, 12), think: reasoning };
    } catch (e) {
      return { searchPlan: defaultPlan(r), think: "" };
    }
  };

  const searchPois = async (state: any) => {
    const city = state.requirements?.destination;
    const all: Poi[] = [];
    for (const item of state.searchPlan || []) {
      try {
        const pois = await amap.searchText(item?.keyword, city, 6);
        for (const p of pois) {
          if (item?.kind && item.kind !== "other") p.category = item.kind;
        }
        all.push(...pois);
      } catch (e) {
        // ignore single search failure
      }
    }
    const seen = new Set<string>();
    const dedup = all.filter((p) =>
      seen.has(p.id) ? false : (seen.add(p.id), true),
    );
    return { pois: dedup };
  };

  const generate = async (state: any) => {
    const r: TripRequirements = state.requirements || {};
    const pois: Poi[] = state.pois || [];
    const poisText = pois
      .map((p) => {
        const meta = [
          p.rating ? `评分${p.rating}` : "",
          p.cost ? `人均${p.cost}元` : "",
          p.tag?.length ? `招牌菜:${p.tag.slice(0, 5).join("/")}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        return `- ${p.id} | ${p.name} | ${p.category} | ${meta} | ${p.address ?? ""}`;
      })
      .join("\n");
    const system = GENERATE_PROMPT.replace("{destination}", r.destination || "")
      .replace("{days}", String(r.days ?? 2))
      .replace("{people}", String(r.people ?? 1))
      .replace("{interests}", (r.interests || []).join("、") || "不限")
      .replace("{budget}", r.budget || "不限")
      .replace("{pois}", poisText || "（无）");
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data, reasoning } = await callJson(model, system, "请生成行程。");
        let itinerary = normalizeItinerary(data, r, pois);
        try {
          itinerary = await enrichItinerary(amap, itinerary);
        } catch (e) {
          console.error("[enrich] failed:", (e as Error).message);
        }
        return { itinerary, think: reasoning };
      } catch (e) {
        if (attempt === 1) {
          console.error("[generate] failed:", (e as Error).message);
          return { itinerary: null, think: "" };
        }
      }
    }
    return { itinerary: null, think: "" };
  };

  const finalize = (state: any) => {
    const it: TripPlan | null = state.itinerary;
    if (!it) {
      return { reply: "抱歉，行程生成失败，请重新描述一下需求再试一次。" };
    }
    const reply = it.summary || "行程已生成，请查看详情。";
    return { reply };
  };

  const graph = new StateGraph(AgentState)
    .addNode("extract", extract)
    .addNode("route", route)
    .addNode("clarify", clarify)
    .addNode("planSearch", planSearch)
    .addNode("searchPois", searchPois)
    .addNode("generate", generate)
    .addNode("finalize", finalize)
    .addEdge(START, "extract")
    .addEdge("extract", "route")
    .addConditionalEdges("route", (state: any) =>
      state.needClarify ? "clarify" : "planSearch",
    )
    .addEdge("clarify", END)
    .addEdge("planSearch", "searchPois")
    .addEdge("searchPois", "generate")
    .addEdge("generate", "finalize")
    .addEdge("finalize", END)
    .compile();

  return graph;
}