import type { Prisma } from '@prisma/client';

export async function generateShipmentNumber(tx: Prisma.TransactionClient): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `SHP${yy}${mm}`;

  // Same numeric-max approach as generateOrderNumber/generateQuoteNumber/
  // generateInvoiceNumber — lexical ordering on the string column breaks once
  // sequence widths mix.
  const existing = await tx.shipment.findMany({
    where: { shipmentNumber: { startsWith: prefix } },
    select: { shipmentNumber: true },
  });

  let next = 1;
  for (const { shipmentNumber } of existing) {
    const seq = parseInt(shipmentNumber.split('/')[1], 10);
    if (Number.isFinite(seq) && seq >= next) next = seq + 1;
  }

  // No lock: two concurrent shipment creations can compute the same number.
  // The unique constraint on shipmentNumber catches that; callers retry on P2002.
  return `${prefix}/${String(next).padStart(4, '0')}`;
}
