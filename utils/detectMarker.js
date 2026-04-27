import * as ImageManipulator from 'expo-image-manipulator';
import jpeg from 'jpeg-js';
import { Buffer } from 'buffer';

const DEBUG = true;

const RESIZE_WIDTH = 220;
const NORMALIZED_SIZE = 96;
const THRESHOLD = 120;

function binaryToJpegBase64(bin, width, height) {
  const rgba = Buffer.alloc(width * height * 4);

  for (let i = 0, p = 0; i < bin.length; i++, p += 4) {
    const v = bin[i] ? 0 : 255;
    rgba[p] = v;
    rgba[p + 1] = v;
    rgba[p + 2] = v;
    rgba[p + 3] = 255;
  }

  const encoded = jpeg.encode({ data: rgba, width, height }, 82);
  return Buffer.from(encoded.data).toString('base64');
}

// ---------- DEBUG ----------
function pushFrame(frames, base64, label) {
  if (!DEBUG || !base64) return;

  frames.push({
    uri: `data:image/jpeg;base64,${base64}`,
    label,
  });
}

function pushBinaryFrame(frames, bin, width, height, label) {
  if (!DEBUG) return;

  try {
    const base64 = binaryToJpegBase64(bin, width, height);
    pushFrame(frames, base64, label);
  } catch (e) {
    log('pushBinaryFrame-error', e?.message || e);
  }
}

function log(label, data) {
  if (DEBUG) console.log(`[detect] ${label}`, data);
}

// ---------- HELPERS ----------
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function region(bin, size, x0, y0, x1, y1) {
  let b = 0, t = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      t++;
      b += bin[y * size + x];
    }
  }

  return t === 0 ? 0 : b / t;
}

function bestBorderBand(bin, size, edge, thickness, searchDepth) {
  let best = 0;
  let bestOffset = 0;

  const maxOffset = Math.max(0, searchDepth - thickness);

  for (let offset = 0; offset <= maxOffset; offset++) {
    let val = 0;

    if (edge === 'top') {
      val = region(bin, size, 0, offset, size, offset + thickness);
    } else if (edge === 'bottom') {
      const y1 = size - offset;
      const y0 = y1 - thickness;
      val = region(bin, size, 0, y0, size, y1);
    } else if (edge === 'left') {
      val = region(bin, size, offset, 0, offset + thickness, size);
    } else if (edge === 'right') {
      const x1 = size - offset;
      const x0 = x1 - thickness;
      val = region(bin, size, x0, 0, x1, size);
    }

    if (val > best) {
      best = val;
      bestOffset = offset;
    }
  }

  return { value: best, offset: bestOffset };
}

function rotate90(bin, size) {
  const out = new Uint8Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[x * size + (size - 1 - y)] = bin[y * size + x];
    }
  }

  return out;
}

function rotateGrayByAngle(src, size, angleDeg) {
  const out = new Uint8Array(size * size);
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;

  function sample(ix, iy) {
    if (ix < 0 || ix >= size || iy < 0 || iy >= size) return 255;
    return src[iy * size + ix];
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;

      const sx = cos * dx + sin * dy + cx;
      const sy = -sin * dx + cos * dy + cy;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = x0 + 1;
      const y1 = y0 + 1;

      const fx = sx - x0;
      const fy = sy - y0;

      const v00 = sample(x0, y0);
      const v10 = sample(x1, y0);
      const v01 = sample(x0, y1);
      const v11 = sample(x1, y1);

      const v0 = v00 * (1 - fx) + v10 * fx;
      const v1 = v01 * (1 - fx) + v11 * fx;
      const v = v0 * (1 - fy) + v1 * fy;

      out[y * size + x] = Math.round(v);
    }
  }

  return out;
}

function histogramFromGray(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) {
    hist[gray[i]] += 1;
  }
  return hist;
}

