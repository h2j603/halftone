// HTML 파일의 <script>에 반드시 p5.js-svg 라이브러리를 추가해야 함!
// <script src="https://cdn.jsdelivr.net/npm/p5.js-svg@1.1.1/dist/p5.js-svg.min.js"></script>

let img;
let tileSize = 30; // 기본 타일 크기
let previewScale = 0.3; // 화면 미리보기 배율 (0~1). 저장되는 SVG 해상도에는 영향을 주지 않음
let cnv;
let scaleSlider;
let customShape = null; // 타일(도트)로 사용할 SVG 모양
let maskShape = null;    // 패턴 배치를 위한 마스크 SVG
let tileSlider;
let contrast = 1; // 대비 조정 값 (지수)
let contrastSlider;
let brightnessFactor = 1; // 밝기 조정 배율
let brightnessSlider;
let minDotSize = 2;
let maxDotScale = 1;
let minDotSlider;
let maxDotSlider;
let brightSkip = 0; // brightnessNorm below which dots are kept (0-1)
let brightSkipSlider;
let invertMode = false;
let invertCheckbox;
let shapes = [];
let patternSelect;
let shapeModeSelect;
let threshold1Slider;
let threshold2Slider;
// 중력 시뮬레이션 변수들
let gravityStrength = 0;
let gravitySlider;
let gravityMode = false;
let gravityCheckbox;
// 노이즈/지터링 변수들
let noiseStrength = 0;
let noiseSlider;
let noiseMode = false;
let noiseCheckbox;
// UI 요소 전역 참조 (재배치용)
let fileInputGlobal, maskInputGlobal, rasterInputGlobal, patternSVGInputGlobal;
let offscreenCanvas; // 오프스크린 캔버스
let baseImg; // 원본 기본 이미지
let patternSVG = null; // SVG 패턴용 별도 이미지

function preload() {
  baseImg = loadImage('https://d2w9rnfcy7mm78.cloudfront.net/37945145/original_149aef3cb23d4d0a495f19326c665581.jpg?1751961646?bc=0'); // 기본 이미지
}

