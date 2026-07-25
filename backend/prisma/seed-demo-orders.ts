// Drives the real HTTP API end-to-end to create realistic demo companies,
// orders, shipments, invoices, payments, and quotations — deliberately NOT
// raw DB inserts, so OrderStatusHistory/Batch decrements/Invoice totals all
// stay exactly as consistent as if a real user did this by hand.
//
// Usage: BASE_URL=https://supplies.ascendpeptides.my ADMIN_EMAIL=admin@ascend.my ADMIN_PASSWORD=... npx tsx prisma/seed-demo-orders.ts

const BASE_URL = process.env.BASE_URL || 'http://localhost:3207';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;

async function api(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function signupOrLogin(company: { name: string; contactName: string; phone: string; email: string; password: string }) {
  try {
    const r = await api('/api/v1/companies/signup', { method: 'POST', body: company });
    return { token: r.token, id: r.company.id };
  } catch {
    const r = await api('/api/v1/companies/login', { method: 'POST', body: { email: company.email, password: company.password } });
    return { token: r.token, id: r.company.id };
  }
}

async function variantId(adminToken: string, code: string): Promise<string> {
  const r = await api(`/api/v1/products?limit=100`, { token: adminToken });
  for (const p of r.data) {
    const v = p.variants?.find((v: { code: string }) => v.code === code);
    if (v) return v.id;
  }
  throw new Error(`variant not found: ${code}`);
}

async function kitIdByName(adminToken: string, name: string): Promise<string> {
  const r = await api('/api/v1/admin/kits?limit=50', { token: adminToken });
  const k = r.data.find((k: { name: string }) => k.name === name);
  if (!k) throw new Error(`kit not found: ${name}`);
  return k.id;
}

async function batchIdByNumber(adminToken: string, batchNumber: string): Promise<string> {
  const r = await api('/api/v1/admin/batches?limit=100', { token: adminToken });
  const b = r.data.find((b: { batchNumber: string }) => b.batchNumber === batchNumber);
  if (!b) throw new Error(`batch not found: ${batchNumber}`);
  return b.id;
}

async function main() {
  const adminLogin = await api('/api/v1/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const adminToken = adminLogin.token;

  const cu50 = await variantId(adminToken, 'CU50');
  const h36 = await variantId(adminToken, 'H36');
  const aa10 = await variantId(adminToken, 'AA10');
  const ms10 = await variantId(adminToken, 'MS10');
  const ms40 = await variantId(adminToken, 'MS40');
  const retaKitId = await kitIdByName(adminToken, 'Retatrutide Full Course Kit');
  const ghkBatchId = await batchIdByNumber(adminToken, 'GHKCU50-2607-A');
  const hghBatchId = await batchIdByNumber(adminToken, 'HGHH36-2607-A');

  // --- Company A: Radiance Aesthetics Clinic — NET30, one completed+invoiced order, one open preorder ---
  const companyA = await signupOrLogin({
    name: 'Radiance Aesthetics Clinic Sdn Bhd',
    contactName: 'Dr. Farah Aziz',
    phone: '0127654321',
    email: 'orders@radianceaesthetics.demo',
    password: 'DemoPassword123',
  });
  await api(`/api/v1/admin/companies/${companyA.id}`, { method: 'PATCH', token: adminToken, body: { creditTerms: 'NET30' } });
  const addrA = await api('/api/v1/companies/addresses', {
    method: 'POST', token: companyA.token,
    body: { label: 'Clinic HQ', line1: '12 Jalan Ampang', city: 'Kuala Lumpur', state: 'Kuala Lumpur', postcode: '50450', type: 'BOTH' },
  });

  const orderA1 = await api('/api/v1/orders', {
    method: 'POST', token: companyA.token,
    body: { shippingAddressId: addrA.id, items: [{ variantId: cu50, quantity: 10 }], notes: 'Monthly clinic restock' },
  });
  await api(`/api/v1/admin/orders/${orderA1.order.id}`, { method: 'PATCH', token: adminToken, body: { status: 'CONFIRMED', note: 'Stock confirmed against GHKCU50-2607-A' } });
  const shipA1 = await api('/api/v1/admin/shipments', { method: 'POST', token: adminToken, body: { orderId: orderA1.order.id, carrier: 'City-Link Express', trackingNumber: 'CL2607A1001' } });
  await api(`/api/v1/admin/shipments/${shipA1.id}/items`, { method: 'POST', token: adminToken, body: { orderItemId: orderA1.order.items[0].id, batchId: ghkBatchId, quantity: 10 } });
  await api(`/api/v1/admin/shipments/${shipA1.id}/ship`, { method: 'POST', token: adminToken, body: {} });
  const shipA1Detail = await api(`/api/v1/admin/shipments/${shipA1.id}`, { token: adminToken });
  const invA1 = await api('/api/v1/admin/invoices', { method: 'POST', token: adminToken, body: { shipmentItemIds: shipA1Detail.items.map((i: { id: string }) => i.id) } });
  // Partial payment — demonstrates the "partially paid" computed invoice status.
  await api(`/api/v1/admin/invoices/${invA1.id}/payments`, { method: 'POST', token: adminToken, body: { amount: Math.round(invA1.total / 2), method: 'WHATSAPP', paymentRef: 'Bank transfer slip #4821' } });

  const orderA2 = await api('/api/v1/orders', {
    method: 'POST', token: companyA.token,
    body: { shippingAddressId: addrA.id, items: [{ kitId: retaKitId, quantity: 1 }], notes: 'Preorder against August restock campaign' },
  });
  console.log(`Company A orders: ${orderA1.order.orderNumber} (invoiced, partially paid), ${orderA2.order.orderNumber} (pending, awaiting campaign stock)`);

  // --- Company B: Vitality Wellness Trading — PREPAID, pay-now order shipped to DELIVERED ---
  const companyB = await signupOrLogin({
    name: 'Vitality Wellness Trading',
    contactName: 'Marcus Tan',
    phone: '0139988776',
    email: 'procurement@vitalitywellness.demo',
    password: 'DemoPassword123',
  });
  const addrB = await api('/api/v1/companies/addresses', {
    method: 'POST', token: companyB.token,
    body: { label: 'Warehouse', line1: '88 Jalan Sultan Ismail', city: 'Johor Bahru', state: 'Johor', postcode: '80000', type: 'BOTH' },
  });
  const orderB1 = await api('/api/v1/orders', {
    method: 'POST', token: companyB.token,
    body: { shippingAddressId: addrB.id, items: [{ variantId: h36, quantity: 5 }], payNow: true },
  });
  if (orderB1.order.prepaidInvoiceId) {
    await api(`/api/v1/admin/invoices/${orderB1.order.prepaidInvoiceId}/payments`, {
      method: 'POST', token: adminToken, body: { amount: orderB1.order.total, method: 'BILLPLZ', paymentRef: 'billplz-demo-ref-001' },
    });
  }
  await api(`/api/v1/admin/orders/${orderB1.order.id}`, { method: 'PATCH', token: adminToken, body: { status: 'CONFIRMED' } });
  const shipB1 = await api('/api/v1/admin/shipments', { method: 'POST', token: adminToken, body: { orderId: orderB1.order.id, carrier: 'J&T Express', trackingNumber: 'JT2607B1002' } });
  await api(`/api/v1/admin/shipments/${shipB1.id}/items`, { method: 'POST', token: adminToken, body: { orderItemId: orderB1.order.items[0].id, batchId: hghBatchId, quantity: 5 } });
  await api(`/api/v1/admin/shipments/${shipB1.id}/ship`, { method: 'POST', token: adminToken, body: {} });
  await api(`/api/v1/admin/orders/${orderB1.order.id}`, { method: 'PATCH', token: adminToken, body: { status: 'DELIVERED', note: 'Confirmed received by warehouse manager' } });
  console.log(`Company B order: ${orderB1.order.orderNumber} (paid via Billplz, delivered)`);

  // --- Company C: Coastal Peptide Distributors — a cancelled order ---
  const companyC = await signupOrLogin({
    name: 'Coastal Peptide Distributors',
    contactName: 'Lim Wei Jian',
    phone: '0165544332',
    email: 'admin@coastalpeptide.demo',
    password: 'DemoPassword123',
  });
  const addrC = await api('/api/v1/companies/addresses', {
    method: 'POST', token: companyC.token,
    body: { label: 'Office', line1: '5 Persiaran Gurney', city: 'George Town', state: 'Penang', postcode: '10250', type: 'BOTH' },
  });
  const orderC1 = await api('/api/v1/orders', {
    method: 'POST', token: companyC.token,
    body: { shippingAddressId: addrC.id, items: [{ variantId: aa10, quantity: 20 }] },
  });
  await api(`/api/v1/admin/orders/${orderC1.order.id}`, { method: 'PATCH', token: adminToken, body: { status: 'CANCELLED', note: 'Customer requested cancellation — reordering next month in bulk' } });
  console.log(`Company C order: ${orderC1.order.orderNumber} (cancelled)`);

  // --- Quotations: one pending (SENT), one accepted (auto-converts to an order) ---
  const quoteA = await api('/api/v1/quotations', {
    method: 'POST', token: companyA.token,
    body: { items: [{ variantId: ms10, quantity: 15 }, { variantId: ms40, quantity: 10 }] },
  });
  await api(`/api/v1/admin/quotations/${quoteA.id}`, {
    method: 'PATCH', token: adminToken,
    body: { items: [{ id: quoteA.items[0].id, variantId: ms10, quantity: 15, unitPrice: 14000 }, { id: quoteA.items[1].id, variantId: ms40, quantity: 10, unitPrice: 30000 }] },
  });
  await api(`/api/v1/admin/quotations/${quoteA.id}/send`, { method: 'POST', token: adminToken, body: {} });
  console.log(`Company A quotation: ${quoteA.quoteNumber} (sent, awaiting response)`);

  const quoteB = await api('/api/v1/quotations', {
    method: 'POST', token: companyB.token,
    body: { items: [{ variantId: h36, quantity: 8 }] },
  });
  await api(`/api/v1/admin/quotations/${quoteB.id}`, {
    method: 'PATCH', token: adminToken,
    body: { items: [{ id: quoteB.items[0].id, variantId: h36, quantity: 8, unitPrice: 17500 }] },
  });
  await api(`/api/v1/admin/quotations/${quoteB.id}/send`, { method: 'POST', token: adminToken, body: {} });
  const acceptedQuoteB = await api(`/api/v1/quotations/${quoteB.id}/accept`, { method: 'POST', token: companyB.token, body: { shippingAddressId: addrB.id } });
  console.log(`Company B quotation: ${quoteB.quoteNumber} (accepted -> order ${acceptedQuoteB.order?.orderNumber ?? acceptedQuoteB.orderNumber})`);

  console.log('Demo orders/quotations seeded successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
