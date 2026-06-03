import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedDefaultPermissionsForUser } from "../src/lib/permissions.js";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@local.test";
  const password = "Admin123!";
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      displayName: "Administrator",
      role: Role.ADMIN,
    },
  });

  const userRoleAccounts = await prisma.user.findMany({
    where: { role: Role.USER },
    select: { id: true },
  });
  for (const u of userRoleAccounts) {
    const count = await prisma.userPagePermission.count({ where: { userId: u.id } });
    if (count === 0) {
      await seedDefaultPermissionsForUser(u.id);
    }
  }

  console.log(`Seeded admin user: ${email} / ${password}`);
  if (userRoleAccounts.length > 0) {
    console.log(`Ensured default page permissions for ${userRoleAccounts.length} USER account(s).`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
