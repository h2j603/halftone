// --- Halftone Generator (p5.js + p5.js-svg) ---
// 주요 수정점
// 1) 오프스크린 버퍼를 항상 P2D로 생성(createGraphics(..., P2D))
// 2) 업로드/초기 이미지에 loadPixels() 보장
// 3) iOS 좌표/픽셀 불일치 방지를 위해 pixelDensity(1)
// 4) CSS 미리보기 스케일에 템플릿 문자열 사용: `scale(${previewScale})`

let img;
let tileSize = 30;           // 기본 타일 크기
let previewScale = 0.3;      // 화면 미리보기 배율 (0~1). 저장되는 SVG 해상도에는 영향 없음
let cnv;
let scaleSlider;
let customShape = null;      // 타일(도트)로 사용할 SVG 모양
let maskShape = null;        // 패턴 배치를 위한 마스크 SVG
let tileSlider;
let contrast = 1;            // 대비 조정 값 (지수)
let contrastSlider;
let brightnessFactor = 1;    // 밝기 조정 배율
let brightnessSlider;
let minDotSize = 2;
let maxDotScale = 1;
let minDotSlider;
let maxDotSlider;
let brightSkip = 0;          // brightnessNorm이 이 값보다 작으면 도트 생략 (0~1)
let brightSkipSlider;
let invertMode = false;
let invertCheckbox;
let shapes = [];
let patternSelect;
let shapeModeSelect;
let threshold1Slider;
let threshold2Slider;

// 중력 시뮬레이션
let gravityStrength = 0;
let gravitySlider;
let gravityMode = false;
let gravityCheckbox;

// 노이즈/지터링
let noiseStrength = 0;
let noiseSlider;
let noiseMode = false;
let noiseCheckbox;

// 업로더 전역 참조
let fileInputGlobal, maskInputGlobal, rasterInputGlobal, patternSVGInputGlobal;

// 오프스크린 캔버스(언제나 P2D)
let offscreenCanvas;

// 원본 기본 이미지
let baseImg;

// SVG 패턴용 별도 이미지
let patternSVG = null;

// 기본 이미지 프리로드
function preload() {
  baseImg = loadImage('https://d2w9rnfcy7mm78.cloudfront.net/37945145/original_149aef3cb23d4d0a495f19326c665581.jpg?1751961646?bc=0');
}

