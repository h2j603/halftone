// --- Halftone Generator (Mobile-safe sampling) ---
// 모바일(iOS Safari) 안정화를 위해 샘플링 전용 버퍼를 자동 축소(capped)하여 사용
// 출력은 메인 SVG 캔버스(원본 크기)에 벡터로 그려 품질 유지

let img;                    // 원본(또는 base) 이미지: 메인 SVG 출력 좌표계 기준
let baseImg;
let samplerG = null;        // 픽셀 샘플링 전용 P2D 그래픽 버퍼(축소본)
let samplerScale = 1;       // samplerG = original / samplerScale
let samplerW = 0, samplerH = 0;

const SAMPLE_MAX_PIXELS = 2_000_000; // 샘플러 최대 픽셀수(≈2MP)
const SAMPLE_MAX_SIDE   = 2048;      // 샘플러 한 변 최대

let tileSize = 30;
let previewScale = 0.3;
let cnv;
let scaleSlider;

let customShape = null; // 타일 SVG
let maskShape   = null; // 마스크 SVG
let patternSVG  = null; // 패턴 SVG
let shapes = [];

let tileSlider, contrastSlider, brightnessSlider, minDotSlider, maxDotSlider, brightSkipSlider;
let invertCheckbox, gravityCheckbox, noiseCheckbox;
let gravitySlider, noiseSlider;
let patternSelect, shapeModeSelect, threshold1Slider, threshold2Slider;

let contrast = 1;
let brightnessFactor = 1;
let minDotSize = 2;
let maxDotScale = 1;
let brightSkip = 0;
let invertMode = false;

let gravityStrength = 0;
let gravityMode = false;

let noiseStrength = 0;
let noiseMode = false;

// 업로더 전역
let fileInputGlobal, maskInputGlobal, rasterInputGlobal, patternSVGInputGlobal;

// 오프스크린(원본 크기 그대로) 보관용이 아니라, 샘플링은 samplerG만 사용
let offscreenCanvas; // 필요 시 별도 사용하지만, 샘플러가 메인

function preload() {
  baseImg = loadImage('https://d2w9rnfcy7mm78.cloudfront.net/37945145/original_149aef3cb23d4d0a495f19326c665581.jpg?1751961646?bc=0');
}

