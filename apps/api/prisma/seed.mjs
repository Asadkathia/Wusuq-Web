import { PrismaClient, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'superadmin@wusuq.com';
  const passwordHash = await hash('password', 10);

  await prisma.user.upsert({
    where: { email },
    update: {
      name: 'Super Admin',
      passwordHash,
      role: UserRole.super_admin,
      verified: true,
      isActive: true,
    },
    create: {
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
