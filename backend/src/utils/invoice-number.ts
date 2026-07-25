import type { Prisma } from '@prisma/client';

export async function generateInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `INV${yy}${mm}`;

  // Same numeric-max approach as generateOrderNumber/generateQuoteNumber —
  // lexical ordering on the string column breaks once sequence widths mix.
  const existing = await tx.invoice.findMany({
    where: { invoiceNumber: { startsWith: prefix } },
    select: { invoiceNumber: true },
  });

  let next = 1;
  for (const { invoiceNumber } of existing) {
    const seq = parseInt(invoiceNumber.split('/')[1], 10);
    if (Number.isFinite(seq) && seq >= next) next = seq + 1;
  }

  // No lock: two concurrent invoice generations can compute the same number.
  // The unique constraint on invoiceNumber catches that; callers retry on P2002.
  return `${prefix}/${String(next).padStart(4, '0')}`;
}