function setup() {
  pixelDensity(1); // iOS 좌표/픽셀 불일치 방지

  // 메인 SVG 캔버스(출력은 원본 해상도 유지)
  cnv = createCanvas(baseImg.width, baseImg.height, SVG);
  cnv.elt.style.transformOrigin = 'top left';
  cnv.elt.style.transform = `scale(${previewScale})`;

  img = baseImg;

  // 샘플러 만들기(자동 축소)
  buildSamplerFrom(img);

  const uiX = width * previewScale + 50;

  // --- 업로드 UI ---
  rasterInputGlobal = createFileInput(handleRasterFile);
  rasterInputGlobal.attribute('accept', '.jpg,.jpeg,.png,.gif,.bmp,.webp');
  rasterInputGlobal.position(uiX, 40);
  createSpan('Raster Image').position(uiX + 140, 45);

  fileInputGlobal = createFileInput(handleFile, true);
  fileInputGlobal.attribute('multiple', '');
  fileInputGlobal.attribute('accept', '.svg');
  fileInputGlobal.position(uiX, 80);
  createSpan('Tile SVGs').position(uiX + 140, 85);

  maskInputGlobal = createFileInput(handleMaskSVG);
  maskInputGlobal.attribute('accept', '.svg');
  maskInputGlobal.position(uiX, 120);
  createSpan('Mask SVG').position(uiX + 140, 125);

  patternSVGInputGlobal = createFileInput(handlePatternSVG);
  patternSVGInputGlobal.attribute('accept', '.svg');
  patternSVGInputGlobal.position(uiX, 160);
  createSpan('Pattern SVG').position(uiX + 140, 165);

  // --- 컨트롤 UI ---
  scaleSlider = createSlider(0.1, 1, previewScale, 0.1);
  scaleSlider.position(uiX, 200);
  createSpan('Preview Scale').position(uiX + 140, 205);
  scaleSlider.input(() => {
    previewScale = scaleSlider.value();
    cnv.elt.style.transform = `scale(${previewScale})`;
  });

  tileSlider = createSlider(5, 100, tileSize, 1);
  tileSlider.position(uiX, 240);
  createSpan('Tile Size').position(uiX + 140, 245);
  tileSlider.input(() => { tileSize = tileSlider.value(); redrawHalftone(); });

  contrastSlider = createSlider(0.2, 3, contrast, 0.1);
  contrastSlider.position(uiX, 280);
  createSpan('Contrast').position(uiX + 140, 285);
  contrastSlider.input(() => { contrast = contrastSlider.value(); redrawHalftone(); });

  brightnessSlider = createSlider(0.5, 1.5, brightnessFactor, 0.05);
  brightnessSlider.position(uiX, 320);
  createSpan('Brightness').position(uiX + 140, 325);
  brightnessSlider.input(() => { brightnessFactor = brightnessSlider.value(); redrawHalftone(); });

  minDotSlider = createSlider(1, 20, minDotSize, 1);
  minDotSlider.position(uiX, 360);
  createSpan('Min Dot').position(uiX + 140, 365);
  minDotSlider.input(() => { minDotSize = minDotSlider.value(); redrawHalftone(); });

  maxDotSlider = createSlider(1, 3, maxDotScale, 0.1);
  maxDotSlider.position(uiX, 400);
  createSpan('Max Dot Scale').position(uiX + 140, 405);
  maxDotSlider.input(() => { maxDotScale = maxDotSlider.value(); redrawHalftone(); });

  brightSkipSlider = createSlider(0, 0.5, brightSkip, 0.01);
  brightSkipSlider.position(uiX, 440);
  createSpan('Skip Bright').position(uiX + 140, 445);
  brightSkipSlider.input(() => { brightSkip = brightSkipSlider.value(); redrawHalftone(); });

  invertCheckbox = createCheckbox('Invert', invertMode);
  invertCheckbox.position(uiX, 480);
  invertCheckbox.changed(() => { invertMode = invertCheckbox.checked(); redrawHalftone(); });

  gravityCheckbox = createCheckbox('Gravity Mode', gravityMode);
  gravityCheckbox.position(uiX, 500);
  gravityCheckbox.changed(() => { gravityMode = gravityCheckbox.checked(); redrawHalftone(); });

  gravitySlider = createSlider(0, 100, gravityStrength, 1);
  gravitySlider.position(uiX, 520);
  createSpan('Gravity Strength').position(uiX + 140, 525);
  gravitySlider.input(() => { gravityStrength = gravitySlider.value(); if (gravityMode) redrawHalftone(); });

  noiseCheckbox = createCheckbox('Noise/Jitter', noiseMode);
  noiseCheckbox.position(uiX, 540);
  noiseCheckbox.changed(() => { noiseMode = noiseCheckbox.checked(); redrawHalftone(); });

  noiseSlider = createSlider(0, 50, noiseStrength, 1);
  noiseSlider.position(uiX, 560);
  createSpan('Noise Strength').position(uiX + 140, 565);
  noiseSlider.input(() => { noiseStrength = noiseSlider.value(); if (noiseMode) redrawHalftone(); });

  patternSelect = createSelect();
  patternSelect.option('Grid');
  patternSelect.option('Staggered');
  patternSelect.option('Radial');
  patternSelect.option('Shape');
  patternSelect.option('SVG Pattern');
  patternSelect.position(uiX, 600);
  createSpan('Pattern').position(uiX + 140, 605);
  patternSelect.changed(() => redrawHalftone());

  shapeModeSelect = createSelect();
  shapeModeSelect.option('Single');
  shapeModeSelect.option('Range');
  shapeModeSelect.option('Random');
  shapeModeSelect.position(uiX, 640);
  createSpan('Shape Mode').position(uiX + 140, 645);
  shapeModeSelect.changed(() => { updateRangeUI(); redrawHalftone(); });

  threshold1Slider = createSlider(0, 1, 0.33, 0.01);
  threshold1Slider.position(uiX, 680);
  threshold2Slider = createSlider(0, 1, 0.66, 0.01);
  threshold2Slider.position(uiX, 720);
  createSpan('T1').position(uiX + 140, 685);
  createSpan('T2').position(uiX + 140, 725);
  threshold1Slider.input(() => redrawHalftone());
  threshold2Slider.input(() => redrawHalftone());
  updateRangeUI();

  const btn = createButton('Save SVG');
  btn.position(uiX, 10);
  btn.mousePressed(() => save('halftone-output.svg'));

  const btnPng = createButton('Save PNG');
  btnPng.position(uiX + 80, 10);
  btnPng.mousePressed(() => {
    const svgEl = document.querySelector('svg');
    if (svgEl) saveSvgAsPng(svgEl, 'halftone-output.png');
  });

  noLoop();
  noStroke();
  fill(0);

  drawHalftone();
}

