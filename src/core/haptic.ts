/**
 * 移动端触感微震动反馈（Web Haptic Vibration API，docs/34 移动设备与触控标杆体验）
 * 1. 防御式执行：在不支持 navigator.vibrate 或权限受阻的桌面/无震动设备上静默跳过，绝不报错；
 * 2. 差异化震动波形：普通轻触 10-12ms 微震，遗忘/错误时触发 [15, 30, 15] 确认双击；
 * 3. 尊重用户偏好：支持传入 disabled 控制开关。
 */

export function triggerHaptic(
    pattern: number | number[] = 12,
    options?: { enabled?: boolean }
): boolean {
    if (options?.enabled === false) return false;
    try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            return navigator.vibrate(pattern);
        }
    } catch {
        // 旁路防御式跳过
    }
    return false;
}
