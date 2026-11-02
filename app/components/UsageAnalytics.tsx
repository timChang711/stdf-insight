"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackUsageError, trackUsagePage } from "../lib/usage-client";

export default function UsageAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) trackUsagePage(pathname);
  }, [pathname]);

  useEffect(() => {
    // Do not inspect error messages, filenames, stacks, or rejection reasons.
    const onError = () => trackUsageError("runtime_error");
    const onRejection = () => trackUsageError("unhandled_rejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
