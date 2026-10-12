import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  CheckCircle,
  Circle,
  CreditCard,
  DownloadSimple,
  LockKey,
  QrCode,
  SealCheck,
  Scissors,
  SlidersHorizontal,
  Square,
  X,
} from "@phosphor-icons/react";

const CANVAS_SIZE = 900;
const PAID_PRICE_LABEL = "¥2.99";
const DEFAULT_SETTINGS = {
  inkStrength: 0.92,
  shape: "circle",
  sealType: "company",
  mainText: "示例科技有限公司",
  bottomText: "合同专用章",
  antiCodeEnabled: false,
  antiCodeText: "NO.20260529",
  centerText: "★",
  headText: "电子印章",
  fontFamily: "default",
  lineWidth: 10,
  borderMode: "double",
  sealSize: 300,
  sealColor: "#b52323",
  aging: true,
  agingStrength: 10,
  mainTextSize: 100,
  bottomTextSize: 100,
  headTextSize: 100,
  centerTextSize: 100,
  mainTextArc: 100,
  bottomTextArc: 100,
  mainTextSpacing: 100,
  bottomTextSpacing: 100,
  mainTextMargin: 100,
  bottomTextMargin: 100,
  headTextMargin: 100,
  mainTextBold: true,
  bottomTextBold: true,
  watermarkText: "试用水印",
  watermarkOpacity: 18,
};
const STORAGE_KEY = "electronic-seal-generator-settings";
const PAYMENT_STORAGE_KEY = "electronic-seal-generator-paid-unlock";

const shapeOptions = [
  { value: "none", label: "无", icon: Scissors },
  { value: "circle", label: "圆章", icon: Circle },
  { value: "ellipse", label: "椭圆", icon: Circle },
  { value: "square", label: "方章", icon: Square },
];

const sealTypeOptions = [
  { value: "company", label: "公章" },
  { value: "private", label: "私章" },
];

const borderModeOptions = [
  { value: "single", label: "单线条" },
  { value: "double", label: "双线条" },
];

const fontOptions = [
  { value: "default", label: "默认" },
  { value: "yahei", label: "微软雅黑" },
  { value: "songti", label: "宋体" },
  { value: "heiti", label: "黑体" },
  { value: "kaiti", label: "楷体" },
  { value: "fangsong", label: "仿宋" },
];

const fontStacks = {
  default: '"PingFang SC", "Microsoft YaHei", sans-serif',
  yahei: '"Microsoft YaHei", "PingFang SC", sans-serif',
  songti: '"SimSun", "Songti SC", serif',
  heiti: '"SimHei", "Heiti SC", sans-serif',
  kaiti: '"KaiTi", "Kaiti SC", serif',
  fangsong: '"FangSong", "FangSong_GB2312", serif',
};

function getFontStack(fontFamily) {
  return fontStacks[fontFamily] || fontStacks.default;
}

