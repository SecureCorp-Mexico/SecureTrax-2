import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty() @IsString() content!: string;
}

export class ViewportDto {
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray()
  bbox?: [number, number, number, number];
  @ApiPropertyOptional() @IsOptional() @IsString() selectedAssetId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() fromMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() toMs?: number;
}

export class ChatRequestDto {
  @ApiProperty({ type: [ChatMessageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @ApiPropertyOptional({ type: ViewportDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ViewportDto)
  viewport?: ViewportDto;

  @ApiPropertyOptional({ enum: ['claude', 'ollama'] })
  @IsOptional()
  @IsIn(['claude', 'ollama'])
  provider?: 'claude' | 'ollama';
}
