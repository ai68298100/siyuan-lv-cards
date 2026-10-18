(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 激活示例卡片 tab + 向导
  const tab = [...document.querySelectorAll(".layout-tab-container__item, [data-type=tab-header]")].filter(t => t.getBoundingClientRect().width > 0).find(t => t.textContent.includes("示例卡片"));
  tab?.click();
  await new Promise(r => setTimeout(r, 1000));
  await p.openAIWizard();
  await new Promise(r => setTimeout(r, 2000));
  let dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("载入当前文档") || b.textContent.includes("Load current doc"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  // 生成
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("AI 生成") || b.textContent.includes("Generate"))?.click();
  await new Promise(r => setTimeout(r, 1200));
  dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("确认发送") || b.textContent.includes("Confirm"))?.click();
  await new Promise(r => setTimeout(r, 4000));
  dlg = vis()[vis().length - 1];
  const t = dlg.textContent.replace(/\s+/g, " ");
  // 审核步交互清单
  const out = { step2: /预览与落库|Preview/.test(t) };
  // 1) 卡面预览（#1 的预览按钮）
  const previews = [...dlg.querySelectorAll("button")].filter(b => b.textContent.includes("卡面预览"));
  out.previewBtns = previews.length;
  previews[0]?.click();
  await new Promise(r => setTimeout(r, 800));
  out.previewShown = dlg.textContent.includes("问题") && dlg.textContent.includes("答案");
  // 2) 来源依据展开
  const srcBtn = [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("来源依据"));
  srcBtn?.click();
  await new Promise(r => setTimeout(r, 800));
  out.sourceExpanded = /来源依据|快照|版本/.test(dlg.textContent);
  return out;
})()