function drawGuide(ctx, size, settings, alpha = 0.5) {
  const { shape, lineWidth, sealColor, borderMode } = settings;
  if (shape === "none") return;

  const margin = Math.round(size * 0.07);
  ctx.save();
  ctx.strokeStyle = sealColor;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = Math.max(4, lineWidth);
  ctx.lineJoin = "round";

  if (shape === "circle") {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - margin, 0, Math.PI * 2);
    ctx.stroke();
    if (borderMode === "single") {
      ctx.restore();
      return;
    }
    ctx.lineWidth = Math.max(2, lineWidth * 0.42);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - margin - lineWidth * 2.8, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shape === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(size / 2, size / 2, size / 2 - margin, (size / 2 - margin) * 0.75, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (borderMode === "single") {
      ctx.restore();
      return;
    }
    ctx.lineWidth = Math.max(2, lineWidth * 0.42);
    ctx.beginPath();
    ctx.ellipse(size / 2, size / 2, size / 2 - margin - lineWidth * 2.8, (size / 2 - margin - lineWidth * 2.8) * 0.75, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeRect(margin, margin, size - margin * 2, size - margin * 2);
    if (borderMode === "single") {
      ctx.restore();
      return;
    }
    ctx.lineWidth = Math.max(2, lineWidth * 0.42);
    ctx.strokeRect(margin + lineWidth * 2.4, margin + lineWidth * 2.4, size - (margin + lineWidth * 2.4) * 2, size - (margin + lineWidth * 2.4) * 2);
  }

  ctx.restore();
}

function drawArcText(ctx, text, centerX, centerY, radius, startAngle, endAngle, fontSize, color, options = {}) {
  const chars = [...text.trim()];
  if (!chars.length) return;

  const reverse = Boolean(options.reverse);
  const weight = options.bold === false ? 500 : 800;
  const span = (endAngle - startAngle) * (options.spacing ?? 1);
  const mid = (startAngle + endAngle) / 2;
  const adjustedStart = mid - span / 2;
  const step = chars.length === 1 ? 0 : span / (chars.length - 1);

  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${weight} ${fontSize}px ${getFontStack(options.fontFamily)}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  chars.forEach((char, index) => {
    const angle = adjustedStart + step * index;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(reverse ? angle - Math.PI / 2 : angle + Math.PI / 2);
    ctx.fillText(char, 0, 0);
    ctx.restore();
  });

  ctx.restore();
}

function drawCenteredText(ctx, text, x, y, maxWidth, fontSize, color, weight = 800, fontFamily = "default") {
  const content = text.trim();
  if (!content) return;

  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${weight} ${fontSize}px ${getFontStack(fontFamily)}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let nextSize = fontSize;
  while (ctx.measureText(content).width > maxWidth && nextSize > 22) {
    nextSize -= 2;
    ctx.font = `${weight} ${nextSize}px ${getFontStack(fontFamily)}`;
  }

  ctx.fillText(content, x, y);
  ctx.restore();
}

function drawAntiCode(ctx, settings, center, scale, radius, color) {
  if (!settings.antiCodeEnabled || !settings.antiCodeText.trim()) return;

  const y = center + 185 * scale;
  drawCenteredText(ctx, settings.antiCodeText, center, y, radius * 1.1, 28 * scale, color, 700, settings.fontFamily);
}

function applyAging(ctx, size, strength = 0.12) {
  const image = ctx.getImageData(0, 0, size, size);
  for (let index = 0; index < image.data.length; index += 4) {
    const alpha = image.data[index + 3];
    if (!alpha) continue;

    const pixel = index / 4;
    const x = pixel % size;
    const y = Math.floor(pixel / size);
    const noise = ((x * 37 + y * 19 + ((x * y) % 47)) % 100) / 100;
    if (noise < strength) image.data[index + 3] = Math.max(0, alpha - 150);
  }
  ctx.putImageData(image, 0, 0);
}

function drawTrialWatermark(ctx, size, settings) {
  const text = settings.watermarkText.trim() || "试用水印";
  const opacity = Math.min(0.35, Math.max(0.08, settings.watermarkOpacity / 100));
  const fontSize = Math.round(size * 0.08);

  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "#1f2328";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.58)";
  ctx.lineWidth = 5;
  ctx.font = `900 ${fontSize}px ${getFontStack(settings.fontFamily)}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let y = -size; y <= size; y += 250) {
    for (let x = -size; x <= size; x += 430) {
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    }
  }

  ctx.restore();
}

function drawTextSeal(ctx, settings) {
  const size = CANVAS_SIZE;
  const center = size / 2;
  const scale = settings.sealSize / 300;
  const radius = size * 0.38 * scale;
  const color = settings.sealColor;
  const mainSize = settings.mainTextSize / 100;
  const bottomSize = settings.bottomTextSize / 100;
  const headSize = settings.headTextSize / 100;
  const centerSize = settings.centerTextSize / 100;
  const mainArc = settings.mainTextArc / 100;
  const bottomArc = settings.bottomTextArc / 100;
  const mainSpacing = settings.mainTextSpacing / 100;
  const bottomSpacing = settings.bottomTextSpacing / 100;
  const mainMargin = settings.mainTextMargin / 100;
  const bottomMargin = settings.bottomTextMargin / 100;
  const headMargin = settings.headTextMargin / 100;

  drawGuide(ctx, size, settings, settings.inkStrength);

  if (settings.sealType === "private") {
    drawCenteredText(ctx, settings.mainText || "个人私章", center, center - 10, radius * 1.25, 96 * scale * mainSize, color, 900, settings.fontFamily);
    if (settings.centerText) {
      drawCenteredText(ctx, settings.centerText, center, center + 126 * scale, radius * 0.9, 58 * scale * centerSize, color, 900, settings.fontFamily);
    }
    return;
  }

  const arcRadius = settings.shape === "ellipse" ? radius * 0.86 : radius * 0.94;
  const mainSpan = 0.64 * mainArc;
  const bottomSpan = 0.44 * bottomArc;
  drawArcText(
    ctx,
    settings.mainText,
    center,
    center,
    arcRadius * mainMargin,
    Math.PI * (1.5 - mainSpan / 2),
    Math.PI * (1.5 + mainSpan / 2),
    42 * scale * mainSize,
    color,
    { spacing: mainSpacing, bold: settings.mainTextBold, fontFamily: settings.fontFamily }
  );

  if (settings.centerText) {
    drawCenteredText(ctx, settings.centerText, center, center - 18 * scale, radius * 0.75, 82 * scale * centerSize, color, 900, settings.fontFamily);
  }

  drawCenteredText(ctx, settings.headText, center, center + 122 * scale * headMargin, radius * 1.25, 44 * scale * headSize, color, 800, settings.fontFamily);
  drawAntiCode(ctx, settings, center, scale, radius, color);

  if (settings.bottomText) {
    drawArcText(
      ctx,
      settings.bottomText,
      center,
      center,
      arcRadius * 0.82 * bottomMargin,
      Math.PI * (0.5 - bottomSpan / 2),
      Math.PI * (0.5 + bottomSpan / 2),
      34 * scale * bottomSize,
      color,
      { reverse: true, spacing: bottomSpacing, bold: settings.bottomTextBold, fontFamily: settings.fontFamily }
    );
  }
}

function renderSeal(canvas, settings, options = {}) {
  const { includeWatermark = false } = options;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawTextSeal(ctx, settings);
  if (settings.aging) applyAging(ctx, CANVAS_SIZE, settings.agingStrength / 100);

  const finalImage = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  let activePixels = 0;
  for (let index = 3; index < finalImage.data.length; index += 4) {
    if (finalImage.data[index]) activePixels += 1;
  }

  if (includeWatermark) drawTrialWatermark(ctx, CANVAS_SIZE, settings);

  return {
    coverage: Math.round((activePixels / (CANVAS_SIZE * CANVAS_SIZE)) * 1000) / 10,
    activePixels,
  };
}

function getExportFileName(settings) {
  const safeName = settings.mainText.trim().replace(/[\\/:*?"<>|]/g, "").slice(0, 48);
  return `${safeName || "电子印章"}.png`;
}

function App() {
  const canvasRef = useRef(null);
  const [settings, setSettings] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [stats, setStats] = useState({ coverage: 0, activePixels: 0 });
  const [savedNotice, setSavedNotice] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paidUnlock, setPaidUnlock] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(PAYMENT_STORAGE_KEY) === "unlocked";
  });
  const canExport = true;
  const shouldShowWatermark = !paidUnlock;

  useEffect(() => {
    if (!canvasRef.current) return;

    const nextStats = renderSeal(canvasRef.current, settings, { includeWatermark: shouldShowWatermark });
    setStats(nextStats);
  }, [settings, shouldShowWatermark]);

  const summary = useMemo(() => {
    if (stats.coverage <= 1) return "印面偏少";
    if (stats.coverage >= 55) return "印面偏满";
    return "印面可用";
  }, [stats.coverage]);

  const updateSetting = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    setSavedNotice(false);
  };

  const saveSettings = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 1800);
    } catch {
      setSavedNotice(false);
    }
  };

  const openPayment = () => {
    if (paidUnlock) return;
    setPaymentOpen(true);
  };

  const confirmPaymentUnlock = () => {
    window.localStorage.setItem(PAYMENT_STORAGE_KEY, "unlocked");
    setPaidUnlock(true);
    setPaymentOpen(false);
  };

  const resetPaymentUnlock = () => {
    window.localStorage.removeItem(PAYMENT_STORAGE_KEY);
    setPaidUnlock(false);
  };

  const exportPng = () => {
    const exportCanvas = document.createElement("canvas");
    renderSeal(exportCanvas, settings, { includeWatermark: shouldShowWatermark });
    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getExportFileName(settings);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return (
    <main className="seal-app">
      <header className="tool-bar">
        <div className="brand-lockup">
          <span className="brand-mark">印</span>
          <div>
            <h1>电子印章生成器</h1>
            <p>{paidUnlock ? "已解锁无水印导出，本地生成透明 PNG" : "公章文字配置，本地生成，试用导出含水印"}</p>
          </div>
        </div>

        <div className="toolbar-actions">
          <button className={`ghost-button ${savedNotice ? "is-active" : ""}`} type="button" onClick={saveSettings}>
            <SealCheck size={18} />
            {savedNotice ? "已保存" : "保存设置"}
          </button>
          <button className="ghost-button" type="button" onClick={resetSettings}>
            <ArrowCounterClockwise size={18} />
            重置
          </button>
          <button className={`ghost-button unlock-button ${paidUnlock ? "is-active" : ""}`} type="button" onClick={openPayment}>
            {paidUnlock ? <CheckCircle size={18} weight="fill" /> : <CreditCard size={18} />}
            {paidUnlock ? "已去水印" : "去水印"}
          </button>
          <button className="primary-button" type="button" onClick={exportPng} disabled={!canExport}>
            <DownloadSimple size={19} weight="bold" />
            {paidUnlock ? "导出透明 PNG" : "导出带水印 PNG"}
          </button>
        </div>
      </header>

      <section className="workspace" aria-label="电子印章生成器工作台">
        <section className="preview-stage">
          <div className="preview-header">
            <div>
              <h2>印面预览</h2>
              <p>{paidUnlock ? "已解锁无水印导出，透明 PNG 仅保留印章内容" : "红色文字、边框、防伪编号、做旧纹理和试用水印都会写入 PNG"}</p>
            </div>
            <div className="status-chip">
              <span>{summary}</span>
              <strong>{stats.coverage}%</strong>
            </div>
          </div>

          <div className="canvas-shell">
            <canvas ref={canvasRef} aria-label="生成的红色印章预览" />
            <span className="measure measure-top">900px</span>
            <span className="measure measure-side">透明背景</span>
          </div>

          <div className="preview-footer">
            <span>导出尺寸：900 x 900</span>
            <span>有效像素：{stats.activePixels.toLocaleString("zh-CN")}</span>
            <span>格式：透明 PNG / {paidUnlock ? "无水印" : "含水印"}</span>
          </div>
        </section>

        <aside className="side-panel inspector-panel">
          <div className="panel-title">
              <SlidersHorizontal size={21} />
              <div>
                <h2>印章设置</h2>
              <p>文字、章形、尺寸和颜色集中调整</p>
            </div>
          </div>

          <details className="settings-section text-settings" open>
            <summary className="section-toggle">
              <span className="section-title">文字内容</span>
              <span className="section-meta">{sealTypeOptions.find((option) => option.value === settings.sealType)?.label}</span>
            </summary>
            <div className="tab-switcher">
              {sealTypeOptions.map((option) => (
                <button
                  key={option.value}
                  className={settings.sealType === option.value ? "is-selected" : ""}
                  type="button"
                  onClick={() => updateSetting("sealType", option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <ControlSelect
              label="字体样式"
              value={settings.fontFamily}
              options={fontOptions}
              onChange={(value) => updateSetting("fontFamily", value)}
            />
            <ControlTextInput
              label="主体文字"
              value={settings.mainText}
              onChange={(value) => updateSetting("mainText", value)}
              placeholder="公司名称或私章文字"
            />
            <ControlTextInput
              label="防伪码"
              value={settings.bottomText}
              onChange={(value) => updateSetting("bottomText", value)}
              placeholder="合同专用章"
            />
            <ControlTextInput
              label="中心内容"
              value={settings.centerText}
              onChange={(value) => updateSetting("centerText", value)}
              placeholder="★"
            />
            <ControlTextInput
              label="抬头文字"
              value={settings.headText}
              onChange={(value) => updateSetting("headText", value)}
              placeholder="电子印章"
            />
            <label className="mini-toggle-row">
              <span>启用防伪码</span>
              <input
                type="checkbox"
                checked={settings.antiCodeEnabled}
                onChange={(event) => updateSetting("antiCodeEnabled", event.target.checked)}
              />
            </label>
            <ControlTextInput
              label="防伪编号"
              value={settings.antiCodeText}
              onChange={(value) => updateSetting("antiCodeText", value)}
              placeholder="NO.20260529"
            />
          </details>

          <details className="settings-section" open>
            <summary className="section-toggle">
              <span className="section-title">印章样式</span>
              <span className="section-meta">章形 / 尺寸 / 颜色</span>
            </summary>
            <div className="shape-group">
              <div className="shape-options">
                {shapeOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      className={settings.shape === option.value ? "is-selected" : ""}
                      type="button"
                      onClick={() => updateSetting("shape", option.value)}
                    >
                      <Icon size={18} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="control-grid">
              <ControlSlider
                label="印章大小"
                value={settings.sealSize}
                min={220}
                max={380}
                step={5}
                suffix=""
                onChange={(value) => updateSetting("sealSize", value)}
              />
              <ControlSlider
                label="线条粗细"
                value={settings.lineWidth}
                min={3}
                max={26}
                step={1}
                suffix=""
                onChange={(value) => updateSetting("lineWidth", value)}
              />
            </div>
            <div className="border-mode-group">
              <div className="section-label">
                <span>边框线型</span>
                <span>{borderModeOptions.find((option) => option.value === settings.borderMode)?.label}</span>
              </div>
              <div className="tab-switcher">
                {borderModeOptions.map((option) => (
                  <button
                    key={option.value}
                    className={settings.borderMode === option.value ? "is-selected" : ""}
                    type="button"
                    onClick={() => updateSetting("borderMode", option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="color-control">
              <div className="section-label">
                <span>印章颜色</span>
                <span>{settings.sealColor}</span>
              </div>
              <label className="color-row">
                <input type="color" value={settings.sealColor} onChange={(event) => updateSetting("sealColor", event.target.value)} />
                <span style={{ background: settings.sealColor }} />
              </label>
            </div>
          </details>

        </aside>

        <section className="advanced-dock" aria-label="高级参数工作区">
          <div className="dock-header">
            <div className="panel-title">
              <SlidersHorizontal size={21} />
              <div>
                <h2>高级参数</h2>
                <p>元素比例、文字细节、纹理和导出横向铺开</p>
              </div>
            </div>
          </div>

          <div className="advanced-dock-grid">
            <details className="settings-section" open>
              <summary className="section-toggle">
                <span className="section-title">元素大小</span>
                <span className="section-meta">文字比例 / 位置</span>
              </summary>
              <div className="control-grid">
                <ControlSlider
                label="主体文字大小"
                value={settings.mainTextSize}
                min={60}
                max={260}
                step={5}
                  suffix="%"
                  onChange={(value) => updateSetting("mainTextSize", value)}
                />
                <ControlSlider
                  label="防伪码大小"
                  value={settings.bottomTextSize}
                  min={60}
                  max={160}
                  step={5}
                  suffix="%"
                  onChange={(value) => updateSetting("bottomTextSize", value)}
                />
                <ControlSlider
                  label="抬头文字大小"
                  value={settings.headTextSize}
                  min={60}
                  max={160}
                  step={5}
                  suffix="%"
                  onChange={(value) => updateSetting("headTextSize", value)}
                />
                <ControlSlider
                  label="抬头文字边距"
                  value={settings.headTextMargin}
                  min={40}
                  max={220}
                  step={5}
                  suffix="%"
                  onChange={(value) => updateSetting("headTextMargin", value)}
                />
                <ControlSlider
                  label="中心内容大小"
                  value={settings.centerTextSize}
                  min={50}
                  max={300}
                  step={5}
                  suffix="%"
                  onChange={(value) => updateSetting("centerTextSize", value)}
                />
                <ControlSlider
                  label="印泥浓度"
                  value={Math.round(settings.inkStrength * 100)}
                  min={35}
                  max={100}
                  step={1}
                  suffix="%"
                  onChange={(value) => updateSetting("inkStrength", value / 100)}
                />
              </div>
            </details>

            <details className="settings-section text-detail-section" open>
              <summary className="section-toggle">
                <span className="section-title">文字细节</span>
                <span className="section-meta">主体文字 / 防伪码</span>
              </summary>
              <div className="text-detail-grid">
                <div className="advanced-text-group">
                  <div className="section-label">
                    <span>主体文字</span>
                    <span>弧度 / 间距 / 边距</span>
                  </div>
                  <ControlSlider
                    label="弧度"
                    value={settings.mainTextArc}
                    min={60}
                    max={150}
                    step={5}
                    suffix="%"
                    onChange={(value) => updateSetting("mainTextArc", value)}
                  />
                  <ControlSlider
                    label="间距"
                    value={settings.mainTextSpacing}
                    min={70}
                    max={150}
                    step={5}
                    suffix="%"
                    onChange={(value) => updateSetting("mainTextSpacing", value)}
                  />
                  <ControlSlider
                    label="边距"
                    value={settings.mainTextMargin}
                    min={78}
                    max={112}
                    step={2}
                    suffix="%"
                    onChange={(value) => updateSetting("mainTextMargin", value)}
                  />
                  <label className="mini-toggle-row">
                    <span>加粗</span>
                    <input
                      type="checkbox"
                      checked={settings.mainTextBold}
                      onChange={(event) => updateSetting("mainTextBold", event.target.checked)}
                    />
                  </label>
                </div>

                <div className="advanced-text-group">
                  <div className="section-label">
                    <span>防伪码</span>
                    <span>弧度 / 间距 / 边距</span>
                  </div>
                  <ControlSlider
                    label="弧度"
                    value={settings.bottomTextArc}
                    min={60}
                    max={170}
                    step={5}
                    suffix="%"
                    onChange={(value) => updateSetting("bottomTextArc", value)}
                  />
                  <ControlSlider
                    label="间距"
                    value={settings.bottomTextSpacing}
                    min={70}
                    max={170}
                    step={5}
                    suffix="%"
                    onChange={(value) => updateSetting("bottomTextSpacing", value)}
                  />
                  <ControlSlider
                    label="边距"
                    value={settings.bottomTextMargin}
                    min={76}
                    max={116}
                    step={2}
                    suffix="%"
                    onChange={(value) => updateSetting("bottomTextMargin", value)}
                  />
                  <label className="mini-toggle-row">
                    <span>加粗</span>
                    <input
                      type="checkbox"
                      checked={settings.bottomTextBold}
                      onChange={(event) => updateSetting("bottomTextBold", event.target.checked)}
                    />
                  </label>
                </div>
              </div>
            </details>

            <details className="settings-section" open>
              <summary className="section-toggle">
                <span className="section-title">做旧与导出</span>
                <span className="section-meta">纹理 / 透明 PNG</span>
              </summary>
              <label className="toggle-row">
                <span>
                  <strong>做旧纹理</strong>
                  <small>给边框、文字和图片印面加入轻微磨损</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.aging}
                  onChange={(event) => updateSetting("aging", event.target.checked)}
                />
              </label>
              <ControlSlider
                label="做旧纹理强度"
                value={settings.agingStrength}
                min={0}
                max={35}
                step={1}
                suffix="%"
                onChange={(value) => updateSetting("agingStrength", value)}
              />

              <div className="watermark-card">
                <div className="watermark-card-header">
                  {paidUnlock ? <CheckCircle size={19} weight="fill" /> : <LockKey size={19} weight="fill" />}
                  <div>
                    <strong>{paidUnlock ? "已解锁无水印" : "试用水印"}</strong>
                    <span>{paidUnlock ? "当前预览和导出均不会叠加水印。" : "未支付前，预览和导出都会叠加水印。"}</span>
                  </div>
                </div>
                {!paidUnlock && (
                  <>
                    <ControlTextInput
                      label="水印文字"
                      value={settings.watermarkText}
                      onChange={(value) => updateSetting("watermarkText", value)}
                      placeholder="试用水印"
                    />
                    <ControlSlider
                      label="水印强度"
                      value={settings.watermarkOpacity}
                      min={8}
                      max={35}
                      step={1}
                      suffix="%"
                      onChange={(value) => updateSetting("watermarkOpacity", value)}
                    />
                    <button className="unlock-cta" type="button" onClick={openPayment}>
                      <CreditCard size={18} />
                      支付 {PAID_PRICE_LABEL} 去水印下载
                    </button>
                  </>
                )}
                {paidUnlock && (
                  <button className="secondary-action" type="button" onClick={resetPaymentUnlock}>
                    恢复试用状态
                  </button>
                )}
              </div>

              <div className="export-card">
                <SealCheck size={20} weight="fill" />
                <div>
                  <strong>透明 PNG</strong>
                  <span>{paidUnlock ? "付费解锁状态下会导出透明背景、无水印 PNG。" : "当前试用版导出会保留透明背景，并叠加水印；支付成功后切换无水印下载。"}</span>
                </div>
              </div>
            </details>
          </div>
        </section>
      </section>
      {paymentOpen && (
        <PaymentDialog onClose={() => setPaymentOpen(false)} onConfirm={confirmPaymentUnlock} />
      )}
    </main>
  );
}

function PaymentDialog({ onClose, onConfirm }) {
  return (
    <div className="payment-overlay" role="presentation">
      <section className="payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title">
        <button className="dialog-close" type="button" onClick={onClose} aria-label="关闭支付弹窗">
          <X size={18} />
        </button>
        <div className="payment-dialog-header">
          <span className="payment-icon">
            <QrCode size={28} weight="duotone" />
          </span>
          <div>
            <h2 id="payment-title">支付去水印</h2>
            <p>支付 {PAID_PRICE_LABEL} 后，当前浏览器可导出无水印透明 PNG。</p>
          </div>
        </div>

        <div className="payment-summary">
          <span>订单内容</span>
          <strong>电子印章无水印下载</strong>
          <span>支付金额</span>
          <strong>{PAID_PRICE_LABEL}</strong>
        </div>

        <div className="qr-placeholder" aria-label="支付二维码占位">
          <QrCode size={70} />
          <strong>支付二维码占位</strong>
          <span>接入微信 / 支付宝后，这里会展示真实收款二维码。</span>
        </div>

        <div className="payment-actions">
          <button className="ghost-button" type="button" onClick={onClose}>
            稍后再说
          </button>
          <button className="primary-button" type="button" onClick={onConfirm}>
            <CheckCircle size={18} weight="fill" />
            测试确认支付，去水印
          </button>
        </div>
      </section>
    </div>
  );
}

function ControlSlider({ label, value, min, max, step, suffix, onChange }) {
  return (
    <label className="control-slider">
      <span className="control-meta">
        <strong>{label}</strong>
        <em>
          {value}
          {suffix}
        </em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ControlTextInput({ label, value, onChange, placeholder }) {
  return (
    <label className="text-field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ControlSelect({ label, value, options, onChange }) {
  return (
    <label className="text-field select-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default App;
