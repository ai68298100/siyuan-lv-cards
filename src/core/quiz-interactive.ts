/**
 * 交互式题型识别与选项解析引擎（纯逻辑、零依赖、可在 Node/浏览器环境无缝运行与单测）。
 * 针对单选题、多选题、判断题与填空题，从笔记 Markdown、DOM 树或块属性（custom-exam-*）中
 * 提取结构化题干、选项列表、对错标记与参考解析，供复习端呈现精美可点击的选项卡片与互动槽位。
 */

export type QuizInteractiveKind = "choice" | "judge" | "fill" | "free-recall";

export interface InteractiveOption {
    key: string;        // "A", "B", "C", "D" 等
    text: string;       // 选项内容文本
    isAnswer: boolean;  // 是否为正确答案（若已知）
}

export interface InteractiveQuizData {
    kind: QuizInteractiveKind;
    stem: string;                      // 纯净题干文本或 HTML
    options: InteractiveOption[];      // 选择题选项列表
    isMultiple: boolean;               // 是否为多选
    judgeAnswer: boolean | null;       // 判断题答案（true=对/正，false=错/负，null=未知）
    fillExpected: string;              // 填空题期望答案文本
    analysis: string;                  // 参考解析/解题思路
    hasInteractiveWidgets: boolean;    // 是否具备可交互控件（选择题选项、判断按钮或打字框）
}

/**
 * 清洗去除 HTML 标签与空白符
 */
function cleanText(raw: string): string {
    if (!raw) return "";
    return raw
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * 解析并提取题干中的选项列表（如 A. 20%  B. 25% 等）
 */
export function extractChoiceOptionsFromText(content: string, knownAnswer = ""): InteractiveOption[] {
    const text = String(content ?? "");
    const options: InteractiveOption[] = [];

    // 1. 按行或列表项逐项扫描：支持 "A. 选项"、"A、选项"、"A: 选项"、"- A. 选项"、"* A. 选项"
    const lines = text.split(/\r?\n|<br\s*\/?>/i);
    const optRegex = /^\s*(?:[-*+]\s+)?(?:<[^>]*>)*([A-Fa-f])[\.\、\:\：\s]\s*(.+)$/;

    for (const line of lines) {
        const cleaned = cleanText(line);
        const match = cleaned.match(optRegex);
        if (match) {
            const key = match[1].toUpperCase();
            const optionText = match[2].trim();
            // 避免重复追加同一字母
            if (!options.some(o => o.key === key) && optionText) {
                options.push({
                    key,
                    text: optionText,
                    isAnswer: knownAnswer ? knownAnswer.toUpperCase().includes(key) : false,
                });
            }
        }
    }

    // 2. 如果分行没拆出来，尝试单行内多选项正则扫描（如 "A. 20% B. 25% C. 80% D. 125%"）
    if (options.length < 2) {
        const inlineRegex = /(?:^|\s+)([A-Fa-f])[\.\、\:\：]\s*([^\sA-Fa-f\.\、\:\：][^A-Fa-f\.\、\:\：]*?)(?=(?:\s+[A-Fa-f][\.\、\:\：])|$)/g;
        let m: RegExpExecArray | null;
        const inlineOpts: InteractiveOption[] = [];
        while ((m = inlineRegex.exec(cleanText(text))) !== null) {
            const key = m[1].toUpperCase();
            const optionText = m[2].trim();
            if (!inlineOpts.some(o => o.key === key) && optionText) {
                inlineOpts.push({
                    key,
                    text: optionText,
                    isAnswer: knownAnswer ? knownAnswer.toUpperCase().includes(key) : false,
                });
            }
        }
        if (inlineOpts.length >= 2) {
            return inlineOpts;
        }
    }

    return options;
}

/**
 * 解析判断题答案布尔值
 */
export function parseJudgeAnswer(answerText: string): boolean | null {
    const raw = cleanText(answerText).toLowerCase();
    if (!raw) return null;
    if (["t", "true", "对", "正确", "√", "1", "yes", "y", "v"].includes(raw)) return true;
    if (["f", "false", "错", "错误", "×", "x", "0", "no", "n"].includes(raw)) return false;
    return null;
}

/**
 * 综合分析卡片属性与正文，生成完整的交互式题型模型
 */
export function parseInteractiveQuiz(params: {
    markdown?: string;
    domHtml?: string;
    attrs?: Record<string, string>;
    cardMemo?: string;
    expectedText?: string;
}): InteractiveQuizData {
    const { markdown = "", domHtml = "", attrs = {}, cardMemo = "", expectedText = "" } = params;
    const fullContent = `${markdown}\n${domHtml}\n${cardMemo}`;

    // 1. 读取可能存在的插件/生态元数据属性
    const examType = String(attrs["custom-exam-type"] || attrs["exam-type"] || "").toLowerCase();
    const examAnswer = String(attrs["custom-exam-answer"] || attrs["exam-answer"] || attrs["custom-card-answer"] || "").trim();
    const examAnalysis = String(attrs["custom-exam-analysis"] || attrs["exam-analysis"] || attrs.memo || attrs["custom-memo"] || "").trim();

    // 2. 检查是否为选择题（单选或多选）
    const knownAnswer = examAnswer || (cleanText(expectedText).length <= 4 ? cleanText(expectedText) : "");
    const extractedOptions = extractChoiceOptionsFromText(fullContent, knownAnswer);

    if (examType === "single" || examType === "multiple" || extractedOptions.length >= 2) {
        const isMultiple = examType === "multiple" || (knownAnswer.length > 1 && /^[A-F]+$/i.test(knownAnswer));
        return {
            kind: "choice",
            stem: cleanText(markdown || domHtml).replace(/[-*+]\s+[A-Fa-f][\.\、\:\：\s].*$/gm, "").trim(),
            options: extractedOptions,
            isMultiple,
            judgeAnswer: null,
            fillExpected: knownAnswer,
            analysis: examAnalysis,
            hasInteractiveWidgets: extractedOptions.length >= 2,
        };
    }

    // 3. 检查是否为判断题
    const judgeVal = parseJudgeAnswer(examAnswer || expectedText || cardMemo);
    const isJudgeStem = /【判断(?:示例|题)?】|判断题|正误题|判断下列/i.test(fullContent);
    if (examType === "judge" || (judgeVal !== null && isJudgeStem)) {
        return {
            kind: "judge",
            stem: cleanText(markdown || domHtml),
            options: [],
            isMultiple: false,
            judgeAnswer: judgeVal,
            fillExpected: judgeVal ? "正确" : "错误",
            analysis: examAnalysis,
            hasInteractiveWidgets: true,
        };
    }

    // 4. 检查是否为填空题
    const hasUnderline = /_{3,}/.test(fullContent);
    const hasClozeMark = fullContent.includes("==") || domHtml.includes("data-type=\"mark\"");
    if (examType === "fill" || hasUnderline || hasClozeMark) {
        return {
            kind: "fill",
            stem: cleanText(markdown || domHtml),
            options: [],
            isMultiple: false,
            judgeAnswer: null,
            fillExpected: examAnswer || expectedText || cardMemo,
            analysis: examAnalysis,
            hasInteractiveWidgets: Boolean(examAnswer || expectedText || cardMemo || hasUnderline || hasClozeMark),
        };
    }

    // 5. 普通自由回忆问答卡
    return {
        kind: "free-recall",
        stem: cleanText(markdown || domHtml),
        options: [],
        isMultiple: false,
        judgeAnswer: null,
        fillExpected: expectedText || cardMemo,
        analysis: examAnalysis,
        hasInteractiveWidgets: false,
    };
}
