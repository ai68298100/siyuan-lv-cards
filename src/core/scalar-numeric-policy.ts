/**
 * BX-1 可检查的标量数值答案政策引擎（Scalar Numeric Answer Policy Engine）
 *
 * 核心目标：
 * 为数值与物理/化学/工程/金融闪卡记录规范单位、允许单位、换算系数、
 * 绝对/相对容差、零值附近防除零规则、有效数字与百分数小数互换。
 *
 * 严格契约：
 * 1. 严格保留原答 rawInput 与策略版本 policyVersion（审计溯源）。
 * 2. 遇到未知单位、非法表达或歧义格式，诚实标记 canDetermine=false，退回人工自评，绝不胡乱判错。
 * 3. 结果只给出建议评分 suggestedGrade，autoSubmitGrade 恒为 false，正式评分权始终在用户手中。
 */

export type ScalarToleranceType = "none" | "absolute" | "relative" | "both";

export interface UnitConversionRule {
    readonly multiplier: number; // 换算到 canonicalUnit 的乘积系数，如 cm -> m 为 0.01
    readonly offset?: number; // 偏移量（如摄氏度到开尔文），默认为 0
}

export interface ScalarNumericPolicy {
    readonly version: number;
    readonly canonicalUnit: string; // 标准基准单位，如 "m", "kg", "s", "%" 或空字符串
    readonly allowedUnits?: Readonly<Record<string, number | UnitConversionRule>>; // 允许的兼容单位映射
    readonly toleranceType: ScalarToleranceType;
    readonly toleranceValue: number; // 绝对误差数值（如 0.02）或相对比例（如 0.05 代表 5%）
    readonly relativeToleranceValue?: number; // 当 toleranceType 为 "both" 时的相对误差容差
    readonly fallbackEpsilon?: number; // 目标值接近 0 时（|expected| < 1e-9），相对容差自动回退的绝对 epsilon（默认 1e-4）
    readonly allowPercentageEquivalent?: boolean; // 是否允许 0.25 ≡ 25% 等价
    readonly significantFigures?: number; // 要求的最小有效数字位数（可选）
    readonly requireExactSignificantFigures?: boolean; // 是否严格要求有效数字完全一致
    readonly thousandsSeparator?: "comma" | "space" | "none" | "any";
    readonly decimalSeparator?: "dot" | "comma" | "both";
}

export type ScalarIssue =
    | "empty-input"
    | "invalid-number"
    | "ambiguous-format"
    | "unknown-unit"
    | "unit-mismatch"
    | "missing-unit"
    | "sig-figs-mismatch"
    | "out-of-tolerance";

export interface ParsedScalar {
    readonly raw: string;
    readonly value: number | null;
    readonly unit: string | null;
    readonly isPercentage: boolean;
    readonly sigFigs: number | null;
    readonly isAmbiguous: boolean;
    readonly error?: string;
}

export interface ScalarEvaluationResult {
    readonly policyVersion: number;
    readonly rawInput: string;
    readonly expectedValue: number;
    readonly expectedUnit: string;
    readonly canDetermine: boolean; // 是否能够程序化断定；若 false 退回人工自评
    readonly isMatch: boolean;
    readonly actualNormalizedValue: number | null; // 折算到基准单位后的数值
    readonly absoluteDiff: number | null;
    readonly relativeDiff: number | null;
    readonly appliedTolerance: {
        readonly type: ScalarToleranceType;
        readonly value: number;
        readonly usedZeroFallback?: boolean;
    };
    readonly unitConversionApplied: {
        readonly fromUnit: string;
        readonly toUnit: string;
        readonly factor: number;
    } | null;
    readonly issues: readonly ScalarIssue[];
    readonly suggestedGrade: 1 | 2 | 3 | 4 | null;
    readonly autoSubmitGrade: false; // 恒为 false，绝不越权自动提交
    readonly explanationKey: string;
    readonly explanationParams?: Record<string, string | number>;
}

