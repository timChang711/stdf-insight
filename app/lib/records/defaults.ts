export type DefaultRecordKind = "FTR" | "MPR";
export type ResolvedRecordDefaults = {
  effective: Record<string, unknown>;
  /** Field -> ordinal of the first record supplying its default. */
  inherited: Record<string, number>;
};

const FTR_DEFAULT_FIELDS = ["PATG_NUM", "SPIN_MAP"] as const;
const FTR_INVALID_FIELDS = [
  ["CYCL_CNT"], ["REL_VADR"], ["REPT_CNT"], ["NUM_FAIL"], ["XFAIL_AD", "YFAIL_AD"], ["VECT_OFF"],
] as const;
const MPR_DEFAULT_FIELDS = [
  "OPT_FLAG", "RES_SCAL", "LLM_SCAL", "HLM_SCAL", "LO_LIMIT", "HI_LIMIT",
  "START_IN", "INCR_IN", "RTN_INDX", "UNITS", "UNITS_IN", "C_RESFMT",
  "C_LLMFMT", "C_HLMFMT", "LO_SPEC", "HI_SPEC",
] as const;

function isBlank(kind: DefaultRecordKind, field: string, value: unknown): boolean {
  if (value === undefined || value === "") return true;
  // C*n length one containing NUL is an explicit null override, not blank.
  // Spaces are also real C*n content and must not be trimmed into inheritance.
  if (kind === "FTR" && field === "PATG_NUM") return value === 255;
  if (kind === "FTR" && field === "SPIN_MAP") {
    return typeof value === "object" && value !== null && "bitCount" in value && value.bitCount === 0;
  }
  return field === "RTN_INDX" && Array.isArray(value) && value.length === 0;
}

type FieldAction = "local-or-inherit" | "inherit" | "unavailable";

function mprFieldAction(field: string, optFlag: number): FieldAction {
  // 'No limit' takes priority over the separate 'use default limit' flag.
  if ((field === "LO_LIMIT" || field === "LLM_SCAL") && (optFlag & 0x40)) return "unavailable";
  if ((field === "HI_LIMIT" || field === "HLM_SCAL") && (optFlag & 0x80)) return "unavailable";
  if (field === "LO_SPEC" && (optFlag & 0x04)) return "unavailable";
  if (field === "HI_SPEC" && (optFlag & 0x08)) return "unavailable";
  if ((field === "START_IN" || field === "INCR_IN") && (optFlag & 0x02)) return "unavailable";
  // These flags explicitly request the first MPR's default value in the spec.
  if (field === "RES_SCAL" && (optFlag & 0x01)) return "inherit";
  if ((field === "LO_LIMIT" || field === "LLM_SCAL") && (optFlag & 0x10)) return "inherit";
  if ((field === "HI_LIMIT" || field === "HLM_SCAL") && (optFlag & 0x20)) return "inherit";
  return "local-or-inherit";
}

/**
 * One resolver per record kind and test number, in original stream order.
 *
 * Source: original STDF V4 specification, workspace artifacts/Stdf-V4-spec.txt.
 * General missing data: 466–484. MPR defaults: 2169–2188, OPT_FLAG: 2279–2299.
 * FTR defaults: 2384–2392; PATG_NUM=255 and empty SPIN_MAP: table on p.55.
 *
 * Only the first record establishes defaults. Later records may override them
 * locally, including an explicit one-byte NUL string; they never fill in or
 * replace missing first-record defaults. OPT_FLAG itself is an MPR default.
 *
 * Effective data overlays these specific default fields. Fields explicitly
 * marked unavailable/no-limit are absent from effective data; unchanged raw
 * data retains their bytes/values. FTR OPT_FLAG bits 0-5 also remove invalid
 * counts/addresses from effective data (specification lines 2426-2433).
 * The specification gives invalid VECT_OFF an interpreted default of zero;
 * this evidence view leaves it absent instead of displaying an invented raw
 * offset. The unchanged raw VECT_OFF and OPT_FLAG remain available to inspect.
 * Other fields are not normalized here.
 * No limits, scaling, array alignment, outcomes or identity policies are inferred.
 * Values/arrays remain shared with decoded source data and must be treated as
 * immutable by callers. Only the outer effective/inherited objects are new.
 */
export function createRecordDefaults(kind: DefaultRecordKind): {
  resolve(raw: Record<string, unknown>, present: string[], recordOrdinal: number): ResolvedRecordDefaults;
} {
  if (kind !== "FTR" && kind !== "MPR") throw new RangeError("Default record kind must be FTR or MPR");
  const fields = kind === "FTR" ? FTR_DEFAULT_FIELDS : MPR_DEFAULT_FIELDS;
  const defaults: Record<string, unknown> = {};
  let initialized = false;
  let defaultOrdinal = 0;

  return {
    resolve(raw, present, recordOrdinal) {
      if (!Number.isSafeInteger(recordOrdinal) || recordOrdinal < 0) throw new RangeError("Record ordinal must be a nonnegative safe integer");
      const firstRecord = !initialized;
      const available = new Set(present);
      const effective = { ...raw };
      const inherited: Record<string, number> = {};

      // OPT_FLAG is resolved first, so all subsequent MPR fields use this
      // record's override or the FIRST record's flags, never a previous local.
      for (const field of fields) {
        const optFlag = typeof effective.OPT_FLAG === "number" ? effective.OPT_FLAG : 0;
        const action = kind === "MPR" ? mprFieldAction(field, optFlag) : "local-or-inherit";
        const hasLocal = available.has(field) && !isBlank(kind, field, raw[field]);
        if (action === "unavailable") {
          delete effective[field];
        } else if (action === "local-or-inherit" && hasLocal) {
          effective[field] = raw[field];
        } else if (Object.hasOwn(defaults, field)) {
          effective[field] = defaults[field];
          inherited[field] = defaultOrdinal;
        } else {
          delete effective[field];
        }
      }

      if (kind === "FTR" && available.has("OPT_FLAG") && typeof raw.OPT_FLAG === "number") {
        for (let bit = 0; bit < FTR_INVALID_FIELDS.length; bit++) {
          if (raw.OPT_FLAG & (1 << bit)) {
            for (const field of FTR_INVALID_FIELDS[bit]) delete effective[field];
          }
        }
      }

      if (firstRecord) {
        for (const field of fields) if (Object.hasOwn(effective, field)) defaults[field] = effective[field];
        defaultOrdinal = recordOrdinal;
        initialized = true;
      }
      return { effective, inherited };
    },
  };
}
