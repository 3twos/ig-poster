import { z } from "zod";

export const PublishSettingsSchema = z.object({
  caption: z.string().max(2200).optional(),
  firstComment: z.string().max(2200).optional(),
  locationId: z.string().max(64).optional(),
  reelShareToFeed: z.boolean().optional(),
});

export type PublishSettings = z.infer<typeof PublishSettingsSchema>;
export type PublishSettingsState = Required<PublishSettings>;

export const DEFAULT_PUBLISH_SETTINGS: PublishSettingsState = {
  caption: "",
  firstComment: "",
  locationId: "",
  reelShareToFeed: true,
};
