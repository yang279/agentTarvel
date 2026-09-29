import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AgentService } from "../agent/agent.service";
import type { ChatMessage, TripPlan } from "@travel/shared";

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private agent: AgentService,
  ) {}

  async getOrCreateConversation(id?: string) {
    if (id) {
      const existing = await this.prisma.conversation.findUnique({ where: { id } });
      if (existing) return existing;
    }
    return this.prisma.conversation.create({ data: {} });
  }

  async saveUserMessage(conversationId: string, content: string) {
    await this.prisma.message.create({
      data: { conversationId, role: "user", content },
    });
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (conv && !conv.title) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { title: content.slice(0, 30) },
      });
    }
  }

  async saveAssistantMessage(conversationId: string, content: string) {
    return this.prisma.message.create({
      data: { conversationId, role: "assistant", content },
    });
  }

  async loadHistory(conversationId: string): Promise<ChatMessage[]> {
    const msgs = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
    return msgs.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  }

  async saveItinerary(conversationId: string, itinerary: TripPlan) {
    const meta = {
      people: itinerary.meta?.people,
      budget: itinerary.meta?.budget,
      startDate: itinerary.meta?.startDate,
      interests: itinerary.meta?.interests,
      summary: itinerary.summary,
      city: itinerary.city,
    };
    const data = {
      destination: itinerary.destination ?? null,
      days: JSON.stringify(itinerary.days ?? []),
      meta: JSON.stringify(meta),
    };
    const existing = await this.prisma.itinerary.findUnique({
      where: { conversationId },
    });
    if (existing) {
      return this.prisma.itinerary.update({ where: { conversationId }, data });
    }
    return this.prisma.itinerary.create({
      data: { conversationId, ...data },
    });
  }

  async streamAgent(messages: ChatMessage[]) {
    return this.agent.stream(messages);
  }

  async deleteConversation(id: string) {
    await this.prisma.conversation.delete({ where: { id } });
    return { ok: true };
  }

  async listConversations() {
    return this.prisma.conversation.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        _count: { select: { messages: true } },
      },
    });
  }

  async getConversation(id: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        itinerary: true,
      },
    });
    if (!conv) return null;
    const rawMeta = conv.itinerary?.meta ? JSON.parse(conv.itinerary.meta) : null;
    return {
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      messages: conv.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
      itinerary: conv.itinerary
        ? {
            destination: conv.itinerary.destination,
            city: rawMeta?.city,
            summary: rawMeta?.summary,
            days: JSON.parse(conv.itinerary.days),
            meta: {
              people: rawMeta?.people,
              budget: rawMeta?.budget,
              startDate: rawMeta?.startDate,
              interests: rawMeta?.interests,
            },
          }
        : null,
    };
  }
}