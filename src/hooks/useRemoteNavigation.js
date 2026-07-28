import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

const PAGE_TOP_TOLERANCE = 8;
const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'iframe:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");
const DIRECTION_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
]);
const REMOTE_BACK_KEY_CODES = new Set([8, 27, 461, 10009]);
const REMOTE_SELECT_KEY_CODES = new Set([23]);

function isVisible(element) {
  if (
    !(element instanceof HTMLElement) ||
    element.closest('[aria-hidden="true"]')
  ) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden"
  );
}

function activeScope() {
  const modal = document.querySelector("#titleDetailsModal.is-open");

  if (modal) {
    return modal.querySelector(".title-details-dialog") || modal;
  }

  const mobileNav = document.querySelector(
    '#mobileNavLayer[aria-hidden="false"] .mobile-nav-drawer',
  );

  if (mobileNav) {
    return mobileNav;
  }

  const search = document.querySelector("#headerSearch.is-open");

  if (search) {
    return search;
  }

  const openHeaderMenu = document.querySelector(
    '.header-menu button[aria-expanded="true"]',
  );

  return openHeaderMenu?.closest(".header-menu") || document;
}

function focusableElements(scope) {
  const includeHeader =
    scope !== document || window.scrollY <= PAGE_TOP_TOLERANCE;

  return [...scope.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      isVisible(element) &&
      (includeHeader || !element.closest("#site-header")),
  );
}

function center(rect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function isInDirection(direction, deltaX, deltaY) {
  if (direction === "ArrowLeft") {
    return deltaX < -4;
  }

  if (direction === "ArrowRight") {
    return deltaX > 4;
  }

  if (direction === "ArrowUp") {
    return deltaY < -4;
  }

  return deltaY > 4;
}

function directionalScore(direction, deltaX, deltaY) {
  const horizontal =
    direction === "ArrowLeft" || direction === "ArrowRight";
  const primary = Math.abs(horizontal ? deltaX : deltaY);
  const secondary = Math.abs(horizontal ? deltaY : deltaX);
  const anglePenalty = secondary / Math.max(primary, 1);

  return primary + secondary * 1.7 + anglePenalty * 70;
}

function initialFocusTarget(elements, direction) {
  const appView = document.querySelector("#app-view");
  const activeElement = document.activeElement;
  const routeElements = appView?.contains(activeElement)
    ? elements.filter((element) => appView.contains(element))
    : elements;
  const candidates = routeElements.length ? routeElements : elements;
  const onscreen = candidates.filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 72 && rect.top < window.innerHeight;
  });
  const pool = onscreen.length ? onscreen : candidates;

  return [...pool].sort((first, second) => {
    const firstRect = first.getBoundingClientRect();
    const secondRect = second.getBoundingClientRect();

    if (direction === "ArrowUp") {
      return (
        secondRect.bottom - firstRect.bottom ||
        firstRect.left - secondRect.left
      );
    }

    if (direction === "ArrowLeft") {
      return (
        secondRect.right - firstRect.right ||
        firstRect.top - secondRect.top
      );
    }

    return (
      firstRect.top - secondRect.top ||
      firstRect.left - secondRect.left
    );
  })[0];
}

function nextFocusTarget(elements, current, direction) {
  if (!elements.includes(current)) {
    return initialFocusTarget(elements, direction);
  }

  const currentCenter = center(current.getBoundingClientRect());
  let bestMatch = null;
  let bestScore = Number.POSITIVE_INFINITY;

  elements.forEach((candidate) => {
    if (candidate === current) {
      return;
    }

    const candidateCenter = center(candidate.getBoundingClientRect());
    const deltaX = candidateCenter.x - currentCenter.x;
    const deltaY = candidateCenter.y - currentCenter.y;

    if (!isInDirection(direction, deltaX, deltaY)) {
      return;
    }

    const score = directionalScore(direction, deltaX, deltaY);

    if (score < bestScore) {
      bestMatch = candidate;
      bestScore = score;
    }
  });

  return bestMatch;
}

function focusElement(element) {
  if (!element) {
    return;
  }

  document.documentElement.classList.add("remote-navigation-active");
  element.focus({ preventScroll: true });
  element.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "nearest",
    inline: "nearest",
  });
}

function scrollTowardPageTop(direction) {
  if (direction !== "ArrowUp" || window.scrollY <= PAGE_TOP_TOLERANCE) {
    return false;
  }

  window.scrollBy({
    top: -Math.max(320, window.innerHeight * 0.72),
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
  return true;
}

function isEditable(element) {
  return Boolean(
    element?.matches?.('input, textarea, select, [contenteditable="true"]'),
  );
}

function isBackEvent(event) {
  return (
    ["BrowserBack", "GoBack"].includes(event.key) ||
    REMOTE_BACK_KEY_CODES.has(event.keyCode) ||
    event.key === "Escape" ||
    event.key === "Backspace"
  );
}

function closeTopLayer() {
  const detailsClose = document.querySelector(
    "#titleDetailsModal.is-open [data-details-close]",
  );

  if (detailsClose) {
    detailsClose.click();
    return true;
  }

  const mobileClose = document.querySelector(
    '#mobileNavLayer[aria-hidden="false"] #mobileNavClose',
  );

  if (mobileClose) {
    mobileClose.click();
    return true;
  }

  const searchClose = document.querySelector(
    "#headerSearch.is-open #searchClose",
  );

  if (searchClose) {
    searchClose.click();
    return true;
  }

  const openMenuToggle = document.querySelector(
    '.header-menu button[aria-expanded="true"]',
  );

  if (openMenuToggle) {
    openMenuToggle.click();
    return true;
  }

  return false;
}

export default function useRemoteNavigation() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleRemoteKey = (event) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      const activeElement = document.activeElement;

      if (isBackEvent(event)) {
        if (event.key === "Backspace" && isEditable(activeElement)) {
          return;
        }

        if (closeTopLayer()) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (event.key !== "Escape" && location.pathname !== "/home") {
          event.preventDefault();
          navigate(-1);
        }
        return;
      }

      const isSelect =
        ["Accept", "Select"].includes(event.key) ||
        REMOTE_SELECT_KEY_CODES.has(event.keyCode);

      if (
        isSelect &&
        !event.repeat &&
        !isEditable(activeElement) &&
        activeElement?.matches?.('a[href], button, [role="button"]')
      ) {
        event.preventDefault();
        activeElement.click();
        return;
      }

      if (!DIRECTION_KEYS.has(event.key) || isEditable(activeElement)) {
        return;
      }

      const scope = activeScope();
      const elements = focusableElements(scope);
      const target = nextFocusTarget(elements, activeElement, event.key);

      if (!target) {
        if (scope === document && scrollTowardPageTop(event.key)) {
          event.preventDefault();
        }
        return;
      }

      event.preventDefault();
      focusElement(target);
    };
    const clearRemoteMode = () =>
      document.documentElement.classList.remove("remote-navigation-active");

    document.addEventListener("keydown", handleRemoteKey);
    document.addEventListener("pointerdown", clearRemoteMode, true);
    return () => {
      document.removeEventListener("keydown", handleRemoteKey);
      document.removeEventListener("pointerdown", clearRemoteMode, true);
    };
  }, [location.pathname, navigate]);
}
