import type { SecurityPerson } from "./template";
export type SecurityKind = "initial" | "recurrent";
export interface SecurityInput {
    kind: string;
    instructor: string;
    chinaDate: string;
    tsaDate: string;
    permitDate: string;
    sourceText: string;
}
export interface SecurityDraft {
    kind: SecurityKind;
    instructor: string;
    chinaDate: string;
    tsaDate: string;
    permitDate: string;
    participants: SecurityPerson[];
    issues: { severity: "error" | "info"; message: string }[];
}
