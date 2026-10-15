import { useEffect } from "react";
import AccountSettings from "../components/AccountSettings.jsx";
import { usePageMetadata } from "../lib/metadata.js";

export default function AccountPage({ onReady }) {
  usePageMetadata({ title: "Account" });
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return (
    <section className="mx-auto w-full max-w-3xl px-5 py-8 md:px-10">
      <h1 className="text-3xl font-bold">Account</h1>
      <AccountSettings />
    </section>
  );
}
