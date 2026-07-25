import { renderLayout, renderOrderSummary, renderBadge, renderMetaLine, renderSubject, escapeHtml, formatDate, type EmailOrder } from './layout.js';

const DEFAULT_SUBJECT = 'Receipt for order {orderNumber}';
const DEFAULT_BADGE = 'PAYMENT RECEIVED';

// Payment.method is still the old B2C enum (see schema.prisma) but repurposed:
// BILLPLZ = paid via the online gateway, WHATSAPP = a manually recorded
// payment (bank transfer confirmed off-platform, e.g. via chat or a slip) —
// same enum value, new meaning.
function methodLabel(method: string): string {
  return method === 'WHATSAPP' ? 'Manual transfer' : 'Online (Billplz)';
}

export function renderPaymentReceipt(
  order: EmailOrder,
  // The actual Payment row that triggered this email — Payment now belongs to
  // Invoice, not Order, so this can't be read off `order` anymore.
  payment: { method: string; paymentRef: string | null; paidAt: Date | string },
  // Admin-editable copy, threaded through to renderLayout — see
  // order-confirmation.ts for why every value here gets escapeHtml()'d.
  settings: Record<string, string>
): { subject: string; html: string } {
  const badge = escapeHtml(settings.email_badge_receipt || DEFAULT_BADGE);

  const html = renderLayout(
    `
          ${renderBadge(badge, 'success')}
          <h1 style="margin:16px 0 10px;font-family:Helvetica,Arial,sans-serif;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:#0A0A0A;">Your payment is confirmed</h1>
${renderMetaLine(order)}
          <p style="margin:-8px 0 24px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#54565b;">
            Received on ${formatDate(payment.paidAt)} via ${escapeHtml(methodLabel(payment.method))}.
          </p>
${renderOrderSummary(order)}
          <p style="margin:28px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#54565b;">
            Your official receipt is attached as a PDF. We&#39;ll notify you once your order ships.
          </p>`,
    `Receipt for order ${order.orderNumber} — payment confirmed.`,
    settings
  );

  return { subject: renderSubject(settings.email_subject_receipt || DEFAULT_SUBJECT, order.orderNumber), html };
}
