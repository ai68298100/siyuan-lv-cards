(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const hubEl = () => document.querySelector("[class*=lv-hub]");
  await p.openTabOf("lv-cards-dashboard", { tab: "manage" });
  await new Promise(r => setTimeout(r, 2500));
  const out = {};
  // 搜索筛选
  const search = [...hubEl().querySelectorAll("input")].find(i => /筛选|Filter/.test(i.placeholder ?? ""));
  out.searchFound = !!search;
  if (search) {
    search.value = "FSRS";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 1200));
    const rows = [...hubEl().querySelectorAll(".lv-text")].map(e => e.textContent.trim());
    out.filteredRows = rows.length;
    out.allMatch = rows.every(t => t.includes("FSRS"));
    out.sample = rows.slice(0, 3);
    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // 卡片编辑器：点第一行开抽屉
  await new Promise(r => setTimeout(r, 800));
  const rows2 = [...hubEl().querySelectorAll("*")].filter(e => e.children.length === 0 && e.textContent.includes("FSRS") && e.getBoundingClientRect().width > 150);
  const el = rows2[rows2.length - 1];
  const r = el?.getBoundingClientRect();
  if (r) {
    window.__p = { x: Math.round(r.x + Math.min(r.width / 2, 260)), y: Math.round(r.y + r.height / 2) };
  }
  out.rowPos = window.__p ?? null;
  return out;
})()
