import type { Prisma } from '@prisma/client';

export async function generateQuoteNumber(tx: Prisma.TransactionClient): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `QUO${yy}${mm}`;

  // Same numeric-max approach as generateOrderNumber (order-number.ts) —
  // lexical ordering on the string column breaks once sequence widths mix.
  const existing = await tx.quotation.findMany({
    where: { quoteNumber: { startsWith: prefix } },
    select: { quoteNumber: true },
  });

  let next = 1;
  for (const { quoteNumber } of existing) {
    const seq = parseInt(quoteNumber.split('/')[1], 10);
    if (Number.isFinite(seq) && seq >= next) next = seq + 1;
  }

  // No lock: two concurrent quote requests can compute the same number. The
  // unique constraint on quoteNumber catches that; callers should retry
  // generation on a P2002 for this field, same pattern as createOrder.
  return `${prefix}/${String(next).padStart(4, '0')}`;
}
