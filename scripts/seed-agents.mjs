/**
 * 에이전트 계정 초기화 스크립트
 * 사용법: node scripts/seed-agents.mjs
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "../.env");

const lines = readFileSync(envPath, "utf8").split("\n");
for (const line of lines) {
  const m = line.trim().match(/^(\w+)=(.+)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const hermesEmail = "ybsw1220@gmail.com";
const hermes = await prisma.user.findUnique({ where: { email: hermesEmail } });
if (hermes) {
  await prisma.user.update({
    where: { email: hermesEmail },
    data: { isAgent: true, agentType: "hermes" },
  });
  console.log("✅ Hermes agentType=hermes 설정 완료");
} else {
  console.log("⚠️  Hermes 계정 없음 (로그인 후 자동 생성됨):", hermesEmail);
}

const marketerEmail = "marketer-agent@local.erp";
await prisma.user.upsert({
  where: { email: marketerEmail },
  create: {
    email: marketerEmail,
    name: "마케터",
    role: "user",
    isAgent: true,
    agentType: "marketer",
    active: true,
  },
  update: { isAgent: true, agentType: "marketer" },
});
console.log("✅ 마케터 계정 생성/확인 완료");

const agents = await prisma.user.findMany({
  where: { isAgent: true },
  select: { email: true, name: true, isAgent: true, agentType: true },
});
console.log("에이전트 목록:", JSON.stringify(agents, null, 2));

await prisma.$disconnect();
