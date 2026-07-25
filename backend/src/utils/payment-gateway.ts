import { env } from '../config/env.js';
import * as billplz from './billplz.js';
import * as toyyibpay from './toyyibpay.js';

export interface CreateBillParams {
  name: string;
  email?: string;
  phone: string;
  amount: number;
  description: string;
  // Fed to the gateway as reference_1 — the Invoice number for the pay-now
  // flow (not an Order number anymore; Invoice, not Order, is what carries
  // the payment). Kept the field name generic since it's just an opaque
  // reference to the gateway.
  invoiceNumber: string;
  // Fed to the gateway as reference_2 — see billplz.ts's CreateBillParams for
  // why: Invoice has no FK back to Order, so the Order id rides along here so
  // the callback/redirect can still enqueue that order's PAYMENT_RECEIPT email.
  orderId: string;
}

export interface BillResult {
  billId: string;
  paymentUrl: string;
  gateway: string;
}

export interface CallbackResult {
  billId: string;
  // 'paid'    — payment confirmed
  // 'failed'  — gateway reported an explicit failure
  // 'pending' — not yet final; do nothing and wait for the next callback
  status: 'paid' | 'failed' | 'pending';
  amount?: number; // sen/cents, best-effort, for verification only
  invoiceNumber?: string;
  orderId?: string;
}

export interface PaymentGateway {
  name: string;
  createBill(params: CreateBillParams): Promise<BillResult>;
  verifyCallback(body: Record<string, string>): boolean;
  parseCallback(body: Record<string, string>): CallbackResult;
  buildRedirectUrl(query: Record<string, string>): string;
  /** Re-query the gateway for the authoritative paid state of a bill. */
  verifyPaid(billId: string): Promise<{ paid: boolean; amount?: number; invoiceNumber?: string; orderId?: string }>;
}

function getBackendUrl(): string {
  if (env.FRONTEND_URL.startsWith('http://localhost')) return `http://localhost:${env.PORT}`;
  const url = new URL(env.FRONTEND_URL);
  return `https://${url.hostname}`;
}

function getFrontendUrl(): string {
  return env.FRONTEND_URL;
}

const billplzGateway: PaymentGateway = {
  name: 'billplz',
  async createBill(params) {
    const backendUrl = getBackendUrl();
    const bill = await billplz.createBill({
      collectionId: env.BILLPLZ_COLLECTION_ID!,
      name: params.name,
      email: params.email,
      mobile: params.phone.startsWith('60') ? params.phone : `60${params.phone.replace(/^0/, '')}`,
      amount: params.amount,
      description: params.description,
      callbackUrl: `${backendUrl}/api/v1/payments/callback`,
      redirectUrl: `${backendUrl}/api/v1/payments/redirect`,
      referenceOne: params.invoiceNumber,
      referenceTwo: params.orderId,
    });
    return { billId: bill.id, paymentUrl: bill.url, gateway: 'billplz' };
  },
  verifyCallback(body) {
    return billplz.verifyCallbackSignature(body);
  },
  parseCallback(body) {
    const paid = body.paid === 'true' && body.state === 'paid';
    return {
      billId: body.id,
      // Billplz only fires a meaningful callback when a bill is paid; an
      // unpaid/"due" callback is treated as pending (never auto-marked failed).
      status: paid ? 'paid' : 'pending',
      amount: body.paid_amount ? parseInt(body.paid_amount, 10) : undefined,
      // Billplz echoes back whatever reference_1/reference_2 the bill was
      // created with — this is how the Invoice (and, best-effort, the Order)
      // get identified again, since neither persists the bill id anywhere.
      invoiceNumber: body.reference_1,
      orderId: body.reference_2,
    };
  },
  buildRedirectUrl(query) {
    const valid = billplz.verifyRedirectSignature(query);
    const paid = query['billplz[paid]'] === 'true';
    const frontendUrl = getFrontendUrl();
    return valid && paid
      ? `${frontendUrl}/checkout/success`
      : `${frontendUrl}/checkout/failed`;
  },
  async verifyPaid(billId) {
    const bill = await billplz.getBill(billId);
    return { paid: bill.paid, amount: bill.paid_amount, invoiceNumber: bill.reference_1, orderId: bill.reference_2 };
  },
};

