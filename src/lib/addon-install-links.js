let pending = null;

export function addonInstallAddress(value) {
  if (typeof value !== "string" || value.length > 16384) return null;
  const converted = value.replace(/^(stremio|rainflix):\/\//i, "https://");
  try {
    const url = new URL(converted);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.hash ||
      !url.pathname.endsWith("/manifest.json")
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function receiveAddonInstallLink(value) {
  const address = addonInstallAddress(value);
  if (!address) return false;
  pending = address;
  window.location.hash = "/addons";
  window.dispatchEvent(new Event("rainflix:addon-install"));
  return true;
}

export function takeAddonInstallLink() {
  const address = pending;
  pending = null;
  return address;
}
