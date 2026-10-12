/** 写入 PNG 像素密度，避免 Canvas 固定 96 DPI 导致插入文档时尺寸不符。 */
export function pngWithDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  if (![150, 300, 600].includes(dpi)) throw new Error("PNG 清晰度无效。");
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) throw new Error("PNG 文件无效。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Uint8Array[] = [bytes.subarray(0, 8)];
  let inserted = false;
  let ended = false;
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) throw new Error("PNG 文件不完整。");
    const length = view.getUint32(offset);
    const end = offset + length + 12;
    if (end > bytes.length) throw new Error("PNG 数据段不完整。");
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!inserted && (type === "IDAT" || type === "IEND")) {
      chunks.push(densityChunk(dpi));
      inserted = true;
    }
    if (type !== "pHYs") chunks.push(bytes.subarray(offset, end));
    if (type === "IEND") ended = true;
    offset = end;
  }
  if (!inserted || !ended) throw new Error("PNG 缺少必要的数据段。");
  const output = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let position = 0;
  for (const chunk of chunks) { output.set(chunk, position); position += chunk.length; }
  return output;
}

function densityChunk(dpi: number): Uint8Array {
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4); // pHYs
  const pixelsPerMeter = Math.round(dpi / 0.0254);
  view.setUint32(8, pixelsPerMeter);
  view.setUint32(12, pixelsPerMeter);
  chunk[16] = 1;
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  view.setUint32(17, (crc ^ 0xffffffff) >>> 0);
  return chunk;
}
