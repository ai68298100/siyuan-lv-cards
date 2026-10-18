(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  const out = { forms: [] };
  for (let i = 0; i < 4; i++) {
    const t = rev.textContent.replace(/\s+/g, " ");
    if (/本场完成|收工的原因/.test(t)) { out.forms.push("DONE"); break; }
    const form = rev.querySelector("input[type=text]") ? "typing" : (/显示答案/.test(t) ? "flip" : "?");
    out.forms.push(form);
    // 翻面（或打字提交）
    const el = rev.querySelector("[class*=lv-card2], .b3-typography");
    const r = el?.getBoundingClientRect();
    if (!r) break;
    const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + Math.min(r.height / 2, 200));
    // 用真实鼠标点击卡面再 Space（cdp.mjs 的命令行循环太慢，这里用 CDP Input 域直接做）
    await new Promise(res => {
      const handler = async () => {
        try {
          const resp = await fetch("http://127.0.0.1:9223/json/list");
        } catch {}
        res();
      };
      handler();
    });
    // 直接派发输入事件（页面内不可靠，改为标记后由外部 shell 循环处理）
    window.__lvAuditStep = { x, y, form };
    break;
  }
  return { ...out, step: window.__lvAuditStep };
})()
