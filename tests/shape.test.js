// node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Shape = require('../shape.js');
const Extract = require('../extract.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≈ ${b} (±${tol})`);
const circle = (r, n = 720, cx = 0, cy = 0) =>
  Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((2 * Math.PI * i) / n), y: cy + r * Math.sin((2 * Math.PI * i) / n) }));

test('spline は制御点を通る', () => {
  const ctrl = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 12, y: 8 }, { x: 4, y: 11 }, { x: -2, y: 5 }];
  const pts = Shape.spline(ctrl, 10);
  assert.equal(pts.length, 50);
  ctrl.forEach((p, i) => { near(pts[i * 10].x, p.x, 1e-9); near(pts[i * 10].y, p.y, 1e-9); });
});

test('superellipse：指数 2 は楕円、箱にぴったり収まる', () => {
  const box = { x0: 10, y0: 20, x1: 70, y1: 60 };
  const pts = Shape.superellipse(box, [2, 2, 2, 2]);
  const b = Shape.bbox(pts);
  near(b.x0, 10, 1e-9); near(b.x1, 70, 1e-9); near(b.y0, 20, 1e-6); near(b.y1, 60, 1e-6);
  for (const p of pts) near(((p.x - 40) / 30) ** 2 + ((p.y - 40) / 20) ** 2, 1, 1e-9, '楕円の式');
  // 角ばらせると、斜め 45° の点が箱の角に近づく
  const sq = Shape.superellipse(box, [8, 8, 8, 8]), k = 90;   // 720 点の 45°
  assert.ok(sq[k].x - 40 > pts[k].x - 40);
});

test('superellipse：画面の右上は y が小さい側（画像の向き）', () => {
  const pts = Shape.superellipse({ x0: 0, y0: 0, x1: 100, y1: 50 }, [2, 2, 2, 2], 360);
  assert.ok(pts[45].x > 50 && pts[45].y < 25);
});

test('polarRadii と offset：半径 10 の円は 10、0.5 広げると 10.5', () => {
  const c = circle(10);
  Shape.polarRadii(c, 360, 0, 0).forEach(r => near(r, 10, 0.001));
  Shape.polarRadii(Shape.offset(c, 0.5), 360, 0, 0).forEach(r => near(r, 10.5, 0.002));
  // 向き（時計回り）が逆でも外側へ広がる
  Shape.polarRadii(Shape.offset(c.slice().reverse(), 0.5), 360, 0, 0).forEach(r => near(r, 10.5, 0.002));
});

test('resampleArc：周長に沿って等間隔', () => {
  const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const pts = Shape.resampleArc(sq, 8);
  assert.deepEqual(pts.map(p => [p.x, p.y]), [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10], [5, 10], [0, 10], [0, 5]]);
});

test('mirrorRadii：左右反転は 180° − a', () => {
  const r = Array.from({ length: 360 }, (_, i) => i);
  const m = Shape.mirrorRadii(r);
  assert.equal(m[0], 180); assert.equal(m[90], 90); assert.equal(m[180], 0); assert.equal(m[270], 270); assert.equal(m[10], 170);
});

test('toVCA：玉形幅が A 寸になり、R・L が 360 点ずつ、L は R の左右反転', () => {
  // 画像上の形（画素、y 下向き）。右上だけ角ばらせて左右非対称にする
  const px = Shape.superellipse({ x0: 100, y0: 100, x1: 400, y1: 320 }, [6, 3, 2.5, 3]);
  const v = Shape.toVCA(px, { widthMM: 52, eye: 'R', groove: 0.5, dbl: 18, fcrv: 4, job: 'T1' });
  near(v.hbox, 52, 0.02, 'HBOX');
  near(v.vbox, (220 / 300) * 51 + 1, 0.05, 'VBOX は縦横比から');
  assert.match(v.text, /^REQ=FIL\r\nJOB=T1\r\nDBL=18\.00\r\nHBOX=52\.\d\d;52\.\d\d\r\n/);
  assert.match(v.text, /FCRV=4\.00;4\.00/);
  assert.match(v.text, /TRCFMT=1;360;E;R;F/); assert.match(v.text, /TRCFMT=1;360;E;L;F/);
  const blocks = v.text.split(/TRCFMT=[^\r]*\r\n/).slice(1).map(b => b.match(/R=[^\r]*/g).join(';').replace(/R=/g, '').split(';').map(Number));
  assert.equal(blocks[0].length, 360); assert.equal(blocks[1].length, 360);
  for (let a = 0; a < 360; a += 7) assert.equal(blocks[1][a], blocks[0][(540 - a) % 360], `L(${a}) = R(${(540 - a) % 360})`);
  // 右上（画面）が角ばっている → 正面視で 45° の半径が 135° より大きい
  assert.ok(v.radii.R[45] > v.radii.R[135]);
  // 左眼として写したときは、L がそのまま、R が反転になる
  const w = Shape.toVCA(px, { widthMM: 52, eye: 'L' });
  assert.deepEqual(w.radii.L, v.radii.R);
});

