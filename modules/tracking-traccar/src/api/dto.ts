import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

const CATEGORIES = [
  'vehicle',
  'fixed-camera',
  'aircraft',
  'router',
  'intercom',
  'access-control',
  'sensor',
  'other',
] as const;

export class UpsertAssetDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ enum: CATEGORIES }) @IsIn(CATEGORIES as unknown as string[])
  category!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() siteId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() groupId?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() tags?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() cameraBindings?: string[];
}

export class IngestPositionDto {
  @ApiProperty({ description: 'epoch ms' }) @IsNumber() ts!: number;
  @ApiProperty() @IsNumber() lat!: number;
  @ApiProperty() @IsNumber() lon!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() alt?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() speed?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() heading?: number;
}
