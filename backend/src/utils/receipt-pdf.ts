import PDFDocument from 'pdfkit';
import path from 'path';
import { getVariantDisplayName } from './product-addons.js';

interface ReceiptItem {
  quantity: number;
  unitPrice: number;
  // variantId/kitId are mutually exclusive on OrderItem — one of these is set.
  variant: { code: string; size: string | null; product: { name: string } } | null;
  kit: { name: string } | null;
}

interface ReceiptOrder {
  orderNumber: string;
  createdAt: Date | string;
  status: string;
  company: { name: string | null; contactName: string | null; phone: string | null; email: string };
  shippingAddress: { line1: string; line2: string | null; city: string; state: string; postcode: string };
  subtotal: number;
  shippingFee: number;
  discountAmount: number;
  total: number;
  discountCode?: { code: string; discountType: string; discountValue: number } | null;
  items: ReceiptItem[];
}

// Best-effort payment/shipping context — pulled from Invoice/Payment/Shipment
// when the caller has them handy, distinct from `order` itself since neither
// relation is directly reachable from Order anymore (Invoice belongs to
// Company, not Order — see the ERD). Both optional: a credit-terms order with
// nothing shipped/invoiced yet still has a valid, renderable receipt.
interface ReceiptPaymentInfo {
  method: string;
  paymentRef: string | null;
  paidAt: Date | string;
}
interface ReceiptShipmentInfo {
  carrier: string | null;
  trackingNumber: string | null;
}

interface ReceiptSettings {
  receipt_company_name?: string;
  receipt_company_reg?: string;
  receipt_address?: string;
  receipt_phone?: string;
  receipt_email?: string;
  receipt_footer_note?: string;
  business_name?: string;
}

function formatRM(sen: number): string {
  return `RM ${(sen / 100).toFixed(2)}`;
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-MY', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function methodLabel(method: string): string {
  return method === 'WHATSAPP' ? 'Manual transfer' : 'Online (Billplz)';
}

