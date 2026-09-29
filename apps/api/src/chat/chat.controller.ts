import { Controller, Post, Get, Delete, Param, Body, Res } from "@nestjs/common";
import type { Response } from "express";
import { ChatService } from "./chat.service";

const STAGE_MESSAGES: Record<string, string> = {
  extract: "正在理解你的需求…",
  planSearch: "正在规划景点与餐厅…",
  searchPois: "正在查询真实地点数据…",
  generate: "正在生成逐日行程…",
  clarify: "正在分析…",
};

interface ChatDto {
  conversationId?: string;
  message: string;
}

@Controller("api")
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post("chat")
  async chat(@Body() dto: ChatDto, @Res() res: Response) {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);

    try {
      const conv = await this.chatService.getOrCreateConversation(dto.conversationId);
      await this.chatService.saveUserMessage(conv.id, dto.message);
      const history = await this.chatService.loadHistory(conv.id);

      send({ type: "meta", conversationId: conv.id });

      let reply = "";
      let needClarify = false;
      let itinerary = null;

      const stream = await this.chatService.streamAgent(history);
      for await (const chunk of stream) {
        const node = Object.keys(chunk)[0];
        const stageMessage = STAGE_MESSAGES[node];
        if (stageMessage) {
          send({
            type: "status",
            stage: node,
            message: stageMessage,
            think: chunk[node]?.think ?? "",
          });
        }
        if (chunk.clarify) {
          reply = chunk.clarify.reply ?? "";
          needClarify = true;
        }
        if (chunk.finalize) reply = chunk.finalize.reply ?? reply;
        if (chunk.generate) itinerary = chunk.generate.itinerary ?? null;
      }

      if (itinerary) await this.chatService.saveItinerary(conv.id, itinerary);
      await this.chatService.saveAssistantMessage(conv.id, reply || "已生成行程。");

      send({
        type: "done",
        reply,
        needClarify,
        itinerary,
        conversationId: conv.id,
      });
    } catch (e) {
      send({ type: "error", message: (e as Error).message || "出错了，请重试" });
    } finally {
      res.end();
    }
  }

  @Get("conversations")
  listConversations() {
    return this.chatService.listConversations();
  }

  @Get("conversations/:id")
  getConversation(@Param("id") id: string) {
    return this.chatService.getConversation(id);
  }

  @Delete("conversations/:id")
  deleteConversation(@Param("id") id: string) {
    return this.chatService.deleteConversation(id);
  }
}