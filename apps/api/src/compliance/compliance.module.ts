import { Module } from '@nestjs/common';
import { ComplianceController } from './compliance.controller.js';
import { EvidenceService } from './evidence.service.js';

/**
 * Always-on compliance surface. Maps ISO 27001 / SOC 2 / IEC 62443 / GDPR
 * controls to live evidence tags resolved at request time. Read-only across
 * the platform; export is signed (sha256 in the X-Content-Sha256 response
 * header) so it can flow into a downstream Sigstore/cosign step without
 * mutation.
 */
@Module({
  controllers: [ComplianceController],
  providers: [EvidenceService],
  exports: [EvidenceService],
})
export class ComplianceModule {}
