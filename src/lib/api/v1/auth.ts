import { z } from "zod";

export const AuthActorSchema = z.object({
  type: z.literal("workspace-user"),
  subjectId: z.string().min(1),
  email: z.string().email(),
  domain: z.string().min(1),
  authSource: z.enum(["bearer", "cookie"]),
  scopes: z.array(z.string()),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const WhoAmIDataSchema = z.object({
  actor: AuthActorSchema,
});