function binarizeGrayWithOtsu(gray) {
  const hist = histogramFromGray(gray);
  const threshold = computeOtsuThreshold(hist, gray.length);
  const out = new Uint8Array(gray.length);

  for (let i = 0; i < gray.length; i++) {
    out[i] = gray[i] <= threshold ? 1 : 0;
  }

  return { bin: out, threshold };
}

function computeOtsuThreshold(hist, total) {
  let sum = 0;
  for (let t = 0; t < 256; t++) {
    sum += t * hist[t];
  }

  let sumB = 0;
  let wB = 0;
  let maxVariance = -1;
  let threshold = THRESHOLD;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;

    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];

    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);

    if (between > maxVariance) {
      maxVariance = between;
      threshold = t;
    }
  }

  return threshold;
}

function findBBox(bin, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bin[y * w + x]) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function findConnectedComponents(bin, w, h, minArea = 1) {
  const seen = new Uint8Array(w * h);
  const comps = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!bin[idx] || seen[idx]) continue;

      const stack = [idx];
      seen[idx] = 1;

      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let area = 0;

      while (stack.length) {
        const cur = stack.pop();
        const cy = Math.floor(cur / w);
        const cx = cur - cy * w;

        area += 1;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;

        const up = cur - w;
        const down = cur + w;
        const left = cur - 1;
        const right = cur + 1;

        if (cy > 0 && bin[up] && !seen[up]) {
          seen[up] = 1;
          stack.push(up);
        }
        if (cy < h - 1 && bin[down] && !seen[down]) {
          seen[down] = 1;
          stack.push(down);
        }
        if (cx > 0 && bin[left] && !seen[left]) {
          seen[left] = 1;
          stack.push(left);
        }
        if (cx < w - 1 && bin[right] && !seen[right]) {
          seen[right] = 1;
          stack.push(right);
        }
      }

      if (area >= minArea) {
        comps.push({
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
          area,
        });
      }
    }
  }

  return comps;
}

function selectMarkerBBox(bin, w, h) {
  const total = w * h;
  const minArea = Math.max(18, Math.floor(total * 0.0008));
  const comps = findConnectedComponents(bin, w, h, minArea);

  if (!comps.length) {
    return null;
  }

  let best = null;
  let bestScore = -Infinity;

  const minDim = Math.min(w, h);
  const minBoxSize = Math.max(14, Math.floor(minDim * 0.08));
  const idealSize = Math.max(minBoxSize + 1, Math.floor(minDim * 0.34));

  for (const c of comps) {
    if (c.width < minBoxSize || c.height < minBoxSize) {
      continue;
    }

    const ar = c.width / Math.max(1, c.height);
    const squarePenalty = Math.abs(Math.log(ar));
    const areaRatio = c.area / total;
    const fillsBox = c.area / Math.max(1, c.width * c.height);

    const boxSize = Math.max(c.width, c.height);
    const sizeCloseness = 1 - Math.min(1, Math.abs(boxSize - idealSize) / idealSize);

    const touchesEdge =
      c.x === 0 ||
      c.y === 0 ||
      c.x + c.width >= w ||
      c.y + c.height >= h;

    // Tiny, dense blobs are often anchor/noise fragments, not full markers.
    const tinyDensePenalty = boxSize < minBoxSize * 1.4 && fillsBox > 0.45 ? 0.9 : 0;

    // Marker black pixels should usually not fill almost the whole bounding box.
    const fillPenalty = fillsBox > 0.72 ? (fillsBox - 0.72) * 2.2 : 0;

    const score =
      sizeCloseness * 2.2 +
      areaRatio * 1.2 +
      fillsBox * 0.25 -
      squarePenalty * 1.4 -
      (touchesEdge ? 0.45 : 0) -
      fillPenalty -
      tinyDensePenalty;

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  // If every component was too small, fall back to largest component rather than a tiny blob.
  if (!best) {
    let fallback = null;
    for (const c of comps) {
      if (!fallback || c.area > fallback.area) {
        fallback = c;
      }
    }
    best = fallback;
    bestScore = -999;
  }

  log('components', {
    count: comps.length,
    minBoxSize,
    idealSize,
    bestScore,
    best,
  });

  return best;
}

function crop(bin, w, rect) {
  const out = new Uint8Array(rect.width * rect.height);

  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      out[y * rect.width + x] =
        bin[(rect.y + y) * w + (rect.x + x)];
    }
  }

  return out;
}

