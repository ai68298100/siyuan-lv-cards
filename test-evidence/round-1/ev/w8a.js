(() => {
  const pal = document.querySelector("[class*=lv-palette], .lv-cmd-palette");
  const dlg = document.querySelector(".b3-dialog");
  return { paletteVisible: !!pal, dlgText: dlg?.textContent?.replace(/\s+/g, " ")?.slice(0, 200) ?? null };
})()
