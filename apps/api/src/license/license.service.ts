import { Injectable, Logger } from '@nestjs/common';
import { loadLicenseSync, type LicenseLoadResult } from './loader.js';
import type { LicenseClaims } from '@securetrax/core';

@Injectable()
export class LicenseService {
  private readonly log = new Logger(LicenseService.name);
  private readonly state: LicenseLoadResult;

  constructor() {
    this.state = LicenseService.cached ?? loadLicenseSync();
    LicenseService.cached = this.state;
    for (const w of this.state.warnings) this.log.warn(w);
    if (this.state.claims) {
      this.log.log(
        `license accepted: tenant=${this.state.claims.tenantId} modules=[${[...this.state.enabled].join(', ')}]`,
      );
    } else {
      this.log.warn('no valid license loaded; running with no modules enabled');
    }
  }

  /** Cached so the same result is shared between AppModule's imports() and DI. */
  static cached: LicenseLoadResult | undefined;

  has(moduleId: string): boolean {
    return this.state.enabled.has(moduleId);
  }

  enabledModules(): string[] {
    return [...this.state.enabled];
  }

  tenantId(): string | undefined {
    return this.state.claims?.tenantId;
  }

  notAfter(): number | undefined {
    return this.state.claims?.notAfter;
  }

  claims(): LicenseClaims | undefined {
    return this.state.claims;
  }
}