function resize(src, sw, sh, dw, dh) {
  const out = new Uint8Array(dw * dh);

  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = Math.floor((x / dw) * sw);
      const sy = Math.floor((y / dh) * sh);
      out[y * dw + x] = src[sy * sw + sx];
    }
  }

  return out;
}

function tightenToMarker(bin, size) {
  const bbox = findBBox(bin, size, size);
  if (!bbox) return bin;

  const minDim = Math.min(bbox.width, bbox.height);
  if (minDim < Math.floor(size * 0.35)) {
    return bin;
  }

  const coreSize = Math.max(bbox.width, bbox.height);
  const pad = Math.max(1, Math.floor(coreSize * 0.06));
  const target = coreSize + pad * 2;
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;

  const rect = {
    x: Math.floor(clamp(cx - target / 2, 0, size - 1)),
    y: Math.floor(clamp(cy - target / 2, 0, size - 1)),
    width: 1,
    height: 1,
  };

  rect.width = Math.max(1, Math.floor(Math.min(target, size - rect.x)));
  rect.height = Math.max(1, Math.floor(Math.min(target, size - rect.y)));

  const cropped = crop(bin, size, rect);
  return resize(cropped, rect.width, rect.height, size, size);
}

function measureLargestComponentInRect(bin, size, rect) {
  const safeRect = {
    x: Math.max(0, Math.min(rect.x, size - 1)),
    y: Math.max(0, Math.min(rect.y, size - 1)),
    width: Math.max(1, Math.min(rect.width, size - rect.x)),
    height: Math.max(1, Math.min(rect.height, size - rect.y)),
  };

  const local = crop(bin, size, safeRect);
  const minArea = Math.max(4, Math.floor(safeRect.width * safeRect.height * 0.05));
  const comps = findConnectedComponents(local, safeRect.width, safeRect.height, minArea);

  if (!comps.length) {
    return null;
  }

  let best = comps[0];
  for (const comp of comps) {
    if (comp.area > best.area) {
      best = comp;
    }
  }

  return {
    x: best.x + safeRect.x,
    y: best.y + safeRect.y,
    width: best.width,
    height: best.height,
    area: best.area,
    fill: best.area / Math.max(1, best.width * best.height),
    rect: safeRect,
  };
}

