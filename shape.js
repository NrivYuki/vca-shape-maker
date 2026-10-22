/*
 * 玉形の形の計算（ブラウザでも Node でも動く）。
 *
 * 画面上の形は「制御点を通る滑らかな閉曲線」で持つ。座標は画像の画素で、x 右・y 下（画像の向き）。
 * VCA に書くときに y を上向きに直し、玉形幅（A 寸）から mm に換算する。
 * 向きは「検者が装用者を正面から見た状態」。0° は 3 時方向、反時計回り（DCS の TRCFMT と同じ）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Shape = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const mix = (a, b, ta, tb, t) => {
    const u = tb === ta ? 0 : (t - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  };

  /** 制御点を通る閉曲線の点列（セントリペタル Catmull-Rom。角でも膨らみや輪が出にくい） */
  function spline(ctrl, perSeg = 16) {
    const n = ctrl.length;
    if (n < 3) return ctrl.map(p => ({ x: p.x, y: p.y }));
    const P = i => ctrl[((i % n) + n) % n];
    const d = (a, b) => Math.max(1e-6, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
    const out = [];
    for (let i = 0; i < n; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
      for (let k = 0; k < perSeg; k++) {
        const t = t1 + ((t2 - t1) * k) / perSeg;
        const a1 = mix(p0, p1, t0, t1, t), a2 = mix(p1, p2, t1, t2, t), a3 = mix(p2, p3, t2, t3, t);
        const b1 = mix(a1, a2, t0, t2, t), b2 = mix(a2, a3, t1, t3, t);
        out.push(mix(b1, b2, t1, t2, t));
      }
    }
    return out;
  }

  /** 外接箱 */
  function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  /** 符号つき面積（y 上向きなら反時計回りが正） */
  function area(pts) {
    let s = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      s += p.x * q.y - q.x * p.y;
    }
    return s / 2;
  }

  /** 周長 */
  function perimeter(pts) {
    let s = 0;
    for (let i = 0, n = pts.length; i < n; i++) s += Math.hypot(pts[(i + 1) % n].x - pts[i].x, pts[(i + 1) % n].y - pts[i].y);
    return s;
  }

  /** 閉曲線を、長さに沿って等間隔の n 点に取り直す（制御点の数を変えるときに使う） */
  function resampleArc(pts, n) {
    const m = pts.length, cum = [0];
    for (let i = 0; i < m; i++) cum.push(cum[i] + Math.hypot(pts[(i + 1) % m].x - pts[i].x, pts[(i + 1) % m].y - pts[i].y));
    const L = cum[m], out = [];
    let j = 0;
    for (let k = 0; k < n; k++) {
      const s = (L * k) / n;
      while (j < m - 1 && cum[j + 1] < s) j++;
      const p = pts[j], q = pts[(j + 1) % m], seg = cum[j + 1] - cum[j];
      const u = seg > 0 ? (s - cum[j]) / seg : 0;
      out.push({ x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u });
    }
    return out;
  }

  /**
   * 箱と四隅の丸みから形を作る。四分円ごとのスーパー楕円 |x/a|^n + |y/b|^n = 1。
   * ns は画面の向きで [右上, 左上, 左下, 右下] の指数。2 で楕円、大きいほど角ばる。
   */
  function superellipse(box, ns, count = 720) {
    const a = (box.x1 - box.x0) / 2, b = (box.y1 - box.y0) / 2;
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, out = [];
    for (let i = 0; i < count; i++) {
      const t = (2 * Math.PI * i) / count, c = Math.cos(t), s = Math.sin(t);
      const e = 2 / ns[Math.min(3, Math.floor(t / (Math.PI / 2)))];
      out.push({ x: cx + a * Math.sign(c) * Math.pow(Math.abs(c), e), y: cy - b * Math.sign(s) * Math.pow(Math.abs(s), e) });
    }
    return out;
  }

  /** 中心 (cx, cy) から n 方向へ線を引き、閉曲線との一番外側の交点までの距離。角度は y 上向きで測る */
  function polarRadii(pts, n, cx, cy) {
    const radii = [], m = pts.length;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n, dx = Math.cos(a), dy = Math.sin(a);
      let best = 0;
      for (let k = 0; k < m; k++) {
        const p = pts[k], q = pts[(k + 1) % m];
        const rx = q.x - p.x, ry = q.y - p.y, den = dx * ry - dy * rx;
        if (Math.abs(den) < 1e-12) continue;
        const wx = p.x - cx, wy = p.y - cy;
        const t = (wx * ry - wy * rx) / den, u = (wx * dy - wy * dx) / den;
        if (t >= 0 && u >= -1e-9 && u <= 1 + 1e-9 && t > best) best = t;   // 頂点ちょうどを通る線も取りこぼさない
      }
      radii.push(best);
    }
    return radii;
  }

  /** 外側へ off だけ広げた閉曲線（各点を法線の向きに動かす）。y 上向きの座標で渡す */
  function offset(pts, off) {
    if (!off) return pts.map(p => ({ x: p.x, y: p.y }));
    const n = pts.length, sgn = area(pts) >= 0 ? 1 : -1;
    return pts.map((p, i) => {
      const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      const tx = b.x - a.x, ty = b.y - a.y, len = Math.hypot(tx, ty) || 1;
      return { x: p.x + (sgn * ty / len) * off, y: p.y - (sgn * tx / len) * off };
    });
  }

  /** 左右の眼を入れ替える（正面視で左右反転）。角度 a の半径 = 元の 180° − a の半径（等角度のとき） */
  function mirrorRadii(radii) {
    const n = radii.length;
    return radii.map((_, i) => radii[(((n / 2 - i) % n) + n) % n]);
  }

  const fix = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);

  /**
   * 画像上の閉曲線（画素、y 下向き）から VCA の中身を作る。
   *   widthMM  玉形幅（A 寸、mm）。溝補正を足したあとの幅がこの値になるように縮尺を決める
   *   eye      写した眼（'R' か 'L'）。もう片方の眼は左右反転して書く
   *   groove   リムの内側の縁から溝の底までの補正（mm、外側へ広げる）
   *   dbl, fcrv, job, n（点の数。既定 360）
   */
  function toVCA(ptsPx, opts) {
    const o = Object.assign({ widthMM: 52, eye: 'R', groove: 0.5, dbl: 18, fcrv: 4, job: 'SHAPE', n: 360 }, opts);
    const up = ptsPx.map(p => ({ x: p.x, y: -p.y }));
    const b0 = bbox(up);
    if (!(b0.w > 0) || !(b0.h > 0)) throw new Error('形がありません');
    const s = (o.widthMM - 2 * o.groove) / b0.w;
    if (!(s > 0)) throw new Error('玉形幅が溝補正に対して小さすぎます');
    const mm = offset(up.map(p => ({ x: (p.x - b0.cx) * s, y: (p.y - b0.cy) * s })), o.groove);
    const bb = bbox(mm);
    const traced = polarRadii(mm, o.n, bb.cx, bb.cy);
    const other = mirrorRadii(traced);
    const radii = o.eye === 'L' ? { R: other, L: traced } : { R: traced, L: other };
    const hbox = bb.w, vbox = bb.h, circ = perimeter(mm), ed = 2 * Math.max(...traced);
    const recs = [];
    const both = v => `${fix(v)};${fix(v)}`;
    recs.push('REQ=FIL', `JOB=${String(o.job || 'SHAPE').replace(/[\r\n;]/g, ' ').slice(0, 30)}`, `DBL=${fix(o.dbl)}`,
      `HBOX=${both(hbox)}`, `VBOX=${both(vbox)}`, `CIRC=${both(circ)}`, `FCRV=${both(o.fcrv)}`);
    for (const e of ['R', 'L']) {
      recs.push(`TRCFMT=1;${o.n};E;${e};F`);
      const vals = radii[e].map(r => Math.round(r * 100));
      for (let i = 0; i < vals.length; i += 15) recs.push('R=' + vals.slice(i, i + 15).join(';'));
    }
    return { text: recs.join('\r\n') + '\r\n', hbox, vbox, circ, ed, radii, outline: mm };
  }

  return { spline, bbox, area, perimeter, resampleArc, superellipse, polarRadii, offset, mirrorRadii, toVCA };
});
