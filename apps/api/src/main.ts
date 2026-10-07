import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
import 'reflect-metadata';
import { BadRequestException, Body, Controller, Get, Inject, Injectable, Module, Post, Query } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
class Db extends PrismaClient {}

const num = (value: unknown) => Number(value ?? 0);
const linesFrom = (body: any): Array<{ itemId: number; qty: number; rate: number }> => {
  if (!Array.isArray(body?.lines) || body.lines.length === 0) throw new BadRequestException('Add at least one item line.');
  const grouped = new Map<number, { itemId: number; qty: number; value: number }>();
  for (const line of body.lines) {
    const itemId = num(line.itemId), qty = num(line.qty), rate = num(line.rate);
    const current = grouped.get(itemId) || { itemId, qty: 0, value: 0 };
    current.qty += qty; current.value += qty * rate; grouped.set(itemId, current);
  }
  return [...grouped.values()].map(line => ({ itemId: line.itemId, qty: line.qty, rate: line.qty ? line.value / line.qty : 0 }));
};
const invoice = (prefix: string) => `${prefix}-${Date.now()}`;

@Injectable()
class ErpService {
  constructor(@Inject(Db) private db: Db) {}

  async dashboard() {
    const [sales, purchases, expenses, items, customers, vendors, recentSales, recentPurchases] = await Promise.all([
      this.db.sale.aggregate({ _sum: { total: true } }),
      this.db.purchase.aggregate({ _sum: { total: true } }),
      this.db.expense.aggregate({ _sum: { amount: true } }),
      this.db.item.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      this.db.customer.count(), this.db.vendor.count(),
      this.db.sale.findMany({ take: 5, orderBy: { date: 'desc' }, include: { customer: true } }),
      this.db.purchase.findMany({ take: 5, orderBy: { date: 'desc' }, include: { vendor: true } }),
    ]);
    const gross = await this.db.saleLine.aggregate({ _sum: { amount: true, costAmount: true } });
    return {
      sales: sales._sum.total ?? 0, purchases: purchases._sum.total ?? 0,
      expenses: expenses._sum.amount ?? 0, grossSales: gross._sum.amount ?? 0,
      cogs: gross._sum.costAmount ?? 0,
      grossProfit: num(gross._sum.amount) - num(gross._sum.costAmount),
      stockValue: items.reduce((sum, item) => sum + num(item.qty) * num(item.avgCost), 0),
      customers, vendors, items, recentSales, recentPurchases,
    };
  }

  async createPurchase(body: any) {
    const lines = linesFrom(body);
    if (!body.vendorId) throw new BadRequestException('Select a vendor.');
    const paid = num(body.paid);
    return this.db.$transaction(async tx => {
      const total = lines.reduce((sum, line) => sum + line.qty * line.rate, 0);
      if (paid < 0 || paid > total) throw new BadRequestException('Paid amount must be between zero and the invoice total.');
      const purchase = await tx.purchase.create({ data: {
        invoiceNo: body.invoiceNo || invoice('PUR'), vendorId: num(body.vendorId),
        date: body.date ? new Date(body.date) : new Date(), subtotal: total, total, paid,
        notes: body.notes || null,
        lines: { create: lines.map(line => ({ ...line, amount: line.qty * line.rate })) },
      } });
      for (const line of lines) {
        if (line.qty <= 0 || line.rate < 0) throw new BadRequestException('Quantity must be positive and rate cannot be negative.');
        const item = await tx.item.findUniqueOrThrow({ where: { id: line.itemId } });
        const oldQty = num(item.qty), newQty = oldQty + line.qty;
        const avg = newQty ? (oldQty * num(item.avgCost) + line.qty * line.rate) / newQty : line.rate;
        await tx.item.update({ where: { id: item.id }, data: { qty: newQty, avgCost: avg, avgPurchaseRate: avg } });
        await tx.stockMove.create({ data: { itemId: item.id, type: 'PURCHASE', qty: line.qty, rate: line.rate, value: line.qty * line.rate, refType: 'PURCHASE', refId: purchase.id } });
      }
      await tx.vendor.update({ where: { id: num(body.vendorId) }, data: { balance: { increment: total - paid } } });
      await tx.ledgerEntry.create({ data: { accountType: 'INVENTORY', accountId: null, debit: total, credit: 0, description: `Inventory received on ${purchase.invoiceNo}`, refType: 'PURCHASE', refId: purchase.id } });
      await tx.ledgerEntry.create({ data: { accountType: 'VENDOR', accountId: num(body.vendorId), debit: 0, credit: total, description: `Purchase ${purchase.invoiceNo}`, refType: 'PURCHASE', refId: purchase.id } });
      if (paid > 0) {
        await tx.ledgerEntry.create({ data: { accountType: 'VENDOR', accountId: num(body.vendorId), debit: paid, credit: 0, description: `Payment on ${purchase.invoiceNo}`, refType: 'PURCHASE', refId: purchase.id } });
        await tx.ledgerEntry.create({ data: { accountType: body.paymentMethod === 'BANK' ? 'BANK' : 'CASH', accountId: null, debit: 0, credit: paid, description: `Payment for ${purchase.invoiceNo}`, refType: 'PURCHASE', refId: purchase.id } });
      }
      return purchase;
    });
  }

