import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AmapModule } from "./amap/amap.module";
import { AgentModule } from "./agent/agent.module";
import { ChatModule } from "./chat/chat.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AmapModule,
    AgentModule,
    ChatModule,
  ],
})
export class AppModule {}