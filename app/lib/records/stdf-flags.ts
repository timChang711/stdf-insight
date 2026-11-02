/**
 * STDF V4 flag evidence only. These helpers neither change legacy boolean
 * outcomes nor choose yield denominators, retest identity or statistical policy.
 *
 * Source: workspace artifacts/Stdf-V4-spec.txt (original Teradyne V4 specification).
 * PRR: 1678–1708; PTR: 1903–1977; MPR: 2199–2272; FTR: 2401–2424.
 */
export type TestRecordKind = "PTR" | "MPR" | "FTR";
export type RecordedVerdict = "pass" | "fail" | "unknown";
export type NumericValidity = "valid" | "invalid" | "not-applicable";

export type DecodedTestFlags = {
  verdict: RecordedVerdict;
  execution: "executed" | "not-executed";
  /**
   * PTR flag eligibility from TEST_FLG bits 0–5 ONLY. A 'valid' value here
   * still needs PARM_FLG bits 0–2 and actual numeric validity checked; use
   * decodePtrNumericEligibility for combined TEST_FLG/PARM_FLG evidence.
   * MPR arrays and FTR have no single numeric result described by this field.
   */
  numericValidity: NumericValidity;
  diagnostics: string[];
  raw: number;
};

export type DecodedPartFlags = {
  verdict: RecordedVerdict;
  completion: "normal" | "abnormal";
  /** Raw declared relationships, not a decision to merge/drop any records. */
  supersession: { byPartId: boolean; byCoordinates: boolean };
  diagnostics: string[];
  raw: number;
};

export type DecodedParametricFlags = {
  scaleError: boolean;
  driftError: boolean;
  oscillation: boolean;
  aboveHighLimit: boolean;
  belowLowLimit: boolean;
  passedAlternateLimits: boolean;
  lowLimitEqualityPass: boolean;
  highLimitEqualityPass: boolean;
  diagnostics: string[];
  raw: number;
};

function requireByte(raw: number, field: string): void {
  if (!Number.isInteger(raw) || raw < 0 || raw > 255) {
    throw new RangeError(`${field} must be an integer byte (0–255)`);
  }
}

/** Decode recorded test outcome independently of numerical result usefulness. */
export function decodeTestFlags(kind: TestRecordKind, rawFlag: number): DecodedTestFlags {
  requireByte(rawFlag, "TEST_FLG");
  if (kind !== "PTR" && kind !== "MPR" && kind !== "FTR") {
    throw new RangeError("Test record kind must be PTR, MPR or FTR");
  }
  const diagnostics: string[] = [];
  if (rawFlag & 0x01) diagnostics.push("alarm");
  if (rawFlag & 0x02) diagnostics.push(kind === "PTR" ? "invalid-result" : "reserved-bit-1-set");
  if (rawFlag & 0x04) diagnostics.push("unreliable");
  if (rawFlag & 0x08) diagnostics.push("timeout");
  if (rawFlag & 0x10) diagnostics.push("not-executed");
  if (rawFlag & 0x20) diagnostics.push("abort");
  if (rawFlag & 0x40) diagnostics.push("no-pass-fail-indication");

  const notExecuted = Boolean(rawFlag & 0x10);
  // Default-only/not-executed records are not an executed PASS, even when
  // their unused bit 7 happens to be zero. Never invent a result for them.
  const verdict: RecordedVerdict = notExecuted || (rawFlag & 0x40)
    ? "unknown"
    : (rawFlag & 0x80) ? "fail" : "pass";

  return {
    verdict,
    execution: notExecuted ? "not-executed" : "executed",
    numericValidity: kind === "PTR" ? ((rawFlag & 0x3f) ? "invalid" : "valid") : "not-applicable",
    diagnostics,
    raw: rawFlag,
  };
}

/** Decode PRR independently of test-result flags and any part-identity policy. */
export function decodePartFlags(rawFlag: number): DecodedPartFlags {
  requireByte(rawFlag, "PART_FLG");
  const byPartId = Boolean(rawFlag & 0x01);
  const byCoordinates = Boolean(rawFlag & 0x02);
  const diagnostics: string[] = [];
  if (byPartId && byCoordinates) diagnostics.push("conflicting-supersession-flags");
  if (rawFlag & 0x04) diagnostics.push("abnormal-end-of-testing");
  if (rawFlag & 0x10) diagnostics.push("no-pass-fail-indication");
  if (rawFlag & 0x20) diagnostics.push("reserved-bit-5-set");
  if (rawFlag & 0x40) diagnostics.push("reserved-bit-6-set");
  if (rawFlag & 0x80) diagnostics.push("reserved-bit-7-set");
  return {
    verdict: (rawFlag & 0x10) ? "unknown" : (rawFlag & 0x08) ? "fail" : "pass",
    completion: (rawFlag & 0x04) ? "abnormal" : "normal",
    supersession: { byPartId, byCoordinates },
    diagnostics,
    raw: rawFlag,
  };
}

/**
 * PARM_FLG has the same bit definitions in PTR and MPR. These are recorded
 * indications, not recalculated comparisons or a replacement TEST_FLG verdict.
 */
export function decodeParametricFlags(rawFlag: number): DecodedParametricFlags {
  requireByte(rawFlag, "PARM_FLG");
  const diagnostics: string[] = [];
  if (rawFlag & 0x01) diagnostics.push("scale-error");
  if (rawFlag & 0x02) diagnostics.push("drift-error");
  if (rawFlag & 0x04) diagnostics.push("oscillation");
  return {
    scaleError: Boolean(rawFlag & 0x01),
    driftError: Boolean(rawFlag & 0x02),
    oscillation: Boolean(rawFlag & 0x04),
    aboveHighLimit: Boolean(rawFlag & 0x08),
    belowLowLimit: Boolean(rawFlag & 0x10),
    passedAlternateLimits: Boolean(rawFlag & 0x20),
    lowLimitEqualityPass: Boolean(rawFlag & 0x40),
    highLimitEqualityPass: Boolean(rawFlag & 0x80),
    diagnostics,
    raw: rawFlag,
  };
}

/**
 * PTR-only eligibility stated at specification lines 1963–1977. This does not
 * test the actual result for NaN/Infinity, apply exclusions, or infer a verdict.
 * The MPR section does not specify an equivalent per-array-element rule; do
 * not reuse this helper for MPR child results.
 */
export function decodePtrNumericEligibility(rawTestFlag: number, rawParametricFlag: number): {
  validity: "valid" | "invalid";
  diagnostics: string[];
  rawTestFlag: number;
  rawParametricFlag: number;
} {
  const testFlags = decodeTestFlags("PTR", rawTestFlag);
  const parametricFlags = decodeParametricFlags(rawParametricFlag);
  return {
    validity: (rawTestFlag & 0x3f) || (rawParametricFlag & 0x07) ? "invalid" : "valid",
    diagnostics: [
      ...testFlags.diagnostics.filter(diagnostic => diagnostic !== "no-pass-fail-indication"),
      ...parametricFlags.diagnostics,
    ],
    rawTestFlag,
    rawParametricFlag,
  };
}
