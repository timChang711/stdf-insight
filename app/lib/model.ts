import type { SourceCoverage } from "./record-coverage.ts";
import type { TypedTest, PinMapping, RecordDiagnostic, RecordReference, RecordedVerdict } from "./typed-records.ts";

export type Measurement = { value: number; site: number; partIndex: number; pass: boolean; x: number; y: number };
export type TestData = { id: number; name: string; unit: string; low: number | null; high: number | null; values: Measurement[] };
export type PartData = { index: number; site: number; hardBin: number; softBin: number; pass: boolean; x: number; y: number; testTimeMs: number; values: Record<number, number>; firstFailTestId: number | null; head?: number; rawFlags?: number; recordedVerdict?: RecordedVerdict; record?: RecordReference };
export type WaferGeometry = { waferSize: number | null; dieWidth: number | null; dieHeight: number | null; units: number | null };
export type RunData = { fileName: string; fileSize: number; lotId: string; device: string; program: string; tester: string; startTime: Date; finishTime: Date; waferId: string; tests: TestData[]; parts: PartData[]; source: "demo" | "file"; waferGeometry?: WaferGeometry; ignoredRecords?: { ftr:number; mpr:number }; recordCoverage?: SourceCoverage; typedTests?: TypedTest[]; pins?: PinMapping[]; recordDiagnostics?: RecordDiagnostic[] };