  async createSale(body: any) {
    const lines = linesFrom(body);
    if (!body.customerId) throw new BadRequestException('Select a customer.');
    const received = num(body.received);
    return this.db.$transaction(async tx => {
      const prepared = [];
      for (const line of lines) {
        if (line.qty <= 0 || line.rate < 0) throw new BadRequestException('Quantity must be positive and rate cannot be negative.');
        const item = await tx.item.findUniqueOrThrow({ where: { id: line.itemId } });
        const priorSales = await tx.saleLine.aggregate({ where: { itemId: line.itemId }, _sum: { qty: true, amount: true } });
        if (num(item.qty) < line.qty) throw new BadRequestException(`Not enough stock for ${item.name}. Available: ${item.qty}`);
        prepared.push({ ...line, costRate: num(item.avgCost), amount: line.qty * line.rate, costAmount: line.qty * num(item.avgCost), item, priorSoldQty: num(priorSales._sum.qty), priorSoldAmount: num(priorSales._sum.amount) });
      }
      const total = prepared.reduce((sum, line) => sum + line.amount, 0);
      if (received < 0 || received > total) throw new BadRequestException('Received amount must be between zero and the invoice total.');
      const sale = await tx.sale.create({ data: {
        invoiceNo: body.invoiceNo || invoice('SAL'), customerId: num(body.customerId),
        date: body.date ? new Date(body.date) : new Date(), subtotal: total, total, received,
        paymentMethod: body.paymentMethod || 'CREDIT', notes: body.notes || null,
        lines: { create: prepared.map(({ item, priorSoldQty, priorSoldAmount, ...line }) => line) },
      } });
      for (const line of prepared) {
        const nextQty = num(line.item.qty) - line.qty;
        const soldQty = line.priorSoldQty + line.qty;
        const avgSellingRate = soldQty ? (line.priorSoldAmount + line.amount) / soldQty : line.rate;
        await tx.item.update({ where: { id: line.itemId }, data: { qty: nextQty, avgSellingRate } });
        await tx.stockMove.create({ data: { itemId: line.itemId, type: 'SALE', qty: -line.qty, rate: line.costRate, value: -line.costAmount, refType: 'SALE', refId: sale.id } });
      }
      await tx.customer.update({ where: { id: num(body.customerId) }, data: { balance: { increment: total - received } } });
      await tx.ledgerEntry.create({ data: { accountType: 'CUSTOMER', accountId: num(body.customerId), debit: total, credit: received, description: `Sale ${sale.invoiceNo}`, refType: 'SALE', refId: sale.id } });
      await tx.ledgerEntry.create({ data: { accountType: 'REVENUE', accountId: null, debit: 0, credit: total, description: `Sales revenue ${sale.invoiceNo}`, refType: 'SALE', refId: sale.id } });
      if (received > 0) await tx.ledgerEntry.create({ data: { accountType: body.paymentMethod === 'BANK' ? 'BANK' : 'CASH', accountId: null, debit: received, credit: 0, description: `Receipt for ${sale.invoiceNo}`, refType: 'SALE', refId: sale.id } });
      const cost = prepared.reduce((sum, line) => sum + line.costAmount, 0);
      if (cost > 0) {
        await tx.ledgerEntry.create({ data: { accountType: 'COGS', accountId: null, debit: cost, credit: 0, description: `Cost of ${sale.invoiceNo}`, refType: 'SALE', refId: sale.id } });
        await tx.ledgerEntry.create({ data: { accountType: 'INVENTORY', accountId: null, debit: 0, credit: cost, description: `Stock issued for ${sale.invoiceNo}`, refType: 'SALE', refId: sale.id } });
      }
      return sale;
    });
  }

