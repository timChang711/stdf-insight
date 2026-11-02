import Link from "next/link";

const linkedinUrl = "https://www.linkedin.com/in/tim-chang-56bb1992/";

export default function SiteFooter({ className = "", locale = "en" }: { className?: string; locale?: "zh-Hant" | "en" }) {
  const chinese = locale === "zh-Hant";
  return (
    <footer className={`copyright-footer ${className}`.trim()}>
      <div className="copyright-footer-main">
        <Link className="copyright-brand" href="/" aria-label={chinese ? "STDF Insight 首頁" : "STDF Insight home"}>
          <span className="copyright-brand-mark" aria-hidden="true" />
          <span><b>STDF INSIGHT</b><small>{chinese ? "半導體測試資料分析" : "Semiconductor test analytics"}</small></span>
        </Link>
        <nav className="copyright-links" aria-label={chinese ? "頁尾導覽" : "Footer navigation"}>
          <Link href={`/about?lang=${locale}`}>{chinese ? "關於" : "About"}</Link>
          <Link href={`/feedback?lang=${locale}`}>{chinese ? "留言與許願" : "Feedback"}</Link>
          <a href={linkedinUrl} target="_blank" rel="noreferrer">LinkedIn <span aria-hidden="true">↗</span></a>
        </nav>
      </div>
      <div className="copyright-footer-bottom">
        <span>{chinese ? "© 2026 Tim Chang. 保留所有權利。" : "Copyright © 2026 Tim Chang. All rights reserved."}</span>
        <span className="copyright-privacy"><i aria-hidden="true" />{chinese ? "本機分析 · STDF 檔案保留在你的瀏覽器中" : "Local-first analysis · STDF files stay in your browser"}</span>
      </div>
    </footer>
  );
}
