(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 2000));
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[vis().length - 1];
  // 分区块标题（LvSection title）
  const sections = [...dlg.querySelectorAll("[class*=lv-section-title], .lv-section-head, h3, h4")].map(e => e.textContent.trim()).filter(t => t && t.length < 30);
  // 控件统计
  const controls = {
    switches: [...dlg.querySelectorAll(".b3-switch, [class*=lv-switch]")].filter(e => e.getBoundingClientRect().width > 0).length,
    selects: [...dlg.querySelectorAll("select")].filter(e => e.getBoundingClientRect().width > 0).length,
    inputs: [...dlg.querySelectorAll("input[type=text], input[type=password], input[type=number], input:not([type])")].filter(e => e.getBoundingClientRect().width > 0).length,
    textareas: [...dlg.querySelectorAll("textarea")].filter(e => e.getBoundingClientRect().width > 0).length,
    buttons: [...dlg.querySelectorAll("button")].filter(e => e.getBoundingClientRect().width > 0).map(b => b.textContent.replace(/\s+/g, " ").trim()).filter(Boolean),
  };
  // 面板滚动全文（分段抓）
  const scroller = [...dlg.querySelectorAll("*")].find(e => e.scrollHeight > e.clientHeight + 200 && e.clientHeight > 300);
  let fullText = "";
  if (scroller) {
    for (let i = 0; i < 14; i++) {
      fullText += " " + scroller.textContent.replace(/\s+/g, " ");
      scroller.scrollTop += 600;
      await new Promise(r => setTimeout(r, 120));
    }
  } else {
    fullText = dlg.textContent;
  }
  return { sections: [...new Set(sections)], controls: { ...controls, buttons: controls.buttons.slice(0, 30) }, textSample: fullText.replace(/\s+/g, " ").slice(0, 200) };
})()
