(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 主端点指 fail 路由，fallback 指正常 mock
  const s = { ...p.settings, aiEndpoint: "http://127.0.0.1:18787/fail", aiFallbackEndpoint: "http://127.0.0.1:18787", aiFallbackKey: "k", aiFallbackModel: "mock" };
  p.settings = s;
  await p.persist.save("settings.json", s);
  // 激活文档 + 向导
  const tab = [...document.querySelectorAll(".layout-tab-container__item, [data-type=tab-header]")].filter(t => t.getBoundingClientRect().width > 0).find(t => t.textContent.includes("示例卡片"));
  tab?.click();
  await new Promise(r => setTimeout(r, 1000));
  await p.openAIWizard();
  await new Promise(r => setTimeout(r, 2000));
  let dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("载入当前文档") || b.textContent.includes("Load current doc"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("AI 生成") || b.textContent.includes("Generate"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("确认发送") || b.textContent.includes("Confirm"))?.click();
  await new Promise(r => setTimeout(r, 4000));
  dlg = vis()[vis().length - 1];
  const t = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
  return {
    fallbackWorked: (t.match(/审计卡\d/g) ?? []).length >= 3,
    step2: /预览与落库|Preview/.test(t),
    snippet: t.slice(0, 200),
  };
})()
