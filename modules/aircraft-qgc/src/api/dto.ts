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

export class WaypointDto {
  @ApiProperty() @IsNumber() seq!: number;
  @ApiProperty() @IsNumber() lat!: number;
  @ApiProperty() @IsNumber() lon!: number;
  @ApiProperty() @IsNumber() alt!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() frame?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() command?: number;
}

export class UpsertPlanDto {
  @ApiProperty() @IsString() aircraftId!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsNumber() notBeforeMs!: number;
  @ApiProperty() @IsNumber() notAfterMs!: number;
  @ApiProperty({ type: [WaypointDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WaypointDto)
  waypoints!: WaypointDto[];
  @ApiPropertyOptional({ description: 'Polygon as [[lat,lon],...].' })
  @IsOptional()
  geofence?: Array<[number, number]>;
}

export class ApproveDto {
  @ApiProperty() @IsString() approverId!: string;
  @ApiProperty({ description: 'kid of the approver keypair.' }) @IsString() kid!: string;
  @ApiProperty({ description: 'Base64 Ed25519 signature over the canonical plan body.' })
  @IsString()
  signature!: string;
}

export class DeployDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() batteryPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() gpsHdop?: number;
}

export class AbortDto {
  @ApiProperty({ enum: ['rtl', 'land', 'brake'] })
  @IsIn(['rtl', 'land', 'brake'])
  mode!: 'rtl' | 'land' | 'brake';
}

export class RegisterApproverDto {
  @ApiProperty() @IsString() kid!: string;
  @ApiProperty({ description: 'PEM-encoded SPKI public key.' }) @IsString()
  publicKey!: string;
}
