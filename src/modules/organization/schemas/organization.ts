import { z } from "zod";

export const updateOrganizationSchema = z.object({ name: z.string().trim().min(2).max(120) }).strict();
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