// ---------- VALIDATION ----------
function evaluateTopLeftOrientation(bin, size) {
  const border = Math.max(2, Math.floor(size * 0.045));
  const anchorSize = Math.max(5, Math.floor(size * 0.14));
  const searchDepth = Math.max(border + 1, Math.floor(size * 0.16));
  const expectedAnchorSize = Math.max(6, Math.round(size * 0.145));
  const anchorWindowSize = Math.max(
    expectedAnchorSize * 2,
    Math.round(size * 0.28)
  );

  const topBand = bestBorderBand(bin, size, 'top', border, searchDepth);
  const leftBand = bestBorderBand(bin, size, 'left', border, searchDepth);
  const rightBand = bestBorderBand(bin, size, 'right', border, searchDepth);
  const bottomBand = bestBorderBand(bin, size, 'bottom', border, searchDepth);

  const top = topBand.value;
  const left = leftBand.value;
  const right = rightBand.value;
  const bottom = bottomBand.value;

  const innerOffset = Math.max(
    border + 2,
    Math.max(topBand.offset, leftBand.offset) + border + 1
  );

  const anchorRect = {
    x: innerOffset,
    y: innerOffset,
    width: Math.max(1, Math.min(anchorWindowSize, size - innerOffset)),
    height: Math.max(1, Math.min(anchorWindowSize, size - innerOffset)),
  };

  const anchorComponent = measureLargestComponentInRect(bin, size, anchorRect);

  const tl = region(
    bin,
    size,
    innerOffset,
    innerOffset,
    innerOffset + anchorSize,
    innerOffset + anchorSize
  );
  const tr = region(
    bin,
    size,
    size - innerOffset - anchorSize,
    innerOffset,
    size - innerOffset,
    innerOffset + anchorSize
  );
  const bl = region(
    bin,
    size,
    innerOffset,
    size - innerOffset - anchorSize,
    innerOffset + anchorSize,
    size - innerOffset
  );
  const br = region(
    bin,
    size,
    size - innerOffset - anchorSize,
    size - innerOffset - anchorSize,
    size - innerOffset,
    size - innerOffset
  );

  const c0 = Math.floor(size * 0.38);
  const c1 = Math.floor(size * 0.62);
  const center = region(bin, size, c0, c0, c1, c1);

  const nonTlMax = Math.max(tr, bl, br);
  const nonTlMean = (tr + bl + br) / 3;
  const borderMin = Math.min(top, left, right, bottom);
  const borderMean = (top + left + right + bottom) / 4;
  const borderMax = Math.max(top, left, right, bottom);
  const borderSpread = borderMax - borderMin;
  const anchorDominance = tl - nonTlMean;
  const anchorVsCenter = tl - center;
  const borderVsCenter = borderMean - center;
  const cornerSeparation = tl - nonTlMax;

  const expectedAnchorArea = expectedAnchorSize * expectedAnchorSize;
  const anchorComponentSize = anchorComponent
    ? Math.max(anchorComponent.width, anchorComponent.height)
    : 0;
  const anchorAreaRatio = anchorComponent
    ? anchorComponent.area / Math.max(1, expectedAnchorArea)
    : 0;
  const anchorSizeRatio = anchorComponent
    ? anchorComponentSize / Math.max(1, expectedAnchorSize)
    : 0;
  const anchorAspectRatio = anchorComponent
    ? Math.max(anchorComponent.width, anchorComponent.height) /
      Math.max(1, Math.min(anchorComponent.width, anchorComponent.height))
    : Infinity;
  const anchorOffsetX = anchorComponent ? anchorComponent.x - anchorRect.x : Infinity;
  const anchorOffsetY = anchorComponent ? anchorComponent.y - anchorRect.y : Infinity;

  const anchorAreaPass =
    anchorComponent && anchorAreaRatio >= 0.45 && anchorAreaRatio <= 2.05;
  const anchorSizePass =
    anchorComponent && anchorSizeRatio >= 0.85 && anchorSizeRatio <= 1.7;
  const anchorAspectPass = anchorComponent && anchorAspectRatio <= 1.9;
  const anchorCornerPass =
    anchorComponent && anchorOffsetX <= 4 && anchorOffsetY <= 4;
  const anchorShapePass =
    anchorComponent && anchorComponent.fill >= 0.32;

  const borderPass =
    borderMin > 0.08 &&
    borderMean > 0.1 &&
    borderSpread < 0.25;
  const anchorPass =
    anchorAreaPass &&
    anchorSizePass &&
    anchorAspectPass &&
    anchorCornerPass &&
    anchorShapePass &&
    cornerSeparation > 0.03;
  const centerPass = center < 0.9;

  const score =
    (anchorComponent ? (1 - Math.abs(anchorAreaRatio - 1)) * 1.4 : -1) +
    (anchorComponent ? (1 - Math.abs(anchorSizeRatio - 1)) * 1.2 : -1) +
    (anchorComponent ? (1 - Math.min(1, (anchorAspectRatio - 1) / 0.9)) * 0.7 : -0.5) +
    borderMean * 0.7 -
    borderSpread * 0.5 -
    nonTlMean * 0.25 -
    (borderPass ? 0 : 0.5);

  const passCount = [borderPass, anchorPass].filter(Boolean).length;
  const qualityPass = borderPass && anchorPass;

  log('evaluate', {
    top,
    left,
    right,
    bottom,
    borderOffsets: {
      top: topBand.offset,
      left: leftBand.offset,
      right: rightBand.offset,
      bottom: bottomBand.offset,
    },
    center,
    anchors: [tl, tr, bl, br],
    nonTlMean,
    nonTlMax,
    anchorDominance,
    anchorVsCenter,
    borderVsCenter,
    borderSpread,
    cornerSeparation,
    expectedAnchorSize,
    anchorComponent,
    anchorAreaRatio,
    anchorSizeRatio,
    anchorAspectRatio,
    anchorOffsetX,
    anchorOffsetY,
    borderMin,
    borderMean,
    borderPass,
    anchorPass,
    centerPass,
    passCount,
    qualityPass,
    score,
  });

  return {
    isValid: qualityPass,
    borderPass,
    anchorPass,
    centerPass,
    qualityPass,
    score,
  };
}

