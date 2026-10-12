export const FONT_STACKS = {
  song: '"SimSun", "Songti SC", serif',
  hei: '"SimHei", "Heiti SC", sans-serif',
  fang: '"FangSong", "STFangsong", serif',
  kai: '"KaiTi", "STKaiti", serif',
  zhuque: '"SealZhuque", serif',
  wenkai: '"SealWenkai", serif',
  notoSerif: '"SealNotoSerif", serif',
  notoSans: '"SealNotoSans", sans-serif',
  xiaowei: '"SealXiaowei", serif'
} as const;

export interface SealOptions {
  company: string;
  caption: string;
  code: string;
  color: string;
  font: keyof typeof FONT_STACKS;
  diameterMm: number;
  dpi: number;
  borderMm: number;
  nameSize: number;
  nameArc: number;
  star: boolean;
  starSize: number;
  codeMode: "arc" | "line";
  nameRadius: number;
  nameWidth: number;
  nameRotation: number;
  starRotation: number;
  starX: number;
  starY: number;
  captionSize: number;
  captionY: number;
  codeSize: number;
  codeRadius: number;
  codeArc: number;
  codeY: number;
  codeFont: keyof typeof FONT_STACKS;
  captionFont: keyof typeof FONT_STACKS;
  codeWidth: number;
  codeRotation: number;
  borderRadius: number;
}

export const DEFAULT_OPTIONS: Readonly<SealOptions> = {
  company: "示例科技有限公司", caption: "", code: "", color: "#d40000", font: "song",
  diameterMm: 40, dpi: 300, borderMm: 0.6, nameSize: 46, nameArc: 240,
  star: true, starSize: 70, codeMode: "arc", nameRadius: 210, nameWidth: 100, nameRotation: 0,
  starRotation: 0, starX: 250, starY: 235, captionSize: 36, captionY: 355,
  codeSize: 18, codeRadius: 208, codeArc: 85, codeY: 435, codeFont: "notoSans", captionFont: "song",
  codeWidth: 100, codeRotation: 0, borderRadius: 245
};

export interface Point { x: number; y: number }
export interface ArcGlyph extends Point { char: string; rotation: number }
export interface SealResult {
  svg: string;
  errors: string[];
  warnings: string[];
  pixelSize: number;
  nameFontSize: number;
}

/** 上弧沿左下 -> 顶部 -> 右下；下弧沿左下 -> 底部 -> 右下。 */
export function layoutArcText(text: string, radius: number, span: number, bottom: boolean): ArcGlyph[] {
  const chars = Array.from(text);
  return chars.map((char, index) => {
    const fraction = chars.length === 1 ? 0 : index / (chars.length - 1) - 0.5;
    const angle = bottom ? 90 - fraction * span : -90 + fraction * span;
    const radians = angle * Math.PI / 180;
    return {
      char, x: 250 + Math.cos(radians) * radius, y: 250 + Math.sin(radians) * radius,
      rotation: bottom ? angle - 90 : angle + 90
    };
  });
}

export function starPoints(cx: number, cy: number, radius: number): Point[] {
  return Array.from({ length: 10 }, (_, index) => {
    const radians = (-90 + index * 36) * Math.PI / 180;
    const length = radius * (index % 2 ? 0.382 : 1);
    return { x: cx + Math.cos(radians) * length, y: cy + Math.sin(radians) * length };
  });
}

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
}

function number(value: number): string { return value.toFixed(3).replace(/\.?0+$/, ""); }

function arcSvg(glyphs: ArcGlyph[], size: number, width = 1): string {
  return glyphs.map((glyph) => `<text transform="translate(${number(glyph.x)} ${number(glyph.y)}) rotate(${number(glyph.rotation)}) scale(${number(width)} 1)" font-size="${number(size)}">${xml(glyph.char)}</text>`).join("");
}

