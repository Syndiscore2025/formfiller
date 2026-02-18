import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  // Create the default public tenant used by guest applicants.
  // The frontend sends `x-tenant-slug: default` (NEXT_PUBLIC_TENANT_SLUG)
  // so the backend can resolve tenantId without a JWT.
  const existing = await prisma.tenant.findUnique({ where: { slug: 'default' } });

  if (!existing) {
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Default Organization',
        slug: 'default',
        apiKey: crypto.randomBytes(32).toString('hex'),
        isActive: true,
      },
    });
    console.log(`✅ Default tenant created: ${tenant.id}`);
  } else {
    console.log(`ℹ️  Default tenant already exists: ${existing.id}`);
  }
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

