import { IsString, IsNumber, IsDateString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDietDto {
  @ApiProperty({ example: '鸡胸肉沙拉' })
  @IsString()
  name: string;

  @ApiProperty({ example: 350 })
  @IsNumber()
  calories: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsNumber()
  fat?: number;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @IsNumber()
  protein?: number;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsNumber()
  carbs?: number;

  @ApiProperty({ example: '2026-02-27' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: 'lunch' })
  @IsOptional()
  @IsString()
  mealType?: string;
}
