import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { EvolutionService } from './evolution.service';
import { CreateEvolutionDto } from './dto/create-evolution.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { multerConfig } from '../upload/multer.config';

@ApiTags('Evolution')
@ApiBearerAuth()
@Controller('evolution')
export class EvolutionController {
  constructor(private evolutionService: EvolutionService) {}

  @Get()
  findAll(@CurrentUser('id') userId: string) {
    return this.evolutionService.findAll(userId);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', multerConfig))
  create(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateEvolutionDto,
  ) {
    const photoUrl = `/uploads/${file.filename}`;
    return this.evolutionService.create(userId, photoUrl, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateEvolutionDto,
  ) {
    return this.evolutionService.update(userId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.evolutionService.remove(userId, id);
  }
}
