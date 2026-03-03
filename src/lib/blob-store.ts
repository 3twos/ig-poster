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

export const putJson = async (pathname: string, value: unknown) => {
  return put(pathname, JSON.stringify(value), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
};

export const readJsonByPath = async <T>(pathname: string): Promise<T | null> => {
  const { blobs } = await list({ prefix: pathname, limit: 1 });
  const blob = blobs.find((item) => item.pathname === pathname) ?? blobs[0];
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

export const deleteBlob = async (url: string) => del(url);

export const deleteBlobByPath = async (pathname: string) => {
  const { blobs } = await list({ prefix: pathname, limit: 1 });
  const blob = blobs.find((item) => item.pathname === pathname) ?? blobs[0];
  if (!blob) {
    return false;
  }

  await del(blob.url);
  return true;
};
