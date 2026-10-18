(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  const rescheduleInput = rev.querySelector("input[type=number]");
  const visible = !!rescheduleInput && rescheduleInput.getBoundingClientRect().width > 0;
  const confirmBtn = [...rev.querySelectorAll("button")].find(b => window.siyuan.languages.confirm === b.textContent.trim());
  return { panelShown: visible, inputVal: rescheduleInput?.value ?? null, confirmText: confirmBtn?.textContent?.trim() ?? null };
})()
