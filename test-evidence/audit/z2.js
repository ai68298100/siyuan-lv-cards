(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 切慢端点（/slow 延迟 12s）→ 生成中刷新页面制造断点
  const s = { ...p.settings, aiEndpoint: "http://127.0.0.1:18787/slow" };
  p.settings = s;
  await p.persist.save("settings.json", s);
  // 激活示例卡片 tab
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
  await new Promise(r => setTimeout(r, 2500));
  // 生成中（12s 窗口内）刷新页面
  const generating = /Generating|生成中/.test(dlg?.textContent ?? "");
  return { generating };
})()