function setup() {
  // 기본 이미지로 캔버스 크기 고정 - 절대 변경하지 않음
  cnv = createCanvas(baseImg.width, baseImg.height, SVG);
  img = baseImg; // 시작은 기본 이미지
  
  const uiX = img.width * previewScale + 50; // UI 패널 x 좌표 (캔버스 우측에 여유 50px)
  
  // 미리보기 크기만 축소 (CSS)
  cnv.elt.style.transformOrigin = 'top left';
  cnv.elt.style.transform = `scale(${previewScale})`;

  // 래스터 이미지 업로더 (jpg/png 등) - 복원!
  rasterInputGlobal = createFileInput(handleRasterFile);
  rasterInputGlobal.attribute('accept', '.jpg,.jpeg,.png,.gif,.bmp,.webp');
  rasterInputGlobal.position(uiX, 40);
  createSpan('Raster Image').position(uiX+140, 45);

  // SVG 파일 업로더 생성
  // 타일 SVG 업로더
  fileInputGlobal = createFileInput(handleFile, true);  // allow multiple
  fileInputGlobal.attribute('multiple', '');
  fileInputGlobal.attribute('accept', '.svg');
  fileInputGlobal.position(uiX, 80);
  createSpan('Tile SVGs').position(uiX+140, 85);

  // 마스크 SVG 업로더 (배열 위치 정의용)
  maskInputGlobal = createFileInput(handleMaskSVG);
  maskInputGlobal.attribute('accept', '.svg');
  maskInputGlobal.position(uiX, 120);
  createSpan('Mask SVG').position(uiX+140, 125);

  // 패턴 SVG 업로더 (새로운! - SVG Pattern용)
  patternSVGInputGlobal = createFileInput(handlePatternSVG);
  patternSVGInputGlobal.attribute('accept', '.svg');
  patternSVGInputGlobal.position(uiX, 160);
  createSpan('Pattern SVG').position(uiX+140, 165);

  // 미리보기 배율 슬라이더
  scaleSlider = createSlider(0.1, 1, previewScale, 0.1);
  scaleSlider.position(uiX, 200);
  createSpan('Preview Scale').position(uiX+140, 205);
  scaleSlider.input(() => {
    previewScale = scaleSlider.value();
    cnv.elt.style.transform = `scale(${previewScale})`;
    updateUIPositions();
  });

  // 타일 크기 슬라이더
  tileSlider = createSlider(5, 100, tileSize, 1);
  tileSlider.position(uiX, 240);
  createSpan('Tile Size').position(uiX+140, 245);
  tileSlider.input(() => {
    tileSize = tileSlider.value();
    redrawHalftone();
  });

  // 콘트라스트 슬라이더
  contrastSlider = createSlider(0.2, 3, contrast, 0.1);
  contrastSlider.position(uiX, 280);
  createSpan('Contrast').position(uiX+140, 285);
  contrastSlider.input(() => {
    contrast = contrastSlider.value();
    redrawHalftone();
  });

  // 밝기 슬라이더
  brightnessSlider = createSlider(0.5, 1.5, brightnessFactor, 0.05);
  brightnessSlider.position(uiX, 320);
  createSpan('Brightness').position(uiX+140, 325);
  brightnessSlider.input(() => {
    brightnessFactor = brightnessSlider.value();
    redrawHalftone();
  });

  // 최소 도트 크기 슬라이더
  minDotSlider = createSlider(1, 20, minDotSize, 1);
  minDotSlider.position(uiX, 360);
  createSpan('Min Dot').position(uiX+140, 365);
  minDotSlider.input(() => {
    minDotSize = minDotSlider.value();
    redrawHalftone();
  });

  // 최대 도트 크기 스케일 슬라이더
  maxDotSlider = createSlider(1, 3, maxDotScale, 0.1);
  maxDotSlider.position(uiX, 400);
  createSpan('Max Dot Scale').position(uiX+140, 405);
  maxDotSlider.input(() => {
    maxDotScale = maxDotSlider.value();
    redrawHalftone();
  });

  // 밝은 영역 스킵 슬라이더
  brightSkipSlider = createSlider(0, 0.5, brightSkip, 0.01);
  brightSkipSlider.position(uiX, 440);
  createSpan('Skip Bright').position(uiX+140, 445);

  // 흑백 반전 체크박스
  invertCheckbox = createCheckbox('Invert', invertMode);
  invertCheckbox.position(uiX, 480);
  invertCheckbox.changed(() => {
    invertMode = invertCheckbox.checked();
    redrawHalftone();
  });

  // 중력 시뮬레이션 체크박스
  gravityCheckbox = createCheckbox('Gravity Mode', gravityMode);
  gravityCheckbox.position(uiX, 500);
  gravityCheckbox.changed(() => {
    gravityMode = gravityCheckbox.checked();
    redrawHalftone();
  });

  // 중력 강도 슬라이더
  gravitySlider = createSlider(0, 100, gravityStrength, 1);
  gravitySlider.position(uiX, 520);
  createSpan('Gravity Strength').position(uiX+140, 525);
  gravitySlider.input(() => {
    gravityStrength = gravitySlider.value();
    if (gravityMode) redrawHalftone();
  });

  // 노이즈 모드 체크박스
  noiseCheckbox = createCheckbox('Noise/Jitter', noiseMode);
  noiseCheckbox.position(uiX, 540);
  noiseCheckbox.changed(() => {
    noiseMode = noiseCheckbox.checked();
    redrawHalftone();
  });

  // 노이즈 강도 슬라이더
  noiseSlider = createSlider(0, 50, noiseStrength, 1);
  noiseSlider.position(uiX, 560);
  createSpan('Noise Strength').position(uiX+140, 565);
  noiseSlider.input(() => {
    noiseStrength = noiseSlider.value();
    if (noiseMode) redrawHalftone();
  });

  // 패턴 타입 드롭다운
  patternSelect = createSelect();
  patternSelect.option('Grid');
  patternSelect.option('Staggered');
  patternSelect.option('Radial');
  patternSelect.option('Shape'); // 기존: SVG 마스크
  patternSelect.option('SVG Pattern'); // 새로운: SVG 모양 반복 패턴
  patternSelect.position(uiX, 600);
  createSpan('Pattern').position(uiX+140, 605);
  patternSelect.changed(() => redrawHalftone());

  // Shape 모드 드롭다운
  shapeModeSelect = createSelect();
  shapeModeSelect.option('Single');
  shapeModeSelect.option('Range');
  shapeModeSelect.option('Random');
  shapeModeSelect.position(uiX, 640);
  createSpan('Shape Mode').position(uiX+140, 645);
  shapeModeSelect.changed(() => {
    updateRangeUI();
    redrawHalftone();
  });

  // Range 임계값 슬라이더 (초기 숨김은 추후 처리)
  threshold1Slider = createSlider(0, 1, 0.33, 0.01);
  threshold1Slider.position(uiX, 680);
  threshold2Slider = createSlider(0, 1, 0.66, 0.01);
  threshold2Slider.position(uiX, 720);
  createSpan('T1').position(uiX+140, 685);
  createSpan('T2').position(uiX+140, 725);
  threshold1Slider.input(() => redrawHalftone());
  threshold2Slider.input(() => redrawHalftone());

  // 초기 Range 슬라이더 가시성 설정
  updateRangeUI();
  brightSkipSlider.input(() => {
    brightSkip = brightSkipSlider.value();
    brightnessFactor = brightnessSlider.value();
    contrast = contrastSlider.value();
    redrawHalftone();
  });

  noLoop(); // 한 번만 그림
  noStroke();
  fill(0); // 1도 블랙
  img.loadPixels();

  drawHalftone();

  // 저장 버튼 추가
  const btn = createButton('Save SVG');
  btn.position(uiX, 10);
  btn.mousePressed(() => save('halftone-output.svg'));
  
  // PNG 저장 버튼
  const btnPng = createButton('Save PNG');
  btnPng.position(uiX+80, 10);
  btnPng.mousePressed(() => {
    const svgEl = document.querySelector('svg');
    if (svgEl) saveSvgAsPng(svgEl, 'halftone-output.png');
  });
}

