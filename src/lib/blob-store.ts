import { del, list, put, type ListBlobResultBlob } from "@vercel/blob";

export const isBlobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const sanitizeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "file";

export const buildBlobPath = (folder: string, fileName: string) => {
  const cleanFolder = folder.replace(/[^a-z0-9/-]/gi, "").replace(/\/+$/, "");
  return `${cleanFolder}/${Date.now()}-${sanitizeName(fileName)}`;
};

export const putJson = async (
  pathname: string,
  value: unknown,
) => {
  return put(pathname, JSON.stringify(value), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
};

export const readJsonByPath = async <T>(pathname: string): Promise<T | null> => {
  const { blobs } = await list({ prefix: pathname, limit: 1 });
  const blob = blobs.find((item) => item.pathname === pathname);
  if (!blob) {
    return null;
  }

  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
};

export const listBlobs = async (prefix: string, limit = 100): Promise<ListBlobResultBlob[]> => {
  const { blobs } = await list({ prefix, limit });
  return blobs;
};

export const listBlobsPaginated = async (
  prefix: string,
  options?: { pageSize?: number; maxResults?: number },
): Promise<ListBlobResultBlob[]> => {
  const pageSize = Math.max(1, Math.min(options?.pageSize ?? 1000, 1000));
  const maxResults = Math.max(1, options?.maxResults ?? 5000);

  const collected: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore && collected.length < maxResults) {
    const { blobs, hasMore: nextHasMore, cursor: nextCursor } = await list({
      prefix,
      limit: Math.min(pageSize, maxResults - collected.length),
      cursor,
    });
    collected.push(...blobs);
    hasMore = nextHasMore;
    cursor = nextCursor;
  }

  return collected;
};

export const deleteBlob = async (url: string) => del(url);

export const deleteBlobByPath = async (pathname: string) => {
  const { blobs } = await list({ prefix: pathname, limit: 1 });
  const blob = blobs.find((item) => item.pathname === pathname);
  if (!blob) {
    return false;
  }

  await del(blob.url);
  return true;
};
