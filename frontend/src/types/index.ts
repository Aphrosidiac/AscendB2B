export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  productCount: number;
}

// Quantity-break pricing row for a variant — the tier with the highest
// minQty <= the requested quantity wins (see backend/src/utils/product-pricing.ts
// getTieredUnitPrice, the actual charging logic this mirrors for display).
export interface PriceTier {
  id: string;
  variantId?: string;
  minQty: number;
  unitPrice: number;
}

// A single sellable SKU (one size/strength) belonging to a parent Product.
export interface ProductVariant {
  id: string;
  productId: string;
  code: string;
  size: string | null;
  price: number;
  salePrice: number | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  stock: number;
  // Purchase floor independent of pricing — a bulk-only SKU can't be ordered
  // below this through the storefront (enforced again server-side at order
  // creation). Defaults to 1 on every variant, so always present.
  moq: number;
  // Quantity-break pricing, ordered by minQty ascending. Always present
  // (possibly empty) on public product list/detail responses.
  priceTiers: PriceTier[];
  imageUrl: string | null;
  active: boolean;
  updatedAt: string;
}

// Parent product line (e.g. "Retatrutide") — owns the one storefront URL and
// everything shared across sizes. Sellable SKUs are in `variants`.
export interface Product {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  description: string | null;
  benefits: string | null;
  dosageInfo: string | null;
  coaUrl: string | null;
  featured: boolean;
  sortOrder: number;
  active: boolean;
  // Hides this product from the public catalog/listing and its own product
  // page while keeping it fully eligible to be used as another product's
  // add-on (unlike `active`, which gates both). For supply items meant only
  // to be bundled, never browsed/purchased on their own.
  addOnOnly: boolean;
  updatedAt: string;
  category: {
    name: string;
    slug: string;
  };
  // Plain-text nudge shown near Add to Cart on the storefront (e.g. "Needs
  // Bacteriostatic Water to reconstitute") — informational only, distinct
  // from the required/forced add-on mechanism below.
  addOnReminder?: string | null;
  variants: ProductVariant[];
  // Present on the public product-detail response; absent from list/admin
  // responses that don't include it.
  addOns?: AddOnVariant[];
}

// An add-on as attached to a parent product's page: the specific sellable
// variant being offered, plus its own parent's name/slug/category (for
// display and linking) and the join row's required/quantity for this
// specific parent-add-on pairing.
export interface AddOnVariant {
  id: string;
  code: string;
  size: string | null;
  price: number;
  salePrice: number | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  stock: number;
  imageUrl: string | null;
  active: boolean;
  name: string;
  slug: string;
  category: { name: string; slug: string };
  // Force-selected and locked on the storefront — the customer cannot
  // uncheck it (enforced again server-side at order creation).
  addOnRequired: boolean;
  // Fixed quantity added — does not scale with the purchased variant's quantity.
  addOnQuantity: number;
}

// One SKU's quantity-break ladder, flattened for the homepage hero's pricing
// demonstration. Chosen server-side (see pickPriceExample in app/page.tsx) as
// whichever live SKU discounts hardest, so it never hardcodes a product.
export interface HeroPriceExample {
  slug: string;
  code: string;
  /** Product name with size appended, e.g. "Tesamorelin 10mg". */
  name: string;
  /** Unit price below the first tier (sale-adjusted). */
  basePrice: number;
  savingPct: number;
  bestMinQty: number;
  tiers: { minQty: number; unitPrice: number }[];
}

