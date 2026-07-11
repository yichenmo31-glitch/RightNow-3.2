import { Module } from '@nestjs/common';
import { EvolutionStageService } from './evolution-stage.service';
import { EvolutionStageController } from './evolution-stage.controller';
import { AiModule } from '../ai/ai.module';
import { ImageGenModule } from '../image-gen/image-gen.module';

@Module({
  imports: [AiModule, ImageGenModule],
  controllers: [EvolutionStageController],
  providers: [EvolutionStageService],
  exports: [EvolutionStageService],
})
export class EvolutionStageModule {}
