(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  for (let i = 0; i < 2; i++) {
    const dlg = vis()[vis().length - 1];
    if (!dlg) break;
    [...dlg.querySelectorAll("button")].filter(b => /Cancel|取消/.test(b.textContent.trim())).pop()?.click();
    await new Promise(r => setTimeout(r, 600));
  }
  // 切 refuse 端点
  const s = { ...p.settings, aiEndpoint: "http://127.0.0.1:18787/refuse" };
  p.settings = s;
  await p.persist.save("settings.json", s);
  // 激活 tab + 向导
  const tab = [...document.querySelectorAll(".layout-tab-container__item, [data-type=tab-header]")].filter(t => t.getBoundingClientRect().width > 0).find(t => t.textContent.includes("示例卡片"));
  tab?.click();
  await new Promise(r => setTimeout(r, 1000));
  await p.openAIWizard();
  await new Promise(r => setTimeout(r, 2000));
  let dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Load current doc") || b.textContent.includes("载入当前文档"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Generate") || b.textContent.includes("AI 生成"))?.click();
  await new Promise(r => setTimeout(r, 1200));
  dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Confirm") || b.textContent.includes("确认发送"))?.click();
  await new Promise(r => setTimeout(r, 3500));
  dlg = vis()[0];
  const t = dlg?.textContent.replace(/\s+/g, " ") ?? "";
  return {
    refusalDetected: /拒答|无法|refus|抱歉|cannot/i.test(t),
    refusalSnippet: t.match(/(抱歉[^。]{0,80}|无法[^。]{0,80}|无法继续[^。]{0,60})/)?.[0] ?? null,
    stillWizard: true,
  };
})()
