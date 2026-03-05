import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateChatDto {
  @ApiProperty({ example: '我今天应该吃什么来减脂？' })
  @IsString()
  content: string;
}
