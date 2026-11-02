export type FeedbackLocale = "zh-Hant" | "en";
export type FeedbackCategory = "feedback" | "feature" | "bug";

export const feedbackCopy = {
  "zh-Hant": {
    pageTitle: "意見箱 | STDF Insight", home: "STDF Insight 首頁", languageLabel: "網站語言", openAnalyzer: "開啟分析工具",
    kicker: "一起讓工具更好用", title: "意見箱", lede: "分享使用心得、回報問題，或許願你期待的新功能。你的留言只會交給站長查看。",
    formTitle: "新增留言", formDescription: "想解決什麼問題？越具體的情境，越能幫助我理解你的需求。", requiredNote: "* 為必填欄位",
    nickname: "暱稱", optional: "選填", nicknamePlaceholder: "如何稱呼你？", category: "留言類型", titleLabel: "標題", titlePlaceholder: "用一句話說明你的想法", body: "內容", bodyPlaceholder: "描述使用情境、遇到的問題，或期待的新功能……", titleHint: "3–100 字", bodyHint: "10–3,000 字", nicknameHint: "最多 40 字，也可以留白。",
    consent: "我了解留言會儲存並僅供站長查看，不會公開顯示。", privacy: "這份表單不需要帳號。請勿填寫個資、機密測試數據或客戶資訊。你的 STDF 檔案仍只在瀏覽器內處理，不會隨留言上傳。",
    submit: "送出留言", submitting: "正在送出…", successTitle: "已收到你的留言", successBody: "謝謝你的分享！留言已送到站長的意見箱，僅供站長查看。", newMessage: "繼續分享想法",
    categories: { feedback: "意見回饋", feature: "功能許願", bug: "問題回報" },
    tipsTitle: "讓想法更容易被理解", tips: [ { title: "分享使用情境", body: "告訴我你在做什麼，以及希望改善哪個步驟。" }, { title: "描述期待的結果", body: "新功能可以如何幫助你？目前遇到什麼限制？" }, { title: "回報問題時提供線索", body: "可附上操作步驟、瀏覽器名稱與錯誤訊息，請略去機密內容。" } ],
    privateTitle: "一封只給站長的留言", privateBody: "送出後，內容會存入意見箱，由站長閱讀與整理。這裡不會顯示其他人的留言，也不會公開你的內容。", about: "關於 STDF Insight",
    errors: { nickname: "暱稱請勿超過 40 字。", title: "標題請填寫 3–100 字。", body: "內容請填寫 10–3,000 字。", consent: "請先確認你了解留言僅供站長查看。", rate_limit: "你剛剛送出了幾則留言，請稍候再試。", validation: "請檢查欄位內容與同意選項後再送出。", unavailable: "目前無法送出。內容已保留，請稍後再試。", invalid_origin: "請重新整理此頁後再試一次。", too_large: "留言內容太長，請縮短後再試。", conflict: "留言識別發生衝突。內容已保留，請再送出一次。" },
  },
  en: {
    pageTitle: "Feedback Inbox | STDF Insight", home: "STDF Insight home", languageLabel: "Website language", openAnalyzer: "Open analyzer",
    kicker: "BUILT BETTER TOGETHER", title: "Feedback Inbox", lede: "Share your experience, report a problem, or suggest a feature. Your message goes directly to the site owner and stays private.",
    formTitle: "Leave a message", formDescription: "What would you like to improve? A specific example helps me understand what you need.", requiredNote: "* Required fields",
    nickname: "Nickname", optional: "optional", nicknamePlaceholder: "What should we call you?", category: "Message type", titleLabel: "Title", titlePlaceholder: "Your idea in one sentence", body: "Message", bodyPlaceholder: "Describe your workflow, the problem you encountered, or the feature you have in mind…", titleHint: "3–100 characters", bodyHint: "10–3,000 characters", nicknameHint: "Up to 40 characters. You can leave this blank.",
    consent: "I understand my message will be saved for the site owner only and will not be published.", privacy: "No account is needed. Please leave out personal details, confidential test data, and customer information. STDF files are still processed only in your browser and are not uploaded with your message.",
    submit: "Send message", submitting: "Sending…", successTitle: "Your message has been received", successBody: "Thanks for sharing! Your message is in the feedback inbox, where only the site owner can read it.", newMessage: "Share another idea",
    categories: { feedback: "Feedback", feature: "Feature wish", bug: "Bug report" },
    tipsTitle: "Help me understand your idea", tips: [ { title: "Share your context", body: "Tell me what you are working on and which step you would like to improve." }, { title: "Describe the result you want", body: "How would this feature help you? What limitations are you encountering?" }, { title: "Include useful clues for a bug", body: "Steps to reproduce, your browser, and an error message can help. Leave out confidential information." } ],
    privateTitle: "A message for the site owner", privateBody: "Your message is saved in the feedback inbox for the site owner to read and organize. This page does not display other visitors’ messages or publish yours.", about: "About STDF Insight",
    errors: { nickname: "Keep your nickname to 40 characters or fewer.", title: "Enter a title between 3 and 100 characters.", body: "Enter a message between 10 and 3,000 characters.", consent: "Please confirm that your message is for the site owner only.", rate_limit: "You have sent a few messages recently. Please wait and try again.", validation: "Please check your entries and the consent checkbox before sending.", unavailable: "Your message could not be sent. Your text is still here; please try again later.", invalid_origin: "Please refresh this page and try again.", too_large: "This message is too long. Please shorten it and try again.", conflict: "The message ID was already used. Your text is still here; please send it again." },
  },
};

export function resolveFeedbackLocale(value?: string | string[]): FeedbackLocale {
  return (Array.isArray(value) ? value[0] : value) === "en" ? "en" : "zh-Hant";
}
