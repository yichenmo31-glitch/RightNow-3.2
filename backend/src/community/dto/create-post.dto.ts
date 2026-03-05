import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePostDto {
  @ApiProperty({ example: '今天完成了5公里跑步，感觉很棒！' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ type: [String], example: [] })
  @IsOptional()
  @IsArray()
  images?: string[];

  @ApiPropertyOptional({ type: [String], example: ['fitness', 'running'] })
  @IsOptional()
  @IsArray()
  tags?: string[];
}
