import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const PRESETS = ['1x1', '2x2', '3x3', '4x4', '1+5', '1+7', '1+12', 'custom'] as const;

export class CellDto {
  @ApiPropertyOptional() @IsOptional() @IsString() streamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiPropertyOptional() @IsOptional() audio?: boolean;
}

export class TourDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true })
  layoutIds!: string[];
  @ApiProperty() @IsNumber() periodMs!: number;
}

export class UpsertLayoutDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ enum: PRESETS }) @IsIn(PRESETS as unknown as string[])
  preset!: (typeof PRESETS)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() customGrid?: string;
  @ApiProperty({ type: [CellDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CellDto)
  cells!: CellDto[];
  @ApiPropertyOptional({ type: TourDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TourDto)
  tour?: TourDto;
}
