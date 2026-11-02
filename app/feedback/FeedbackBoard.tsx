"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import SiteFooter from "../components/SiteFooter";
import { feedbackCopy, type FeedbackCategory, type FeedbackLocale } from "./copy";
type FormErrors = Partial<Record<"nickname" | "title" | "body" | "consent", string>>;
const categories: FeedbackCategory[] = ["feedback", "feature", "bug"];

export default function FeedbackBoard({ locale }: { locale: FeedbackLocale }) {
  const copy = feedbackCopy[locale];
  const [nickname, setNickname] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("feedback");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const submission = useRef<{ id: string; signature: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (success || submitError) resultRef.current?.focus();
  }, [success, submitError]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const trimmed = { nickname: nickname.trim(), category, title: title.trim(), body: body.trim(), website, consent };
    const nextErrors: FormErrors = {};
    if (trimmed.nickname.length > 40) nextErrors.nickname = copy.errors.nickname;
    if (trimmed.title.length < 3 || trimmed.title.length > 100) nextErrors.title = copy.errors.title;
    if (trimmed.body.length < 10 || trimmed.body.length > 3000) nextErrors.body = copy.errors.body;
    if (!consent) nextErrors.consent = copy.errors.consent;
    setErrors(nextErrors);
    setSubmitError("");
    if (Object.keys(nextErrors).length) {
      const first = Object.keys(nextErrors)[0];
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    const signature = JSON.stringify(trimmed);
    if (!submission.current || submission.current.signature !== signature) submission.current = { id: crypto.randomUUID(), signature };
    setSending(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ id: submission.current.id, ...trimmed }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) {
        const errorKey = result.error as keyof typeof copy.errors;
        if (result.error === "conflict") submission.current = null;
        setSubmitError(copy.errors[errorKey] || copy.errors.unavailable);
        return;
      }
      setSuccess(true);
      setNickname(""); setTitle(""); setBody(""); setWebsite(""); setConsent(false);
      submission.current = null;
    } catch {
      setSubmitError(copy.errors.unavailable);
    } finally {
      window.clearTimeout(timeout);
      setSending(false);
    }
  }

  return <main className="about-page feedback-page" lang={locale}>
    <header className="about-header">
      <Link className="about-brand" href="/" aria-label={copy.home}><span aria-hidden="true">SI</span><b>STDF INSIGHT</b></Link>
      <div className="about-header-actions">
        <nav className="about-language-switch" aria-label={copy.languageLabel}>
          <Link href="/feedback?lang=zh-Hant" hrefLang="zh-Hant" lang="zh-Hant" aria-current={locale === "zh-Hant" ? "page" : undefined}>繁體中文</Link>
          <Link href="/feedback?lang=en" hrefLang="en" lang="en" aria-current={locale === "en" ? "page" : undefined}>English</Link>
        </nav>
        <Link className="about-analyzer-link" href="/">{copy.openAnalyzer}<span aria-hidden="true">→</span></Link>
      </div>
    </header>
    <section className="feedback-hero" aria-labelledby="feedback-title">
      <div><span className="about-kicker">{copy.kicker}</span><h1 id="feedback-title">{copy.title}</h1><p>{copy.lede}</p></div>
    </section>
    <div className="feedback-layout">
      <section className="feedback-form-card" aria-labelledby="feedback-form-title">
        <div className="feedback-section-heading"><span className="feedback-section-icon" aria-hidden="true">＋</span><h2 id="feedback-form-title">{copy.formTitle}</h2></div>
        <p className="feedback-description">{copy.formDescription}</p>
        {success ? <div className="feedback-success" role="status" tabIndex={-1} ref={resultRef}>
          <span className="feedback-success-mark" aria-hidden="true">✓</span><h3>{copy.successTitle}</h3><p>{copy.successBody}</p>
          <button className="feedback-secondary" type="button" onClick={() => { setSuccess(false); requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>("#feedback-nickname")?.focus()); }}>{copy.newMessage}</button>
        </div> : <form ref={formRef} onSubmit={submit} noValidate>
          <p className="feedback-required-note">{copy.requiredNote}</p>
          <fieldset disabled={sending}>
            <div className="feedback-field"><label htmlFor="feedback-nickname">{copy.nickname} <span>({copy.optional})</span></label><input id="feedback-nickname" name="nickname" autoComplete="nickname" value={nickname} maxLength={40} onChange={event => setNickname(event.target.value)} placeholder={copy.nicknamePlaceholder} aria-invalid={Boolean(errors.nickname)} aria-describedby={errors.nickname ? "feedback-nickname-error" : "feedback-nickname-hint"} /><small id="feedback-nickname-hint">{copy.nicknameHint}</small>{errors.nickname && <span className="feedback-field-error" id="feedback-nickname-error" role="alert">{errors.nickname}</span>}</div>
            <div className="feedback-field"><label htmlFor="feedback-category">{copy.category} <span aria-hidden="true">*</span></label><select id="feedback-category" name="category" value={category} required onChange={event => setCategory(event.target.value as FeedbackCategory)}>{categories.map(value => <option key={value} value={value}>{copy.categories[value]}</option>)}</select></div>
            <div className="feedback-field"><label htmlFor="feedback-subject">{copy.titleLabel} <span aria-hidden="true">*</span></label><input id="feedback-subject" name="title" value={title} required minLength={3} maxLength={100} onChange={event => setTitle(event.target.value)} placeholder={copy.titlePlaceholder} aria-invalid={Boolean(errors.title)} aria-describedby="feedback-title-hint feedback-title-error" /><div className="feedback-field-meta"><small id="feedback-title-hint">{copy.titleHint}</small><small>{title.length}/100</small></div>{errors.title && <span className="feedback-field-error" id="feedback-title-error" role="alert">{errors.title}</span>}</div>
            <div className="feedback-field"><label htmlFor="feedback-body">{copy.body} <span aria-hidden="true">*</span></label><textarea id="feedback-body" name="body" value={body} required rows={6} minLength={10} maxLength={3000} onChange={event => setBody(event.target.value)} placeholder={copy.bodyPlaceholder} aria-invalid={Boolean(errors.body)} aria-describedby="feedback-body-hint feedback-body-error" /><div className="feedback-field-meta"><small id="feedback-body-hint">{copy.bodyHint}</small><small>{body.length.toLocaleString(locale)}/3,000</small></div>{errors.body && <span className="feedback-field-error" id="feedback-body-error" role="alert">{errors.body}</span>}</div>
            <div className="feedback-honeypot" aria-hidden="true"><label htmlFor="feedback-website">Website</label><input id="feedback-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></div>
            <div className="feedback-consent"><label><input name="consent" type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? "feedback-consent-error" : undefined} /><span>{copy.consent}</span></label>{errors.consent && <span className="feedback-field-error" id="feedback-consent-error" role="alert">{errors.consent}</span>}</div>
            <p className="feedback-privacy">{copy.privacy}</p>
            {submitError && <div className="feedback-submit-error" role="alert" tabIndex={-1} ref={resultRef}>{submitError}</div>}
            <button className="feedback-submit" type="submit" disabled={sending}>{sending ? copy.submitting : copy.submit}<span aria-hidden="true">{sending ? "…" : "→"}</span></button>
          </fieldset>
        </form>}
      </section>
      <aside className="feedback-guidance" aria-labelledby="feedback-guidance-title">
        <section className="feedback-tips-card">
          <h2 id="feedback-guidance-title">{copy.tipsTitle}</h2>
          <ol>{copy.tips.map((tip, index) => <li key={tip.title}><span className="feedback-tip-number" aria-hidden="true">0{index + 1}</span><div><h3>{tip.title}</h3><p>{tip.body}</p></div></li>)}</ol>
        </section>
        <section className="feedback-private-card"><span className="feedback-private-icon" aria-hidden="true">✉</span><h2>{copy.privateTitle}</h2><p>{copy.privateBody}</p></section>
        <Link className="feedback-about-link" href={`/about?lang=${locale}`}>{copy.about}<span aria-hidden="true"> →</span></Link>
      </aside>
    </div>
    <SiteFooter className="about-copyright-footer" locale={locale} />
  </main>;
}
