import {
  Controller,
  Get,
  Query,
  Res,
  SetMetadata,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { canonicalize } from '@securetrax/core';
import {
  CONTROL_MAP,
  frameworks,
  type ControlMapEntry,
  type EvidenceTag,
  type Framework,
} from './control-map.js';
import { EvidenceService } from './evidence.service.js';

const RequirePermissions = (...perms: string[]) =>
  SetMetadata('securetrax:permissions', perms);

@ApiTags('compliance')
@ApiBearerAuth()
@Controller('v1/compliance')
export class ComplianceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Get('frameworks')
  @RequirePermissions('compliance.audit.read')
  @ApiOperation({ summary: 'Frameworks the control map covers.' })
  listFrameworks() {
    return { items: frameworks() };
  }

  @Get('controls')
  @RequirePermissions('compliance.audit.read')
  @ApiQuery({ name: 'framework', required: false })
  @ApiOperation({
    summary:
      'Control map. Returns each control with its narrative + the evidence-tag slots that resolve to live state on the next call.',
  })
  controls(@Query('framework') framework?: string): { items: ControlMapEntry[] } {
    const items = framework
      ? CONTROL_MAP.filter((c) => c.framework === framework)
      : CONTROL_MAP;
    return { items };
  }

  @Get('evidence')
  @RequirePermissions('compliance.audit.read')
  @ApiQuery({ name: 'framework', required: false })
  @ApiOperation({
    summary:
      'Resolve every evidence tag in the control map to its current state. The ISO 27001 Compliance Console uses this as its single source of truth.',
  })
  async evidenceMap(@Query('framework') framework?: string) {
    const filtered = framework
      ? CONTROL_MAP.filter((c) => c.framework === framework)
      : CONTROL_MAP;
    const tags = new Set<EvidenceTag>();
    for (const c of filtered) for (const t of c.evidence) tags.add(t);

    const results = await Promise.all(
      [...tags].map(async (tag) => [tag, await this.evidence.resolve(tag)] as const),
    );
    const evidence = Object.fromEntries(results);
    return {
      framework: framework ?? 'ALL',
      generatedAtMs: Date.now(),
      controls: filtered.map((c) => ({
        framework: c.framework,
        control: c.control,
        title: c.title,
        narrative: c.narrative,
        evidence: c.evidence.map((tag) => evidence[tag]),
        status: aggregateStatus(c.evidence.map((tag) => evidence[tag])),
      })),
    };
  }

  @Get('evidence/export')
  @RequirePermissions('compliance.audit.export')
  @ApiQuery({ name: 'framework', required: false })
  @ApiOperation({
    summary:
      'Signed JSON evidence pack — auditor-friendly. The bundle includes generation timestamp + sha256 of the canonical body, ready to feed into a downstream signing pipeline.',
  })
  async exportEvidence(
    @Res() res: Response,
    @Query('framework') framework?: string,
  ): Promise<void> {
    const filtered = framework
      ? CONTROL_MAP.filter((c) => c.framework === framework)
      : CONTROL_MAP;
    const tags = new Set<EvidenceTag>();
    for (const c of filtered) for (const t of c.evidence) tags.add(t);
    const evidence = Object.fromEntries(
      await Promise.all(
        [...tags].map(async (tag) => [tag, await this.evidence.resolve(tag)] as const),
      ),
    );
    const body = {
      kind: 'compliance-evidence',
      v: 1,
      framework: framework ?? 'ALL',
      generatedAtMs: Date.now(),
      controls: filtered,
      evidence,
    };
    const canonical = canonicalize(body);
    const digest = createHash('sha256').update(canonical).digest('hex');
    res.setHeader('content-type', 'application/json');
    res.setHeader(
      'content-disposition',
      `attachment; filename="compliance-${(framework ?? 'ALL').replace(/[^a-z0-9]/gi, '-')}-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    res.setHeader('x-content-sha256', digest);
    res.send(canonical);
  }
}

function aggregateStatus(values: Array<{ ok: boolean }>): 'ok' | 'partial' | 'fail' {
  if (values.every((v) => v.ok)) return 'ok';
  if (values.some((v) => v.ok)) return 'partial';
  return 'fail';
}
