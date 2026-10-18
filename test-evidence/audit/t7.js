(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const hubEl = () => document.querySelector("[class*=lv-hub]");
  const tabs = () => [...hubEl().querySelectorAll("button, [role=tab]")].map(b => b.textContent.trim()).filter(t => /总览|管理|制卡|目标|收件箱|维护|考试/.test(t));
  const out = {};
  await p.openTabOf("lv-cards-dashboard");
  await new Promise(r => setTimeout(r, 2000));
  out.tabsBefore = tabs();
  // 开考试模块
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 1800));
  let dlg = vis()[vis().length - 1];
  const findByLabel = (kw) => {
    const rows = [...dlg.querySelectorAll("*")].filter(e => {
      const sws = e.querySelectorAll(":scope input.b3-switch, :scope > input.b3-switch");
      return sws.length === 1 && e.textContent.includes(kw) && e.getBoundingClientRect().height < 80 && e.getBoundingClientRect().height > 15;
    });
    return rows[rows.length - 1]?.querySelector("input.b3-switch");
  };
  const examSw = findByLabel("启用考试");
  examSw?.click();
  await new Promise(r => setTimeout(r, 400));
  [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "确定" && b.getBoundingClientRect().width > 0).pop()?.click();
  await new Promise(r => setTimeout(r, 1500));
  // 重开中心
  await p.openTabOf("lv-cards-dashboard");
  await new Promise(r => setTimeout(r, 2000));
  out.tabsWithExam = tabs();
  return out;
})()