// ---------- MAIN ----------
export default async function detectMarker(uri) {
  const frames = [];

  try {
    // 1. Resize (ONLY real visual frame)
    const img = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: RESIZE_WIDTH } }],
      { base64: true }
    );

    pushFrame(frames, img.base64, "resized");

    // 2. Decode
    const bytes = Buffer.from(img.base64, 'base64');
    const { data, width, height } = jpeg.decode(bytes);

    const total = width * height;
    const grayPixels = new Uint8Array(total);
    const histogram = new Uint32Array(256);

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const gray = Math.round(
        (data[i] * 30 + data[i + 1] * 59 + data[i + 2] * 11) / 100
      );
      grayPixels[p] = gray;
      histogram[gray] += 1;
    }

    const otsuThreshold = computeOtsuThreshold(histogram, total);
    log('threshold', { otsuThreshold });

    const bin = new Uint8Array(total);

    let black = 0;

    // 3. Binarize
    for (let p = 0; p < grayPixels.length; p++) {
      const val = grayPixels[p] <= otsuThreshold ? 1 : 0;
      bin[p] = val;
      black += val;
    }

    const blackRatio = black / total;
    log("blackRatio", blackRatio);

    if (blackRatio < 0.005 || blackRatio > 0.92) {
      log('reject', 'global black ratio out of range');
      return { isValid: false, frames, rotation: 0, rotationDegrees: 0 };
    }

    pushBinaryFrame(frames, bin, width, height, 'binary');

    // 4. Bounding box from connected-component candidates
    let bbox = selectMarkerBBox(bin, width, height);

    if (!bbox) {
      bbox = findBBox(bin, width, height);
    }

    if (!bbox) {
      log("reject", "no bbox");
      return { isValid: false, frames };
    }

    log("bbox", bbox);

    // 5. Padding crop
    const pad = 0.12;
    const size = Math.max(bbox.width, bbox.height) * (1 + pad);

    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;

    const square = {
      x: Math.floor(clamp(cx - size / 2, 0, width - 1)),
      y: Math.floor(clamp(cy - size / 2, 0, height - 1)),
      width: 1,
      height: 1,
    };

    square.width = Math.max(1, Math.floor(Math.min(size, width - square.x)));
    square.height = Math.max(1, Math.floor(Math.min(size, height - square.y)));

    const cropped = crop(bin, width, square);
    const croppedGray = crop(grayPixels, width, square);

    // 6. Normalize
    const normalized = resize(
      cropped,
      square.width,
      square.height,
      NORMALIZED_SIZE,
      NORMALIZED_SIZE
    );

    const normalizedGray = resize(
      croppedGray,
      square.width,
      square.height,
      NORMALIZED_SIZE,
      NORMALIZED_SIZE
    );

    pushBinaryFrame(frames, normalized, NORMALIZED_SIZE, NORMALIZED_SIZE, 'normalized');

    const tightened = tightenToMarker(normalized, NORMALIZED_SIZE);
    pushBinaryFrame(frames, tightened, NORMALIZED_SIZE, NORMALIZED_SIZE, 'normalized-tight');

    // 🔥 KEY DEBUG (this replaces broken image debug)
    const ones = tightened.reduce((a, b) => a + b, 0);
    const normRatio = ones / tightened.length;

    log("normalized-stats", {
      blackPixels: ones,
      total: normalized.length,
      ratio: normRatio,
    });

    // 7. Evaluate rotations (coarse arbitrary-angle deskew + 90deg orientation)
    let best = null;
    let bestValid = null;
    let secondBestValid = null;
    let validCount = 0;
    let bestRotation = 0;
    let bestValidRotation = 0;
    let bestBaseAngle = 0;
    let bestValidBaseAngle = 0;

    for (let baseAngle = 0; baseAngle < 90; baseAngle += 10) {
      const rotatedGray = rotateGrayByAngle(normalizedGray, NORMALIZED_SIZE, baseAngle);
      const { bin: rotatedBin } = binarizeGrayWithOtsu(rotatedGray);
      let current = tightenToMarker(rotatedBin, NORMALIZED_SIZE);
      current = tightenToMarker(current, NORMALIZED_SIZE);

      for (let i = 0; i < 4; i++) {
        const res = evaluateTopLeftOrientation(current, NORMALIZED_SIZE);

        if (res.isValid && (!bestValid || res.score > bestValid.score)) {
          if (bestValid && res.score !== bestValid.score) {
            secondBestValid = !secondBestValid || bestValid.score > secondBestValid.score ? bestValid : secondBestValid;
          }
          bestValid = res;
          bestValidRotation = i;
          bestValidBaseAngle = baseAngle;
          validCount += 1;
        } else if (
          res.isValid &&
          (!secondBestValid || res.score > secondBestValid.score) &&
          (!bestValid || res.score < bestValid.score)
        ) {
          secondBestValid = res;
          validCount += 1;
        } else if (res.isValid) {
          validCount += 1;
        }

        if (!best || res.score > best.score) {
          best = res;
          bestRotation = i;
          bestBaseAngle = baseAngle;
        }

        current = rotate90(current, NORMALIZED_SIZE);
      }
    }

    if (bestValid) {
      const bestValidMargin = secondBestValid ? bestValid.score - secondBestValid.score : Infinity;
      const ambiguousValid = secondBestValid && bestValidMargin < 0.18;

      log('validity-margin', {
        validCount,
        bestValidScore: bestValid.score,
        secondBestValidScore: secondBestValid?.score ?? null,
        bestValidMargin,
        ambiguousValid,
      });

      if (ambiguousValid) {
        bestValid = null;
      }
    }

    if (bestValid) {
      best = bestValid;
      bestRotation = bestValidRotation;
      bestBaseAngle = bestValidBaseAngle;
    }

    const bestRotationDegrees = bestBaseAngle + bestRotation * 90;

    if (DEBUG) {
      const orientedGray = rotateGrayByAngle(normalizedGray, NORMALIZED_SIZE, bestBaseAngle);
      const { bin: orientedBin } = binarizeGrayWithOtsu(orientedGray);
      let oriented = tightenToMarker(orientedBin, NORMALIZED_SIZE);
      for (let i = 0; i < bestRotation; i++) {
        oriented = rotate90(oriented, NORMALIZED_SIZE);
      }
      pushBinaryFrame(
        frames,
        oriented,
        NORMALIZED_SIZE,
        NORMALIZED_SIZE,
        `oriented-${bestRotationDegrees}`
      );
    }

    log('final', {
      ...best,
      rotation: bestRotation,
      baseAngle: bestBaseAngle,
      rotationDegrees: bestRotationDegrees,
    });

    return {
      isValid: best?.isValid || false,
      rotation: bestRotation,
      rotationDegrees: bestRotationDegrees,
      frames,
    };

  } catch (e) {
    console.log("Detection error:", e);
    return { isValid: false, frames, rotation: 0, rotationDegrees: 0 };
  }
}