import { PrismaClient, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'superadmin@wusuq.com';
  // Audit 4.3: the seed used to reset the super-admin password to the
  // hardcoded 'password' on EVERY run — including production. The password
  // comes from SEED_ADMIN_PASSWORD (required outside local dev), and an
  // existing user's passwordHash is never overwritten.
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!seedPassword && process.env.NODE_ENV === 'production') {
    console.error(
      'Refusing to seed in production without SEED_ADMIN_PASSWORD set.',
    );
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Never touch the password of an existing account — only repair the
    // role/active flags if someone broke them.
    await prisma.user.update({
      where: { email },
      data: {
        role: UserRole.super_admin,
        verified: true,
        isActive: true,
      },
    });
    console.log('Super admin already present (password untouched):', email);
    return;
  }

  if (!seedPassword) {
    console.warn(
      'WARNING: SEED_ADMIN_PASSWORD not set — seeding with the well-known ' +
        "local-dev password 'password'. NEVER do this against a shared or " +
        'production database.',
    );
  }
  const passwordHash = await hash(seedPassword ?? 'password', 10);
  await prisma.user.create({
    data: {
      name: 'Super Admin',
      email,
      passwordHash,
      role: UserRole.super_admin,
      verified: true,
      isActive: true,
    },
  });

  console.log('Seeded super admin:', email);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
