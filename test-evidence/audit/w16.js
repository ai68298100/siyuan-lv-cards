(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  // 向 rootEl 派发合成 f 键盘事件（target=面板内元素，通过 interactive 守卫）
  const evt = new KeyboardEvent("keydown", { key: "f", bubbles: true, cancelable: true });
  rev.dispatchEvent(evt);
  await new Promise(r => setTimeout(r, 900));
  const input = [...rev.querySelectorAll("input[type=number]")].find(i => i.getBoundingClientRect().width > 0);
  if (!input) return { panelShown: false, activeEl: document.activeElement?.tagName };
  input.value = "5";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  const confirmBtn = [...rev.querySelectorAll("button")].find(b => /Confirm|确定/.test(b.textContent.trim()));
  confirmBtn?.click();
  await new Promise(r => setTimeout(r, 2000));
  const t = rev.textContent.replace(/\s+/g, " ");
  return { panelShown: true, rescheduled: /2\/3|1\/3|rescheduled|改期/.test(t), toast: document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 110) ?? null };
})()