  async createProduction(body: any) {
    const recipeId = num(body.recipeId), plannedQty = num(body.plannedQty);
    const goodQty = num(body.goodQty || body.plannedQty);
    if (plannedQty <= 0 || goodQty <= 0) throw new BadRequestException('Production quantities must be positive.');
    return this.db.$transaction(async tx => {
      const recipe = await tx.recipe.findUniqueOrThrow({ where: { id: recipeId }, include: { lines: { include: { item: true } } } });
      const scale = plannedQty / num(recipe.outputQty);
      let totalCost = 0;
      for (const input of recipe.lines) {
        const qty = num(input.qty) * scale;
        if (num(input.item.qty) < qty) throw new BadRequestException(`Not enough stock for ${input.item.name}.`);
        totalCost += qty * num(input.item.avgCost);
      }
      const batch = await tx.productionBatch.create({ data: {
        batchNo: body.batchNo || invoice('BATCH'), recipeId, outputItemId: recipe.outputItemId,
        plannedQty, actualQty: num(body.actualQty || plannedQty), goodQty,
        wastageQty: Math.max(0, num(body.actualQty || plannedQty) - goodQty), totalCost,
        costPerKg: totalCost / goodQty, date: body.date ? new Date(body.date) : new Date(),
      } });
      for (const input of recipe.lines) {
        const qty = num(input.qty) * scale, value = qty * num(input.item.avgCost);
        await tx.item.update({ where: { id: input.itemId }, data: { qty: { decrement: qty } } });
        await tx.stockMove.create({ data: { itemId: input.itemId, type: 'PRODUCTION_CONSUME', qty: -qty, rate: num(input.item.avgCost), value: -value, refType: 'PRODUCTION', refId: batch.id } });
      }
      const output = await tx.item.findUniqueOrThrow({ where: { id: recipe.outputItemId } });
      const outQty = num(output.qty) + goodQty;
      const avgCost = outQty ? (num(output.qty) * num(output.avgCost) + totalCost) / outQty : totalCost / goodQty;
      await tx.item.update({ where: { id: output.id }, data: { qty: outQty, avgCost, avgPurchaseRate: avgCost } });
      await tx.stockMove.create({ data: { itemId: output.id, type: 'PRODUCTION_OUTPUT', qty: goodQty, rate: totalCost / goodQty, value: totalCost, refType: 'PRODUCTION', refId: batch.id } });
      return batch;
    });
  }
}

