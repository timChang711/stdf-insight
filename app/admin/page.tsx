import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { feedbackAdminAccess } from "../lib/feedback-server";
import { resolveAboutLocale } from "../about/content";
import { chatGPTSignOutPath } from "../chatgpt-auth";
import AnalyticsBoard from "./AnalyticsBoard";
import "../about/about.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title:"STDF Insight · 管理後台",robots:{index:false,follow:false}};
export default async function AdminPage({searchParams}:{searchParams:Promise<{lang?:string|string[]}>}) {
  if(await feedbackAdminAccess()!=="allowed") notFound();
  const locale=resolveAboutLocale((await searchParams).lang),zh=locale==="zh-Hant";
  return <main className="about-page" lang={locale}>
    <header className="about-header">
      <Link className="about-brand" href="/"><span aria-hidden="true">SI</span><b>STDF INSIGHT</b></Link>
      <div className="about-header-actions">
        <nav className="about-language-switch" aria-label={zh?"頁面語言":"Page language"}>
          <Link href="/admin?lang=zh-Hant" lang="zh-Hant" aria-current={zh?"page":undefined}>繁體中文</Link>
          <Link href="/admin?lang=en" lang="en" aria-current={!zh?"page":undefined}>English</Link>
        </nav>
        <Link className="about-analyzer-link" href={`/feedback/admin?lang=${locale}`}>{zh?"私密留言管理":"Private inbox"}</Link>
      </div>
    </header>
    <AnalyticsBoard locale={locale}/>
    <p style={{maxWidth:1180,margin:"20px auto"}}><a href={chatGPTSignOutPath('/')} target="_top" style={{color:"#5e4cc2"}}>{zh?"登出管理帳號":"Sign out"}</a></p>
  </main>;
}
