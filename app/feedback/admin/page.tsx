import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { chatGPTSignOutPath } from "../../chatgpt-auth";
import { feedbackAdminAccess } from "../../lib/feedback-server";
import { resolveAboutLocale } from "../../about/content";
import SiteFooter from "../../components/SiteFooter";
import AdminBoard from "./AdminBoard";
import "../../about/about.css";
import "./admin.css";

export const dynamic = "force-dynamic";
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }): Promise<Metadata> { const locale = resolveAboutLocale((await searchParams).lang); return { title: locale === "zh-Hant" ? "私密留言管理 | STDF Insight" : "Private inbox | STDF Insight", robots: { index: false, follow: false } }; }
export default async function FeedbackAdminPage({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  if (await feedbackAdminAccess() !== "allowed") notFound();
  const locale = resolveAboutLocale((await searchParams).lang);
  const zh = locale === "zh-Hant";
  return <main className="about-page" lang={locale}>
    <header className="about-header">
      <Link className="about-brand" href="/" aria-label={zh ? "STDF Insight 首頁" : "STDF Insight home"}><span aria-hidden="true">SI</span><b>STDF INSIGHT</b></Link>
      <div className="about-header-actions">
        <nav className="about-language-switch" aria-label={zh ? "頁面語言" : "Page language"}>
          <Link href="/feedback/admin?lang=zh-Hant" hrefLang="zh-Hant" lang="zh-Hant" aria-current={zh ? "page" : undefined}>繁體中文</Link>
          <Link href="/feedback/admin?lang=en" hrefLang="en" lang="en" aria-current={!zh ? "page" : undefined}>English</Link>
        </nav>
        <Link className="about-analyzer-link" href={`/admin?lang=${locale}`}>{zh ? "網站使用概況" : "Usage overview"}</Link>
      </div>
    </header>
    <AdminBoard locale={locale} />
    <p style={{maxWidth:1180,margin:"20px auto"}}><a href={chatGPTSignOutPath('/')} target="_top" style={{color:"#5e4cc2"}}>{zh ? "登出管理帳號" : "Sign out"}</a></p>
    <SiteFooter className="about-copyright-footer" locale={locale} />
  </main>;
}
