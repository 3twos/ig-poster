export const readCookieFromHeader = (cookieHeader: string | null, key: string) => {
  if (!cookieHeader) {
    return "";
  }

  const match = cookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(`${key}=`));

  if (!match) {
    return "";
  }

  try {
    return decodeURIComponent(match.slice(key.length + 1));
  } catch {
    return match.slice(key.length + 1);
  }
};

export const readCookieFromRequest = (req: Request, key: string) =>
  readCookieFromHeader(req.headers.get("cookie"), key);
