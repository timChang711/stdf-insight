import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { unstable_dev } from "wrangler";

const developmentPreviewMeta = /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("production pages render inside the Worker runtime and private routes stay hidden", { timeout: 60000 }, async () => {
  const worker = await unstable_dev(fileURLToPath(new URL("../dist/server/index.js", import.meta.url)), {
    config: fileURLToPath(new URL("../dist/server/wrangler.json", import.meta.url)),
    local: true, port: 0, inspectorPort: 0, bundle: false, persist: false, logLevel: "error",
    experimental: { disableExperimentalWarning: true, watch: false, disableDevRegistry: true },
  });
  try {
    const response = await worker.fetch("/");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    assert.doesNotMatch(await response.text(), developmentPreviewMeta);
    const feedback = await worker.fetch("/feedback?lang=zh-Hant");
    assert.equal(feedback.status, 200);
    const html = await feedback.text();
    assert.match(html, /僅供站長查看/);
    assert.doesNotMatch(html, /使用 ChatGPT 登入|Sign in with ChatGPT|\/feedback\/admin/);
    for (const path of ["/admin", "/feedback/admin"]) {
      const blocked = await worker.fetch(path);
      const blockedHtml = await blocked.text();
      assert.ok(blocked.status === 404 || blockedHtml.includes("404"), path);
      assert.doesNotMatch(blockedHtml, /使用 ChatGPT 登入|Sign in with ChatGPT/);
    }
    const inbox = await worker.fetch("/api/feedback");
    assert.equal(inbox.status, 405);
  } finally { await worker.stop(); }
});
