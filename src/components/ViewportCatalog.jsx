import { useEffect, useRef, useState } from "react";

export default function ViewportCatalog({ children }) {
  const host = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [visible]);
  return (
    <div ref={host} data-viewport-catalog={visible ? "loaded" : "pending"}>
      {visible ? (
        children
      ) : (
        <div className="h-[420px] md:h-[480px]" aria-hidden="true" />
      )}
    </div>
  );
}
