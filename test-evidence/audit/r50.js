(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const hubEl = () => document.querySelector("[class*=lv-hub]");
  const out = {};
  const cb = hubEl().querySelector("input[type=checkbox]");
  out.cbBefore = cb?.checked;
  if (!cb?.checked) { cb?.click(); await new Promise(r => setTimeout(r, 700)); }
  out.cbAfter = cb?.checked;
  const selBtn = [...hubEl().querySelectorAll("button")].find(b => b.textContent.trim() === "选中");
  out.selBtnFound = !!selBtn;
  selBtn?.click();
  await new Promise(r => setTimeout(r, 1800));
  const t = hubEl().textContent.replace(/\s+/g, " ");
  out.after = { picked: /已选中 \(1\)|已选中 1/.test(t), snippet: t.slice(0, 150) };
  out.inboxStatus = p.inbox?.items?.[0]?.status ?? null;
  return out;
})()
