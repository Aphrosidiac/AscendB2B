// One-off: applies the exact-code-match imageUrl mapping pulled from the
// live ascend.my catalog (see chat history — only exact code matches were
// applied, renamed/ambiguous codes like RETA10 vs RT10 were deliberately
// left alone rather than guessed).
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { readFileSync } from 'node:fs';

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const csv = readFileSync(process.argv[2], 'utf-8').trim();
  const rows = csv.split('\n').map((line) => {
    const idx = line.indexOf(',');
    return { code: line.slice(0, idx), imageUrl: line.slice(idx + 1) };
  });

  let applied = 0;
  for (const row of rows) {
    const res = await prisma.productVariant.updateMany({
      where: { code: row.code },
      data: { imageUrl: row.imageUrl },
    });
    if (res.count > 0) applied++;
  }
  console.log(`Applied real imageUrl to ${applied}/${rows.length} matched variants`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
