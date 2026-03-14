// Using tsx for TypeScript imports
import { PrismaClient } from './src/generated/prisma/client.ts';
const db = new PrismaClient();
const messages = await db.message.findMany({
  where: { projectId: '3c2262a1-69a0-450d-a16c-4a7630406dd6' },
  orderBy: { createdAt: 'asc' },
  select: { id: true, role: true, type: true, content: true, createdAt: true }
});
for (const m of messages) {
  console.log(`[${m.role}] [${m.type}] ${m.content?.substring(0, 120)}`);
}
console.log(`\nTotal messages: ${messages.length}`);
await db.$disconnect();
