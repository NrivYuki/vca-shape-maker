/*
 * 画像からレンズの内側の範囲を取り出し、輪郭の点列にする（ブラウザでも Node でも動く）。
 *
 * 商品写真では、レンズの内側も外側も同じ背景色に見え、その間をリムが仕切っている。
 * そこで、クリックした点から「似た色」を塗り広げ、リムで止まった範囲をレンズの内側とみなす。
 * img は { width, height, data }（ImageData と同じ RGBA の並び）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Extract = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** (sx, sy) の色から tol 以内の色を 4 近傍で塗り広げる。画像の端に届いたら「閉じていない」 */
  function region(img, sx, sy, tol) {
    const { width: w, height: h, data } = img;
    sx = Math.round(sx); sy = Math.round(sy);
    const mask = new Uint8Array(w * h);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return { mask, count: 0, leaked: false };
    const i0 = (sy * w + sx) * 4, r0 = data[i0], g0 = data[i0 + 1], b0 = data[i0 + 2], t2 = tol * tol;
    const stack = new Int32Array(w * h);
    let top = 0, count = 0, leaked = false;
    stack[top++] = sy * w + sx; mask[sy * w + sx] = 1;
    while (top) {
      const k = stack[--top], x = k % w, y = (k - x) / w;
      count++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) leaked = true;
      for (const nk of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) {
        if (nk < 0 || mask[nk]) continue;
        const j = nk * 4, dr = data[j] - r0, dg = data[j + 1] - g0, db = data[j + 2] - b0;
        if (dr * dr + dg * dg + db * db <= t2) { mask[nk] = 1; stack[top++] = nk; }
      }
    }
    return { mask, count, leaked };
  }

  /** 範囲の中の穴（映り込み・刻印など）を埋める。画像の端から届かない「外」は内側に含める */
  function fillHoles(mask, w, h) {
    const out = new Uint8Array(w * h), stack = new Int32Array(w * h);
    let top = 0;
    const push = k => { if (!mask[k] && !out[k]) { out[k] = 1; stack[top++] = k; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (top) {
      const k = stack[--top], x = k % w;
      if (x > 0) push(k - 1); if (x < w - 1) push(k + 1);
      if (k >= w) push(k - w); if (k < w * (h - 1)) push(k + w);
    }
    const filled = new Uint8Array(w * h);
    for (let k = 0; k < w * h; k++) filled[k] = out[k] ? 0 : 1;
    return filled;
  }

  /** 範囲の重心から n 方向へ進み、範囲を出る手前までを輪郭の点にする。半径は少しならして角のギザギザを消す */
  function contour(mask, w, h, n = 720, smooth = 2) {
    let sx = 0, sy = 0, c = 0;
    for (let k = 0; k < w * h; k++) if (mask[k]) { const x = k % w; sx += x; sy += (k - x) / w; c++; }
    if (!c) return null;
    const cx = sx / c, cy = sy / c, radii = [];
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n, dx = Math.cos(a), dy = Math.sin(a);
      let r = 0;
      for (;;) {
        const nr = r + 0.5, x = Math.round(cx + dx * nr), y = Math.round(cy + dy * nr);
        if (x < 0 || y < 0 || x >= w || y >= h || !mask[y * w + x]) break;
        r = nr;
      }
      radii.push(r + 0.5);   // 画素の中心から縁までの半画素ぶん
    }
    const sm = radii.map((_, i) => {
      let s = 0;
      for (let d = -smooth; d <= smooth; d++) s += radii[(i + d + n) % n];
      return s / (2 * smooth + 1);
    });
    return sm.map((r, i) => ({ x: cx + r * Math.cos((2 * Math.PI * i) / n), y: cy + r * Math.sin((2 * Math.PI * i) / n) }));
  }

  /** クリックした点からレンズの内側の輪郭を取り出す。閉じていなければ pts は null */
  function extract(img, sx, sy, tol = 48) {
    const r = region(img, sx, sy, tol);
    if (r.leaked) return { pts: null, leaked: true, count: r.count };
    if (r.count < 50) return { pts: null, leaked: false, count: r.count };
    const filled = fillHoles(r.mask, img.width, img.height);
    return { pts: contour(filled, img.width, img.height), leaked: false, count: r.count };
  }

  return { region, fillHoles, contour, extract };
});
