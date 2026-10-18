(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 开复习
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3000));
  const rev = document.querySelector("[class*=lv-review]");
  const tabsBefore = document.querySelectorAll(".layout-tab-container__item").length;
  // 点编辑
  [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === "编辑")?.click();
  await new Promise(r => setTimeout(r, 2500));
  const tabsAfter = [...document.querySelectorAll(".layout-tab-container__item")].map(e => e.textContent.trim());
  return {
    tabsBefore,
    tabsAfter,
    newTabOpened: tabsAfter.length > tabsBefore,
    noDialogExpected: vis().length === 0,
  };
})()
