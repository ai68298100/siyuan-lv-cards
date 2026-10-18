(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const hubEl = () => document.querySelector("[class*=lv-hub]");
  const out = {};
  await p.openTabOf("lv-cards-dashboard");
  await new Promise(r => setTimeout(r, 2500));
  // 深度统计展开
  const deep = [...hubEl().querySelectorAll("button, summary, [role=button]")].find(b => b.textContent.includes("深度统计"));
  deep?.click();
  await new Promise(r => setTimeout(r, 1500));
  const t = hubEl().textContent.replace(/\s+/g, " ");
  out.deepStats = { expanded: !/深度统计 ▾/.test(t), sections: (t.match(/保持率|连击|间隔|能力分布|错误原因|经验|热力/g) ?? []).slice(0, 8) };
  // 命令面板逐命令（安全命令）
  const safeCmds = ["openDashboard", "openExam", "diagnostics", "openHelp"];
  out.cmdResults = [];
  for (const key of safeCmds) {
    const cmd = p.commands?.find(c => c.langKey === key);
    if (!cmd?.callback) { out.cmdResults.push({ key, err: "no cmd" }); continue; }
    try {
      await cmd.callback();
      await new Promise(r => setTimeout(r, 1200));
      out.cmdResults.push({ key, ok: true });
    } catch (e) {
      out.cmdResults.push({ key, err: String(e).slice(0, 80) });
    }
  }
  // 清理打开的 tab/dialog
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  for (let i = 0; i < 3; i++) {
    const dlg = vis()[vis().length - 1];
    if (!dlg) break;
    [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "取消").pop()?.click();
    await new Promise(r => setTimeout(r, 600));
  }
  return out;
})()
