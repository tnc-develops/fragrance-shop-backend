import type { Order, PaymentMethod, PaymentOption, PaymentStatus, Prisma } from '@prisma/client';
import { badRequest } from '../lib/http';
import { prisma } from '../lib/prisma';

export interface PaymentInitResult {
  status: PaymentStatus;
  /** Set by hosted-checkout gateways (Stripe, PayHere...) that need a redirect. */
  redirectUrl?: string;
}

/**
 * Code that takes a payment for one method. A method can only be switched on in the admin once it has a
 * provider here, so adding card payments means implementing `CARD` below (see the README).
 */
export interface PaymentProvider {
  method: PaymentMethod;
  initiate(order: Order): Promise<PaymentInitResult>;
}

const providers: Partial<Record<PaymentMethod, PaymentProvider>> = {
  COD: { method: 'COD', initiate: async () => ({ status: 'PENDING' }) },
  // Paid offline; the admin marks the order paid after checking the slip.
  BANK_TRANSFER: { method: 'BANK_TRANSFER', initiate: async () => ({ status: 'PENDING' }) },
};

export const hasProvider = (method: PaymentMethod) => Boolean(providers[method]);

export function getPaymentProvider(method: PaymentMethod): PaymentProvider {
  const provider = providers[method];
  if (!provider) throw badRequest('This payment method is not available');
  return provider;
}

export interface BankAccount {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch?: string | null;
}

export const DEFAULT_PAYMENT_OPTIONS = [
  {
    method: 'COD',
    name: 'Cash on delivery',
    description: 'Pay in cash when your order arrives at your door.',
    isActive: true,
    sortOrder: 0,
  },
  {
    method: 'BANK_TRANSFER',
    name: 'Bank transfer',
    description: 'Transfer the total to our bank account, then share your payment slip.',
    instructions:
      'Please use your order number as the payment reference. We will confirm and dispatch your order once the payment is received.',
    isActive: true,
    sortOrder: 1,
    bankAccounts: [
      { bankName: 'Commercial Bank', accountName: 'Fragrance by Shoon', accountNumber: '0000 0000 0000', branch: 'Colombo 07' },
    ] satisfies BankAccount[],
  },
  {
    method: 'CARD',
    name: 'Credit / debit card',
    description: 'Pay securely online with Visa or Mastercard.',
    isActive: false,
    sortOrder: 2,
  },
] satisfies Prisma.PaymentOptionCreateManyInput[];

let ensured = false;

/** All payment options in display order, creating any missing method with its defaults. */
export async function getPaymentOptions(): Promise<PaymentOption[]> {
  if (!ensured) {
    await prisma.paymentOption.createMany({ data: DEFAULT_PAYMENT_OPTIONS, skipDuplicates: true });
    ensured = true;
  }
  return prisma.paymentOption.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
}

/** Whether customers can choose this option at checkout right now. */
export const isAvailable = (o: PaymentOption) => o.isActive && hasProvider(o.method);

/** The fields customers see. Bank details are meant to be shared, so they are public. */
export function publicPaymentOption(o: PaymentOption) {
  const bankTransfer = o.method === 'BANK_TRANSFER';
  return {
    method: o.method,
    name: o.name,
    description: o.description,
    instructions: o.instructions,
    bankAccounts: bankTransfer ? ((o.bankAccounts as BankAccount[] | null) ?? []) : [],
    allowSlipUpload: bankTransfer && o.allowSlipUpload,
    allowWhatsappSlip: bankTransfer && o.allowWhatsappSlip,
    available: isAvailable(o),
  };
}

export async function requireAvailableOption(method: PaymentMethod): Promise<PaymentOption> {
  const option = (await getPaymentOptions()).find((o) => o.method === method);
  if (!option || !isAvailable(option)) throw badRequest('This payment method is not available. Please choose another.');
  return option;
}