/* ===================== 샘플러 생성/관리 ===================== */
function buildSamplerFrom(sourceImg) {
  // 원본 크기
  const w = sourceImg.width;
  const h = sourceImg.height;

  // 1) 한 변 제한, 2) 총 픽셀 제한 두 가지를 만족하는 축소배율 산출
  let scaleBySide  = Math.max(w, h) / SAMPLE_MAX_SIDE;
  let scaleByPixels = Math.sqrt((w * h) / SAMPLE_MAX_PIXELS);

  let needScale = Math.max(1, scaleBySide, scaleByPixels);
  samplerScale = needScale; // >= 1

  samplerW = Math.max(1, Math.floor(w / samplerScale));
  samplerH = Math.max(1, Math.floor(h / samplerScale));

  if (samplerG) samplerG.remove();
  samplerG = createGraphics(samplerW, samplerH, P2D);
  samplerG.pixelDensity(1);
  samplerG.clear();

  // sourceImg를 samplerG 크기로 축소 렌더
  samplerG.image(sourceImg, 0, 0, samplerW, samplerH);

  if (samplerG.loadPixels) samplerG.loadPixels();
}

/* ===================== 파일 핸들러 ===================== */
function handleRasterFile(file) {
  if (file.type === 'image') {
    const reader = new FileReader();
    reader.onload = function (e) {
      loadImage(e.target.result, newImg => {
        // 메인 출력 좌표계는 baseImg와 동일하게 유지 (질문 코드 요구)
        // 다만 샘플링은 newImg를 기반으로 samplerG를 다시 구성
        img = createImage(baseImg.width, baseImg.height);
        img.loadPixels(); // dummy (메인 좌표만 필요)

        // newImg를 baseImg 크기에 letterbox로 맞춰 별도 버퍼에 채우고,
        // 그 결과를 샘플러로 다운스케일링
        const temp = createGraphics(baseImg.width, baseImg.height, P2D);
        temp.pixelDensity(1);
        temp.clear();

        const scaleX = baseImg.width / newImg.width;
        const scaleY = baseImg.height / newImg.height;
        const s = Math.min(scaleX, scaleY);
        const scaledW = newImg.width * s;
        const scaledH = newImg.height * s;
        const offsetX = (baseImg.width - scaledW) / 2;
        const offsetY = (baseImg.height - scaledH) / 2;

        temp.image(newImg, offsetX, offsetY, scaledW, scaledH);
        const composed = temp.get(); // base 크기의 래스터

        // composed를 기준으로 샘플러 구성(자동 축소)
        buildSamplerFrom(composed);

        redrawHalftone();

        temp.remove();
      });
    };
    reader.readAsDataURL(file.file || file);
  } else {
    alert('이미지 파일(.jpg, .png 등)만 업로드하세요');
  }
}

function handleFile(file) {
  if (file.type === 'image' && file.subtype === 'svg+xml') {
    loadImage(file.data, imgObj => {
      shapes.push(imgObj);
      if (shapes.length === 1) customShape = imgObj;
      redrawHalftone();
    });
  } else {
    alert('SVG 파일(.svg)만 업로드하세요');
  }
}

function handleMaskSVG(file) {
  if (file.type === 'image' && file.subtype === 'svg+xml') {
    loadImage(file.data, imgObj => {
      maskShape = imgObj;
      redrawHalftone();
    });
  } else {
    alert('SVG 파일(.svg)만 업로드하세요');
  }
}

function handlePatternSVG(file) {
  if (file.type === 'image' && file.subtype === 'svg+xml') {
    loadImage(file.data, imgObj => {
      patternSVG = imgObj;
      redrawHalftone();
    });
  } else {
    alert('SVG 파일(.svg)만 업로드하세요');
  }
}

/* ===================== UI 보조 ===================== */
function updateRangeUI() {
  const show = shapeModeSelect && shapeModeSelect.value() === 'Range';
  threshold1Slider.style('display', show ? 'block' : 'none');
  threshold2Slider.style('display', show ? 'block' : 'none');
}

/* ===================== 렌더링 ===================== */
function redrawHalftone() {
  // samplerG가 픽셀 버퍼를 보유하도록 보장
  if (samplerG && samplerG.loadPixels) samplerG.loadPixels();
  clear();
  noStroke();
  fill(0);
  drawHalftone();
}