test('toVCA：1440 点でも書ける（R・L とも 1440 点、L は R の左右反転）', () => {
  const px = Shape.superellipse({ x0: 100, y0: 100, x1: 400, y1: 320 }, [6, 3, 2.5, 3]);
  const v = Shape.toVCA(px, { widthMM: 52, n: 1440 });
  assert.match(v.text, /TRCFMT=1;1440;E;R;F/); assert.match(v.text, /TRCFMT=1;1440;E;L;F/);
  const blocks = v.text.split(/TRCFMT=[^\r]*\r\n/).slice(1).map(b => b.match(/R=[^\r]*/g).join(';').replace(/R=/g, '').split(';').map(Number));
  assert.equal(blocks[0].length, 1440); assert.equal(blocks[1].length, 1440);
  for (let i = 0; i < 1440; i += 37) assert.equal(blocks[1][i], blocks[0][(2160 - i) % 1440]);   // 0.25° 刻みで 180° − a
  // 360 点の値と同じ角度で一致する
  const w = Shape.toVCA(px, { widthMM: 52, n: 360 });
  for (let a = 0; a < 360; a += 15) near(v.radii.R[a * 4], w.radii.R[a], 1e-9);
});

test('toVCA：形がないときと、A 寸が小さすぎるときはエラー', () => {
  assert.throws(() => Shape.toVCA([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }], {}), /形がありません/);
  assert.throws(() => Shape.toVCA(circle(10, 36, 50, 50), { widthMM: 1, groove: 0.5 }), /小さすぎ/);
});

// 白い背景に、黒いリムの楕円（太さ 6 画素）を描いた画像
function ringImage(w, h, a, b, thick, gapDeg = 0) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ang = (Math.atan2(cy - y, x - cx) * 180) / Math.PI;
    const d = Math.hypot((x - cx) / a, (y - cy) / b);   // 1 が楕円の線
    const inRim = d >= 1 && d <= 1 + thick / Math.min(a, b);
    if (inRim && !(gapDeg && Math.abs(ang) < gapDeg)) { const j = (y * w + x) * 4; data[j] = data[j + 1] = data[j + 2] = 20; }
  }
  // レンズの映り込み（少し灰色の帯）。許容値の中なら内側に含まれ、外れても穴埋めで内側になる
  for (let y = cy - 8; y < cy - 2; y++) for (let x = cx - 30; x < cx + 30; x++) { const j = (y * w + x) * 4; data[j] = data[j + 1] = data[j + 2] = 150; }
  return { width: w, height: h, data };
}

test('extract：リムの内側の輪郭を取り出せる（映り込みがあっても穴を埋める）', () => {
  const img = ringImage(300, 200, 100, 60, 6);
  const r = Extract.extract(img, 150, 140, 48);
  assert.equal(r.leaked, false);
  const b = Shape.bbox(r.pts);
  near(b.w, 200, 3, '幅'); near(b.h, 120, 3, '高さ'); near(b.cx, 150, 1.5); near(b.cy, 100, 1.5);
});

test('extract：リムが切れていると「閉じていない」', () => {
  const img = ringImage(300, 200, 100, 60, 6, 12);
  const r = Extract.extract(img, 150, 140, 48);
  assert.equal(r.leaked, true); assert.equal(r.pts, null);
});
