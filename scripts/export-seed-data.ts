/**
 * One-time script to export current DB projects to a seed fixture.
 * Run: npx tsx scripts/export-seed-data.ts
 * Output: prisma/seed-data.json (commit this file)
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      messages: true,
      agentEvents: true,
      data: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const output = {
    demoUser: {
      email: "demo@example.com",
      password: "demo",
    },
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      messages: JSON.parse(p.messages),
      agentEvents: JSON.parse(p.agentEvents),
      data: JSON.parse(p.data),
    })),
  };

  const outPath = join(__dirname, "../prisma/seed-data.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`Exported ${projects.length} project(s) to prisma/seed-data.json`);
  projects.forEach((p) => console.log(`  - [${p.id}] ${p.name}`));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
