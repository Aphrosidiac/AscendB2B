-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "prepaidInvoiceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_prepaidInvoiceId_key" ON "orders"("prepaidInvoiceId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_prepaidInvoiceId_fkey" FOREIGN KEY ("prepaidInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

