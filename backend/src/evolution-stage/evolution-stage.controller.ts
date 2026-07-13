import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EvolutionStageService } from './evolution-stage.service';

@Controller('evolution-stage')
@UseGuards(JwtAuthGuard)
export class EvolutionStageController {
  constructor(private readonly service: EvolutionStageService) {}

  @Get()
  async list(@CurrentUser() user: { sub: string }) {
    return this.service.getStages(user.sub);
  }

  @Post('assess/:recordId')
  async assess(@CurrentUser() user: { sub: string }, @Param('recordId') recordId: string) {
    return this.service.assessUpload(user.sub, recordId);
  }

  @Get('prediction')
  async predict(
    @CurrentUser() user: { sub: string },
    @Query('proteinChangePercent') proteinChangePercent?: string,
  ) {
    const parsed = Number.parseFloat(proteinChangePercent ?? '0.1');
    const normalized = Number.isFinite(parsed) ? parsed : 0.1;
    return this.service.getPrediction(user.sub, { proteinChangePercent: normalized });
  }

  @Post('north-star')
  async northStar(
    @CurrentUser() user: { sub: string },
    @Body() body: { startImageUrl: string },
  ) {
    return this.service.generateNorthStar(user.sub, body.startImageUrl);
  }

  @Post('ideal-selection')
  idealSelection(
    @CurrentUser() user: { sub: string },
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { imageTaskId: string; variant: string },
  ) {
    return this.service.confirmIdealSelection(user.sub, body, idempotencyKey);
  }

  @Get('image-profile')
  imageProfile(@CurrentUser() user: { sub: string }) {
    return this.service.getImageProfile(user.sub);
  }

  @Post('image-profile/prepare')
  prepareImageProfile(
    @CurrentUser() user: { sub: string },
    @Body() body: { startImage: string; recalibrate?: boolean },
  ) {
    return this.service.prepareImageProfile(user.sub, body.startImage, body.recalibrate === true);
  }

  @Post('image-profile/batch')
  beginImageBatch(@CurrentUser() user: { sub: string }) {
    return this.service.beginImageBatch(user.sub);
  }
}
