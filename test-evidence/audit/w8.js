(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[vis().length - 1];
  // 按钮文案：撤销后显示 Grant 按钮（aiKillGrant）——文本是什么？
  const btns = [...dlg.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 0).map(b => b.textContent.trim()).filter(t => /Grant|Revoke|consent|同意/i.test(t));
  const grant = [...dlg.querySelectorAll("button")].find(b => /Grant/i.test(b.textContent));
  grant?.click();
  await new Promise(r => setTimeout(r, 1200));
  return { consentButtons: btns, grantedAfter: !p.killSwitch?.revoked };
})()