// 常见科学与工程内置单位换算表
export const BUILTIN_UNIT_FAMILIES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
    length: {
        m: 1,
        cm: 0.01,
        mm: 0.001,
        um: 1e-6,
        nm: 1e-9,
        km: 1000,
        in: 0.0254,
        ft: 0.3048,
    },
    mass: {
        kg: 1,
        g: 0.001,
        mg: 1e-6,
        ug: 1e-9,
        t: 1000,
        lb: 0.45359237,
        oz: 0.028349523125,
    },
    time: {
        s: 1,
        ms: 0.001,
        us: 1e-6,
        ns: 1e-9,
        min: 60,
        h: 3600,
        d: 86400,
    },
    frequency: {
        hz: 1,
        khz: 1000,
        mhz: 1e6,
        ghz: 1e9,
    },
    pressure: {
        pa: 1,
        kpa: 1000,
        mpa: 1e6,
        bar: 100000,
        atm: 101325,
        mmhg: 133.322,
    },
    volume: {
        l: 1,
        ml: 0.001,
        ul: 1e-6,
        m3: 1000,
        cm3: 0.001,
    },
    energy: {
        j: 1,
        kj: 1000,
        mj: 1e6,
        cal: 4.184,
        kcal: 4184,
        ev: 1.602176634e-19,
    },
    power: {
        w: 1,
        kw: 1000,
        mw: 1e6,
        hp: 745.7,
    },
    electric_potential: {
        v: 1,
        mv: 0.001,
        kv: 1000,
    },
    electric_current: {
        a: 1,
        ma: 0.001,
        ua: 1e-6,
    },
};

/**
 * 统计一个数字字符串的有效数字位数
 */
export function countSignificantFigures(numStr: string): number | null {
    const s = numStr.trim().replace(/^[+-]/, "");
    if (!s) return null;

    // 科学计数法格式，如 1.20e-3
    const sciMatch = s.match(/^([0-9.]+)[eE][+-]?[0-9]+$/);
    const significand = sciMatch ? sciMatch[1] : s;

    // 包含小数点情况
    if (significand.includes(".")) {
        const parts = significand.split(".");
        if (parts.length !== 2) return null;
        const [integerPart, fractionalPart] = parts;
        // 如果全为0，如 "0.00"，有效数字为小数部分的0数量？科学记数法通常取去掉前导0后的全部数字
        const combined = integerPart + fractionalPart;
        const nonZeroMatch = combined.match(/^0*([1-9][0-9]*)$/);
        if (nonZeroMatch) {
            return nonZeroMatch[1].length;
        }
        // 如果全为0且带小数点，如 "0.0"，小数位数即有效数字（1位）
        const zeroFractional = fractionalPart.match(/^0+$/);
        if (zeroFractional && integerPart === "0") {
            return fractionalPart.length;
        }
        return combined.replace(/^0+/, "").length || 1;
    }

    // 不包含小数点：如 "1200" 或 "102"
    const nonZeroMatch = significand.match(/^0*([1-9][0-9]*)$/);
    if (!nonZeroMatch) {
        // "0"
        return significand === "0" ? 1 : null;
    }
    const clean = nonZeroMatch[1];
    // 尾部0在没有小数点时严格来说有歧义，但这里计算其非0段到末尾的最少到最多可能，默认取最小明确有效数字
    return clean.length;
}

/**
 * 解析用户输入的标量与单位
 */
