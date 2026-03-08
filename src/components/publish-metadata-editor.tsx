"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MetaLocationSearchField } from "@/components/meta-location-search";
import { MetaUserTagsEditor } from "@/components/meta-user-tags-editor";
import type { AssetMediaType } from "@/lib/types";
import type { MetaUserTag } from "@/lib/meta-schemas";

type TaggableAsset = {
  assetId: string;
  name: string;
  mediaType: AssetMediaType;
  previewUrl?: string;
  userTags: MetaUserTag[];
};

type Props = {
  postType: "single-image" | "reel" | "carousel";
  firstComment: string;
  locationId: string;
  reelShareToFeed: boolean;
  hasIncompleteUserTags: boolean;
  disabled?: boolean;
  singleTagAsset?: TaggableAsset | null;
  carouselTagAssets?: TaggableAsset[];
  onFirstCommentChange: (value: string) => void;
  onLocationIdChange: (value: string) => void;
  onReelShareToFeedChange: (value: boolean) => void;
  onAssetUserTagsChange: (assetId: string, tags: MetaUserTag[]) => void;
};

export function PublishMetadataEditor({
  postType,
  firstComment,
  locationId,
  reelShareToFeed,
  hasIncompleteUserTags,
  disabled = false,
  singleTagAsset,
  carouselTagAssets = [],
  onFirstCommentChange,
  onLocationIdChange,
  onReelShareToFeedChange,
  onAssetUserTagsChange,
}: Props) {
  const showSingleAssetTagging =
    (postType === "single-image" || postType === "reel") && singleTagAsset;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
        Publish Metadata
      </p>

      <div className="space-y-1 rounded-xl border border-white/15 bg-white/5 p-3">
        <Label className="text-[11px] text-slate-300">
          First comment (optional)
        </Label>
        <Textarea
          aria-label="First comment (optional)"
          value={firstComment}
          onChange={(event) => onFirstCommentChange(event.target.value)}
          className="min-h-[76px] text-xs"
          maxLength={2200}
          placeholder="Add a first comment to post immediately after publish..."
        />
        <p className="text-[11px] text-slate-400">
          {firstComment.trim().length}/2200
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-white/15 bg-white/5 p-3">
        <Label className="text-[11px] text-slate-300">
          Location ID (optional)
        </Label>
        <Input
          aria-label="Location ID (optional)"
          value={locationId}
          onChange={(event) => onLocationIdChange(event.target.value)}
          className="text-xs"
          placeholder="Facebook location ID"
        />
        <MetaLocationSearchField
          ariaLabel="Search Meta locations"
          locationId={locationId}
          onSelectLocationId={onLocationIdChange}
          disabled={disabled}
        />
        <p className="text-[11px] text-slate-400">
          Meta accepts location tags on supported feed posts. Search fills the same location ID sent at publish time.
        </p>
      </div>

      {showSingleAssetTagging ? (
        <div className="space-y-2 rounded-xl border border-white/15 bg-white/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-slate-300">
              {postType === "reel" ? "User tags (reel)" : "User tags"}
            </Label>
            <Badge variant="outline" className="text-[10px] uppercase">
              {singleTagAsset.mediaType}
            </Badge>
          </div>
          <MetaUserTagsEditor
            ariaLabelPrefix={
              postType === "reel" ? "Reel publish" : "Publish"
            }
            imageUrl={singleTagAsset.previewUrl}
            tags={singleTagAsset.userTags}
            onChange={(tags) => onAssetUserTagsChange(singleTagAsset.assetId, tags)}
            disabled={disabled}
          />
          <p className="text-[11px] text-slate-400">
            {postType === "reel"
              ? "If the reel has no cover image, you can still edit tag usernames and x/y coordinates."
              : "Place tags visually on the final image, or fine-tune x/y values between 0 and 1."}
          </p>
        </div>
      ) : null}

      {postType === "carousel" ? (
        <div className="space-y-3 rounded-xl border border-white/15 bg-white/5 p-3">
          <div>
            <Label className="text-[11px] text-slate-300">
              Carousel item tags
            </Label>
            <p className="mt-1 text-[11px] text-slate-400">
              Tag each included image individually. Meta does not support user tags on carousel videos.
            </p>
          </div>
          {carouselTagAssets.map((asset, index) => (
            <div
              key={asset.assetId}
              className="rounded-lg border border-white/10 bg-slate-950/35 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-slate-100">
                    Item {index + 1}: {asset.name}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {asset.mediaType}
                </Badge>
              </div>
              {asset.mediaType === "video" ? (
                <p className="text-[11px] text-slate-400">
                  Videos can stay in the carousel, but Meta will reject user tags on carousel video items.
                </p>
              ) : (
                <MetaUserTagsEditor
                  ariaLabelPrefix={`Carousel item ${index + 1}`}
                  imageUrl={asset.previewUrl}
                  tags={asset.userTags}
                  onChange={(tags) => onAssetUserTagsChange(asset.assetId, tags)}
                  disabled={disabled}
                />
              )}
            </div>
          ))}
        </div>
      ) : null}

      {postType === "reel" ? (
        <div className="space-y-2 rounded-xl border border-white/15 bg-white/5 p-3">
          <p className="text-[11px] font-medium text-slate-300">
            Reel controls
          </p>
          <label className="flex items-start gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              aria-label="Share reel to main feed"
              checked={reelShareToFeed}
              onChange={(event) => onReelShareToFeedChange(event.target.checked)}
              disabled={disabled}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-950/40"
            />
            <span>Share reel to main feed</span>
          </label>
          <p className="text-[11px] text-slate-400">
            Turn this off to publish the reel only to the Reels tab.
          </p>
        </div>
      ) : null}

      {hasIncompleteUserTags ? (
        <p className="text-[11px] text-amber-200">
          Fill a username for each tag row or remove incomplete rows before publishing.
        </p>
      ) : null}
    </div>
  );
}
