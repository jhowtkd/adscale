import { z } from "zod";

export const WAITLIST_SECTORS = [
  "agency",
  "ecommerce",
  "saas",
  "infoproduct",
  "retail",
  "other",
] as const;

export type WaitlistSector = (typeof WAITLIST_SECTORS)[number];

export const waitlistSignupSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    sector: z.enum(WAITLIST_SECTORS),
    sectorOther: z.string().trim().max(100).optional().nullable(),
    whatsapp: z.string().trim().min(8).max(30),
    consent: z.literal(true),
    locale: z.enum(["pt-BR", "en"]).default("pt-BR"),
    website: z.string().optional(), // honeypot
  })
  .superRefine((data, ctx) => {
    if (data.sector === "other" && !data.sectorOther?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sectorOtherRequired",
        path: ["sectorOther"],
      });
    }
  });

export type WaitlistSignupInput = z.infer<typeof waitlistSignupSchema>;

export const WAITLIST_CONSENT_VERSION = "2026-06-08";