// A cart line is either a product variant or a kit, never both — the same
// XOR convention the backend enforces on OrderItem/QuotationItem. Use
// cartLineKey() (lib/cart.tsx) to identify a line rather than reaching for
// variantId, which is absent on kit lines.
export interface CartItem {
  variantId?: string;
  // Set instead of variantId when this line is a kit. Kits are priced flat at
  // pricePerKit with no quantity breaks, so `priceTiers` is never set here.
  kitId?: string;
  code: string;
  name: string;
  size: string | null;
  price: number;
  quantity: number;
  // Available stock at add-to-cart time — used to clamp merged quantities in
  // the cart reducer. Optional because carts saved before this field existed
  // won't have it (the backend re-validates stock at order creation anyway).
  stock?: number;
  // Minimum order quantity at add-to-cart time — the cart reducer won't let
  // quantity drop below this. Optional for the same reason as `stock` above
  // (older saved carts, and add-on lines which have no MOQ concept).
  moq?: number;
  // Snapshot of the variant's quantity-break pricing, used only to compute a
  // display-only tiered subtotal in the cart/checkout UI (see
  // lib/utils.ts's getTieredPrice) — the backend always recomputes the real
  // charged price at order creation regardless of what's stored here.
  priceTiers?: PriceTier[];
  imageUrl: string | null;
  // Kit lines only: what the kit contains, so the cart can show what a buyer
  // is actually committing to without refetching. Display-only.
  kitContents?: { name: string; size: string | null; quantity: number }[];
}

export interface OrderItem {
  id: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  variant: {
    code: string;
    size: string | null;
    imageUrl?: string | null;
    product: { name: string };
  };
}

// Per-order transactional email status from the backend outbox (admin only).
// DELIVERED/BOUNCED/COMPLAINED are set by the Resend webhook
// (modules/webhooks/resend-webhook.controller.ts) once a SENT message
// reaches one of those terminal delivery events.
export interface OrderEmail {
  type: 'ORDER_CONFIRMATION' | 'PAYMENT_RECEIPT';
  status: 'PENDING' | 'SENT' | 'FAILED' | 'DELIVERED' | 'BOUNCED' | 'COMPLAINED';
  attempts: number;
  sentAt: string | null;
  lastError: string | null;
}

// A full outbox row on the admin Emails ops page — the per-order OrderEmail
// shape plus identity/scheduling fields and the parent order reference.
export interface AdminEmailRow extends OrderEmail {
  id: string;
  toEmail: string;
  createdAt: string;
  nextAttemptAt: string;
  order: { id: string; orderNumber: string };
}

export interface AdminEmailsResponse extends PaginatedResponse<AdminEmailRow> {
  stats: {
    pending: number;
    failed: number;
    sentLast7Days: number;
  };
  // Whether RESEND_API_KEY is set on the server — distinct from the
  // emails_enabled DB toggle, so the admin UI can tell "off because you
  // turned it off" apart from "off because there's no key to turn on".
  hasApiKey: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  email: string | null;
  address: string;
  city: string;
  state: string;
  postcode: string;
  subtotal: number;
  shippingFee: number;
  discountAmount: number;
  total: number;
  status: 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  paymentMethod: 'WHATSAPP' | 'BILLPLZ';
  paymentGateway: string | null;
  paymentStatus: 'UNPAID' | 'PAID' | 'FAILED' | 'REFUNDED';
  discountCodeId: string | null;
  discountCode?: { code: string; discountType: string; discountValue: number } | null;
  notes: string | null;
  trackingNumber: string | null;
  deletedAt: string | null;
  createdAt: string;
  items: OrderItem[];
  // Only present on admin order responses.
  emails?: OrderEmail[];
}