const toyyibpayGateway: PaymentGateway = {
  name: 'toyyibpay',
  async createBill(params) {
    const backendUrl = getBackendUrl();
    const billCode = await toyyibpay.createBill({
      secretKey: env.TOYYIBPAY_SECRET_KEY!,
      categoryCode: env.TOYYIBPAY_CATEGORY_CODE!,
      name: params.name,
      email: params.email || '',
      phone: params.phone,
      amount: params.amount,
      description: params.description,
      // ToyyibPay's API only has one external-reference slot — the Invoice
      // number goes there. It has no second slot for the Order id (unlike
      // Billplz's reference_2), so a ToyyibPay pay-now callback can't recover
      // the originating order for the PAYMENT_RECEIPT email; only the
      // Invoice/Payment gets recorded. Billplz is the gateway this B2B rework
      // was actually built against — this is a pre-existing, now slightly
      // wider gap on the secondary gateway.
      orderNumber: params.invoiceNumber,
      callbackUrl: `${backendUrl}/api/v1/payments/callback`,
      returnUrl: `${backendUrl}/api/v1/payments/redirect`,
    });
    const host = env.TOYYIBPAY_SANDBOX ? 'https://dev.toyyibpay.com' : 'https://toyyibpay.com';
    return { billId: billCode, paymentUrl: `${host}/${billCode}`, gateway: 'toyyibpay' };
  },
  verifyCallback(body) {
    return toyyibpay.verifyCallbackHash(body, env.TOYYIBPAY_SECRET_KEY!);
  },
  parseCallback(body) {
    // ToyyibPay status: 1 = success, 2 = pending, 3 = fail.
    const status =
      body.status === '1' ? 'paid' : body.status === '3' ? 'failed' : 'pending';
    // ToyyibPay's server-to-server callback `amount` is ALWAYS in sen (e.g.
    // "1150" = RM11.50), unlike getBillTransactions which returns RM. Parse as
    // an integer; guard against non-numeric so a bad value becomes undefined,
    // not NaN.
    const parsedAmount = body.amount != null ? parseInt(body.amount, 10) : NaN;
    const amount = Number.isFinite(parsedAmount) ? parsedAmount : undefined;
    return { billId: body.billcode, status, amount, invoiceNumber: body.order_id };
  },
  buildRedirectUrl(query) {
    const paid = query.status_id === '1' && !!query.billcode;
    const frontendUrl = getFrontendUrl();
    return paid
      ? `${frontendUrl}/checkout/success`
      : `${frontendUrl}/checkout/failed`;
  },
  async verifyPaid(billId) {
    return toyyibpay.getBillTransactions(billId, env.TOYYIBPAY_SECRET_KEY!);
  },
};

export function getActiveGateway(gatewayName?: string): PaymentGateway | null {
  const name = gatewayName || 'billplz';

  if (name === 'billplz' && env.BILLPLZ_API_KEY && env.BILLPLZ_COLLECTION_ID) {
    return billplzGateway;
  }
  if (name === 'toyyibpay' && env.TOYYIBPAY_SECRET_KEY && env.TOYYIBPAY_CATEGORY_CODE) {
    return toyyibpayGateway;
  }
  return null;
}

export function getGatewayByBillId(billId: string, gatewayName?: string): PaymentGateway | null {
  if (gatewayName === 'toyyibpay') return toyyibpayGateway;
  if (gatewayName === 'billplz') return billplzGateway;
  if (billId && billId.length < 20) return toyyibpayGateway;
  return billplzGateway;
}
