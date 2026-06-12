import { describe, it, expect } from "vitest";
import {
  filterCompatibleProducts,
  matchesCompatRecord,
  isWildcardCompatValue,
  normalizeCompatValue,
  type CompatRecord,
} from "./configurator-match";

/**
 * These tests guard the configurator's strict-match logic.
 *
 * Bug history:
 *  - Empty match used to fall back to "all products in category" → must NEVER happen.
 *  - Strict guard used to reject Saveiro 2012 Trend because the compatibility
 *    record carried version keys for OTHER year ranges (e.g. saveiro_2015).
 *    Those out-of-flow keys must be ignored, not used to reject the product.
 */

const baseProduct = { active: true, name: "Capota Marítima Saveiro" };

const saveiroTrendRecord: CompatRecord = {
  product_id: "p-saveiro-trend",
  products: baseProduct,
  year_from: 2010,
  year_to: 2014,
  answers: {
    cabine: "estendida",
    ganchos: "com_ganchos",
    // Version keys for several year buckets — only the matching one is in flow.
    saveiro_2010_a_2014: ["trend", "ce"],
    saveiro_2015: "cross",
    saveiro_2016: "cross",
  },
};

const flow2012 = new Set([
  "cabine",
  "ganchos",
  "saveiro_2010_a_2014",
]);

describe("normalizeCompatValue / isWildcardCompatValue", () => {
  it("treats wildcards consistently", () => {
    expect(isWildcardCompatValue("")).toBe(true);
    expect(isWildcardCompatValue("qualquer")).toBe(true);
    expect(isWildcardCompatValue("(qualquer)")).toBe(true);
    expect(isWildcardCompatValue(["*", ""])).toBe(true);
    expect(isWildcardCompatValue("trend")).toBe(false);
  });

  it("normalizes case and whitespace", () => {
    expect(normalizeCompatValue("  Trend  ")).toBe("trend");
    expect(normalizeCompatValue(null)).toBe("");
  });
});

describe("Saveiro 2012 Trend (regression)", () => {
  it("matches the registered combination", () => {
    const ok = matchesCompatRecord(saveiroTrendRecord, {
      year: 2012,
      userAnswers: {
        cabine: "estendida",
        ganchos: "com_ganchos",
        saveiro_2010_a_2014: "trend",
      },
      flowQuestionKeys: flow2012,
    });
    expect(ok).toBe(true);
  });

  it("ignores version keys for OTHER year ranges (out-of-flow)", () => {
    // Customer never answered saveiro_2015 / saveiro_2016 — must not reject.
    const ok = matchesCompatRecord(saveiroTrendRecord, {
      year: 2012,
      userAnswers: {
        cabine: "estendida",
        ganchos: "com_ganchos",
        saveiro_2010_a_2014: "ce",
      },
      flowQuestionKeys: flow2012,
    });
    expect(ok).toBe(true);
  });

  it("still rejects when an in-flow answer does not match", () => {
    const ok = matchesCompatRecord(saveiroTrendRecord, {
      year: 2012,
      userAnswers: {
        cabine: "simples", // wrong cabine
        ganchos: "com_ganchos",
        saveiro_2010_a_2014: "trend",
      },
      flowQuestionKeys: flow2012,
    });
    expect(ok).toBe(false);
  });

  it("rejects when the year is outside the record range", () => {
    const ok = matchesCompatRecord(saveiroTrendRecord, {
      year: 2016,
      userAnswers: {
        cabine: "estendida",
        ganchos: "com_ganchos",
        saveiro_2016: "cross",
      },
      flowQuestionKeys: new Set(["cabine", "ganchos", "saveiro_2016"]),
    });
    expect(ok).toBe(false);
  });

  it("rejects when an in-flow filter has no answer (strict)", () => {
    const ok = matchesCompatRecord(saveiroTrendRecord, {
      year: 2012,
      userAnswers: {
        cabine: "estendida",
        ganchos: "com_ganchos",
        // saveiro_2010_a_2014 missing despite being in flow
      },
      flowQuestionKeys: flow2012,
    });
    expect(ok).toBe(false);
  });
});

describe("filterCompatibleProducts", () => {
  const other: CompatRecord = {
    product_id: "p-other",
    products: baseProduct,
    year_from: 2010,
    year_to: 2014,
    answers: {
      cabine: "simples",
      ganchos: "sem_ganchos",
      saveiro_2010_a_2014: ["cs"],
    },
  };
  const inactive: CompatRecord = {
    ...saveiroTrendRecord,
    product_id: "p-inactive",
    products: { name: "Inativo", active: false },
  };

  it("returns ONLY records matching the selection (no fallback to all)", () => {
    const matches = filterCompatibleProducts([saveiroTrendRecord, other, inactive], {
      year: 2012,
      userAnswers: {
        cabine: "estendida",
        ganchos: "com_ganchos",
        saveiro_2010_a_2014: "trend",
      },
      flowQuestionKeys: flow2012,
    });
    expect(matches.map((m) => m.product_id)).toEqual(["p-saveiro-trend"]);
  });

  it("returns empty array (NEVER all products) when nothing matches", () => {
    const matches = filterCompatibleProducts([saveiroTrendRecord, other], {
      year: 2012,
      userAnswers: {
        cabine: "estendida",
        ganchos: "com_ganchos",
        saveiro_2010_a_2014: "xyz-inexistente",
      },
      flowQuestionKeys: flow2012,
    });
    expect(matches).toEqual([]);
  });

  it("respects wildcard answers in compatibility records", () => {
    const wildcard: CompatRecord = {
      product_id: "p-wild",
      products: baseProduct,
      year_from: 2010,
      year_to: 2014,
      answers: {
        cabine: "estendida",
        ganchos: "(qualquer)",
        saveiro_2010_a_2014: "trend",
      },
    };
    const ok = matchesCompatRecord(wildcard, {
      year: 2012,
      userAnswers: {
        cabine: "estendida",
        ganchos: "sem_ganchos",
        saveiro_2010_a_2014: "trend",
      },
      flowQuestionKeys: flow2012,
    });
    expect(ok).toBe(true);
  });
});
