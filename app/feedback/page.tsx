import type { Metadata } from "next";
import FeedbackBoard from "./FeedbackBoard";
import { feedbackCopy, resolveFeedbackLocale } from "./copy";
import "../about/about.css";
import "./feedback.css";

type FeedbackProps = { searchParams: Promise<{ lang?: string | string[] }> };

export async function generateMetadata({ searchParams }: FeedbackProps): Promise<Metadata> {
  const locale = resolveFeedbackLocale((await searchParams).lang);
  const copy = feedbackCopy[locale];
  return {
    title: copy.pageTitle,
    description: copy.lede,
    alternates: {
      canonical: `https://stdfinsight.com/feedback?lang=${locale}`,
      languages: { "zh-Hant": "https://stdfinsight.com/feedback?lang=zh-Hant", en: "https://stdfinsight.com/feedback?lang=en" },
    },
    openGraph: { title: copy.pageTitle, description: copy.lede, locale: locale === "en" ? "en_US" : "zh_TW" },
    twitter: { title: copy.pageTitle, description: copy.lede },
  };
}

export default async function FeedbackPage({ searchParams }: FeedbackProps) {
  return <FeedbackBoard locale={resolveFeedbackLocale((await searchParams).lang)} />;
}
