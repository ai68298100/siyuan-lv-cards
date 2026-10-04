# e2e 真机验收启动脚本（docs/34 E2E-1）：
# 杀掉全部思源实例后以显式工作区重启，避免多工作区/多插件并行开发互相占用。
# 注意：本文件必须保留 UTF-8 BOM（PowerShell 5.1 无 BOM 时中文路径会乱码）。
# ⚠️ 本脚本会杀掉全部思源实例（独占模式）。多插件并行开发时请改用：
#   node scripts/e2e-isolated.mjs   （隔离临时工作区+无头内核，不碰任何现有实例）
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts/e2e-launch.ps1
# 前置：插件以「单文件内联构建」部署（pnpm build && npx vite build -c vite.config.inline.mjs，
#       将 dist-inline/index.js、index.css 覆盖到 <工作区>/data/plugins/siyuan-lv-cards/），
#       原因见 docs/34 E2E-1 发现 1（3.8.6 分包 CJS 插件加载失败）。
Get-Process | Where-Object { $_.Name -match '^SiYuan' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 4
Start-Process -FilePath 'D:\biji\SiYuan\SiYuan.exe' -ArgumentList '--workspace=D:\小飞驴的SIYUAN'
Write-Output "launched: D:\小飞驴的SIYUAN"
