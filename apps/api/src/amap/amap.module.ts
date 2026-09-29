import { Module } from "@nestjs/common";
import { AmapService } from "./amap.service";

@Module({
  providers: [AmapService],
  exports: [AmapService],
})
export class AmapModule {}