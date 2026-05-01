import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

const KINDS = ['json', 'text'] as const;
const EVENT_TYPES = ['position', 'telemetry', 'alert'] as const;

export class UpsertMappingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ description: "MQTT pattern with `+`/`#` and `{name}` captures." })
  @IsString()
  topicPattern!: string;
  @ApiProperty({ enum: KINDS }) @IsIn(KINDS as unknown as string[])
  payloadKind!: 'json' | 'text';
  @ApiProperty({ enum: EVENT_TYPES }) @IsIn(EVENT_TYPES as unknown as string[])
  eventType!: 'position' | 'telemetry' | 'alert';
  @ApiProperty({ description: "Map of canonical-field → '$.path' / '{capture}' / literal." })
  @IsObject()
  rules!: Record<string, string>;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() priority?: number;
}

export class ArchiveSearchDto {
  @ApiPropertyOptional() @IsOptional() @IsString() topicLike?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() since?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() until?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() limit?: number;
}
