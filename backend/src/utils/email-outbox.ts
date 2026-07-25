import type { Prisma, EmailType } from '@prisma/client';
import { isEmailEnabled } from './email.js';

/**
 * Queue a transactional email for an order. Call inside the SAME transaction
 * as the state change it announces, so a rollback discards the email too.
 *
 * Recipient email is now the Company's (Order dropped its own flat `email`
 * field in the B2B rework) — pass it in explicitly rather than reading it off
 * the order, since callers already have the company loaded one way or
 * another and Company.email is always present (unlike the old optional
 * guest-checkout email).
 *
 * No-op when no email is given, and skipDuplicates makes a double-fire
 * (payment callback + redirect verify can both confirm the same order) a
 * silent no-op against the (orderId, type) unique key instead of a P2002.
 *
 * Also a no-op while sending is disabled — deliberately, rather than queuing
 * anyway for the worker to skip: if nothing gets queued while off, nothing
 * fires a backlog of stale "your order was received" emails days later the
 * moment someone flips the setting back on.
 */
export async function enqueueEmail(
  tx: Prisma.TransactionClient,
  order: { id: string },
  type: EmailType,
  toEmail: string | null | undefined
): Promise<{ queued: boolean } | null> {
  if (!toEmail) return null;
  if (!(await isEmailEnabled(tx))) return null;
  const { count } = await tx.emailOutbox.createMany({
    data: { orderId: order.id, type, toEmail },
    skipDuplicates: true,
  });
  return { queued: count > 0 };
}
