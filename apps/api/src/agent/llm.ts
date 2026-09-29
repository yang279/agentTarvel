import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export interface LlmConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export function createModel(config: LlmConfig, maxTokens = 16384): ChatOpenAI {
  return new ChatOpenAI({
    model: config.model,
    apiKey: config.apiKey,
    configuration: { baseURL: config.baseURL, timeout: 120_000 },
    temperature: 0.3,
    maxRetries: 1,
    maxTokens,
  });
}

/** 从 LLM 输出中健壮地提取 JSON（容忍 markdown 代码块与前后缀） */
export function extractJson(text: string): unknown {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  const firstBrace = s.search(/[\[{]/);
  if (firstBrace === -1) throw new Error("No JSON found in output");
  const start = s[firstBrace] === "[" ? s.indexOf("[") : s.indexOf("{");
  const end = s[firstBrace] === "[" ? s.lastIndexOf("]") : s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("Malformed JSON in output");

  return JSON.parse(s.slice(start, end + 1));
}

function toText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (c?.text ? c.text : c?.type === "text" ? c.text : ""))
      .join("");
  }
  return JSON.stringify(content);
}

/** 从模型响应中提取思考过程（reasoning_content） */
export function extractReasoning(res: any): string {
  const r = res?.additional_kwargs?.reasoning_content ?? res?.reasoning_content;
  return typeof r === "string" ? r.trim() : "";
}

export async function callJson(
  model: ChatOpenAI,
  system: string,
  user: string,
): Promise<{ data: any; reasoning: string }> {
  const res = await model.invoke([new SystemMessage(system), new HumanMessage(user)]);
  return {
    data: extractJson(toText(res.content)),
    reasoning: extractReasoning(res),
  };
}

export async function callText(
  model: ChatOpenAI,
  system: string,
  user: string,
): Promise<{ text: string; reasoning: string }> {
  const res = await model.invoke([new SystemMessage(system), new HumanMessage(user)]);
  return {
    text: toText(res.content).trim(),
    reasoning: extractReasoning(res),
  };
}