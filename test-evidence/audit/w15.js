(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  const input = [...rev.querySelectorAll("input[type=number]")].find(i => i.getBoundingClientRect().width > 0);
  if (!input) return { panelShown: false, state: rev.textContent.replace(/\s+/g, " ").slice(0, 100) };
  // 改 5 天并确认
  input.value = "5";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  const confirmBtn = [...rev.querySelectorAll("button")].find(b => /Confirm|确定/.test(b.textContent.trim()));
  confirmBtn?.click();
  await new Promise(r => setTimeout(r, 2000));
  const t = rev.textContent.replace(/\s+/g, " ");
  return { panelShown: true, rescheduled: /rescheduled|改期|5/.test(t), toast: document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 100) ?? null };
})()