export interface DiscountCode {
  id: string;
  code: string;
  description: string | null;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  minOrderAmount: number | null;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// B2B — Company auth, addresses, orders (see docs/erd-b2b.md).
// Deliberately kept separate from the legacy B2C `Order`/`ORDER_STATUS_*`
// types above rather than reshaping them in place — those are still read by
// the old track/receipt/admin-orders pages (`/track`, `/receipt/[...]`,
// `admin/orders`) which a later pass replaces; this file just needs both
// shapes to coexist until then.
// ---------------------------------------------------------------------------

export type CreditTerms = 'PREPAID' | 'NET15' | 'NET30' | 'NET60';

export interface CompanyProfile {
  id: string;
  // Chosen at signup alongside email + password. The account's handle, and the
  // label shown wherever a company name isn't set yet.
  username: string;
  // Nullable: signup collects none of these. They're captured afterwards by
  // the business-profile step (PATCH /companies/me), and ordering/quoting is
  // blocked server-side until name + contactName + phone are all present.
  name: string | null;
  taxId: string | null;
  contactName: string | null;
  phone: string | null;
  email: string;
  emailVerifiedAt: string | null;
  creditTerms: CreditTerms;
  createdAt: string;
  // Server-derived — the client shouldn't re-implement which fields make a
  // profile orderable.
  profileComplete: boolean;
}

export type CompanyAddressType = 'BILLING' | 'SHIPPING' | 'BOTH';

export interface CompanyAddress {
  id: string;
  companyId: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postcode: string;
  type: CompanyAddressType;
  createdAt: string;
}

// The 8 OrderStatus values from schema.prisma — the stepper/filter-pills UI
// collapses PACKING/SHIPPED/PARTIALLY_SHIPPED etc into 6 display steps (see
// components/orders/OrderStepper.tsx), but the API value itself is one of these.
export type CompanyOrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PACKING'
  | 'SHIPPED'
  | 'PARTIALLY_SHIPPED'
  | 'DELIVERED'
  | 'COMPLETE'
  | 'CANCELLED';

export interface CompanyOrderItem {
  id: string;
  variantId: string | null;
  kitId: string | null;
  quantity: number;
  unitPrice: number;
  variant?: {
    code: string;
    size: string | null;
    imageUrl?: string | null;
    product: { name: string };
  } | null;
  kit?: { name: string } | null;
}

// The quote an order was converted from, present only on the order-detail
// response (getMyOrder) and only when the order actually came from one.
export interface CompanyOrderQuotationRef {
  id: string;
  quoteNumber: string;
  status: QuotationStatus;
  validUntil: string;
}

export interface CompanyOrderStatusHistoryEntry {
  id: string;
  orderId: string;
  status: CompanyOrderStatus;
  changedAt: string;
  note: string | null;
}

// Batch/orderItem nested info is only populated on the order-detail endpoint
// (getMyOrder) — it's what powers the Files tab (Batch.coaUrl per shipment
// item, per docs/frontend-design.md) and the per-line display on the
// Shipments tab. Absent on any response that doesn't include it.
export interface CompanyOrderShipmentItem {
  id: string;
  shipmentId: string;
  orderItemId: string;
  batchId: string;
  quantity: number;
  batch?: { batchNumber: string; expiry: string; coaUrl: string | null; variantId?: string };
  orderItem?: {
    id: string;
    quantity: number;
    unitPrice: number;
    variant?: { code: string; size: string | null; product: { name: string } } | null;
    kit?: { name: string } | null;
  };
}

export interface CompanyOrderShipment {
  id: string;
  orderId: string;
  shipmentNumber: string;
  shippedAt: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  items: CompanyOrderShipmentItem[];
}

// Company-scoped order — the shape returned by
// backend/src/modules/orders/orders.controller.ts (list/get). Distinct from
// the legacy B2C `Order` above: companyId-scoped, address is a
// `CompanyAddress` FK rather than typed-in-line fields, and status covers
// the fulfillment lifecycle (PACKING/SHIPPED/PARTIALLY_SHIPPED/COMPLETE)
// instead of B2C's flat PENDING..CANCELLED set.
export interface CompanyOrder {
  id: string;
  orderNumber: string;
  companyId: string;
  quotationId: string | null;
  shippingAddressId: string;
  subtotal: number;
  shippingFee: number;
  discountAmount: number;
  total: number;
  status: CompanyOrderStatus;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: CompanyOrderItem[];
  shippingAddress?: CompanyAddress;
  discountCode?: { code: string; discountType: string; discountValue: number } | null;
  shipments?: CompanyOrderShipment[];
  statusHistory?: CompanyOrderStatusHistoryEntry[];
  // Detail endpoint only, and only when this order came from a quote.
  quotation?: CompanyOrderQuotationRef | null;
}

// ---------------------------------------------------------------------------
// B2B — Quotations (backend/src/modules/quotations/quotations.controller.ts).
// ---------------------------------------------------------------------------

export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface QuotationItem {
  id: string;
  quotationId: string;
  variantId: string | null;
  kitId: string | null;
  quantity: number;
  // Negotiated price — 0 until an admin fills it in (see requestQuotation's
  // comment); may differ from the catalog price/PriceTier.
  unitPrice: number;
  variant?: {
    code: string;
    size: string | null;
    imageUrl?: string | null;
    product: { name: string };
  } | null;
  kit?: { name: string } | null;
}

export interface Quotation {
  id: string;
  quoteNumber: string;
  companyId: string;
  status: QuotationStatus;
  validUntil: string;
  createdBy: string;
  subtotal: number;
  total: number;
  createdAt: string;
  updatedAt: string;
  items: QuotationItem[];
  // Admin list/detail only. The detail endpoint (requireQuotation) also
  // returns contactName/phone; the list endpoint doesn't, hence optional.
  company?: { id: string; username: string; name: string | null; email: string; contactName?: string | null; phone?: string | null };
}

// ---------------------------------------------------------------------------
// B2B — Invoices (backend/src/modules/admin/admin-invoices.controller.ts +
// the company-scoped mirror in modules/companies/company-invoices.controller.ts).
// paid/void/overdue status is always server-computed (never stored) — see
// computeInvoiceStatus — so every response carries `status`/`paidAmount`
// alongside the raw Invoice fields rather than the frontend re-deriving it.
// ---------------------------------------------------------------------------

export type InvoiceStatus = 'VOID' | 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'UNPAID';

export interface InvoicePayment {
  id: string;
  invoiceId: string;
  amount: number;
  method: 'WHATSAPP' | 'BILLPLZ';
  paymentRef: string | null;
  paidAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  shipmentItemId: string;
  amount: number;
  // Only present on the single-invoice detail endpoint.
  shipmentItem?: {
    id: string;
    quantity: number;
    batch: { batchNumber: string; expiry: string; coaUrl: string | null };
    orderItem: {
      variant?: { code: string; size: string | null; product: { name: string } } | null;
      kit?: { name: string } | null;
    };
    shipment: { id: string; shipmentNumber: string; orderId: string };
  };
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  companyId: string;
  issueDate: string;
  dueDate: string;
  total: number;
  void: boolean;
  createdAt: string;
  paidAmount: number;
  status: InvoiceStatus;
  // Present on the list endpoint (count only) or detail endpoint (full rows).
  items?: InvoiceItem[];
  payments?: InvoicePayment[];
  _count?: { items: number };
  // Admin list/detail only.
  company?: { id: string; username: string; name: string | null; creditTerms: CreditTerms };
}

// Business-wide receivables rollup on the admin invoices list — intentionally
// NOT scoped by the caller's filters (see outstandingSummary in
// admin-invoices.controller.ts).
export interface InvoiceReceivablesSummary {
  outstandingAmount: number;
  overdueAmount: number;
  outstandingCount: number;
  overdueCount: number;
}

// A ShipmentItem that has shipped but has no InvoiceItem yet — the raw
// material for a consolidated invoice.
export interface UnbilledItem {
  id: string;
  quantity: number;
  amount: number;
  orderItem: {
    unitPrice: number;
    variant: { code: string; size: string | null; product: { name: string } } | null;
    kit: { name: string } | null;
  };
  batch: { batchNumber: string };
  shipment: {
    id: string;
    shipmentNumber: string;
    shippedAt: string | null;
    order: { id: string; orderNumber: string; company: { id: string; username: string; name: string | null; creditTerms: CreditTerms } };
  };
}

export interface UnbilledCompanyRow {
  company: { id: string; username: string; name: string | null; creditTerms: CreditTerms };
  itemCount: number;
  orderCount: number;
  amount: number;
}

// ---------------------------------------------------------------------------
// Admin — orders (backend/src/modules/admin/admin-orders.controller.ts). Same
// underlying Order/OrderStatus as the company-facing CompanyOrder above —
// admin's list/detail responses just add the company + email-outbox fields a
// company obviously never sees about itself.
// ---------------------------------------------------------------------------

export interface AdminOrder extends CompanyOrder {
  company: { id: string; username: string; name: string | null; contactName: string | null; email: string; creditTerms: CreditTerms };
  emails?: OrderEmail[];
}

// ---------------------------------------------------------------------------
// Admin — shipments (backend/src/modules/admin/admin-shipments.controller.ts).
// ---------------------------------------------------------------------------

export interface AdminShipment {
  id: string;
  orderId: string;
  shipmentNumber: string;
  shippedAt: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  createdAt: string;
  // The list endpoint returns company + shipping address (the fulfilment
  // worklist needs "who and where"); the detail endpoint returns the fuller
  // order. Both branches optional since a caller only ever has one.
  order?:
    | {
        id: string;
        orderNumber: string;
        companyId: string;
        company: { username: string; name: string | null };
        shippingAddress: { label: string; city: string; state: string } | null;
      }
    | { id: string; orderNumber: string; company: { name: string } };
  items: CompanyOrderShipmentItem[];
}

// ---------------------------------------------------------------------------
// Admin — campaigns / batches / kits
// (backend/src/modules/admin/admin-{campaigns,batches,kits}.controller.ts).
// ---------------------------------------------------------------------------

export type CampaignStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'SOLD_OUT';

export interface PreorderCampaign {
  id: string;
  name: string;
  opensAt: string;
  closesAt: string;
  estimatedArrival: string;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
  _count?: { batches: number; kits: number };
  // Detail endpoint only.
  batches?: Batch[];
  kits?: Kit[];
}

export type BatchStatus = 'INCOMING' | 'IN_STOCK' | 'DEPLETED';

export interface Batch {
  id: string;
  variantId: string;
  campaignId: string | null;
  batchNumber: string;
  expiry: string;
  coaUrl: string | null;
  quantity: number;
  status: BatchStatus;
  createdAt: string;
  updatedAt: string;
  variant?: { id: string; code: string; size: string | null; product: { id: string; name: string } };
  campaign?: { id: string; name: string; status: CampaignStatus } | null;
  _count?: { shipmentItems: number };
}

export interface KitItem {
  id: string;
  kitId: string;
  variantId: string;
  quantity: number;
  variant?: { id: string; code: string; size: string | null; product?: { name: string } };
}

export interface Kit {
  id: string;
  name: string;
  pricePerKit: number;
  qtyPerKit: number;
  campaignId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  items: KitItem[];
  campaign?: { id: string; name: string; status: CampaignStatus } | null;
}

// ---------------------------------------------------------------------------
// Public storefront — kits & pre-order campaigns.
// backend/src/modules/kits + modules/campaigns. Distinct from the admin `Kit`
// above: component variants carry slug/imageUrl for linking and thumbnails but
// no per-component price (a kit is sold at pricePerKit, not as a priced parts
// list), and each kit carries a computed `available`.
// ---------------------------------------------------------------------------

export interface PublicKitItem {
  id: string;
  kitId: string;
  variantId: string;
  quantity: number;
  variant: {
    id: string;
    code: string;
    size: string | null;
    imageUrl: string | null;
    product: { name: string; slug: string };
  };
}

export interface PublicKit {
  id: string;
  campaignId: string | null;
  name: string;
  pricePerKit: number;
  qtyPerKit: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  items: PublicKitItem[];
  campaign: {
    id: string;
    name: string;
    status: CampaignStatus;
    closesAt: string;
    estimatedArrival: string;
  } | null;
  // Whole kits assemblable from current component stock — gated by the
  // scarcest component, and the same number checkout enforces.
  available: number;
}

export interface PublicCampaignBatch {
  id: string;
  quantity: number;
  status: BatchStatus;
  expiry: string;
  coaUrl: string | null;
  variant: {
    id: string;
    code: string;
    size: string | null;
    product: { name: string; slug: string };
  };
}

export interface PublicCampaign {
  id: string;
  name: string;
  opensAt: string;
  closesAt: string;
  estimatedArrival: string;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
  kits: PublicKit[];
  batches: PublicCampaignBatch[];
}

// ---------------------------------------------------------------------------
// Admin — companies (backend/src/modules/admin/admin-companies.controller.ts).
// ---------------------------------------------------------------------------

export interface AdminCompany extends CompanyProfile {
  _count?: { orders: number; quotations: number };
  // Detail endpoint only.
  addresses?: CompanyAddress[];
  lifetimeOrderValue?: number;
  recentOrders?: { id: string; orderNumber: string; status: CompanyOrderStatus; total: number; createdAt: string }[];
}
