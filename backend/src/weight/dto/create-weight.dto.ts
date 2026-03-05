import { IsDateString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWeightDto {
  @ApiProperty({ example: '2026-02-27' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 74.5 })
  @IsNumber()
  weight: number;

  @ApiPropertyOptional({ example: 79.5 })
  @IsOptional()
  @IsNumber()
  waist?: number;

  @ApiPropertyOptional({ example: 95.0 })
  @IsOptional()
  @IsNumber()
  hip?: number;
}
