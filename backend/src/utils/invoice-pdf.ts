import PDFDocument from 'pdfkit';
import path from 'path';
import { getVariantDisplayName } from './product-addons.js';

// Third document in the set, deliberately laid out like quotation-pdf.ts and
// receipt-pdf.ts so all three read as coming from the same company. The
// invoice-specific parts are the ones that matter: it carries a due date
// derived from the account's credit terms, it shows payments already received
// against it, and it ends on a balance due rather than a total — a receipt is
// a record of something settled, an invoice is a demand for something owed.
//
// Line names come through InvoiceItem -> shipmentItem -> orderItem, since an
// invoice bills shipped items, not ordered ones (a part-shipped order is
// billed for what actually went out).
interface InvoiceLine {
  amount: number;
  shipmentItem: {
    quantity: number;
    batch?: { batchNumber: string } | null;
    orderItem: {
      unitPrice: number;
      // variantId/kitId are mutually exclusive on OrderItem — one is set.
      variant: { code: string; size: string | null; product: { name: string } } | null;
      kit: { name: string } | null;
    };
    shipment?: { shipmentNumber?: string | null; order?: { orderNumber: string } | null } | null;
  };
}

interface InvoiceDoc {
  invoiceNumber: string;
  issueDate: Date | string;
  dueDate: Date | string;
  total: number;
  void: boolean;
  company: {
    name: string | null;
    contactName?: string | null;
    phone?: string | null;
    email: string;
    creditTerms?: string | null;
  };
  items: InvoiceLine[];
  payments: { amount: number; method?: string | null; paymentRef?: string | null; paidAt?: Date | string | null }[];
}

interface InvoiceSettings {
  receipt_company_name?: string;
  receipt_company_reg?: string;
  receipt_address?: string;
  receipt_phone?: string;
  receipt_email?: string;
  receipt_footer_note?: string;
  receipt_bank_details?: string;
  business_name?: string;
}

const CREDIT_TERMS_LABELS: Record<string, string> = {
  PREPAID: 'Prepaid',
  NET15: 'Net 15',
  NET30: 'Net 30',
  NET60: 'Net 60',
};

function formatRM(sen: number): string {
  return `RM ${(sen / 100).toFixed(2)}`;
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-MY', { year: 'numeric', month: 'long', day: 'numeric' });
}

