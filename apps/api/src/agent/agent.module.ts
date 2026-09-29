import { Module } from "@nestjs/common";
import { AgentService } from "./agent.service";
import { AmapModule } from "../amap/amap.module";

@Module({
  imports: [AmapModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}