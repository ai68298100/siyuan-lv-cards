(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3000));
  const rev = () => document.querySelector("[class*=lv-review]");
  const out = { forms: [] };
  for (let i = 0; i < 3; i++) {
    const t = rev().textContent.replace(/\s+/g, " ");
    const form = /输入答案|打字/.test(t) ? "typing" : /选择|选项/.test(t) && /A|B|C|D|①|1\./.test(t) ? "choice" : (rev().querySelector("button[aria-label], .b3-button") && /显示答案/.test(t) ? "flip" : "?");
    out.forms.push(form);
    // 前进：翻面/提交后评分 3（打字/选择先作答）
    const input = rev().querySelector("input[type=text]");
    if (input && form === "typing") {
      input.value = "测试作答";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await new Promise(r => setTimeout(r, 1200));
    } else if (form === "choice") {
      const opt = [...rev().querySelectorAll("button, [role=button]")].find(b => /^[ABCD]/.test(b.textContent.trim()));
      opt?.click();
      await new Promise(r => setTimeout(r, 1200));
    } else {
      const el = rev().querySelector("[class*=lv-card2], .b3-typography");
      const r = el?.getBoundingClientRect();
      if (!r) break;
      window.__x = Math.round(r.x + r.width / 2); window.__y = Math.round(r.y + Math.min(r.height / 2, 200));
      break;
    }
    await new Promise(r => setTimeout(r, 1200));
  }
  out.finalText = rev().textContent.replace(/\s+/g, " ").slice(0, 200);
  out.pos = { x: window.__x, y: window.__y };
  return out;
})()
