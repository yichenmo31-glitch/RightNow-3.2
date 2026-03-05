import {
  BadRequestException,
  Controller,
  Injectable,
  Module,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { buildUploadUrl, imageUploadOptions } from '../common/upload.util';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
class UploadService {
  constructor(private readonly prisma: PrismaService) {}

  async save(userId: string, filename: string, kind: 'general' | 'avatar') {
    const url = buildUploadUrl(filename);

    await this.prisma.uploadAsset.create({
      data: {
        userId,
        url,
        kind,
      },
    });

    if (kind === 'avatar') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { avatar: url },
      });
    }

    return { url };
  }
}

@Controller('upload')
@UseGuards(JwtAuthGuard)
class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  upload(
    @CurrentUser() user: { sub: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    return this.uploadService.save(user.sub, file.filename, 'general');
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  uploadAvatar(
    @CurrentUser() user: { sub: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    return this.uploadService.save(user.sub, file.filename, 'avatar');
  }
}

@Module({
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