// 패턴 위치 계산(메인 좌표계: img/baseImg 크기)
function calcPositions(pattern) {
  const pts = [];
  const half = tileSize / 2;

  switch (pattern) {
    case 'Staggered':
      for (let y = half; y <= height - half; y += tileSize) {
        const row = Math.floor((y - half) / tileSize);
        const offset = (row % 2 === 1) ? tileSize / 2 : 0;
        for (let x = half + offset; x <= width - half; x += tileSize) {
          pts.push({ x, y });
        }
      }
      break;

    case 'Radial': {
      const cx = width / 2;
      const cy = height / 2;
      const maxR = dist(0, 0, cx, cy);
      for (let r = half; r < maxR; r += tileSize) {
        const stepA = tileSize / r;
        for (let a = 0; a < TWO_PI; a += stepA) {
          const x = Math.round(cx + r * Math.cos(a));
          const y = Math.round(cy + r * Math.sin(a));
          if (x >= half && x <= width - half && y >= half && y <= height - half) {
            pts.push({ x, y });
          }
        }
      }
      break;
    }

    case 'Shape': {
      // 마스크/커스텀 SVG의 알파를 메인 좌표계로 샘플 → sampler 해상도로 보간
      const refShape = maskShape || customShape;
      if (!refShape) break;
      if (refShape.loadPixels) refShape.loadPixels();

      for (let y = half; y <= height - half; y += tileSize) {
        for (let x = half; x <= width - half; x += tileSize) {
          const sx = Math.floor(map(x, 0, width, 0, refShape.width  - 1));
          const sy = Math.floor(map(y, 0, height, 0, refShape.height - 1));
          const idx = 4 * (sy * refShape.width + sx) + 3;
          const alphaVal = refShape.pixels[idx];
          if (alphaVal > 10) pts.push({ x, y });
        }
      }
      break;
    }

    case 'SVG Pattern': {
      const patternShape = patternSVG;
      if (!patternShape) break;
      if (patternShape.loadPixels) patternShape.loadPixels();

      const shapeW = patternShape.width;
      const shapeH = patternShape.height;
      const tilesX = Math.ceil(width / shapeW);
      const tilesY = Math.ceil(height / shapeH);

      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          const ox = tx * shapeW;
          const oy = ty * shapeH;
          for (let sy = 0; sy < shapeH; sy += tileSize) {
            for (let sx = 0; sx < shapeW; sx += tileSize) {
              const idx = 4 * (sy * shapeW + sx) + 3;
              const alphaVal = patternShape.pixels[idx];
              if (alphaVal > 10) {
                const fx = ox + sx;
                const fy = oy + sy;
                if (fx >= 0 && fx < width && fy >= 0 && fy < height) {
                  pts.push({ x: fx, y: fy });
                }
              }
            }
          }
        }
      }
      break;
    }

    default: // Grid
      for (let y = half; y <= height - half; y += tileSize) {
        for (let x = half; x <= width - half; x += tileSize) {
          pts.push({ x, y });
        }
      }
  }
  return pts;
}

// 샘플러에서 색을 읽되, 메인 좌표(x,y)를 샘플러 좌표로 매핑해서 읽음
function sampleColorAt(x, y) {
  // 메인(원본) → 샘플러
  const sx = Math.max(0, Math.min(samplerW - 1, Math.floor(x / samplerScale)));
  const sy = Math.max(0, Math.min(samplerH - 1, Math.floor(y / samplerScale)));
  // samplerG.get(sx, sy)는 1픽셀 RGBA 배열
  return samplerG.get(sx, sy);
}

function pickShape(brightnessNorm) {
  if (shapes.length === 0) return customShape;
  const mode = shapeModeSelect ? shapeModeSelect.value() : 'Single';
  if (mode === 'Single') return shapes[0];
  if (mode === 'Range') {
    const t1 = threshold1Slider.value();
    const t2 = threshold2Slider.value();
    if (brightnessNorm < t1 && shapes[0]) return shapes[0];
    if (brightnessNorm < t2 && shapes[1]) return shapes[1] || shapes[0];
    return shapes[2] || shapes[shapes.length - 1];
  }
  const idx = Math.floor(brightnessNorm * 1000) % shapes.length;
  return shapes[idx];
}

function drawHalftone() {
  const positions = calcPositions(patternSelect ? patternSelect.value() : 'Grid');

  const dotData = [];
  positions.forEach((pos, i) => {
    const { x, y } = pos;

    let c = sampleColorAt(x, y); // ★ samplerG에서 읽기
    if (alpha(c) === 0) {
      dotData[i] = null;
      return;
    }

    let b = ((red(c) + green(c) + blue(c)) / 3) * brightnessFactor;
    let brightnessNorm = pow(map(b, 0, 255, 1, 0), contrast);
    if (invertMode) brightnessNorm = 1 - brightnessNorm;

    let s = brightnessNorm * tileSize;
    s *= lerp(1, maxDotScale, brightnessNorm);

    if (s < minDotSize || brightnessNorm < brightSkip) {
      dotData[i] = null;
    } else {
      dotData[i] = {
        originalX: x,
        originalY: y,
        x, y,
        size: s,
        brightness: brightnessNorm,
        mass: brightnessNorm
      };
    }
  });

  // 중력
  if (gravityMode && gravityStrength > 0) {
    dotData.forEach(dot => {
      if (!dot) return;
      const fall = dot.mass * gravityStrength * 3;
      dot.y = Math.min(height - dot.size / 2, dot.originalY + fall);
    });
  }

  // 노이즈/지터링
