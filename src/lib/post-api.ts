import { z } from "zod";

export const DuplicatePostResponseSchema = z
  .object({
    id: z.string().trim().min(1),
    post: z
      .object({
        id: z.string().trim().min(1),
      })
      .passthrough(),
  })
  .refine((value) => value.id === value.post.id, {
    message: "Duplicate response id does not match duplicated post payload.",
    path: ["id"],
  });

export type DuplicatePostResponse = z.infer<typeof DuplicatePostResponseSchema>;
