(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const out = {};
  // 1) 诊断命令
  const diag = p.commands?.find(c => c.langKey === "diagnostics");
  await diag?.callback?.();
  await new Promise(r => setTimeout(r, 3000));
  const docText = document.body.textContent.replace(/\s+/g, " ");
  out.diagnostics = /dueCache|Lv Cards|诊断/.test(docText) ? "诊断文档已生成（含 dueCache/统计诊断段）" : docText.slice(0, 120);
  // 2) 周报开关（R9 前置已开 weeklyReportEnabled=true）→ 写入
  const weeklyCmd = p.commands?.find(c => c.langKey === "" && c.callback && JSON.stringify(c).includes("weekly")) ;
  // 直接调插件 maybeWriteWeeklyReport（私有方法探测）
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(p)).filter(n => /weekly/i.test(n));
  out.weeklyMethods = methods;
  if (methods[0]) {
    try { await p[methods[0]](); await new Promise(r => setTimeout(r, 2500)); } catch (e) { out.weeklyErr = String(e).slice(0, 80); }
    const t2 = document.body.textContent.replace(/\s+/g, " ");
    out.weeklyWritten = /周报|weekly report|学习周报/.test(t2) || !![...document.querySelectorAll(".protyle-title")].find(e => e.textContent.includes("周报"));
  }
  return out;
})()