// 래스터 이미지 핸들러 - 오프스크린으로 처리, 캔버스 크기는 고정
function handleRasterFile(file) {
  if (file.type === 'image') {
    const reader = new FileReader();
    reader.onload = function(e) {
      loadImage(e.target.result, newImg => {
        console.log('새 이미지 로드:', newImg.width, 'x', newImg.height);
        
        // 오프스크린 캔버스에서 이미지 처리 - 기본 캔버스 크기에 맞춤
        offscreenCanvas = createGraphics(baseImg.width, baseImg.height);
        
        // 새 이미지를 기본 캔버스 크기에 맞게 스케일링
        const scaleX = baseImg.width / newImg.width;
        const scaleY = baseImg.height / newImg.height;
        const scale = Math.min(scaleX, scaleY); // 비율 유지하며 맞춤
        
        const scaledW = newImg.width * scale;
        const scaledH = newImg.height * scale;
        const offsetX = (baseImg.width - scaledW) / 2;
        const offsetY = (baseImg.height - scaledH) / 2;
        
        // 오프스크린에 이미지 그리기
        offscreenCanvas.image(newImg, offsetX, offsetY, scaledW, scaledH);
        
        img = offscreenCanvas; // 처리된 이미지 사용
        console.log('오프스크린 처리 완료');
        
        // 캔버스 크기는 변경하지 않음 - 고정
        // UI 위치도 변경하지 않음 - 고정
        
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
      console.log('패턴 SVG 로드 완료:', patternSVG.width, 'x', patternSVG.height);
      redrawHalftone();
    });
  } else {
    alert('SVG 파일(.svg)만 업로드하세요');
  }
}

function updateUIPositions() {
  // UI 위치는 고정 - 캔버스 크기가 변하지 않으므로 불필요
  // 하지만 함수는 유지 (다른 곳에서 호출될 수 있음)
}

function redrawHalftone() {
  clear();
  noStroke();
  fill(0);
  drawHalftone();
}

// 패턴별 위치 계산
function calcPositions(pattern) {
  const pts = [];
  const half = tileSize / 2;
  switch(pattern) {
    case 'Staggered':
      for (let y = half; y <= img.height - half; y += tileSize) {
        const row = Math.floor((y - half) / tileSize);
        const offset = (row % 2 === 1) ? tileSize / 2 : 0;
        for (let x = half + offset; x <= img.width - half; x += tileSize) {
          pts.push({x, y});
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
          const x = round(cx + r * cos(a));
          const y = round(cy + r * sin(a));
          if (x >= half && x <= img.width - half && y >= half && y <= img.height - half) {
            pts.push({x, y});
          }
        }
      }
      break; }
    case 'Shape': {
      // 기존: SVG 마스크 - SVG 모양 안에서만 도트 생성
      const refShape = maskShape || customShape;
      if (!refShape) break;
      refShape.loadPixels();
      const imgW = img.width;
      const imgH = img.height;
      for (let y = half; y <= imgH - half; y += tileSize) {
        for (let x = half; x <= imgW - half; x += tileSize) {
          const sx = floor(map(x, 0, imgW, 0, refShape.width - 1));
          const sy = floor(map(y, 0, imgH, 0, refShape.height - 1));
          const idx = 4 * (sy * refShape.width + sx) + 3;
          const alphaVal = refShape.pixels[idx];
          if (alphaVal > 10) {
            pts.push({x, y});
          }
        }
      }
      break; }
    case 'SVG Pattern': {
      // SVG 모양을 패턴으로 반복
      const patternShape = patternSVG; // 전용 패턴 SVG 사용
      if (!patternShape) {
        console.log('패턴 SVG가 없음 - Pattern SVG를 업로드하세요');
        break;
      }
      
      patternShape.loadPixels();
      const shapeW = patternShape.width;
      const shapeH = patternShape.height;
      
      console.log('SVG Pattern 모드 - 패턴 크기:', shapeW, 'x', shapeH);
      
      // SVG 모양을 타일처럼 반복
      const tilesX = Math.ceil(img.width / shapeW);
      const tilesY = Math.ceil(img.height / shapeH);
      
      for (let tileY = 0; tileY < tilesY; tileY++) {
        for (let tileX = 0; tileX < tilesX; tileX++) {
          const tileOffsetX = tileX * shapeW;
          const tileOffsetY = tileY * shapeH;
          
          // 각 타일 내에서 SVG 모양에 따라 도트 배치
          for (let sy = 0; sy < shapeH; sy += tileSize) {
            for (let sx = 0; sx < shapeW; sx += tileSize) {
              const idx = 4 * (sy * shapeW + sx) + 3; // alpha index
              const alphaVal = patternShape.pixels[idx];
              
              if (alphaVal > 10) {
                const finalX = tileOffsetX + sx;
                const finalY = tileOffsetY + sy;
                
                // 캔버스 범위 내에서만 추가
                if (finalX >= 0 && finalX < img.width && finalY >= 0 && finalY < img.height) {
                  pts.push({x: finalX, y: finalY});
                }
              }
            }
          }
        }
      }
      break; }
    default: // Grid
      for (let y = half; y <= img.height - half; y += tileSize) {
        for (let x = half; x <= img.width - half; x += tileSize) {
          pts.push({x, y});
        }
      }
  }
  return pts;
}

