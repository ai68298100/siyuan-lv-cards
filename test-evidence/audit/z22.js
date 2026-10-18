(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3000));
  const rev = document.querySelector("[class*=lv-review]");
  // window 级派发 f 键（svelte:window 监听 window keydown；target=window 不受 interactive 守卫影响）
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));
  await new Promise(r => setTimeout(r, 900));
  const input = [...rev.querySelectorAll("input[type=number]")].find(i => i.getBoundingClientRect().width > 0);
  if (!input) return { panelShown: false, note: "window dispatch not received (svelte:window may filter target)" };
  // 填 3 天 → 确认
  input.value = "3";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  const confirmBtn = [...rev.querySelectorAll("button")].find(b => /Confirm|确定/.test(b.textContent.trim()));
  confirmBtn?.click();
  await new Promise(r => setTimeout(r, 2000));
  const t = rev.textContent.replace(/\s+/g, " ");
  return {
    panelShown: true,
    rescheduled: /改期|rescheduled|3 天|3 days/.test(t),
    toast: document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 110) ?? null,
  };
})()
