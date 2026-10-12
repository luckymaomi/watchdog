import { FONT_STACKS, type SealOptions } from "./logic";

export const BUNDLED_FONTS = {
  zhuque: { label: "朱雀仿宋", family: "SealZhuque", url: "./fonts/zhuque.woff2", license: "./fonts/zhuque-OFL.txt" },
  wenkai: { label: "霞鹜文楷", family: "SealWenkai", url: "./fonts/wenkai.woff2", license: "./fonts/wenkai-OFL.txt" },
  notoSerif: { label: "思源宋体（Noto）", family: "SealNotoSerif", url: "./fonts/noto-serif.woff2", license: "./fonts/noto-serif-OFL.txt" },
  notoSans: { label: "思源黑体（Noto）", family: "SealNotoSans", url: "./fonts/noto-sans.woff2", license: "./fonts/noto-sans-OFL.txt" },
  xiaowei: { label: "站酷小薇", family: "SealXiaowei", url: "./fonts/xiaowei.woff2", license: "./fonts/xiaowei-OFL.txt" }
} as const;

type FontKey = keyof typeof FONT_STACKS;
type BundledKey = keyof typeof BUNDLED_FONTS;
interface LoadedFont { base64: string; license: string }
const cache = new Map<BundledKey, Promise<LoadedFont>>();

function isBundled(key: FontKey): key is BundledKey { return key in BUNDLED_FONTS; }

export function usedFonts(options: SealOptions): FontKey[] {
  return [...new Set([options.font, ...(options.caption.trim() ? [options.captionFont] : []), ...(options.code.trim() ? [options.codeFont] : [])])];
}

async function loadFont(key: BundledKey): Promise<LoadedFont> {
  const font = BUNDLED_FONTS[key];
  const responses = await Promise.all([fetch(font.url), fetch(font.license)]);
  if (responses.some((response) => !response.ok)) throw new Error(`${font.label}加载失败，请重试或换一种字体。`);
  const bytes = await responses[0].arrayBuffer();
  const license = await responses[1].text();
  const face = new FontFace(font.family, bytes);
  await face.load();
  // 当前 DOM 类型库未声明 FontFaceSet.add，明确补齐这个浏览器边界。
  (document.fonts as FontFaceSet & { add(font: FontFace): FontFaceSet }).add(face);
  const data = new Uint8Array(bytes);
  let binary = "";
  for (let index = 0; index < data.length; index += 8192) binary += String.fromCharCode(...data.subarray(index, index + 8192));
  return { base64: btoa(binary), license };
}

function cachedFont(key: BundledKey): Promise<LoadedFont> {
  let loading = cache.get(key);
  if (!loading) {
    loading = loadFont(key).catch((error: unknown) => { cache.delete(key); throw error; });
    cache.set(key, loading);
  }
  return loading;
}

export async function ensureFonts(options: SealOptions): Promise<void> {
  await Promise.all(usedFonts(options).filter(isBundled).map(cachedFont));
}

export function embedFontData(svg: string, fonts: Array<{ family: string; base64: string; license: string }>): string {
  const escape = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const style = fonts.map((font) => `@font-face{font-family:'${font.family}';src:url(data:font/woff2;base64,${font.base64}) format('woff2');font-weight:400;font-style:normal;}`).join("");
  const licenses = fonts.map((font) => `${font.family}\n${font.license}`).join("\n\n");
  return svg.replace(/<svg\b[^>]*>/, (root) => `${root}<metadata>${escape(licenses)}</metadata><defs><style>${style}</style></defs>`);
}

/** 把实际选择的内置字体和授权一起写入 SVG，PNG 使用同一文件。 */
export async function portableSvg(svg: string, options: SealOptions): Promise<string> {
  const fonts = await Promise.all(usedFonts(options).filter(isBundled).map(async (key) => ({
    family: BUNDLED_FONTS[key].family, ...await cachedFont(key)
  })));
  return embedFontData(svg, fonts);
}
