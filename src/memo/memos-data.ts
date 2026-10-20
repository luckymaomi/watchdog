import type { MemoItem } from "./models";

export const memoItems: MemoItem[] = [
  { name: "每天看", path: "memos/01/MEMO.md", audience: "human" },
  { name: "资质录入、统计与发布", path: "memos/02/MEMO.md", audience: "human" },
  { name: "资质代码", path: "memos/03/MEMO.md", audience: "human" },
  { name: "特殊机场资格代码", path: "memos/04/MEMO.md", audience: "human" },
  { name: "危险品培训录入", path: "memos/07/MEMO.md", audience: "human" },
  {
    name: "副驾驶流转更新",
    path: "memos/08/MEMO.md",
    audience: "agent",
    downloadName: "skill-副驾驶流转更新.md"
  },
  {
    name: "检查单手册比对填写",
    path: "memos/09/MEMO.md",
    audience: "agent",
    downloadName: "skill-检查单手册比对填写.md"
  }
];
