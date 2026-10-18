(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 关旧向导重开
  for (let i = 0; i < 2; i++) {
    const dlg = vis()[vis().length - 1];
    if (!dlg) break;
    [...dlg.querySelectorAll("button")].filter(b => /Cancel|取消/.test(b.textContent.trim())).pop()?.click();
    await new Promise(r => setTimeout(r, 600));
  }
  // 激活示例卡片 tab
  const tab = [...document.querySelectorAll(".layout-tab-container__item, [data-type=tab-header]")].filter(t => t.getBoundingClientRect().width > 0).find(t => t.textContent.includes("示例卡片"));
  tab?.click();
  await new Promise(r => setTimeout(r, 1000));
  await p.openAIWizard();
  await new Promise(r => setTimeout(r, 2000));
  const dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("载入当前文档") || b.textContent.includes("Load current doc"))?.click();
  await new Promise(r => setTimeout(r, 2000));
  const t = dlg.textContent.replace(/\s+/g, " ");
  return {
    sensPromptShown: /敏感|脱敏|sensitive|Sensitive/.test(t),
    sensSnippet: t.match(/(敏感|Sensitive)[^|]{0,120}/)?.[0] ?? null,
    materialChars: t.match(/(\d+) 字符/)?.[1] ?? null,
  };
})()
