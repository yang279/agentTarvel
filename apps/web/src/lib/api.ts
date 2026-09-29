import type { TripPlan, ChatMessage } from "@travel/shared";

export interface UiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  _count: { messages: number };
}

export interface ConversationDetail {
  id: string;
  title: string | null;
  createdAt: string;
  messages: ChatMessage[];
  itinerary: TripPlan | null;
}

export interface ChatDoneEvent {
  type: "done";
  reply: string;
  needClarify: boolean;
  itinerary: TripPlan | null;
  conversationId: string;
}

interface ChatEvent {
  type: "meta" | "status" | "done" | "error";
  stage?: string;
  message?: string;
  think?: string;
  reply?: string;
  needClarify?: boolean;
  itinerary?: TripPlan | null;
  conversationId?: string;
}

export interface ChatHandlers {
  onMeta?: (conversationId: string) => void;
  onStatus?: (message: string, think?: string) => void;
  onDone?: (event: ChatDoneEvent) => void;
  onError?: (message: string) => void;
}

export async function streamChat(
  conversationId: string | undefined,
  message: string,
  handlers: ChatHandlers,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, message }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`请求失败（HTTP ${res.status}）`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const handle = (event: ChatEvent) => {
      switch (event.type) {
        case "meta":
          if (event.conversationId) handlers.onMeta?.(event.conversationId);
          break;
        case "status":
          if (event.message) handlers.onStatus?.(event.message, event.think);
          break;
        case "done":
          handlers.onDone?.({
            type: "done",
            reply: event.reply ?? "",
            needClarify: !!event.needClarify,
            itinerary: event.itinerary ?? null,
            conversationId: event.conversationId ?? "",
          });
          break;
        case "error":
          handlers.onError?.(event.message ?? "出错了");
          break;
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = raw.split("\n").find((l) => l.startsWith("data: "));
        if (line) {
          try {
            handle(JSON.parse(line.slice(6)));
          } catch {
            // ignore malformed chunk
          }
        }
      }
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error("生成超时，请重试");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const res = await fetch("/api/conversations");
  if (!res.ok) throw new Error("加载会话列表失败");
  return res.json();
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  const res = await fetch(`/api/conversations/${id}`);
  if (!res.ok) throw new Error("加载会话失败");
  return res.json();
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("删除失败");
}