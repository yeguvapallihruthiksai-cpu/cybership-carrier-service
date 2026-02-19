import { z } from 'zod';

// ─── Address ────────────────────────────────────────────────────────────────

export const AddressSchema = z.object({
  name: z.string().min(1, 'Address name is required').max(100),
  street1: z.string().min(1, 'Street address is required').max(100),
  street2: z.string().max(100).optional(),
  street3: z.string().max(100).optional(),
  city: z.string().min(1, 'City is required').max(50),
  stateProvinceCode: z.string().min(1, 'State/Province code is required').max(20),
  postalCode: z.string().min(1, 'Postal code is required').max(20),
  countryCode: z.string().length(2, 'Country code must be 2-letter ISO'),
});

export type Address = z.infer<typeof AddressSchema>;

// ─── Package dimensions and weight ──────────────────────────────────────────

export const PackageSchema = z.object({
  weight: z.number().positive('Weight must be positive'),
  weightUnit: z.enum(['LBS', 'OZS', 'KGS']).default('LBS'),
  length: z.number().positive('Length must be positive'),
  width: z.number().positive('Width must be positive'),
  height: z.number().positive('Height must be positive'),
  dimensionUnit: z.enum(['IN', 'CM']).default('IN'),
});

export type Package = z.infer<typeof PackageSchema>;

// ─── Rate request ───────────────────────────────────────────────────────────

export const RateRequestSchema = z.object({
  origin: AddressSchema,
  destination: AddressSchema,
  packages: z.array(PackageSchema).min(1, 'At least one package is required'),
  serviceLevel: z.string().optional(),
  requestId: z.string().optional(),
});

export type RateRequest = z.infer<typeof RateRequestSchema>;

// ─── Normalized rate quote (caller-facing) ──────────────────────────────────

export const RateQuoteSchema = z.object({
  carrier: z.string(),
  serviceName: z.string(),
  serviceCode: z.string(),
  totalCharge: z.number().nonnegative(),
  currency: z.string(),
  transitDays: z.number().int().nonnegative().optional(),
});

export type RateQuote = z.infer<typeof RateQuoteSchema>;

// ─── Rate response (normalized, returned to caller) ─────────────────────────

export const RateResponseSchema = z.object({
  quotes: z.array(RateQuoteSchema),
  requestId: z.string().optional(),
});

export type RateResponse = z.infer<typeof RateResponseSchema>;