export function buildSeal(options: SealOptions): SealResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  // 控制字符在 trim 之前检查，避免非法输入被静默抹掉。
  for (const [label, text, limit] of [
    ["单位名称", options.company, 60], ["章名", options.caption, 20], ["编号", options.code, 40]
  ] as const) {
    if (/[\u0000-\u001f\u007f-\u009f\ufffe\uffff]/u.test(text) || /[\ud800-\udfff]/u.test(text)) errors.push(`${label}含不支持的控制字符。`);
    if (Array.from(text.trim()).length > limit) errors.push(`${label}最多 ${limit} 个字。`);
  }
  const company = options.company.trim();
  const caption = options.caption.trim();
  const code = options.code.trim();
  if (!company) errors.push("请填写单位名称。");
  if (!/^#[0-9a-f]{6}$/i.test(options.color)) errors.push("请选择有效的印章颜色。");
  if (![options.font, options.captionFont, options.codeFont].every((font) => Object.prototype.hasOwnProperty.call(FONT_STACKS, font))) errors.push("请选择列表中的字体。");
  if (!["arc", "line"].includes(options.codeMode)) errors.push("请选择有效的编号排版。");
  for (const [label, value, min, max] of [
    ["直径", options.diameterMm, 20, 60], ["清晰度", options.dpi, 150, 600]
  ] as const) {
    if (!Number.isFinite(value) || value < min || value > max) errors.push(`${label}须在 ${min} 至 ${max} 之间。`);
  }
  for (const [label, value, positive] of [
    ["边框粗细", options.borderMm, true], ["名称字号", options.nameSize, true],
    ["名称弧度", options.nameArc, true], ["五角星大小", options.starSize, true],
    ["名称半径", options.nameRadius, true], ["名称字宽", options.nameWidth, true],
    ["名称旋转", options.nameRotation, false], ["五角星旋转", options.starRotation, false],
    ["五角星横向位置", options.starX, false], ["五角星纵向位置", options.starY, false],
    ["章名字号", options.captionSize, true], ["章名位置", options.captionY, false],
    ["编号字号", options.codeSize, true], ["编号半径", options.codeRadius, true],
    ["编号弧度", options.codeArc, true], ["编号位置", options.codeY, false],
    ["编号字宽", options.codeWidth, true], ["编号旋转", options.codeRotation, false],
    ["圆圈半径", options.borderRadius, true]
  ] as const) {
    if (!Number.isFinite(value) || (positive && value <= 0)) errors.push(`${label}须为${positive ? "大于 0 的" : "有效的"}数字。`);
  }
  if (typeof options.star !== "boolean") errors.push("五角星选项无效。");
  if (![150, 300, 600].includes(options.dpi)) errors.push("请选择 150、300 或 600 DPI。");
  if (errors.length) return { svg: "", errors, warnings, pixelSize: 0, nameFontSize: 0 };

  const stroke = options.borderMm * 500 / options.diameterMm;
  const radius = options.borderRadius;
  const nameRadius = options.nameRadius;
  const nameFontSize = options.nameSize;
  const pixelSize = Math.round(options.diameterMm / 25.4 * options.dpi);
  const parts = [`<circle cx="250" cy="250" r="${number(radius)}" fill="none" stroke="${options.color}" stroke-width="${number(stroke)}"/>`];
  if (radius + stroke / 2 > 250 || nameRadius + nameFontSize / 2 > 250) warnings.push("部分图形可能超出画布，超出部分不会导出。可自行调小或移回。" );
  parts.push(`<g transform="rotate(${number(options.nameRotation)} 250 250)">${arcSvg(layoutArcText(company, nameRadius, options.nameArc, false), nameFontSize, options.nameWidth / 100)}</g>`);
  if (options.star) parts.push(`<polygon transform="rotate(${number(options.starRotation)} ${number(options.starX)} ${number(options.starY)})" points="${starPoints(options.starX, options.starY, options.starSize).map((point) => `${number(point.x)},${number(point.y)}`).join(" ")}"/>`);
  if (caption) {
    const size = options.captionSize;
    parts.push(`<text x="250" y="${number(options.captionY)}" font-family="${xml(FONT_STACKS[options.captionFont])}" font-size="${number(size)}">${xml(caption)}</text>`);
  }
  if (code) {
    const size = options.codeSize;
    parts.push(`<g font-family="${xml(FONT_STACKS[options.codeFont])}" transform="rotate(${number(options.codeRotation)} 250 250)">`);
    if (options.codeMode === "arc") parts.push(arcSvg(layoutArcText(code, options.codeRadius, options.codeArc, true), size, options.codeWidth / 100));
    else parts.push(`<text transform="translate(250 ${number(options.codeY)}) scale(${number(options.codeWidth / 100)} 1)" font-size="${number(size)}">${xml(code)}</text>`);
    parts.push("</g>");
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${options.diameterMm}mm" height="${options.diameterMm}mm" viewBox="0 0 500 500" role="img" aria-label="${xml(company)}印章"><g fill="${options.color}" font-family="${xml(FONT_STACKS[options.font])}" font-weight="normal" text-anchor="middle" dominant-baseline="central">${parts.join("")}</g></svg>`;
  return { svg, errors, warnings, pixelSize, nameFontSize };
}
