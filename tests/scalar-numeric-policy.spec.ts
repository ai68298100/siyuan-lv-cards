import { describe, it, expect } from "vitest";
import {
    countSignificantFigures,
    parseScalarInput,
    resolveUnitConversion,
    evaluateScalarAnswer,
    createScalarPolicy,
    bumpPolicyVersion,
    type ScalarNumericPolicy,
} from "../src/core/scalar-numeric-policy";

describe("BX-1 可检查的标量数值答案政策引擎 (scalar-numeric-policy)", () => {
    describe("有效数字统计 (countSignificantFigures)", () => {
        it("正确统计整数与小数的有效数字", () => {
            expect(countSignificantFigures("123")).toBe(3);
            expect(countSignificantFigures("0.0045")).toBe(2);
            expect(countSignificantFigures("0.00450")).toBe(3);
            expect(countSignificantFigures("12.304")).toBe(5);
            expect(countSignificantFigures("-0.050")).toBe(2);
            expect(countSignificantFigures("+100.0")).toBe(4);
            expect(countSignificantFigures("1.20e-3")).toBe(3);
        });

        it("处理 0 与空值边界", () => {
            expect(countSignificantFigures("0")).toBe(1);
            expect(countSignificantFigures("0.0")).toBe(1);
            expect(countSignificantFigures("")).toBeNull();
        });
    });

    describe("标量与单位输入解析 (parseScalarInput)", () => {
        it("解析普通数字与排版负号、全角符号", () => {
            const res1 = parseScalarInput("-1");
            expect(res1.value).toBe(-1);
            expect(res1.isPercentage).toBe(false);

            const res2 = parseScalarInput("−12.5"); // U+2212
            expect(res2.value).toBe(-12.5);

            const res3 = parseScalarInput("＋42");
            expect(res3.value).toBe(42);
        });

        it("解析带单位的输入", () => {
            const res = parseScalarInput("25.4 cm");
            expect(res.value).toBe(25.4);
            expect(res.unit).toBe("cm");

            const res2 = parseScalarInput("  -1500  kJ  ");
            expect(res2.value).toBe(-1500);
            expect(res2.unit).toBe("kJ");
        });

        it("解析科学记数法", () => {
            const res1 = parseScalarInput("1.25e-3 m");
            expect(res1.value).toBe(0.00125);
            expect(res1.unit).toBe("m");

            const res2 = parseScalarInput("3.5 * 10^4 Pa");
            expect(res2.value).toBe(35000);
            expect(res2.unit).toBe("Pa");
        });

        it("解析百分数", () => {
            const res = parseScalarInput("75.5%");
            expect(res.value).toBe(75.5);
            expect(res.isPercentage).toBe(true);
            expect(res.unit).toBe("%");
        });

        it("处理千分位与欧式小数", () => {
            // 逗号千分位，点小数
            const res1 = parseScalarInput("1,234.56 kg");
            expect(res1.value).toBe(1234.56);
            expect(res1.unit).toBe("kg");

            // 点千分位，逗号小数
            const res2 = parseScalarInput("1.234,56 m");
            expect(res2.value).toBe(1234.56);
            expect(res2.unit).toBe("m");

            // 单逗号欧式小数
            const res3 = parseScalarInput("3,14");
            expect(res3.value).toBe(3.14);
        });

        it("歧义格式标记为 isAmbiguous", () => {
            const res = parseScalarInput("1.2.3.4");
            expect(res.isAmbiguous).toBe(false); // 多个点通常导致 invalid-number
            expect(res.value).toBeNull();

            const resConflict = parseScalarInput("1.2.3,4,5");
            expect(resConflict.isAmbiguous).toBe(true);
        });
    });

    describe("单位换算 (resolveUnitConversion)", () => {
        it("相同单位返回系数 1", () => {
            expect(resolveUnitConversion("kg", "kg")).toEqual({ factor: 1, offset: 0 });
            expect(resolveUnitConversion("m", "M")).toEqual({ factor: 1, offset: 0 });
        });

        it("内置长度与质量换算", () => {
            const cmToM = resolveUnitConversion("cm", "m");
            expect(cmToM).not.toBeNull();
            expect(cmToM?.factor).toBeCloseTo(0.01);

            const gToKg = resolveUnitConversion("g", "kg");
            expect(gToKg?.factor).toBeCloseTo(0.001);

            const mgToG = resolveUnitConversion("mg", "g");
            expect(mgToG?.factor).toBeCloseTo(0.001);
        });

        it("不同量纲无法换算返回 null", () => {
            expect(resolveUnitConversion("kg", "m")).toBeNull();
            expect(resolveUnitConversion("s", "Pa")).toBeNull();
        });

        it("支持自定义 allowedUnits", () => {
            const customAllowed = {
                furlong: 201.168, // 1 furlong = 201.168 m
            };
            const conv = resolveUnitConversion("furlong", "m", customAllowed);
            expect(conv).not.toBeNull();
            expect(conv?.factor).toBeCloseTo(201.168);
        });
    });

    describe("标量答案综合判定 (evaluateScalarAnswer)", () => {
        it("绝对容差：在容差内判定为匹配，超出则判定不匹配", () => {
            const policy: ScalarNumericPolicy = createScalarPolicy("m", "absolute", 0.05);

            // 刚好相等
            const r1 = evaluateScalarAnswer("10.0 m", 10.0, policy);
            expect(r1.isMatch).toBe(true);
            expect(r1.suggestedGrade).toBe(3);
            expect(r1.autoSubmitGrade).toBe(false);

            // 在容差内: 10.04 m (差 0.04 <= 0.05)
            const r2 = evaluateScalarAnswer("10.04 m", 10.0, policy);
            expect(r2.isMatch).toBe(true);
            expect(r2.absoluteDiff).toBeCloseTo(0.04);

            // 超出容差: 10.06 m (差 0.06 > 0.05)
            const r3 = evaluateScalarAnswer("10.06 m", 10.0, policy);
            expect(r3.isMatch).toBe(false);
            expect(r3.issues).toContain("out-of-tolerance");
            expect(r3.suggestedGrade).toBe(1);
        });

        it("相对容差与零值附近安全防护 (0附近防除零)", () => {
            const policy: ScalarNumericPolicy = createScalarPolicy("V", "relative", 0.02, {
                fallbackEpsilon: 0.001,
            });

            // 正常基数 100V，相对容差 2% (2V)
            const rNormal = evaluateScalarAnswer("101.5 V", 100.0, policy);
            expect(rNormal.isMatch).toBe(true);
            expect(rNormal.appliedTolerance.usedZeroFallback).toBe(false);

            // 零值基数 0.0V：自动回退绝对 epsilon 0.001V
            const rZeroPass = evaluateScalarAnswer("0.0005 V", 0.0, policy);
            expect(rZeroPass.isMatch).toBe(true);
            expect(rZeroPass.appliedTolerance.usedZeroFallback).toBe(true);

            const rZeroFail = evaluateScalarAnswer("0.05 V", 0.0, policy);
            expect(rZeroFail.isMatch).toBe(false);
            expect(rZeroFail.appliedTolerance.usedZeroFallback).toBe(true);
        });

        it("单位自动换算匹配 (如 250 mg 匹配 0.25 g)", () => {
            const policy: ScalarNumericPolicy = createScalarPolicy("g", "absolute", 0.001);

            const res = evaluateScalarAnswer("250 mg", 0.25, policy);
            expect(res.isMatch).toBe(true);
            expect(res.actualNormalizedValue).toBeCloseTo(0.25);
            expect(res.unitConversionApplied).toEqual({
                fromUnit: "mg",
                toUnit: "g",
                factor: 0.001,
            });
        });

        it("百分数与小数等价互换 (0.75 与 75%)", () => {
            const policy: ScalarNumericPolicy = createScalarPolicy("", "relative", 0.01, {
                allowPercentageEquivalent: true,
            });

            const res = evaluateScalarAnswer("75%", 0.75, policy);
            expect(res.isMatch).toBe(true);
            expect(res.actualNormalizedValue).toBeCloseTo(0.75);
        });

        it("未知单位或非同量纲单位退回人工自评 (canDetermine=false)", () => {
            const policy: ScalarNumericPolicy = createScalarPolicy("kg", "absolute", 0.1);

            const res = evaluateScalarAnswer("50 meters", 50, policy);
            expect(res.canDetermine).toBe(false);
            expect(res.isMatch).toBe(false);
            expect(res.issues).toContain("unit-mismatch");
            expect(res.suggestedGrade).toBeNull();
        });

        it("有效数字不足时给出友好警示 (suggestedGrade=2)", () => {
            const policy: ScalarNumericPolicy = createScalarPolicy("m", "absolute", 0.1, {
                significantFigures: 4,
            });

            // 期望 4 位有效数字，输入只给 2 位 "12"
            const res = evaluateScalarAnswer("12 m", 12.0, policy);
            expect(res.isMatch).toBe(true);
            expect(res.issues).toContain("sig-figs-mismatch");
            expect(res.suggestedGrade).toBe(2);
        });

        it("空输入或非法输入给出正确 issue", () => {
            const policy = createScalarPolicy("m", "none", 0);

            const emptyRes = evaluateScalarAnswer("", 10, policy);
            expect(emptyRes.canDetermine).toBe(false);
            expect(emptyRes.issues).toContain("empty-input");

            const invalidRes = evaluateScalarAnswer("not-a-number", 10, policy);
            expect(invalidRes.canDetermine).toBe(false);
            expect(invalidRes.issues).toContain("invalid-number");
        });
    });

    describe("策略版本代次演进 (bumpPolicyVersion)", () => {
        it("更新策略时版本号自增并保持不可变性", () => {
            const p1 = createScalarPolicy("m", "absolute", 0.05);
            expect(p1.version).toBe(1);

            const p2 = bumpPolicyVersion(p1, { toleranceValue: 0.01 });
            expect(p2.version).toBe(2);
            expect(p2.toleranceValue).toBe(0.01);
            expect(p1.toleranceValue).toBe(0.05); // p1 不受影响
        });
    });
});
