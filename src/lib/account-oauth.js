export const nativeAuthRedirect = "rainflix://auth/callback";

export function parseAccountCallback(address, webRedirect) {
  try {
    const url = new URL(address);
    const native =
      url.protocol === "rainflix:" &&
      url.hostname === "auth" &&
      url.pathname === "/callback" &&
      !url.port;
    const web =
      webRedirect &&
      url.origin === new URL(webRedirect).origin &&
      url.pathname === new URL(webRedirect).pathname;
    if (
      (!native && !web) ||
      url.username ||
      url.password ||
      (native && url.hash)
    )
      return null;
    const code = url.searchParams.get("code");
    const attempt = url.searchParams.get("attempt");
    if (
      !/^[a-f0-9]{64}$/.test(attempt || "") ||
      url.searchParams.getAll("attempt").length !== 1
    )
      return null;
    if (!code && !url.searchParams.has("error")) return null;
    if (
      code &&
      (!/^[A-Za-z0-9._~-]{1,2048}$/.test(code) ||
        url.searchParams.getAll("code").length !== 1)
    )
      return null;
    return { code, attempt, error: url.searchParams.has("error") };
  } catch {
    return null;
  }
}
