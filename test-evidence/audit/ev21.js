(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const rev = () => document.querySelector("[class*=lv-review]");
  const before = JSON.stringify(p.suspendToday);
  const btn = [...rev().querySelectorAll("button")].find(b => b.textContent.trim() === "暂停");
  if (!btn) return { err: "no pause btn" };
  btn.click();
  await new Promise(r => setTimeout(r, 2500));
  return {
    before,
    after: JSON.stringify(p.suspendToday),
    toast: document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 120) ?? null,
    queue: rev().querySelector(".lv-progress")?.textContent ?? null,
    face: (rev().querySelector(".b3-typography, [class*=lv-card2]")?.textContent ?? "").slice(0, 40),
  };
})()
