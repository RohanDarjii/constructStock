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

export const forgotPasswordSchema = z.object({ email }).strict();

export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(12).max(128),
}).strict();

export type RegisterCompanyInput = z.infer<typeof registerCompanySchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