function setup() {
  // iOS에서 좌표/픽셀 불일치 방지
  pixelDensity(1);

  // 메인 캔버스는 SVG 렌더러(벡터 출력용)
  cnv = createCanvas(baseImg.width, baseImg.height, SVG);

  // 미리보기 크기만 축소 (CSS)
  cnv.elt.style.transformOrigin = 'top left';
  cnv.elt.style.transform = `scale(${previewScale})`;

  // 샘플링 소스 이미지 지정 + 픽셀 버퍼 준비
  img = baseImg;
  if (img && img.loadPixels) img.loadPixels();

  // UI 패널 x 좌표 (캔버스 우측 50px 여유)
  const uiX = img.width * previewScale + 50;

  // -------- 업로드 UI --------
  // 래스터 이미지 업로더
  rasterInputGlobal = createFileInput(handleRasterFile);
  rasterInputGlobal.attribute('accept', '.jpg,.jpeg,.png,.gif,.bmp,.webp');
  rasterInputGlobal.position(uiX, 40);
  createSpan('Raster Image').position(uiX + 140, 45);

  // 타일 SVG 업로더 (여러 개)
  fileInputGlobal = createFileInput(handleFile, true);
  fileInputGlobal.attribute('multiple', '');
  fileInputGlobal.attribute('accept', '.svg');
  fileInputGlobal.position(uiX, 80);
  createSpan('Tile SVGs').position(uiX + 140, 85);

  // 마스크 SVG 업로더 (도트 배치 영역 정의용)
  maskInputGlobal = createFileInput(handleMaskSVG);
  maskInputGlobal.attribute('accept', '.svg');
  maskInputGlobal.position(uiX, 120);
  createSpan('Mask SVG').position(uiX + 140, 125);

  // 패턴 SVG 업로더 (SVG Pattern용)
  patternSVGInputGlobal = createFileInput(handlePatternSVG);
  patternSVGInputGlobal.attribute('accept', '.svg');
  patternSVGInputGlobal.position(uiX, 160);
  createSpan('Pattern SVG').position(uiX + 140, 165);

  // -------- 컨트롤 UI --------
  // 미리보기 배율
  scaleSlider = createSlider(0.1, 1, previewScale, 0.1);
  scaleSlider.position(uiX, 200);
  createSpan('Preview Scale').position(uiX + 140, 205);
  scaleSlider.input(() => {
    previewScale = scaleSlider.value();
    cnv.elt.style.transform = `scale(${previewScale})`;
  });

  // 타일 크기
  tileSlider = createSlider(5, 100, tileSize, 1);
  tileSlider.position(uiX, 240);
  createSpan('Tile Size').position(uiX + 140, 245);
  tileSlider.input(() => {
    tileSize = tileSlider.value();
    redrawHalftone();
  });

  // 콘트라스트
  contrastSlider = createSlider(0.2, 3, contrast, 0.1);
  contrastSlider.position(uiX, 280);
  createSpan('Contrast').position(uiX + 140, 285);
  contrastSlider.input(() => {
    contrast = contrastSlider.value();
    redrawHalftone();
  });

  // 밝기
  brightnessSlider = createSlider(0.5, 1.5, brightnessFactor, 0.05);
  brightnessSlider.position(uiX, 320);
  createSpan('Brightness').position(uiX + 140, 325);
  brightnessSlider.input(() => {
    brightnessFactor = brightnessSlider.value();
    redrawHalftone();
  });

  // 최소 도트
  minDotSlider = createSlider(1, 20, minDotSize, 1);
  minDotSlider.position(uiX, 360);
  createSpan('Min Dot').position(uiX + 140, 365);
  minDotSlider.input(() => {
    minDotSize = minDotSlider.value();
    redrawHalftone();
  });

  // 최대 도트 스케일
  maxDotSlider = createSlider(1, 3, maxDotScale, 0.1);
  maxDotSlider.position(uiX, 400);
  createSpan('Max Dot Scale').position(uiX + 140, 405);
  maxDotSlider.input(() => {
    maxDotScale = maxDotSlider.value();
    redrawHalftone();
  });

  // 밝은 영역 스킵
  brightSkipSlider = createSlider(0, 0.5, brightSkip, 0.01);
  brightSkipSlider.position(uiX, 440);
  createSpan('Skip Bright').position(uiX + 140, 445);
  brightSkipSlider.input(() => {
    brightSkip = brightSkipSlider.value();
    redrawHalftone();
  });

  // 흑백 반전
  invertCheckbox = createCheckbox('Invert', invertMode);
  invertCheckbox.position(uiX, 480);
  invertCheckbox.changed(() => {
    invertMode = invertCheckbox.checked();
    redrawHalftone();
  });

  // 중력 모드
  gravityCheckbox = createCheckbox('Gravity Mode', gravityMode);
  gravityCheckbox.position(uiX, 500);
  gravityCheckbox.changed(() => {
    gravityMode = gravityCheckbox.checked();
    redrawHalftone();
  });

  // 중력 강도
  gravitySlider = createSlider(0, 100, gravityStrength, 1);
  gravitySlider.position(uiX, 520);
  createSpan('Gravity Strength').position(uiX + 140, 525);
  gravitySlider.input(() => {
    gravityStrength = gravitySlider.value();
    if (gravityMode) redrawHalftone();
  });

  // 노이즈/지터링
  noiseCheckbox = createCheckbox('Noise/Jitter', noiseMode);
  noiseCheckbox.position(uiX, 540);
  noiseCheckbox.changed(() => {
    noiseMode = noiseCheckbox.checked();
    redrawHalftone();
  });

  noiseSlider = createSlider(0, 50, noiseStrength, 1);
  noiseSlider.position(uiX, 560);
  createSpan('Noise Strength').position(uiX + 140, 565);
  noiseSlider.input(() => {
    noiseStrength = noiseSlider.value();
    if (noiseMode) redrawHalftone();
  });

  // 패턴 타입
  patternSelect = createSelect();
  patternSelect.option('Grid');
  patternSelect.option('Staggered');
  patternSelect.option('Radial');
  patternSelect.option('Shape');       // SVG 마스크 영역 내 배치
  patternSelect.option('SVG Pattern'); // SVG 모양을 반복 패턴으로
  patternSelect.position(uiX, 600);
  createSpan('Pattern').position(uiX + 140, 605);
  patternSelect.changed(() => redrawHalftone());

  // Shape 모드
  shapeModeSelect = createSelect();
  shapeModeSelect.option('Single');
  shapeModeSelect.option('Range');
  shapeModeSelect.option('Random');
  shapeModeSelect.position(uiX, 640);
  createSpan('Shape Mode').position(uiX + 140, 645);
  shapeModeSelect.changed(() => {
    updateRangeUI();
    redrawHalftone();
  });

  // Range 임계값 슬라이더
  threshold1Slider = createSlider(0, 1, 0.33, 0.01);
  threshold1Slider.position(uiX, 680);
  threshold2Slider = createSlider(0, 1, 0.66, 0.01);
  threshold2Slider.position(uiX, 720);
  createSpan('T1').position(uiX + 140, 685);
  createSpan('T2').position(uiX + 140, 725);
  threshold1Slider.input(() => redrawHalftone());
  threshold2Slider.input(() => redrawHalftone());
  updateRangeUI();

  // 저장 버튼
  const btn = createButton('Save SVG');
  btn.position(uiX, 10);
  btn.mousePressed(() => save('halftone-output.svg'));

  const btnPng = createButton('Save PNG');
  btnPng.position(uiX + 80, 10);
  btnPng.mousePressed(() => {
    const svgEl = document.querySelector('svg');
    if (svgEl) saveSvgAsPng(svgEl, 'halftone-output.png');
  });

  // 렌더링 준비
  noLoop();
  noStroke();
  fill(0); // 1도 블랙

  drawHalftone();
}

