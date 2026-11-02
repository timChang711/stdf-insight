import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "../components/SiteFooter";
import { aboutCopy, resolveAboutLocale } from "./content";
import "./about.css";

type AboutProps = { searchParams: Promise<{ lang?: string | string[] }> };

export async function generateMetadata({ searchParams }: AboutProps): Promise<Metadata> {
  const locale = resolveAboutLocale((await searchParams).lang);
  const copy = aboutCopy[locale];
  return {
    title: copy.pageTitle,
    description: copy.lede,
    alternates: {
      canonical: `https://stdfinsight.com/about?lang=${locale}`,
      languages: { "zh-Hant": "https://stdfinsight.com/about?lang=zh-Hant", en: "https://stdfinsight.com/about?lang=en" },
    },
    openGraph: { title: copy.pageTitle, description: copy.lede, locale: locale === "en" ? "en_US" : "zh_TW" },
    twitter: { title: copy.pageTitle, description: copy.lede },
  };
}

export default async function AboutPage({ searchParams }: AboutProps) {
  const locale = resolveAboutLocale((await searchParams).lang);
  const copy = aboutCopy[locale];
  return <main className="about-page" lang={locale}>
    <header className="about-header">
      <Link className="about-brand" href="/" aria-label={copy.home}><span aria-hidden="true">SI</span><b>STDF INSIGHT</b></Link>
      <div className="about-header-actions">
        <nav className="about-language-switch" aria-label={copy.languageLabel}>
          <Link href="/about?lang=zh-Hant" hrefLang="zh-Hant" lang="zh-Hant" aria-current={locale === "zh-Hant" ? "page" : undefined}>繁體中文</Link>
          <Link href="/about?lang=en" hrefLang="en" lang="en" aria-current={locale === "en" ? "page" : undefined}>English</Link>
        </nav>
        <Link className="about-analyzer-link" href="/">{copy.openAnalyzer}<span aria-hidden="true">→</span></Link>
      </div>
    </header>
    <section className="about-hero" aria-labelledby="about-title">
      <div className="about-hero-copy">
        <span className="about-kicker">{copy.kicker}</span>
        <h1 id="about-title">{copy.title}</h1>
        <p className="about-lede">{copy.lede}</p>
        <div className="about-author-byline"><span aria-hidden="true">TC</span><div><b>Tim Chang</b><small>{copy.role}</small></div></div>
      </div>
      <aside className="about-workflow-card" aria-label={copy.workflowLabel}>
        <span className="about-kicker">{copy.workflowTitle}</span>
        <ol className="about-workflow">{copy.steps.map((step, index) => <li key={index}><span aria-hidden="true">0{index + 1}</span><div><b>{step.title}</b><p>{step.body}</p></div></li>)}</ol>
        <p>{copy.workflowNote}</p>
      </aside>
    </section>
    <section className="about-story-grid">
      <article className="about-story" aria-labelledby="story-title">
        <div className="about-section-label"><span>01</span><b>{copy.whyLabel}</b></div>
        <h2 id="story-title">{copy.whyTitle}</h2>
        <div className="story-copy">{copy.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
      </article>
      <aside className="about-principles" aria-labelledby="principles-title">
        <div className="about-section-label"><span>02</span><h2 id="principles-title">{copy.principlesTitle}</h2></div>
        {copy.principles.map((principle, index) => <div className="about-principle" key={index}><span className="principle-number" aria-hidden="true">{String.fromCharCode(65 + index)}</span><h3>{principle.title}</h3><p>{principle.body}</p></div>)}
      </aside>
    </section>
    <section className="about-contact" aria-labelledby="contact-title">
      <div>
        <div className="about-section-label"><span>03</span><b>{copy.contactLabel}</b></div>
        <h2 id="contact-title">{copy.contactTitle}</h2>
        <p>{copy.contactBody}</p>
      </div>
      <div className="about-contact-actions">
        <a className="primary" href="mailto:s9927220@gmail.com?subject=STDF%20Insight%20Feedback"><span aria-hidden="true">@</span><b>{copy.email}</b><small>s9927220@gmail.com</small></a>
        <a href="https://www.linkedin.com/in/tim-chang-56bb1992/" target="_blank" rel="noreferrer"><span aria-hidden="true">in</span><b>LinkedIn</b><small>{copy.connect}</small></a>
      </div>
    </section>
    <SiteFooter className="about-copyright-footer" locale={locale} />
  </main>;
}
