(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[0];
  // Load current doc（向导里）
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Load current doc"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  const t0 = dlg.textContent.replace(/\s+/g, " ");
  if (/No material/.test(t0)) return { err: "material still empty", note: "load failed" };
  const before = performance.getEntriesByType("resource").filter(e => /api\/ai|bigmodel/.test(e.name)).length;
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Generate"))?.click();
  await new Promise(r => setTimeout(r, 1200));
  dlg = vis()[0];
  [...dlg.querySelectorAll("button")].find(b => /Confirm|确认/.test(b.textContent))?.click();
  await new Promise(r => setTimeout(r, 2000));
  dlg = vis()[0];
  const wt = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
  const after = performance.getEntriesByType("resource").filter(e => /api\/ai|bigmodel/.test(e.name)).length;
  return {
    blockText: wt.match(/(revoked|consent|Emergency)[^|]{0,90}/i)?.[0] ?? null,
    noRawError: !wt.includes("Cannot read properties"),
    requests: { before, after },
  };
})()
