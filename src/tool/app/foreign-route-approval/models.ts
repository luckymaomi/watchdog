export type WorkbookApi = typeof import("xlsx-js-style");
export type SourceKind = "open" | "temporary";
export interface Issue {
  severity: "error" | "warning";
  message: string;
  source: string;
  sourceRow?: number;
}
export interface Approval {
  company: string;
  stationA: string;
  stationB: string;
  go: string;
  back: string;
  tw: string;
  source: string;
  sourceRow: number;
}
export interface ParsedSource { rows: Approval[]; issues: Issue[] }
export interface AirportCatalog { ports: Map<string, string>; multi: Map<string, string[]> }
export interface Leg {
  company: string;
  left: string;
  right: string;
  code: string;
  tw: string;
  multi: boolean;
  source: string;
  sourceRow: number;
}
export interface Analysis {
  merged: Approval[];
  go: Leg[];
  back: Leg[];
  issues: Issue[];
  openCount: number;
  temporaryCount: number;
  skippedBack: number;
  multiCount: number;
}
export interface ExportOptions { effective: string; expiry: string; season: string }
export const TEMPLATE_URL = "../../../template/foreign-route-approval/approval-template.xlsx";
export const SHEETS = ["开放与临开合并", "去程", "回程", "机场列表", "俄罗斯机场列表"] as const;
