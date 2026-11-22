import { z } from "zod";

const supportedCurrencies = new Set(Intl.supportedValuesOf("currency"));
const email = z.email().max(254).transform((value) => value.trim().toLowerCase());

export const registerCompanySchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  email,
  password: z.string().min(12).max(128),
  currencyCode: z.string().trim().toUpperCase().refine((value) => supportedCurrencies.has(value), "Use an ISO 4217 currency code."),
}).strict();

export const loginSchema = z.object({
  email,
  password: z.string().min(1),
}).strict();

export type RegisterCompanyInput = z.infer<typeof registerCompanySchema>;
export type LoginInput = z.infer<typeof loginSchema>;
