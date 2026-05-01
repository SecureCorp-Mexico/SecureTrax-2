import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpsertCameraDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ description: 'Frigate camera id (`<name>` in frigate.yml).' })
  @IsString()
  frigateName!: string;
  @ApiProperty() @IsNumber() lat!: number;
  @ApiProperty() @IsNumber() lon!: number;
  @ApiPropertyOptional({ description: 'go2rtc stream id; defaults to frigateName.' })
  @IsOptional()
  @IsString()
  streamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() siteId?: string;
}
