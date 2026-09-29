import { loadEnvFile } from "node:process";
import { AmapService } from "../amap/amap.service";
import { createModel } from "./llm";
import { createTravelGraph } from "./graph";

loadEnvFile();

async function main() {
  const input =
    process.argv[2] || "我想去杭州玩3天，2个人，喜欢美食和自然风光，预算3000元";

  const amap = new AmapService({ get: (k: string) => process.env[k] } as any);
  const model = createModel({
    baseURL: process.env.OPENAI_BASE_URL ?? "",
    apiKey: process.env.OPENAI_API_KEY ?? "",
    model: process.env.OPENAI_MODEL ?? "deepseek-v4-pro",
  });
  const graph = await createTravelGraph(amap, model);

  const messages = [{ role: "user" as const, content: input }];
  const state = await graph.invoke({
    messages,
    requirements: { complete: false },
  });

  console.log("=== REPLY ===");
  console.log(state.reply);
  console.log("=== NEED CLARIFY ===", state.needClarify);
  console.log("=== REQUIREMENTS ===");
  console.log(JSON.stringify(state.requirements, null, 2));
  if (state.itinerary) {
    console.log("=== ITINERARY ===");
    console.log(JSON.stringify(state.itinerary, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});