export function parseScalarInput(
    raw: string,
    options?: {
        thousandsSeparator?: "comma" | "space" | "none" | "any";
        decimalSeparator?: "dot" | "comma" | "both";
    }
): ParsedScalar {
    const trimmed = raw.trim();
    if (!trimmed) {
        return {
            raw,
            value: null,
            unit: null,
            isPercentage: false,
            sigFigs: null,
            isAmbiguous: false,
            error: "empty-input",
        };
    }

    // 统一排版负号、全角符号
    let normalized = trimmed
        .replace(/[\u2212\uFF0D]/g, "-") // 排版减号与全角减号
        .replace(/\uFF0B/g, "+"); // 全角加号

    // 检查是否存在多个相互冲突的小数点或逗号，如 "1.2.3" 或 "1,2,3"（无明确千分位特征）
    const dotCount = (normalized.match(/\./g) || []).length;
    const commaCount = (normalized.match(/,/g) || []).length;

    if (dotCount > 1 && commaCount > 1) {
        return {
            raw,
            value: null,
            unit: null,
            isPercentage: false,
            sigFigs: null,
            isAmbiguous: true,
            error: "ambiguous-format",
        };
    }

    let isPercentage = false;
    if (normalized.endsWith("%") || normalized.includes("%")) {
        isPercentage = true;
        normalized = normalized.replace(/%/g, " ").trim();
    }

    // 拆分数值部分与后缀单位部分
    // 支持科学记数法: -1.23e-4, 2.5E3, 3.14 * 10^5
    normalized = normalized.replace(/\s*\*\s*10\^([+-]?\d+)/i, "e$1");

    // 匹配前导数值（含符号、数字、逗号、点、科学记数法）
    const match = normalized.match(/^([+-]?(?:[0-9]+(?:[,.][0-9]+)*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)(?:\s*(.*))?$/);
    if (!match) {
        return {
            raw,
            value: null,
            unit: null,
            isPercentage,
            sigFigs: null,
            isAmbiguous: false,
            error: "invalid-number",
        };
    }

    let numStr = match[1];
    let unitStr = match[2] ? match[2].trim() : (isPercentage ? "%" : null);
    if (isPercentage && unitStr && unitStr !== "%") {
        unitStr = `${unitStr}%`;
    }

    // 处理逗号与点号的千分位与小数解析
    if (numStr.includes(",") && numStr.includes(".")) {
        const lastComma = numStr.lastIndexOf(",");
        const lastDot = numStr.lastIndexOf(".");
        if (lastComma < lastDot) {
            // 逗号在点前，例如 "1,234.56" -> 逗号为千分位
            numStr = numStr.replace(/,/g, "");
        } else {
            // 点在逗号前，例如 "1.234,56" -> 点为千分位，逗号为小数
            numStr = numStr.replace(/\./g, "").replace(/,/g, ".");
        }
    } else if (numStr.includes(",")) {
        // 只有逗号：如果是 "1,234"（三位整）且配置了逗号千分位，还是欧式小数？
        // 若指定了 decimalSeparator="comma"，则当作小数点；若为 "1,5" 且小数只有一位或两位，通常是欧式小数
        if (options?.decimalSeparator === "comma" || /,\d{1,2}$/.test(numStr) || options?.decimalSeparator === "both") {
            // 欧式小数
            numStr = numStr.replace(/,/g, ".");
        } else {
            // 默认转为点
            numStr = numStr.replace(/,/g, ".");
        }
    }

    const parsedNum = Number(numStr);
    if (Number.isNaN(parsedNum)) {
        return {
            raw,
            value: null,
            unit: unitStr,
            isPercentage,
            sigFigs: null,
            isAmbiguous: false,
            error: "invalid-number",
        };
    }

    const sigFigs = countSignificantFigures(numStr);

    return {
        raw,
        value: parsedNum,
        unit: unitStr || (isPercentage ? "%" : null),
        isPercentage,
        sigFigs,
        isAmbiguous: false,
    };
}

/**
 * 查询两个单位之间的转换乘积系数
 */
export function resolveUnitConversion(
    fromUnit: string,
    toUnit: string,
    allowedUnits?: Readonly<Record<string, number | UnitConversionRule>>
): { factor: number; offset: number } | null {
    const f = fromUnit.trim().toLowerCase();
    const t = toUnit.trim().toLowerCase();

    if (f === t) {
        return { factor: 1, offset: 0 };
    }

    // 1. 优先查策略中显式登记的 allowedUnits
    if (allowedUnits) {
        for (const [k, rule] of Object.entries(allowedUnits)) {
            if (k.toLowerCase() === f) {
                if (typeof rule === "number") {
                    return { factor: rule, offset: 0 };
                }
                return { factor: rule.multiplier, offset: rule.offset ?? 0 };
            }
        }
    }

    // 2. 查内置物理量家族
    for (const family of Object.values(BUILTIN_UNIT_FAMILIES)) {
        if (f in family && t in family) {
            const factorFrom = family[f];
            const factorTo = family[t];
            // 转换为标准基准再折算到目标单位
            const factor = factorFrom / factorTo;
            return { factor, offset: 0 };
        }
    }

    return null;
}

/**
 * 核心：标量数值答案判定引擎（BX-1）
 */
export function evaluateScalarAnswer(
    input: string,
    expected: number,
    policy: ScalarNumericPolicy
): ScalarEvaluationResult {
    const rawInput = input;
    const policyVersion = policy.version;
    const expectedValue = expected;
    const expectedUnit = policy.canonicalUnit.trim();

    // 解析用户输入
    const parsed = parseScalarInput(input, {
        thousandsSeparator: policy.thousandsSeparator,
        decimalSeparator: policy.decimalSeparator,
    });

    const issues: ScalarIssue[] = [];

    // 1. 空输入或格式错误处理
    if (parsed.error === "empty-input") {
        issues.push("empty-input");
        return {
            policyVersion,
            rawInput,
            expectedValue,
            expectedUnit,
            canDetermine: false,
            isMatch: false,
            actualNormalizedValue: null,
            absoluteDiff: null,
            relativeDiff: null,
            appliedTolerance: { type: policy.toleranceType, value: policy.toleranceValue },
            unitConversionApplied: null,
            issues,
            suggestedGrade: 1,
            autoSubmitGrade: false,
            explanationKey: "scalarNumeric.emptyInput",
        };
    }

    if (parsed.isAmbiguous || parsed.error === "ambiguous-format") {
        issues.push("ambiguous-format");
        return {
            policyVersion,
            rawInput,
            expectedValue,
            expectedUnit,
            canDetermine: false,
            isMatch: false,
            actualNormalizedValue: null,
            absoluteDiff: null,
            relativeDiff: null,
            appliedTolerance: { type: policy.toleranceType, value: policy.toleranceValue },
            unitConversionApplied: null,
            issues,
            suggestedGrade: null, // 歧义格式退回人工判定
            autoSubmitGrade: false,
            explanationKey: "scalarNumeric.ambiguousFormat",
        };
    }

    if (parsed.value === null || parsed.error === "invalid-number") {
        issues.push("invalid-number");
        return {
            policyVersion,
            rawInput,
            expectedValue,
            expectedUnit,
            canDetermine: false,
            isMatch: false,
            actualNormalizedValue: null,
            absoluteDiff: null,
            relativeDiff: null,
            appliedTolerance: { type: policy.toleranceType, value: policy.toleranceValue },
            unitConversionApplied: null,
            issues,
            suggestedGrade: 1,
            autoSubmitGrade: false,
            explanationKey: "scalarNumeric.invalidNumber",
        };
    }

    // 2. 单位检查与换算
    let actualValue = parsed.value;
    let conversionApplied: { fromUnit: string; toUnit: string; factor: number } | null = null;
    const actualUnit = parsed.unit ? parsed.unit.trim() : "";

    // 处理百分数与小数等价
    let matchedPercentageEquivalent = false;
    if (policy.allowPercentageEquivalent) {
        if (parsed.isPercentage && expectedUnit !== "%") {
            // 用户输入了 25%，而标准期望为 0.25
            actualValue = actualValue / 100;
            matchedPercentageEquivalent = true;
        } else if (!parsed.isPercentage && expectedUnit === "%") {
            // 用户输入了 0.25，而标准期望为 25%
            actualValue = actualValue * 100;
            matchedPercentageEquivalent = true;
        }
    }

    if (expectedUnit) {
        if (!actualUnit && !matchedPercentageEquivalent) {
            // 缺失单位
            issues.push("missing-unit");
        } else if (actualUnit && actualUnit.toLowerCase() !== expectedUnit.toLowerCase()) {
            // 尝试单位换算
            const conv = resolveUnitConversion(actualUnit, expectedUnit, policy.allowedUnits);
            if (conv) {
                actualValue = (actualValue + conv.offset) * conv.factor;
                conversionApplied = {
                    fromUnit: actualUnit,
                    toUnit: expectedUnit,
                    factor: conv.factor,
                };
            } else {
                // 未知单位或非同量纲单位
                issues.push("unit-mismatch");
                return {
                    policyVersion,
                    rawInput,
                    expectedValue,
                    expectedUnit,
                    canDetermine: false, // 无法换算单位，转人工自评
                    isMatch: false,
                    actualNormalizedValue: null,
                    absoluteDiff: null,
                    relativeDiff: null,
                    appliedTolerance: { type: policy.toleranceType, value: policy.toleranceValue },
                    unitConversionApplied: null,
                    issues,
                    suggestedGrade: null,
                    autoSubmitGrade: false,
                    explanationKey: "scalarNumeric.unitMismatch",
                    explanationParams: { actualUnit, expectedUnit },
                };
            }
        }
    }

    // 3. 有效数字检查
    if (policy.significantFigures !== undefined && parsed.sigFigs !== null) {
        if (policy.requireExactSignificantFigures) {
            if (parsed.sigFigs !== policy.significantFigures) {
                issues.push("sig-figs-mismatch");
            }
        } else if (parsed.sigFigs < policy.significantFigures) {
            issues.push("sig-figs-mismatch");
        }
    }

    // 4. 容差与零值附近规则计算
    const absoluteDiff = Math.abs(actualValue - expectedValue);
    const absExpected = Math.abs(expectedValue);
    const relativeDiff = absExpected > 1e-9 ? absoluteDiff / absExpected : null;

    let inTolerance = false;
    let usedZeroFallback = false;
    const fallbackEps = policy.fallbackEpsilon ?? 1e-4;

    switch (policy.toleranceType) {
        case "none":
            inTolerance = absoluteDiff === 0 || absoluteDiff < 1e-12;
            break;

        case "absolute":
            inTolerance = absoluteDiff <= policy.toleranceValue;
            break;

        case "relative":
            if (absExpected <= 1e-9) {
                // 零值附近防护：相对误差除以零失效，自动回退到绝对 epsilon 容差
                usedZeroFallback = true;
                inTolerance = absoluteDiff <= fallbackEps;
            } else {
                inTolerance = relativeDiff !== null && relativeDiff <= policy.toleranceValue;
            }
            break;

        case "both": {
            const relTol = policy.relativeToleranceValue ?? policy.toleranceValue;
            const absPassed = absoluteDiff <= policy.toleranceValue;
            let relPassed = false;
            if (absExpected <= 1e-9) {
                usedZeroFallback = true;
                relPassed = absoluteDiff <= fallbackEps;
            } else {
                relPassed = relativeDiff !== null && relativeDiff <= relTol;
            }
            inTolerance = absPassed || relPassed;
            break;
        }
    }

    if (!inTolerance) {
        issues.push("out-of-tolerance");
    }

    const isMatch = inTolerance && !issues.includes("missing-unit") && !issues.includes("unit-mismatch");

    // 建议评分判定
    let suggestedGrade: 1 | 2 | 3 | 4 = 1;
    let explanationKey = "scalarNumeric.match";

    if (isMatch) {
        if (issues.includes("sig-figs-mismatch")) {
            // 数值对但有效数字欠缺，给良好/再接再厉 (2)
            suggestedGrade = 2;
            explanationKey = "scalarNumeric.matchSigFigsWarning";
        } else {
            suggestedGrade = 3;
            explanationKey = "scalarNumeric.match";
        }
    } else {
        if (issues.includes("missing-unit")) {
            suggestedGrade = 2; // 数值如果在范围内但漏写单位，给 2
            explanationKey = "scalarNumeric.missingUnitWarning";
        } else if (inTolerance) {
            suggestedGrade = 2;
            explanationKey = "scalarNumeric.partialMatch";
        } else {
            suggestedGrade = 1;
            explanationKey = "scalarNumeric.outOfTolerance";
        }
    }

    return {
        policyVersion,
        rawInput,
        expectedValue,
        expectedUnit,
        canDetermine: true,
        isMatch,
        actualNormalizedValue: actualValue,
        absoluteDiff,
        relativeDiff,
        appliedTolerance: {
            type: policy.toleranceType,
            value: policy.toleranceValue,
            usedZeroFallback,
        },
        unitConversionApplied: conversionApplied,
        issues,
        suggestedGrade,
        autoSubmitGrade: false,
        explanationKey,
        explanationParams: {
            expected: expectedValue,
            actual: actualValue,
            absDiff: Number(absoluteDiff.toFixed(6)),
        },
    };
}

/**
 * 辅助工厂函数：创建标量政策
 */
export function createScalarPolicy(
    canonicalUnit: string,
    toleranceType: ScalarToleranceType,
    toleranceValue: number,
    options?: Partial<Omit<ScalarNumericPolicy, "version" | "canonicalUnit" | "toleranceType" | "toleranceValue">>
): ScalarNumericPolicy {
    return {
        version: 1,
        canonicalUnit,
        toleranceType,
        toleranceValue,
        fallbackEpsilon: options?.fallbackEpsilon ?? 1e-4,
        allowPercentageEquivalent: options?.allowPercentageEquivalent ?? true,
        significantFigures: options?.significantFigures,
        requireExactSignificantFigures: options?.requireExactSignificantFigures,
        allowedUnits: options?.allowedUnits,
        thousandsSeparator: options?.thousandsSeparator ?? "any",
        decimalSeparator: options?.decimalSeparator ?? "both",
    };
}

/**
 * 递增并修改政策版本（用于策略更新时保留旧版本审计契约）
 */
export function bumpPolicyVersion(
    current: ScalarNumericPolicy,
    patch: Partial<Omit<ScalarNumericPolicy, "version">>
): ScalarNumericPolicy {
    return {
        ...current,
        ...patch,
        version: current.version + 1,
    };
}