// ------- 파일 핸들러들 -------

// 래스터 이미지 업로드 → 오프스크린(P2D)로 리샘플, 캔버스 크기는 고정
function handleRasterFile(file) {
  if (file.type === 'image') {
    const reader = new FileReader();
    reader.onload = function (e) {
      loadImage(e.target.result, newImg => {
        // 오프스크린은 항상 P2D (HTMLCanvas)
        offscreenCanvas = createGraphics(baseImg.width, baseImg.height, P2D);

        // 새 이미지를 기본 캔버스 크기에 비율 유지 맞춤
        const scaleX = baseImg.width / newImg.width;
        const scaleY = baseImg.height / newImg.height;
        const scaleV = Math.min(scaleX, scaleY);

        const scaledW = newImg.width * scaleV;
        const scaledH = newImg.height * scaleV;
        const offsetX = (baseImg.width - scaledW) / 2;
        const offsetY = (baseImg.height - scaledH) / 2;

        // 오프스크린에 그리기 + 픽셀 버퍼 준비
        offscreenCanvas.clear();
        offscreenCanvas.pixelDensity(1); // 일관성
        offscreenCanvas.image(newImg, offsetX, offsetY, scaledW, scaledH);
        if (offscreenCanvas.loadPixels) offscreenCanvas.loadPixels();

        // 샘플링 소스를 오프스크린으로 교체
        img = offscreenCanvas;

        redrawHalftone();
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

// ------- 유틸 -------

function updateRangeUI() {
  const show = shapeModeSelect && shapeModeSelect.value() === 'Range';
  threshold1Slider.style('display', show ? 'block' : 'none');
  threshold2Slider.style('display', show ? 'block' : 'none');
}

function redrawHalftone() {
  // 샘플링 소스가 픽셀 버퍼를 보유하도록 보장
  if (img && img.loadPixels) img.loadPixels();
  clear();
  noStroke();
  fill(0);
  drawHalftone();
}

// 패턴별 도트 중심 위치 계산
function calcPositions(pattern) {
  const pts = [];
  const half = tileSize / 2;

  switch (pattern) {
    case 'Staggered':
      for (let y = half; y <= img.height - half; y += tileSize) {
        const row = Math.floor((y - half) / tileSize);
        const offset = (row % 2 === 1) ? tileSize / 2 : 0;
        for (let x = half + offset; x <= img.width - half; x += tileSize) {
          pts.push({ x, y });
        }
      }
      break;

    case 'Radial': {
      const cx = img.width / 2;
      const cy = img.height / 2;
      const maxR = dist(0, 0, cx, cy);
      for (let r = half; r < maxR; r += tileSize) {
        const stepA = tileSize / r;
        for (let a = 0; a < TWO_PI; a += stepA) {
          const x = Math.round(cx + r * Math.cos(a));
          const y = Math.round(cy + r * Math.sin(a));
          if (x >= half && x <= img.width - half && y >= half && y <= img.height - half) {
            pts.push({ x, y });
          }
        }
      }
      break;
    }

    case 'Shape': {
      // SVG 마스크 or 커스텀 SVG 이미지의 알파 영역 내에만 도트 생성
      const refShape = maskShape || customShape;
      if (!refShape) break;
      if (refShape.loadPixels) refShape.loadPixels();

      const imgW = img.width;
      const imgH = img.height;

      for (let y = half; y <= imgH - half; y += tileSize) {
        for (let x = half; x <= imgW - half; x += tileSize) {
          const sx = Math.floor(map(x, 0, imgW, 0, refShape.width - 1));
          const sy = Math.floor(map(y, 0, imgH, 0, refShape.height - 1));
          const idx = 4 * (sy * refShape.width + sx) + 3;
          const alphaVal = refShape.pixels[idx];
          if (alphaVal > 10) pts.push({ x, y });
        }
      }
      break;
    }

    case 'SVG Pattern': {
      // 패턴 SVG의 불투명 픽셀 위치를 기준으로 반복 배치
      const patternShape = patternSVG;
      if (!patternShape) break;

      if (patternShape.loadPixels) patternShape.loadPixels();
      const shapeW = patternShape.width;
      const shapeH = patternShape.height;

      const tilesX = Math.ceil(img.width / shapeW);
      const tilesY = Math.ceil(img.height / shapeH);

      for (let tileY = 0; tileY < tilesY; tileY++) {
        for (let tileX = 0; tileX < tilesX; tileX++) {
          const tileOffsetX = tileX * shapeW;
          const tileOffsetY = tileY * shapeH;

          for (let sy = 0; sy < shapeH; sy += tileSize) {
            for (let sx = 0; sx < shapeW; sx += tileSize) {
              const idx = 4 * (sy * shapeW + sx) + 3;
              const alphaVal = patternShape.pixels[idx];
              if (alphaVal > 10) {
                const finalX = tileOffsetX + sx;
                const finalY = tileOffsetY + sy;
                if (finalX >= 0 && finalX < img.width && finalY >= 0 && finalY < img.height) {
                  pts.push({ x: finalX, y: finalY });
                }
              }
            }
          }
        }
      }
      break;
    }

    default: // Grid
      for (let y = half; y <= img.height - half; y += tileSize) {
        for (let x = half; x <= img.width - half; x += tileSize) {
          pts.push({ x, y });
        }
      }
  }

  return pts;
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

  // Random 모드: 밝기 기반이지만 의사랜덤하게 골라줌(반복 가능한 패턴 유지)
  const idx = Math.floor(brightnessNorm * 1000) % shapes.length;
  return shapes[idx];
}

function drawHalftone() {
  const pattern = patternSelect ? patternSelect.value() : 'Grid';
  const positions = calcPositions(pattern);

  // 각 위치의 도트 정보 사전 계산
  const dotData = [];
  positions.forEach((pos, index) => {
    const { x, y } = pos;

    // 소스에서 픽셀 샘플
    let c = img.get(x, y);
    if (alpha(c) === 0) {
      dotData[index] = null;
      return;
    }

    let b = ((red(c) + green(c) + blue(c)) / 3) * brightnessFactor;
    // 어두울수록 큰 도트: 0~255 → 1~0 → 대비 지수 적용
    let brightnessNorm = pow(map(b, 0, 255, 1, 0), contrast);
    if (invertMode) brightnessNorm = 1 - brightnessNorm;

    // 기본 크기
    let s = brightnessNorm * tileSize;
    // 밝을수록(=brightnessNorm 큼) maxDotScale 쪽으로 보간
    s *= lerp(1, maxDotScale, brightnessNorm);

    if (s < minDotSize || brightnessNorm < brightSkip) {
      dotData[index] = null;
    } else {
      dotData[index] = {
        originalX: x,
        originalY: y,
        x: x,
        y: y,
        size: s,
        brightness: brightnessNorm,
        mass: brightnessNorm // 어두울수록 무거움
      };
    }
  });

  // 중력 시뮬레이션
  if (gravityMode && gravityStrength > 0) {
    dotData.forEach(dot => {
      if (!dot) return;
      const fallDistance = (dot.mass * gravityStrength * 3);
      dot.y = dot.originalY + fallDistance;
      if (dot.y > img.height - dot.size / 2) {
        dot.y = img.height - dot.size / 2;
      }
    });
  }

  // 노이즈/지터링
  if (noiseMode && noiseStrength > 0) {
    dotData.forEach(dot => {
      if (!dot) return;

      const seed = dot.originalX * 1000 + dot.originalY;
      const pseudoRandom = (s) => {
        let x = Math.sin(s) * 10000;
        return x - Math.floor(x);
      };

      const offsetX = (pseudoRandom(seed) - 0.5) * noiseStrength;
      const offsetY = (pseudoRandom(seed + 1) - 0.5) * noiseStrength;

      dot.x += offsetX;
      dot.y += offsetY;

      dot.x = constrain(dot.x, dot.size / 2, img.width - dot.size / 2);
      dot.y = constrain(dot.y, dot.size / 2, img.height - dot.size / 2);
    });
  }

  // 겹침 방지(새 위치 기준)
  const adjustedSizes = dotData.map(dot => dot ? dot.size : 0);
  dotData.forEach((dot, index) => {
    if (!dot) return;
    let currentSize = dot.size;

    dotData.forEach((otherDot, otherIndex) => {
      if (index === otherIndex || !otherDot) return;
      const distance = dist(dot.x, dot.y, otherDot.x, otherDot.y);
      const minDistance = (currentSize + otherDot.size) / 2;
      if (distance < minDistance && distance > 0) {
        const maxAllowedSize = Math.max(minDotSize, (distance * 2) - otherDot.size / 2);
        currentSize = Math.min(currentSize, maxAllowedSize);
      }
    });

    adjustedSizes[index] = currentSize;
  });

  // 도트 그리기 (벡터 출력: 메인 캔버스는 SVG 렌더러)
  dotData.forEach((dot, index) => {
    if (!dot) return;
    const s = adjustedSizes[index];
    if (s <= 0) return;

    const shapeImg = pickShape(dot.brightness);
    if (shapeImg) {
      // SVG 이미지(<image>)로 삽입됨
      image(shapeImg, dot.x - s / 2, dot.y - s / 2, s, s);
    } else {
      // 기본 원
      ellipse(dot.x, dot.y, s, s);
    }
  });
}
