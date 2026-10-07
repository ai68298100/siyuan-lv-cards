/**
 * 每周学习报告（T-周报 · docs/41 P1 · 纯逻辑 node 可单测）。
 * 触发语义：上周（周一~周日）结束后，本周首次加载时若「上周」尚未写过周报，则生成上周报告；
 * weekKey = 上周一的本地 ISO 日期（幂等键）。
 * 内容口径（docs/28 数据边界）：全部来自本地复习日志（内核调度），缺失数据标「未知」，不补 0 叙事。
 */

const pad = (n: number) => String(n).padStart(2, "0");

export function localISO(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 本地时区的周一 00:00（周为自然周，周一起） */
export function mondayOf(d: Date): Date {
    const day = d.getDay(); // 0=周日
    const back = (day + 6) % 7; // 周一回退 0，周日回退 6
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
}

export interface WeeklyReportDecision {
    write: boolean;
    /** 幂等键 = 上周一的本地 ISO；写入后由调用方持久化 */
    weekKey: string;
    /** 报告覆盖范围：上周一 ~ 上周日（本地 ISO） */
    rangeStart: string;
    rangeEnd: string;
}

export function decideWeeklyReport(today: Date, lastWrittenWeekKey: string, enabled: boolean): WeeklyReportDecision {
    const prevMonday = mondayOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7));
    const weekKey = localISO(prevMonday);
    const rangeStart = weekKey;
    const rangeEnd = localISO(new Date(prevMonday.getFullYear(), prevMonday.getMonth(), prevMonday.getDate() + 6));
    return {
        write: enabled && lastWrittenWeekKey !== weekKey,
        weekKey,
        rangeStart,
        rangeEnd,
    };
}

export interface WeeklyReportFacts {
    /** 上周正式复习张数 */
    reviewed: number;
    /** 上上周期复习张数（对比基准；null = 无历史） */
    reviewedPrev: number | null;
    newCards: number;
    forgotten: number;
    /** 当前连击天数 */
    streak: number;
    /** 保持率 0-100；null = 样本不足（如实标未知） */
    retention: number | null;
}

export interface WeeklyReportLabels {
    title: string;      // 学习周报
    reviewed: string;   // 正式复习
    newCards: string;   // 新卡
    forgotten: string;  // 遗忘
    streak: string;     // 连击
    retention: string;  // 保持率
    unknown: string;    // 未知
    lastWeek: string;   // 上周
    footer: string;     // 数据边界脚注
}

/** 周报 markdown（写入思源文档的内容）；全部事实由调用方聚合，本函数只做排版 */
export function buildWeeklyReport(facts: WeeklyReportFacts, labels: WeeklyReportLabels): string {
    const trend = facts.reviewedPrev === null ? "" : `（${labels.lastWeek} ${facts.reviewedPrev}）`;
    const retention = facts.retention === null ? labels.unknown : `${facts.retention}%`;
    return [
        `## ${labels.title}`,
        ``,
        `- ${labels.reviewed}：${facts.reviewed}${trend}`,
        `- ${labels.newCards}：${facts.newCards}`,
        `- ${labels.forgotten}：${facts.forgotten}`,
        `- ${labels.streak}：${facts.streak}`,
        `- ${labels.retention}：${retention}`,
        ``,
        `> ${labels.footer}`,
    ].join("\n");
}
