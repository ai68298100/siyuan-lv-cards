(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 通过命令系统触发（langKey pairing）
  const cmd = p.commands?.find?.(c => c.langKey === "pairing");
  if (cmd?.callback) { await cmd.callback(); }
  else {
    // 兜底：插件命令经 SiYuan 应用命令
    const appCmd = window.siyuan.ws.app.plugins[0].commands;
    return { err: "no cmd", cmds: (appCmd ?? []).map(c => c.langKey).slice(0, 20) };
  }
  await new Promise(r => setTimeout(r, 3500));
  const dlg = vis()[vis().length - 1];
  const t = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
  return {
    pairingOpen: t.includes("配对"),
    text: t.slice(0, 260),
    leftItems: [...(dlg?.querySelectorAll("[class*=pair], [class*=lv-pair]") ?? [])].length,
  };
})()
