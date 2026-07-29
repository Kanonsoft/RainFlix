import { useEffect } from "react";

const DEFAULT_TITLE = "RainFlix";
const DEFAULT_DESCRIPTION =
  "Discover movies and series through a cinematic, touch-first RainFlix experience.";
const DEFAULT_IMAGE = new URL(
  `${import.meta.env.BASE_URL}rainflix-preview.jpg`,
  window.location.origin,
).href;

function ensureMeta(selector, attributes) {
  let element = document.head.querySelector(selector);

  if (!element) {
    element = document.createElement("meta");
    Object.entries(attributes).forEach(([name, value]) =>
      element.setAttribute(name, value),
    );
    document.head.appendChild(element);
  }

  return element;
}

function setMeta(selector, attributes, content) {
  ensureMeta(selector, attributes).setAttribute("content", content);
}

const META_SELECTORS = [
  'meta[name="description"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
  'meta[property="og:type"]',
  'meta[property="og:url"]',
  'meta[property="og:image"]',
  'meta[name="twitter:title"]',
  'meta[name="twitter:description"]',
  'meta[name="twitter:image"]',
];

export function capturePageMetadata() {
  return {
    title: document.title,
    values: META_SELECTORS.map((selector) => ({
      content: document.head.querySelector(selector)?.getAttribute("content"),
      selector,
    })),
  };
}

export function restorePageMetadata(snapshot) {
  if (!snapshot) {
    return;
  }

  document.title = snapshot.title;
  snapshot.values.forEach(({ content, selector }) => {
    const element = document.head.querySelector(selector);
    if (element && content !== null && content !== undefined) {
      element.setAttribute("content", content);
    }
  });
}

export function applyPageMetadata({
  description = DEFAULT_DESCRIPTION,
  image = "",
  title = DEFAULT_TITLE,
} = {}) {
  const pageTitle = title === DEFAULT_TITLE ? title : `${title} | RainFlix`;
  const socialImage = image || DEFAULT_IMAGE;
  const url = window.location.href;

  document.title = pageTitle;
  setMeta('meta[name="description"]', { name: "description" }, description);
  setMeta('meta[property="og:title"]', { property: "og:title" }, pageTitle);
  setMeta(
    'meta[property="og:description"]',
    { property: "og:description" },
    description,
  );
  setMeta('meta[property="og:type"]', { property: "og:type" }, "website");
  setMeta('meta[property="og:url"]', { property: "og:url" }, url);
  setMeta('meta[name="twitter:title"]', { name: "twitter:title" }, pageTitle);
  setMeta(
    'meta[name="twitter:description"]',
    { name: "twitter:description" },
    description,
  );

  setMeta('meta[property="og:image"]', { property: "og:image" }, socialImage);
  setMeta('meta[name="twitter:image"]', { name: "twitter:image" }, socialImage);
}

export function usePageMetadata(metadata) {
  const { description, image, title } = metadata;

  useEffect(() => {
    applyPageMetadata({ description, image, title });
  }, [description, image, title]);
}
