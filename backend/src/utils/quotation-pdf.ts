import PDFDocument from 'pdfkit';
import path from 'path';
import { getVariantDisplayName } from './product-addons.js';

// Deliberately close to receipt-pdf.ts's layout so the two documents read as
// coming from the same company. The meaningful differences are all
// quotation-specific: validity dating is prominent (a quote is only an offer
// until it expires), prices are the *negotiated* QuotationItem.unitPrice
// rather than catalog price, and there's no payment/shipping block since
// nothing has been ordered yet.
interface QuotationItem {
  quantity: number;
  unitPrice: number;
  // variantId/kitId are mutually exclusive on QuotationItem — one of these is set.
  variant: { code: string; size: string | null; product: { name: string } } | null;
  kit: { name: string } | null;
}

interface QuotationDoc {
  quoteNumber: string;
  createdAt: Date | string;
  validUntil: Date | string;
  status: string;
  createdBy: string;
  subtotal: number;
  total: number;
  company: { name: string; contactName?: string | null; phone?: string | null; email: string };
  items: QuotationItem[];
}

interface QuotationSettings {
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

export async function generateQuotationPdf(
  quotation: QuotationDoc,
  settings: QuotationSettings,
): Promise<Buffer> {
  const companyName = settings.receipt_company_name || settings.business_name || 'ASCEND';
  const companyReg = settings.receipt_company_reg || '';
  const companyAddress = settings.receipt_address || '';
  const companyPhone = settings.receipt_phone || '';
  const companyEmail = settings.receipt_email || '';
  const footerNote =
    settings.receipt_footer_note || 'All products are for research and laboratory use only.';

  const logoPath = path.resolve(process.cwd(), 'assets', 'logo.png');
  const expired = new Date(quotation.validUntil).getTime() < Date.now();

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100;
    const leftX = 50;
    const rightX = doc.page.width - 50;

    // === Header: Logo + Company Info ===
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

    // === QUOTATION title + quote info (right aligned) ===
    doc
      .font('Helvetica-Bold')
      .fontSize(24)
      .fillColor('#000000')
      .text('QUOTATION', leftX, 110, { align: 'right', width: pageWidth });

    doc.font('Helvetica').fontSize(9).fillColor('#444444');
    doc.text(`Quote: ${quotation.quoteNumber}`, leftX, 140, { align: 'right', width: pageWidth });
    doc.text(`Date: ${formatDate(quotation.createdAt)}`, leftX, 153, { align: 'right', width: pageWidth });
    // Validity is the single most consequential field on a quote — an expired
    // one is not an offer any more, so it's called out in red rather than
    // sitting quietly in the same grey as everything else.
    doc.fillColor(expired ? '#c0392b' : '#444444');
    doc.text(
      `${expired ? 'Expired' : 'Valid until'}: ${formatDate(quotation.validUntil)}`,
      leftX,
      166,
      { align: 'right', width: pageWidth },
    );

    doc.moveTo(leftX, 188).lineTo(rightX, 188).strokeColor('#dddddd').lineWidth(1).stroke();

    // === Customer Info ===
    let y = 200;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#888888').text('PREPARED FOR', leftX, y);
    y += 16;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text(quotation.company.name, leftX, y);
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor('#444444');
    if (quotation.company.contactName) {
      doc.text(quotation.company.contactName, leftX, y);
      y += 12;
    }
    if (quotation.company.phone) {
      doc.text(quotation.company.phone, leftX, y);
      y += 12;
    }
    doc.text(quotation.company.email, leftX, y);
    y += 12;
    if (quotation.createdBy) {
      doc.fillColor('#888888').fontSize(8);
      doc.text(`Prepared by ${quotation.createdBy}`, leftX, y);
      y += 12;
    }
    y += 12;

    // === Items Table ===
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

    doc.font('Helvetica').fontSize(9).fillColor('#000000');
    for (const item of quotation.items) {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
      const itemName = item.variant
        ? getVariantDisplayName(item.variant.product, item.variant)
        : (item.kit?.name ?? 'Item');
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

    y += 4;
    doc.moveTo(leftX, y).lineTo(rightX, y).strokeColor('#000000').lineWidth(1).stroke();
    y += 14;

    // === Totals ===
    const totalsX = colPrice;
    const totalsW = rightX - colPrice;

    doc.font('Helvetica').fontSize(9).fillColor('#444444');
    doc.text('Subtotal', totalsX - 80, y, { width: 80, align: 'right' });
    doc.text(formatRM(quotation.subtotal), totalsX, y, { width: totalsW, align: 'right' });
    y += 4;

    doc.moveTo(totalsX - 80, y + 10).lineTo(rightX, y + 10).strokeColor('#000000').lineWidth(1).stroke();
    y += 20;

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000');
    doc.text('Total', totalsX - 80, y, { width: 80, align: 'right' });
    doc.text(formatRM(quotation.total), totalsX, y, { width: totalsW, align: 'right' });
    y += 34;

    // === Terms — a quote is an offer, not an order; spell out what it does
    // and doesn't commit to so an accepted quote can't be argued to have
    // included shipping/tax that was never quoted. ===
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#888888').text('TERMS', leftX, y);
    y += 14;
    doc.font('Helvetica').fontSize(8).fillColor('#444444');
    const terms = [
      `This quotation is valid until ${formatDate(quotation.validUntil)} and is subject to stock availability at the time of acceptance.`,
      'Prices are quoted in Malaysian Ringgit (MYR) and exclude shipping unless stated otherwise.',
      'Accepting this quotation converts it into a confirmed order; payment terms follow your account’s agreed credit terms.',
    ];
    for (const line of terms) {
      doc.text(`•  ${line}`, leftX, y, { width: pageWidth });
      y += doc.heightOfString(`•  ${line}`, { width: pageWidth }) + 4;
    }

    // === Footer ===
    // -84, not -70: the second footer line sits at +22, and A4's 50pt bottom
    // margin cuts off at height-50 — at -70 that last line overflows and
    // PDFKit silently appends a blank page to hold it.
    const footerY = doc.page.height - 84;
    doc.moveTo(leftX, footerY).lineTo(rightX, footerY).strokeColor('#dddddd').lineWidth(0.5).stroke();

    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#999999')
      .text(footerNote, leftX, footerY + 10, { align: 'center', width: pageWidth });
    doc.text('Thank you for your interest.', leftX, footerY + 22, {
      align: 'center',
      width: pageWidth,
    });

    doc.end();
  });
}