export async function generateInvoicePdf(
  invoice: InvoiceDoc,
  settings: InvoiceSettings,
): Promise<Buffer> {
  const companyName = settings.receipt_company_name || settings.business_name || 'ASCEND';
  const companyReg = settings.receipt_company_reg || '';
  const companyAddress = settings.receipt_address || '';
  const companyPhone = settings.receipt_phone || '';
  const companyEmail = settings.receipt_email || '';
  const bankDetails = settings.receipt_bank_details || '';
  const footerNote =
    settings.receipt_footer_note || 'All products are for research and laboratory use only.';

  const logoPath = path.resolve(process.cwd(), 'assets', 'logo.png');

  const paidAmount = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
  const balanceDue = Math.max(0, invoice.total - paidAmount);
  // Mirrors computeInvoiceStatus: a void invoice owes nothing regardless of
  // dates, and only an unsettled one can be overdue.
  const overdue =
    !invoice.void && balanceDue > 0 && new Date(invoice.dueDate).getTime() < Date.now();

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100;
    const leftX = 50;
    const rightX = doc.page.width - 50;

    // === Header ===
    try {
      doc.image(logoPath, leftX, 45, { width: 36 });
    } catch {
      // logo missing — skip
    }
    doc.font('Helvetica-Bold').fontSize(18).text(companyName, leftX + 44, 50);

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

    // === Title + invoice meta ===
    doc
      .font('Helvetica-Bold')
      .fontSize(24)
      .fillColor(invoice.void ? '#999999' : '#000000')
      .text(invoice.void ? 'INVOICE (VOID)' : 'INVOICE', leftX, 110, {
        align: 'right',
        width: pageWidth,
      });

    doc.font('Helvetica').fontSize(9).fillColor('#444444');
    doc.text(`Invoice: ${invoice.invoiceNumber}`, leftX, 140, { align: 'right', width: pageWidth });
    doc.text(`Issued: ${formatDate(invoice.issueDate)}`, leftX, 153, { align: 'right', width: pageWidth });
    // The due date is the whole point of an invoice, so an overdue one is
    // called out in red rather than sitting in the same grey as the rest.
    doc.fillColor(overdue ? '#c0392b' : '#444444');
    doc.text(`${overdue ? 'Overdue since' : 'Due'}: ${formatDate(invoice.dueDate)}`, leftX, 166, {
      align: 'right',
      width: pageWidth,
    });

    doc.moveTo(leftX, 188).lineTo(rightX, 188).strokeColor('#dddddd').lineWidth(1).stroke();

    // === Bill to ===
    let y = 200;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#888888').text('BILL TO', leftX, y);
    y += 16;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000')
      .text(invoice.company.name ?? invoice.company.contactName ?? 'Trade account', leftX, y);
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor('#444444');
    if (invoice.company.contactName) {
      doc.text(invoice.company.contactName, leftX, y);
      y += 12;
    }
    if (invoice.company.phone) {
      doc.text(invoice.company.phone, leftX, y);
      y += 12;
    }
    doc.text(invoice.company.email, leftX, y);
    y += 12;
    if (invoice.company.creditTerms) {
      doc.fillColor('#888888').fontSize(8);
      doc.text(
        `Payment terms: ${CREDIT_TERMS_LABELS[invoice.company.creditTerms] ?? invoice.company.creditTerms}`,
        leftX,
        y,
      );
      y += 12;
    }
    y += 12;

    // === Line items ===
    const colItem = leftX;
    const colQty = leftX + 280;
    const colPrice = leftX + 340;
    const colAmount = rightX;

    doc.moveTo(leftX, y).lineTo(rightX, y).strokeColor('#000000').lineWidth(1).stroke();
    y += 8;

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#888888');
    doc.text('ITEM', colItem, y);
    doc.text('QTY', colQty, y, { width: 40, align: 'center' });
    doc.text('UNIT PRICE', colPrice, y, { width: 60, align: 'right' });
    doc.text('AMOUNT', colAmount - 70, y, { width: 70, align: 'right' });
    y += 16;

    doc.moveTo(leftX, y).lineTo(rightX, y).strokeColor('#dddddd').lineWidth(0.5).stroke();
    y += 8;

    for (const line of invoice.items) {
      if (y > 660) {
        doc.addPage();
        y = 50;
      }
      const { shipmentItem } = line;
      const { orderItem } = shipmentItem;
      const itemName = orderItem.variant
        ? getVariantDisplayName(orderItem.variant.product, orderItem.variant)
        : (orderItem.kit?.name ?? 'Item');

      doc.font('Helvetica').fontSize(9).fillColor('#000000');
      doc.text(itemName, colItem, y, { width: 260 });
      const nameHeight = doc.heightOfString(itemName, { width: 260 });

      // Batch is worth printing on an invoice specifically: it's the record
      // tying what was billed to what physically shipped.
      const subParts = [
        orderItem.variant?.code,
        shipmentItem.batch?.batchNumber ? `Batch ${shipmentItem.batch.batchNumber}` : null,
      ].filter(Boolean);
      if (subParts.length) {
        doc.fontSize(7).fillColor('#888888');
        doc.text(subParts.join('  ·  '), colItem, y + nameHeight, { width: 260 });
      }

      doc.fontSize(9).fillColor('#000000');
      doc.text(String(shipmentItem.quantity), colQty, y, { width: 40, align: 'center' });
      doc.text(formatRM(orderItem.unitPrice), colPrice, y, { width: 60, align: 'right' });
      doc.text(formatRM(line.amount), colAmount - 70, y, { width: 70, align: 'right' });

      y += Math.max(nameHeight + 14, 22);
    }

    y += 4;
    doc.moveTo(leftX, y).lineTo(rightX, y).strokeColor('#000000').lineWidth(1).stroke();
    y += 14;

    // === Totals, payments received, balance ===
    const totalsX = colPrice;
    const totalsW = rightX - colPrice;

    doc.font('Helvetica').fontSize(9).fillColor('#444444');
    doc.text('Invoice total', totalsX - 90, y, { width: 90, align: 'right' });
    doc.text(formatRM(invoice.total), totalsX, y, { width: totalsW, align: 'right' });
    y += 14;

    if (paidAmount > 0) {
      doc.text('Payments received', totalsX - 90, y, { width: 90, align: 'right' });
      doc.text(`- ${formatRM(paidAmount)}`, totalsX, y, { width: totalsW, align: 'right' });
      y += 4;
      doc.moveTo(totalsX - 90, y + 10).lineTo(rightX, y + 10).strokeColor('#000000').lineWidth(1).stroke();
      y += 20;
    }

    doc.font('Helvetica-Bold').fontSize(12).fillColor(overdue ? '#c0392b' : '#000000');
    doc.text(invoice.void ? 'Void' : 'Balance due', totalsX - 90, y, { width: 90, align: 'right' });
    doc.text(invoice.void ? '—' : formatRM(balanceDue), totalsX, y, { width: totalsW, align: 'right' });
    y += 30;

    // === Payment history — an invoice that's been part-paid should show
    // what's already landed, or the customer can't reconcile it. ===
    if (invoice.payments.length > 0) {
      if (y > 640) {
        doc.addPage();
        y = 50;
      }
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#888888').text('PAYMENTS RECEIVED', leftX, y);
      y += 14;
      doc.font('Helvetica').fontSize(8).fillColor('#444444');
      for (const payment of invoice.payments) {
        const parts = [
          payment.paidAt ? formatDate(payment.paidAt) : null,
          payment.method ?? null,
          payment.paymentRef ? `Ref ${payment.paymentRef}` : null,
        ].filter(Boolean);
        doc.text(parts.join('  ·  '), leftX, y, { width: pageWidth - 90 });
        doc.text(formatRM(payment.amount), totalsX, y, { width: totalsW, align: 'right' });
        y += 13;
      }
      y += 10;
    }

    // === How to pay — omitted once settled or voided, where it's just noise. ===
    if (!invoice.void && balanceDue > 0 && bankDetails) {
      if (y > 660) {
        doc.addPage();
        y = 50;
      }
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#888888').text('PAYMENT DETAILS', leftX, y);
      y += 14;
      doc.font('Helvetica').fontSize(8).fillColor('#444444');
      doc.text(bankDetails, leftX, y, { width: pageWidth });
      y += doc.heightOfString(bankDetails, { width: pageWidth }) + 6;
      doc.fillColor('#888888');
      doc.text(`Please quote ${invoice.invoiceNumber} with your payment.`, leftX, y, { width: pageWidth });
    }

    // === Footer ===
    // -84 for the same reason as quotation-pdf.ts: the second line sits at
    // +22 and A4's 50pt bottom margin would otherwise push it onto a blank
    // trailing page.
    const footerY = doc.page.height - 84;
    doc.moveTo(leftX, footerY).lineTo(rightX, footerY).strokeColor('#dddddd').lineWidth(0.5).stroke();

    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#999999')
      .text(footerNote, leftX, footerY + 10, { align: 'center', width: pageWidth });
    doc.text('Thank you for your business.', leftX, footerY + 22, {
      align: 'center',
      width: pageWidth,
    });

    doc.end();
  });
}