export async function generateReceiptPdf(
  order: ReceiptOrder,
  settings: ReceiptSettings,
  payment?: ReceiptPaymentInfo | null,
  shipments?: ReceiptShipmentInfo[],
): Promise<Buffer> {
  const companyName = settings.receipt_company_name || settings.business_name || 'ASCEND';
  const companyReg = settings.receipt_company_reg || '';
  const companyAddress = settings.receipt_address || '';
  const companyPhone = settings.receipt_phone || '';
  const companyEmail = settings.receipt_email || '';
  const footerNote =
    settings.receipt_footer_note || 'All products are for research and laboratory use only.';

  const logoPath = path.resolve(process.cwd(), 'assets', 'logo.png');

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100; // 50 margin each side
    const leftX = 50;
    const rightX = doc.page.width - 50;

    // === Header: Logo + Company Info ===
    try {
      doc.image(logoPath, leftX, 45, { width: 36 });
    } catch {
      // logo missing — skip
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(companyName, leftX + 44, 50);

    let headerY = 72;
    doc.font('Helvetica').fontSize(8).fillColor('#666666');
    if (companyAddress) {
      doc.text(companyAddress, leftX + 44, headerY);
      headerY += 11;
    }
    const contactParts = [companyPhone, companyEmail].filter(Boolean);
    if (contactParts.length) {
      doc.text(contactParts.join('  |  '), leftX + 44, headerY);
      headerY += 11;
    }
    if (companyReg) {
      doc.text(`Reg: ${companyReg}`, leftX + 44, headerY);
      headerY += 11;
    }

    // === RECEIPT title + order info (right aligned) ===
    doc
      .font('Helvetica-Bold')
      .fontSize(24)
      .fillColor('#000000')
      .text('RECEIPT', leftX, 110, { align: 'right', width: pageWidth });

    doc.font('Helvetica').fontSize(9).fillColor('#444444');
    doc.text(`Order: ${order.orderNumber}`, leftX, 140, { align: 'right', width: pageWidth });
    doc.text(`Date: ${formatDate(order.createdAt)}`, leftX, 153, {
      align: 'right',
      width: pageWidth,
    });
    doc.text(
      `Status: ${order.status}`,
      leftX,
      166,
      { align: 'right', width: pageWidth },
    );

    // === Divider ===
    doc
      .moveTo(leftX, 188)
      .lineTo(rightX, 188)
      .strokeColor('#dddddd')
      .lineWidth(1)
      .stroke();

    // === Customer Info ===
    let y = 200;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#888888').text('BILL TO', leftX, y);
    y += 16;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000')
      .text(order.company.name ?? order.company.contactName ?? 'Trade account', leftX, y);
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor('#444444');
    if (order.company.contactName) doc.text(order.company.contactName, leftX, y);
    y += 12;
    if (order.company.phone) doc.text(order.company.phone, leftX, y);
    y += 12;
    doc.text(order.company.email, leftX, y);
    y += 12;
    doc.text(`${order.shippingAddress.line1}${order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}`, leftX, y);
    y += 12;
    doc.text(`${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.postcode}`, leftX, y);
    y += 24;

    // === Items Table ===
    const colItem = leftX;
    const colQty = leftX + 280;
    const colPrice = leftX + 340;
    const colAmount = rightX;

    // Table header
    doc
      .moveTo(leftX, y)
      .lineTo(rightX, y)
      .strokeColor('#000000')
      .lineWidth(1)
      .stroke();
    y += 8;

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#888888');
    doc.text('ITEM', colItem, y);
    doc.text('QTY', colQty, y, { width: 40, align: 'center' });
    doc.text('PRICE', colPrice, y, { width: 60, align: 'right' });
    doc.text('AMOUNT', colAmount - 70, y, { width: 70, align: 'right' });
    y += 16;

    doc
      .moveTo(leftX, y)
      .lineTo(rightX, y)
      .strokeColor('#dddddd')
      .lineWidth(0.5)
      .stroke();
    y += 8;

    // Table rows
    doc.font('Helvetica').fontSize(9).fillColor('#000000');
    for (const item of order.items) {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
      const itemName = item.variant ? getVariantDisplayName(item.variant.product, item.variant) : (item.kit?.name ?? 'Item');
      doc.font('Helvetica').fontSize(9).fillColor('#000000');
      doc.text(itemName, colItem, y, { width: 260 });
      const nameHeight = doc.heightOfString(itemName, { width: 260 });

      if (item.variant) {
        doc.fontSize(7).fillColor('#888888');
        doc.text(item.variant.code, colItem, y + nameHeight, { width: 260 });
      }

      doc.fontSize(9).fillColor('#000000');
      doc.text(String(item.quantity), colQty, y, { width: 40, align: 'center' });
      doc.text(formatRM(item.unitPrice), colPrice, y, { width: 60, align: 'right' });
      doc.text(formatRM(item.unitPrice * item.quantity), colAmount - 70, y, {
        width: 70,
        align: 'right',
      });

      y += Math.max(nameHeight + 14, 22);
    }

    // Table bottom line
    y += 4;
    doc
      .moveTo(leftX, y)
      .lineTo(rightX, y)
      .strokeColor('#000000')
      .lineWidth(1)
      .stroke();
    y += 14;

    // === Totals ===
    const totalsX = colPrice;
    const totalsW = rightX - colPrice;

    doc.font('Helvetica').fontSize(9).fillColor('#444444');
    doc.text('Subtotal', totalsX - 80, y, { width: 80, align: 'right' });
    doc.text(formatRM(order.subtotal), totalsX, y, { width: totalsW, align: 'right' });
    y += 16;

    if (order.discountAmount > 0) {
      const discountLabel = order.discountCode
        ? `Discount (${order.discountCode.code})`
        : 'Discount';
      doc.fillColor('#22863a');
      doc.text(discountLabel, totalsX - 120, y, { width: 120, align: 'right' });
      doc.text(`-${formatRM(order.discountAmount)}`, totalsX, y, {
        width: totalsW,
        align: 'right',
      });
      y += 16;
    }

    doc.fillColor('#444444');
    doc.text('Shipping', totalsX - 80, y, { width: 80, align: 'right' });
    doc.text(
      order.shippingFee ? formatRM(order.shippingFee) : 'Free',
      totalsX,
      y,
      { width: totalsW, align: 'right' },
    );
    y += 4;

    // Total divider
    doc
      .moveTo(totalsX - 80, y + 10)
      .lineTo(rightX, y + 10)
      .strokeColor('#000000')
      .lineWidth(1)
      .stroke();
    y += 20;

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000');
    doc.text('Total', totalsX - 80, y, { width: 80, align: 'right' });
    doc.text(formatRM(order.total), totalsX, y, { width: totalsW, align: 'right' });
    y += 30;

    // === Payment Info — only rendered when a Payment was actually passed in;
    // a credit-terms order with nothing recorded yet just omits this block
    // rather than showing a misleading "unpaid" line. ===
    if (payment) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#888888').text('PAYMENT', leftX, y);
      y += 14;
      doc.font('Helvetica').fontSize(9).fillColor('#444444');
      doc.text(`Method: ${methodLabel(payment.method)}`, leftX, y);
      y += 13;
      doc.text(`Received: ${formatDate(payment.paidAt)}`, leftX, y);
      y += 13;
      if (payment.paymentRef) {
        doc.text(`Reference: ${payment.paymentRef}`, leftX, y);
        y += 13;
      }
    }

    // === Tracking — one line per shipment that has a tracking number ===
    const tracked = (shipments ?? []).filter((s) => s.trackingNumber);
    if (tracked.length) {
      y += 6;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#888888').text('SHIPPING', leftX, y);
      y += 14;
      doc.font('Helvetica').fontSize(9).fillColor('#444444');
      for (const s of tracked) {
        doc.text(`Tracking: ${s.trackingNumber}${s.carrier ? ` (${s.carrier})` : ''}`, leftX, y);
        y += 13;
      }
    }

    // === Footer ===
    // -84, not -70: the second footer line sits at +22, and A4's 50pt bottom
    // margin cuts off at height-50 — at -70 that last line overflows and
    // PDFKit silently appends a blank page to hold it.
    const footerY = doc.page.height - 84;
    doc
      .moveTo(leftX, footerY)
      .lineTo(rightX, footerY)
      .strokeColor('#dddddd')
      .lineWidth(0.5)
      .stroke();

    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#999999')
      .text(footerNote, leftX, footerY + 10, { align: 'center', width: pageWidth });
    doc.text('Thank you for your purchase.', leftX, footerY + 22, {
      align: 'center',
      width: pageWidth,
    });

    doc.end();
  });
}
