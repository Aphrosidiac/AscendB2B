import { renderLayout, renderOrderSummary, renderBadge, renderMetaLine, renderButton, renderSubject, escapeHtml, type EmailOrder } from './layout.js';
import { env } from '../config/env.js';

const DEFAULT_SUBJECT = 'Order {orderNumber} received — ASCEND Peptides';
const DEFAULT_BADGE = 'ORDER RECEIVED';
const DEFAULT_BUTTON_LABEL = 'VIEW ORDER';

const CREDIT_TERMS_LABEL: Record<string, string> = {
  PREPAID: 'Prepaid',
  NET15: 'Net 15',
  NET30: 'Net 30',
  NET60: 'Net 60',
};

// Payment on a B2B order is no longer a fixed WhatsApp-vs-gateway choice
// baked into the order row (Order dropped paymentMethod/paymentGateway
// entirely) — an order can be paid immediately via the gateway (payNow) or
// billed later against the company's credit terms when it ships. Since
// neither Order nor the zero-item pay-now Invoice persists a gateway bill
// reference (see the documented gap in orders.controller.ts), this email
// deliberately never tries to link back to a specific gateway bill URL —
// it always points at the account's order page, which is stable and never
// goes stale the way a reconstructed bill link could.
export function renderOrderConfirmation(
  order: EmailOrder,
  orderId: string,
  // Admin-editable copy (see the "Email Content" panel on the admin Emails
  // page) plus receipt_footer_note, threaded through to renderLayout. All
  // values are free text now, not safe-by-construction hardcoded strings —
  // escapeHtml() anything interpolated into the HTML.
  settings: Record<string, string>
): { subject: string; html: string } {
  const buttonLabel = escapeHtml(settings.email_button_label || DEFAULT_BUTTON_LABEL);
  const termsLabel = CREDIT_TERMS_LABEL[order.company.creditTerms] ?? order.company.creditTerms;

  const paymentBlock = `
          <p style="margin:28px 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#54565b;">
            <strong style="color:#0A0A0A;">Payment terms:</strong> ${escapeHtml(termsLabel)}${
              order.company.creditTerms === 'PREPAID'
                ? ' — pay online now, or we’ll follow up to arrange payment.'
                : ' — you’ll receive an invoice when this order ships.'
            }
          </p>
          ${renderButton(buttonLabel, `${env.FRONTEND_URL}/account/orders/${orderId}`)}`;

  const badge = escapeHtml(settings.email_badge_confirmation || DEFAULT_BADGE);

  const html = renderLayout(
    `
          ${renderBadge(badge)}
          <h1 style="margin:16px 0 10px;font-family:Helvetica,Arial,sans-serif;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:#0A0A0A;">Thanks for your order, ${escapeHtml(order.company.contactName.split(' ')[0])}</h1>
${renderMetaLine(order)}
${renderOrderSummary(order)}
${paymentBlock}`,
    `Order ${order.orderNumber} received — here's your summary.`,
    settings
  );

  return { subject: renderSubject(settings.email_subject_confirmation || DEFAULT_SUBJECT, order.orderNumber), html };
}
