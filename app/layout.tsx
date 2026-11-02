import type { Metadata } from "next";
import UsageAnalytics from "./components/UsageAnalytics";
import "./globals.css";

export const metadata: Metadata = {
  title: "STDF Insight",
  description: "Local-first STDF yield, parametric, bin and wafer-map analysis for semiconductor test engineers.",

  openGraph: {
    title: "STDF Insight",
    description: "Local-first STDF yield, parametric, bin and wafer-map analysis for semiconductor test engineers.",
    type: "website",
    images: ["https://stdfinsight.com/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "STDF Insight",
    description: "Local-first STDF yield, parametric, bin and wafer-map analysis for semiconductor test engineers.",
    images: ["https://stdfinsight.com/og.png"],
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}<UsageAnalytics /></body></html>; }