@Controller('api')
class ApiController {
  constructor(@Inject(Db) private db: Db, @Inject(ErpService) private erp: ErpService) {}
  @Get('dashboard') dashboard() { return this.erp.dashboard(); }
  @Get('items') items() { return this.db.item.findMany({ orderBy: { name: 'asc' } }); }
  @Post('items') createItem(@Body() b: any) { return this.db.item.create({ data: { sku: b.sku, name: b.name, type: b.type || 'RAW', unit: b.unit || 'KG', reorderLevel: num(b.reorderLevel), avgSellingRate: num(b.avgSellingRate) } }); }
  @Get('vendors') vendors() { return this.db.vendor.findMany({ orderBy: { name: 'asc' } }); }
  @Post('vendors') createVendor(@Body() b: any) { return this.db.vendor.create({ data: { code: b.code, name: b.name, phone: b.phone || null, address: b.address || null, openingBalance: num(b.openingBalance), balance: num(b.openingBalance) } }); }
  @Get('customers') customers() { return this.db.customer.findMany({ orderBy: { name: 'asc' } }); }
  @Post('customers') createCustomer(@Body() b: any) { return this.db.customer.create({ data: { code: b.code, name: b.name, phone: b.phone || null, address: b.address || null, openingBalance: num(b.openingBalance), balance: num(b.openingBalance) } }); }
  @Get('purchases') purchases() { return this.db.purchase.findMany({ include: { vendor: true, lines: { include: { item: true } } }, orderBy: { date: 'desc' } }); }
  @Post('purchases') purchase(@Body() b: any) { return this.erp.createPurchase(b); }
  @Get('sales') sales(@Query('from') from?: string, @Query('to') to?: string) { const where: Prisma.SaleWhereInput = {}; if (from || to) where.date = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) }; return this.db.sale.findMany({ where, include: { customer: true, lines: { include: { item: true } } }, orderBy: { date: 'desc' } }); }
  @Post('sales') sale(@Body() b: any) { return this.erp.createSale(b); }
  @Get('expenses') expenses() { return this.db.expense.findMany({ orderBy: { date: 'desc' } }); }
  @Post('expenses') expense(@Body() b: any) {
    const amount = num(b.amount), paymentMethod = b.paymentMethod || 'CASH';
    if (amount <= 0) throw new BadRequestException('Expense amount must be greater than zero.');
    return this.db.$transaction(async tx => {
      const expense = await tx.expense.create({ data: { category: b.category, description: b.description, amount, paymentMethod, date: b.date ? new Date(b.date) : new Date() } });
      await tx.ledgerEntry.create({ data: { accountType: 'EXPENSE', accountId: expense.id, debit: amount, credit: 0, description: `${b.category}: ${b.description}`, refType: 'EXPENSE', refId: expense.id } });
      await tx.ledgerEntry.create({ data: { accountType: paymentMethod, accountId: null, debit: 0, credit: amount, description: `Payment for ${b.category}`, refType: 'EXPENSE', refId: expense.id } });
      return expense;
    });
  }
  @Get('recipes') recipes() { return this.db.recipe.findMany({ include: { lines: { include: { item: true } } }, orderBy: { name: 'asc' } }); }
  @Post('recipes') recipe(@Body() b: any) { if (!Array.isArray(b.lines) || !b.lines.length) throw new BadRequestException('Add recipe ingredients.'); return this.db.recipe.create({ data: { name: b.name, outputItemId: num(b.outputItemId), outputQty: num(b.outputQty), lines: { create: b.lines.map((line: any) => ({ itemId: num(line.itemId), qty: num(line.qty), percentage: num(line.percentage) })) } } }); }
  @Get('production') production() { return this.db.productionBatch.findMany({ include: { recipe: true, outputItem: true }, orderBy: { date: 'desc' } }); }
  @Post('production') productionCreate(@Body() b: any) { return this.erp.createProduction(b); }
  @Get('stock-moves') stockMoves() { return this.db.stockMove.findMany({ include: { item: true }, orderBy: { date: 'desc' }, take: 200 }); }
  @Get('ledger') ledger() { return this.db.ledgerEntry.findMany({ orderBy: { date: 'desc' }, take: 200 }); }
}

@Module({ controllers: [ApiController], providers: [Db, ErpService] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('');
  await app.listen(Number(process.env.API_PORT || 4000));
}
bootstrap();
