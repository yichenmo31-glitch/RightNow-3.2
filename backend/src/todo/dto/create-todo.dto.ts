import { IsString, IsDateString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTodoDto {
  @ApiProperty({ example: '完成今日蛋白质摄入目标' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'diet | water | training', example: 'diet' })
  @IsString()
  category: string;

  @ApiProperty({ example: '2026-02-27' })
  @IsDateString()
  date: string;
}

export class UpdateTodoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
