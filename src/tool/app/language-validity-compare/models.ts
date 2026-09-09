export type Language = "英语" | "汉语";
export type SourceType = "personnel" | "caac";

export type LanguageStatus =
  | "双方一致"
  | "日期不一致"
  | "仅人员信息"
  | "仅局方数据"
  | "均无有效期"
  | "人员未匹配"
  | "局方未匹配";

export type IssueKind =
  | "missing-name"
  | "duplicate-name"
  | "missing-employee-id"
  | "missing-pilot-id"
  | "invalid-date-value"
  | "invalid-note-date"
  | "missing-language-note";

export interface LanguageValue {
  raw: string;
  date: string;
}

export interface PersonnelRecord {
  source: "personnel";
  employeeId: string;
  name: string;
  english: LanguageValue;
  chinese: LanguageValue;
  sheetName: string;
  rowNumber: number;
}

export interface CaacRecord {
  source: "caac";
  pilotId: string;
  name: string;
  english: LanguageValue;
  chinese: LanguageValue;
  note: string;
  sheetName: string;
  rowNumber: number;
}

export interface LanguageIssue {
  kind: IssueKind;
  source: SourceType;
  message: string;
  sheetName: string;
  rowNumber?: number;
  name?: string;
  identifier?: string;
  language?: Language;
}

export interface ParsedPersonnelWorkbook {
  source: "personnel";
  sheetName: string;
  headerRowNumber: number;
  records: PersonnelRecord[];
  issues: LanguageIssue[];
}

export interface ParsedCaacWorkbook {
  source: "caac";
  sheetName: string;
  headerRowNumber: number;
  records: CaacRecord[];
  issues: LanguageIssue[];
}

export interface LanguageDetail {
  name: string;
  language: Language;
  status: LanguageStatus;
  personnelValue: string;
  caacValue: string;
  personnelDate: string;
  caacDate: string;
  employeeId: string;
  pilotId: string;
  personnelSource: string;
  caacSource: string;
  nameMatched: boolean;
}

export interface LanguageSummary {
  language: Language;
  personnelPeople: number;
  caacPeople: number;
  matchedPeople: number;
  sameCount: number;
  dateDifferenceCount: number;
  attentionCount: number;
}

export interface LanguageComparisonResult {
  summaries: LanguageSummary[];
  details: LanguageDetail[];
  issues: LanguageIssue[];
  totals: {
    personnelPeople: number;
    caacPeople: number;
    matchedPeople: number;
    personnelOnlyPeople: number;
    caacOnlyPeople: number;
    attentionCount: number;
    issueCount: number;
  };
}
