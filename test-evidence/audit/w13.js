(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  const input = rev.querySelector("input[type=number]");
  const visible = !!input && input.getBoundingClientRect().width > 0;
  if (!visible) return { panelShown: false };
  // 改 5 天 → 点确认
  input.value = "5";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  const confirmBtn = [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === window.siyuan.languages.confirm || /确定|Confirm/.test(b.textContent));
  confirmBtn?.click();
  await new Promise(r => setTimeout(r, 2000));
  const t = rev.textContent.replace(/\s+/g, " ");
  return { panelShown: true, rescheduled: /已改期|rescheduled|5 天/.test(t), toast: document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 100) ?? null };
})()
