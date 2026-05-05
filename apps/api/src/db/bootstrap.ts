/**
 * Dev/test bootstrap: ensures a default tenant exists, creates an admin user,
 * mirrors the role presets into iam_roles, and assigns SystemAdmin to the
 * admin user with a tenant-wide scope. Idempotent.
 *
 *   pnpm --filter @securetrax/api run db:bootstrap
 *
 * Configurable via env: BOOTSTRAP_TENANT, BOOTSTRAP_ADMIN_ID,
 * BOOTSTRAP_ADMIN_EMAIL.
 */
import { Pool } from 'pg';
import { ROLE_PRESETS } from '../iam/roles.js';

const TENANT_ID = process.env.BOOTSTRAP_TENANT ?? 'default';
const ADMIN_ID = process.env.BOOTSTRAP_ADMIN_ID ?? 'admin';
const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'admin@securetrax.local';

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      'postgres://securetrax:securetrax@localhost:5432/securetrax',
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL "app.bypass_rls" = 'on'`);

    await client.query(
      `INSERT INTO tenants(id, name)
       VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [TENANT_ID, 'Default tenant'],
    );

    for (const r of ROLE_PRESETS) {
      await client.query(
        `INSERT INTO iam_roles(id, tenant_id, name, description, permissions, exclusive_with, requires_mfa)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           permissions = EXCLUDED.permissions,
           exclusive_with = EXCLUDED.exclusive_with,
           requires_mfa = EXCLUDED.requires_mfa`,
        [
          r.id,
          TENANT_ID,
          r.name,
          r.description,
          JSON.stringify(r.permissions),
          JSON.stringify(r.exclusiveWith ?? []),
          r.requiresMfa ?? false,
        ],
      );
    }

    await client.query(
      `INSERT INTO iam_users(id, tenant_id, email, display_name, enabled, mfa_enrolled)
       VALUES ($1, $2, $3, $4, true, false)
       ON CONFLICT (id) DO NOTHING`,
      [ADMIN_ID, TENANT_ID, ADMIN_EMAIL, 'Default Admin'],
    );

    await client.query(
      `INSERT INTO iam_user_roles(tenant_id, user_id, role_id, scope)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING`,
      [
        TENANT_ID,
        ADMIN_ID,
        'SystemAdmin',
        JSON.stringify({
          include: [{ kind: 'tenant', id: TENANT_ID, includeSubtree: true }],
          exclude: [],
        }),
      ],
    );

    await client.query('COMMIT');
    console.log(
      `bootstrap complete: tenant=${TENANT_ID} admin=${ADMIN_ID} email=${ADMIN_EMAIL}`,
    );
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('bootstrap failed:', err);
  process.exit(1);
});
