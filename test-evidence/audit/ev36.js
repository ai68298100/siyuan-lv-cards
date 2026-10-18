(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  document.querySelector(".b3-menu")?.classList.add("fn__none");
  const out = {};
  // 制台页签
  await p.openTabOf("lv-cards-dashboard", { tab: "authoring" });
  await new Promise(r => setTimeout(r, 2000));
  const hub = () => document.querySelector("[class*=lv-hub]");
  out.authoring = hub()?.textContent?.replace(/\s+/g, " ")?.slice(0, 200) ?? null;
  // 收件箱页签
  await p.openTabOf("lv-cards-dashboard", { tab: "inbox" });
  await new Promise(r => setTimeout(r, 2000));
  out.inbox = hub()?.textContent?.replace(/\s+/g, " ")?.slice(0, 200) ?? null;
  // 帮助对话框
  await p.openHelpDoc();
  await new Promise(r => setTimeout(r, 2500));
  out.help = { tabOpened: !!document.querySelector(".layout-tab-container__item") };
  // 修卡演练
  await p.openRepairDrill();
  await new Promise(r => setTimeout(r, 2500));
  let dlg = vis()[vis().length - 1];
  out.drill = { open: !!dlg, text: dlg?.textContent?.replace(/\s+/g, " ")?.slice(0, 150) ?? null };
  [...(dlg?.querySelectorAll("button") ?? [])].find(b => b.textContent.trim() === "取消" || b.textContent.trim() === "关闭")?.click();
  await new Promise(r => setTimeout(r, 600));
  // 挑战模式
  const challenge = p.commands?.find(c => c.langKey === "challenge");
  await challenge?.callback?.();
  await new Promise(r => setTimeout(r, 2500));
  dlg = vis()[vis().length - 1];
  out.challenge = { open: !!dlg, text: dlg?.textContent?.replace(/\s+/g, " ")?.slice(0, 150) ?? null };
  return out;
})()