function updateRangeUI() {
  const show = shapeModeSelect && shapeModeSelect.value() === 'Range';
  threshold1Slider.style('display', show ? 'block' : 'none');
  threshold2Slider.style('display', show ? 'block' : 'none');
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
  const idx = floor(brightnessNorm * 1000) % shapes.length;
  return shapes[idx];
}

function drawHalftone() {
  const positions = calcPositions(patternSelect ? patternSelect.value() : 'Grid');
  
  // 각 위치의 도트 정보 미리 계산
  const dotData = [];
  positions.forEach((pos, index) => {
    const {x, y} = pos;
    let c = img.get(x, y);
    if (alpha(c) === 0) {
      dotData[index] = null;
      return;
    }
    
    let b = (red(c) + green(c) + blue(c)) / 3 * brightnessFactor;
    let brightnessNorm = pow(map(b, 0, 255, 1, 0), contrast);
    if (invertMode) brightnessNorm = 1 - brightnessNorm;

    let s = brightnessNorm * tileSize;
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
        mass: brightnessNorm // 밝기가 높을수록(어두울수록) 무거움
      };
    }
  });
  
  // 중력 시뮬레이션 적용
  if (gravityMode && gravityStrength > 0) {
    dotData.forEach(dot => {
      if (!dot) return;
      
      // 중력에 의한 낙하 거리 계산
      // 무거운 도트(어두운 부분)일수록 더 많이 떨어짐
      const fallDistance = (dot.mass * gravityStrength * 3); // 배율 조정
      
      // Y 좌표에 중력 효과 적용
      dot.y = dot.originalY + fallDistance;
      
      // 캔버스 밖으로 나가지 않도록 제한
      if (dot.y > img.height - dot.size/2) {
        dot.y = img.height - dot.size/2;
      }
    });
  }
  
  // 노이즈/지터링 적용
  if (noiseMode && noiseStrength > 0) {
    dotData.forEach(dot => {
      if (!dot) return;
      
      // 각 도트의 원래 위치를 기준으로 랜덤 오프셋 추가
      // 같은 위치에서는 항상 같은 노이즈 값이 나오도록 시드 사용
      const seed = dot.originalX * 1000 + dot.originalY;
      
      // 의사 랜덤 함수 (deterministic)
      const pseudoRandom = (s) => {
        let x = Math.sin(s) * 10000;
        return x - Math.floor(x);
      };
      
      // X, Y 각각에 대해 다른 시드 사용
      const offsetX = (pseudoRandom(seed) - 0.5) * noiseStrength;
      const offsetY = (pseudoRandom(seed + 1) - 0.5) * noiseStrength;
      
      // 현재 위치에 노이즈 오프셋 추가
      dot.x += offsetX;
      dot.y += offsetY;
      
      // 캔버스 경계 내에 유지
      dot.x = constrain(dot.x, dot.size/2, img.width - dot.size/2);
      dot.y = constrain(dot.y, dot.size/2, img.height - dot.size/2);
    });
  }
  
  // 겹침 방지 (기존 로직 유지하되 새로운 위치 기준)
  const adjustedSizes = dotData.map(dot => dot ? dot.size : 0);
  dotData.forEach((dot, index) => {
    if (!dot) return;
    
    let currentSize = dot.size;
    
    // 주변 도트들과의 거리 확인
    dotData.forEach((otherDot, otherIndex) => {
      if (index === otherIndex || !otherDot) return;
      
      const distance = dist(dot.x, dot.y, otherDot.x, otherDot.y);
      const minDistance = (currentSize + otherDot.size) / 2;
      
      if (distance < minDistance && distance > 0) {
        const maxAllowedSize = Math.max(minDotSize, (distance * 2) - otherDot.size/2);
        currentSize = Math.min(currentSize, maxAllowedSize);
      }
    });
    
    adjustedSizes[index] = currentSize;
  });

  // 조정된 크기로 도트 그리기
  dotData.forEach((dot, index) => {
    if (!dot) return;
    
    const s = adjustedSizes[index];
    if (s <= 0) return;

    const shapeImg = pickShape(dot.brightness);
    if (shapeImg) {
      image(shapeImg, dot.x - s / 2, dot.y - s / 2, s, s);
    } else {
      ellipse(dot.x, dot.y, s, s);
    }
  });
}
