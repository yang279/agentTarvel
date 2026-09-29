import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  ChatMessage,
  TripPlan,
  TripRequirements,
} from "@travel/shared";
import { AmapService } from "../amap/amap.service";
import { createModel } from "./llm";
import { createTravelGraph } from "./graph";

export interface AgentResult {
  reply: string;
  needClarify: boolean;
  requirements: TripRequirements;
  itinerary: TripPlan | null;
}

@Injectable()
export class AgentService {
  private graphPromise: Promise<any>;

  constructor(config: ConfigService, amap: AmapService) {
    const model = createModel({
      baseURL: config.get<string>("OPENAI_BASE_URL") ?? "",
      apiKey: config.get<string>("OPENAI_API_KEY") ?? "",
      model: config.get<string>("OPENAI_MODEL") ?? "deepseek-v4-pro",
    });
    this.graphPromise = createTravelGraph(amap, model);
  }

  async run(messages: ChatMessage[]): Promise<AgentResult> {
    const graph = await this.graphPromise;
    const state = await graph.invoke({
      messages,
      requirements: { complete: false },
    });
    return {
      reply: state.reply ?? "",
      needClarify: !!state.needClarify,
      requirements: state.requirements ?? { complete: false },
      itinerary: state.itinerary ?? null,
    };
  }

  /** 流式执行，逐节点产出更新（用于 SSE 进度反馈） */
  async stream(messages: ChatMessage[]): Promise<AsyncIterable<Record<string, any>>> {
    const graph = await this.graphPromise;
    return graph.stream(
      { messages, requirements: { complete: false } },
      { streamMode: "updates" },
    );
  }
}