import type { CaacRecord, Language, LanguageComparisonResult, LanguageDetail, LanguageStatus, LanguageValue, ParsedCaacWorkbook, ParsedPersonnelWorkbook, PersonnelRecord } from "./models";

const languages: Language[] = ["英语", "汉语"];

function sourceLabel(record: PersonnelRecord | CaacRecord | undefined): string {
  return record ? `${record.sheetName} 第${record.rowNumber}行` : "";
}

function recordValue(record: PersonnelRecord | CaacRecord, language: Language): LanguageValue {
  return language === "英语" ? record.english : record.chinese;
}

function compareValues(personnel: LanguageValue | undefined, caac: LanguageValue | undefined, matched: boolean): LanguageStatus {
  if (!matched) return personnel ? "人员未匹配" : "局方未匹配";
  const personnelDate = personnel?.date || "";
  const caacDate = caac?.date || "";
  if (personnelDate && caacDate) return personnelDate === caacDate ? "双方一致" : "日期不一致";
  if (personnelDate) return "仅人员信息";
  if (caacDate) return "仅局方数据";
  return "均无有效期";
}

export function compareLanguageValidity(personnel: ParsedPersonnelWorkbook, caac: ParsedCaacWorkbook): LanguageComparisonResult {
  const issues = [...personnel.issues, ...caac.issues];
  const personnelMap = new Map<string, PersonnelRecord>();
  const caacMap = new Map<string, CaacRecord>();
  personnel.records.forEach((record) => { if (!personnelMap.has(record.name)) personnelMap.set(record.name, record); });
  caac.records.forEach((record) => { if (!caacMap.has(record.name)) caacMap.set(record.name, record); });
  const names = [...new Set([...personnelMap.keys(), ...caacMap.keys()])];
  const details: LanguageDetail[] = [];
  for (const name of names) {
    const personnelRecord = personnelMap.get(name);
    const caacRecord = caacMap.get(name);
    for (const language of languages) {
      const personnelValue = personnelRecord ? recordValue(personnelRecord, language) : undefined;
      const caacValue = caacRecord ? recordValue(caacRecord, language) : undefined;
      details.push({
        name,
        language,
        status: compareValues(personnelValue, caacValue, Boolean(personnelRecord && caacRecord)),
        personnelValue: personnelValue?.raw || "",
        caacValue: caacValue?.raw || "",
        personnelDate: personnelValue?.date || "",
        caacDate: caacValue?.date || "",
        employeeId: personnelRecord?.employeeId || "",
        pilotId: caacRecord?.pilotId || "",
        personnelSource: sourceLabel(personnelRecord),
        caacSource: sourceLabel(caacRecord),
        nameMatched: Boolean(personnelRecord && caacRecord)
      });
    }
  }
  const attentionStatuses = new Set<LanguageStatus>(["日期不一致", "仅人员信息", "仅局方数据", "人员未匹配", "局方未匹配"]);
  const summaries = languages.map((language) => {
    const rows = details.filter((detail) => detail.language === language);
    return {
      language,
      personnelPeople: personnel.records.length,
      caacPeople: caac.records.length,
      matchedPeople: names.filter((name) => personnelMap.has(name) && caacMap.has(name)).length,
      sameCount: rows.filter((row) => row.status === "双方一致" || row.status === "均无有效期").length,
      dateDifferenceCount: rows.filter((row) => row.status === "日期不一致").length,
      attentionCount: rows.filter((row) => attentionStatuses.has(row.status)).length
    };
  });
  const personnelOnlyPeople = names.filter((name) => personnelMap.has(name) && !caacMap.has(name)).length;
  const caacOnlyPeople = names.filter((name) => !personnelMap.has(name) && caacMap.has(name)).length;
  return {
    summaries,
    details,
    issues,
    totals: {
      personnelPeople: personnelMap.size,
      caacPeople: caacMap.size,
      matchedPeople: names.filter((name) => personnelMap.has(name) && caacMap.has(name)).length,
      personnelOnlyPeople,
      caacOnlyPeople,
      attentionCount: details.filter((detail) => attentionStatuses.has(detail.status)).length,
      issueCount: issues.length
    }
  };
}
