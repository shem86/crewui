/**
 * Prisma seed script — populates a fresh DB from prisma/seed-data.json.
 * Idempotent: uses upsert so re-running is safe.
 *
 * Run via: npx prisma db seed
 * Or directly: npx tsx prisma/seed.ts
 *
 * Demo credentials: demo@example.com / demo
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { PrismaClient } from "../src/generated/prisma";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

interface SeedProject {
  id: string;
  name: string;
  messages: unknown[];
  agentEvents: unknown[];
  data: Record<string, unknown>;
}

interface SeedData {
  demoUser: { email: string; password: string };
  projects: SeedProject[];
}

async function main() {
  const seedPath = join(__dirname, "seed-data.json");

  if (!existsSync(seedPath)) {
    console.log("No seed-data.json found — skipping seed.");
    console.log(
      "Run `npx tsx scripts/export-seed-data.ts` to generate it from an existing DB."
    );
    return;
  }

  const seedData: SeedData = JSON.parse(readFileSync(seedPath, "utf-8"));
  const { demoUser, projects } = seedData;

  // Create / update demo user
  const hashedPassword = await bcrypt.hash(demoUser.password, 10);
  const user = await prisma.user.upsert({
    where: { email: demoUser.email },
    update: {},
    create: {
      email: demoUser.email,
      password: hashedPassword,
    },
  });
  console.log(`Demo user: ${user.email} (id: ${user.id})`);

  // Seed projects
  let created = 0;
  let skipped = 0;

  for (const project of projects) {
    const existing = await prisma.project.findUnique({ where: { id: project.id } });

    if (existing?.userId === user.id) {
      skipped++;
      console.log(`  skip  [${project.id}] ${project.name}`);
      continue;
    }

    // Either doesn't exist (use seed ID) or belongs to another user (auto-generate new ID)
    const useFixedId = !existing;

    await prisma.project.create({
      data: {
        ...(useFixedId ? { id: project.id } : {}),
        name: project.name,
        userId: user.id,
        messages: JSON.stringify(project.messages),
        agentEvents: JSON.stringify(project.agentEvents),
        data: JSON.stringify(project.data),
      },
    });

    created++;
    console.log(`  create [${existing ? "dup" : project.id}] ${project.name}`);
  }

  console.log(`\nSeed complete: ${created} created, ${skipped} skipped.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
