// 書き出した VCA ファイルが DCS v3.14 の決まりを守るかのテスト。番号は docs/conformance.md の表の番号
// 期待値は規格書の文から決めている(各テストに節を書く)。このツールは VCA を読まないので、どれも送る側のテスト
'use strict';
const assert = require('node:assert/strict');
const spec = require('./spec.js');
const Shape = require('../shape.js');

// 横長の角の丸い形(画素、y 下向き)
const px = Shape.superellipse({ x0: 100, y0: 100, x1: 400, y1: 320 }, [3, 3, 3, 3]);
const vca = opts => Shape.toVCA(px, Object.assign({ widthMM: 52, job: 'T1' }, opts));
// 改行は CR LF。最後の行も CR LF で終わる
function lines(text) {
  assert.ok(text.endsWith('\r\n'), '最後の行も CR LF で終わる');
  return text.slice(0, -2).split('\r\n');
}
const label = l => l.slice(0, l.indexOf('='));
const fields = l => l.slice(l.indexOf('=') + 1).split(';');
const first = (text, lab) => lines(text).find(l => label(l) === lab);
// TRCFMT ごとに、直後に続く R の行と値
function traces(text) {
  const ls = lines(text), out = [];
  ls.forEach((l, i) => {
    if (label(l) !== 'TRCFMT') return;
    const rs = [];
    for (let k = i + 1; k < ls.length && label(ls[k]) === 'R'; k++) rs.push(ls[k]);
    out.push({ fmt: fields(l), rLines: rs, values: rs.flatMap(fields) });
  });
  return out;
}
// R の値(1/100 mm)を、0° から反時計回りに等角度に並んだ点(mm)にする(5.4.10)
const points = vals => vals.map((v, i) => {
  const a = (2 * Math.PI * i) / vals.length, r = +v / 100;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
});

// ---- ファイル(7.5) ----------------------------------------------------------
spec('ファイルの 1 行目は REQ=FIL、2 行目は JOB で、CRC・STATUS は書かない(7.5.1・7.5.4・7.5.5)',
  { req: ['R182', 'R183'], kind: ['正常'], side: '送る' }, () => {
    const ls = lines(vca().text);
    assert.equal(ls[0], 'REQ=FIL');
    assert.equal(ls[1], 'JOB=T1');
    assert.deepEqual(ls.filter(l => ['CRC', 'STATUS'].includes(label(l))), []);
  });

spec('JOB の入力が空・空白だけ・? なら、2 行目は JOB=?(表 A.2 の JOB、7.5.4)',
  { req: ['R225', 'R183'], kind: ['正常', '境界'], side: '送る' }, () => {
    for (const job of ['', '   ', '?', undefined]) assert.equal(lines(vca({ job }).text)[1], 'JOB=?', JSON.stringify(job));
  });

// ---- JOB(limited 型。3.3.1・5.1.8) --------------------------------------------
spec('JOB は 12 文字までは書き、13 文字は誤りにして書き出さない(5.1.8.3)',
  { req: ['5.1.8.3'], kind: ['正常', '境界', '異常'], side: '送る' }, () => {
    assert.equal(lines(vca({ job: 'A1' }).text)[1], 'JOB=A1');
    assert.equal(lines(vca({ job: 'ABCDEFGHIJKL' }).text)[1], 'JOB=ABCDEFGHIJKL');
    assert.equal(lines(vca({ job: ' ABCDEFGHIJKL ' }).text)[1], 'JOB=ABCDEFGHIJKL', '前後の空白は数えない');
    assert.throws(() => vca({ job: 'ABCDEFGHIJKLM' }), /12 文字/);
  });

spec('JOB は 32-127 の文字で書き、; と範囲の外の文字(全角・128 以上)は誤りにする(5.1.8.1)',
  { req: ['5.1.8.1'], kind: ['正常', '境界', '異常'], side: '送る' }, () => {
    assert.equal(lines(vca({ job: 'Ab-09' }).text)[1], 'JOB=Ab-09');
    assert.equal(lines(vca({ job: ' !~\x7f' }).text)[1], 'JOB=!~\x7f', '33・126・127 は書ける(前後の空白は外す)');
    for (const job of ['A;B', 'Ａ1', 'é1', 'A\x80B']) assert.throws(() => vca({ job }), Error, JSON.stringify(job));
  });

spec('JOB の制御文字(32 未満の文字。3.2.12)は誤りにする(5.1.7.1)',
  { req: ['O004'], kind: ['正常', '境界', '異常'], side: '送る' }, () => {
    assert.equal(lines(vca({ job: 'A B' }).text)[1], 'JOB=A B', '32(空白)は制御文字ではない');
    for (const job of ['A\x00B', 'A\tB', 'A\r\nB', 'A\x1bB', 'A\x1cB', 'A\x1fB']) assert.throws(() => vca({ job }), Error, JSON.stringify(job));
  });

spec('JOB に予約文字 = , * ? | は書かない。? だけなら不明値(5.1.7.2・表 1)',
  { req: ['R007'], kind: ['異常', '正常'], side: '送る' }, () => {
    for (const c of ['=', ',', '*', '?', '|']) assert.throws(() => vca({ job: `A${c}B` }), new RegExp(`「\\${c}」`), c);
    assert.equal(lines(vca({ job: '?' }).text)[1], 'JOB=?');
    assert.equal(lines(vca({ job: 'A-1_B.2' }).text)[1], 'JOB=A-1_B.2', '予約文字でない記号は書ける');
  });

// ---- 左右のレコード(5.1) ------------------------------------------------------
spec('左右のレコード HBOX・VBOX・CIRC・FCRV は、右眼;左眼 の 2 つの値(5.1)',
  { req: ['R003'], kind: ['正常'], side: '送る' }, () => {
    for (const eye of ['R', 'L']) {
      const t = vca({ eye, fcrv: 4 }).text;
      for (const lab of ['HBOX', 'VBOX', 'CIRC', 'FCRV']) {
        const f = fields(first(t, lab));
        assert.equal(f.length, 2, lab);
        f.forEach(v => assert.match(v, /^\d+\.\d\d$/, lab));
      }
      assert.deepEqual(fields(first(t, 'FCRV')), ['4.00', '4.00']);
    }
  });

// ---- 玉型(5.4) -----------------------------------------------------------------
spec('TRCFMT は 5 つの欄で形式 1、眼は R と L の 1 つずつ(表 A.2 の TRCFMT・7.5.6・5.4.12.3)',
  { req: ['R234', '7.5.6', 'R037', 'R038'], kind: ['正常'], side: '送る' }, () => {
    for (const n of [360, 1440]) {
      const tr = traces(vca({ n }).text);
      assert.deepEqual(tr.map(t => t.fmt), [['1', String(n), 'E', 'R', 'F'], ['1', String(n), 'E', 'L', 'F']]);
    }
  });

spec('写した眼に R・L 以外(B・空など)を渡すと誤りにして書かない(5.4.12.3)',
  { req: ['R037'], kind: ['異常'], side: '送る' }, () => {
    for (const eye of ['B', '', 'r', '?']) assert.throws(() => vca({ eye }), /写した眼/, JSON.stringify(eye));
  });

spec('R の行は TRCFMT の直後に続き、値の数は点数と同じ。点数と半径は整数(5.4.5・A.1.1.5.2)',
  { req: ['R024', 'R207'], kind: ['正常'], side: '送る' }, () => {
    for (const n of [360, 1440]) {
      for (const t of traces(vca({ n }).text)) {
        assert.ok(t.rLines.length > 0, 'TRCFMT の次の行が R');
        assert.equal(t.values.length, n);
        assert.match(t.fmt[1], /^\d+$/);
        t.values.forEach(v => assert.match(v, /^\d+$/));
      }
    }
  });

spec('R の行は 80 文字以内。半径が 100 mm を超えて値が 5 けたになっても(5.4.15.1)',
  { req: ['R042'], kind: ['正常', '境界'], side: '送る' }, () => {
    for (const widthMM of [52, 250]) {
      const t = vca({ widthMM }).text;
      assert.ok(traces(t)[0].values.some(v => v.length === (widthMM > 200 ? 5 : 4)), '値のけた数');
      for (const l of lines(t)) assert.ok(l.length <= 80, `${l.length} 文字: ${l.slice(0, 20)}…`);
    }
  });

spec('両眼とも R の並びの直後に ZFMT=0 を置き、Z は書かない(5.4.1・5.4.7)',
  { req: ['S013', 'R027'], kind: ['正常'], side: '送る' }, () => {
    for (const n of [360, 1440]) {
      const ls = lines(vca({ n }).text);
      const after = ls.filter((l, i) => i > 0 && label(ls[i - 1]) === 'R' && label(l) !== 'R');
      assert.deepEqual(after, ['ZFMT=0', 'ZFMT=0']);
      assert.deepEqual(ls.filter(l => ['Z', 'ZA'].includes(label(l))), []);
    }
  });

spec('最初の半径は 0°(3 時)で、続きは反時計回り(5.4.10)',
  { req: ['R036'], kind: ['正常'], side: '送る' }, () => {
    // 屋根の頂点が左寄りの五角形(y 上向きで (0,0) (10,0) (10,6) (3,10) (0,6))。箱の中心 (5,5) から、
    // 0° は右の辺まで 5、45°(右上)は屋根まで 3.47、90° は屋根まで 3.86、315°(右下の角)は 7.07。
    // A 寸 50 mm・溝の補正 0 なので mm ではこの 5 倍。時計回りに並べると 45° の位置に 315° の値が来る。
    // 原点は書いた点の箱の中心に合わせ直す(5.4.8)ので、形の箱の中心から 0.05 mm ほど動く。許容差はそれを含めて 0.1 mm
    const house = [{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 4 }, { x: 3, y: 0 }, { x: 0, y: 4 }];
    const n = 360, r = traces(Shape.toVCA(house, { widthMM: 50, groove: 0, n, job: 'T1' }).text)[0].values.map(v => +v / 100);
    const at = deg => r[(deg * n) / 360];
    assert.ok(Math.abs(at(0) - 25) <= 0.01, `0°: ${at(0)}`);
    assert.ok(Math.abs(at(45) - 17.35) <= 0.1, `45°: ${at(45)}`);
    assert.ok(Math.abs(at(90) - 19.29) <= 0.1, `90°: ${at(90)}`);
    assert.ok(Math.abs(at(315) - 35.36) <= 0.1, `315°: ${at(315)}`);
  });

spec('半径の原点は箱の中心。書いた半径から求めた箱の中心が原点から 0.01 mm 以内。角のとがった形でも(5.4.8)',
  { req: ['R028'], kind: ['正常', '境界'], side: '送る' }, () => {
    const house = [{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 4 }, { x: 3, y: 0 }, { x: 0, y: 4 }];
    const texts = [];
    for (const eye of ['R', 'L']) for (const n of [360, 400, 1000, 1440]) texts.push(vca({ eye, n }).text, Shape.toVCA(house, { widthMM: 50, groove: 0, eye, n, job: 'T1' }).text);
    for (const text of texts) {
      for (const t of traces(text)) {
        const p = points(t.values), xs = p.map(q => q.x), ys = p.map(q => q.y);
        const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
        assert.ok(Math.abs(cx) <= 0.01 && Math.abs(cy) <= 0.01, `${t.fmt[3]}: (${cx}, ${cy})`);
      }
    }
  });

spec('HBOX・VBOX・CIRC は、R の値から求めた幅・高さ・周長と一致する(5.4.9.3)',
  { req: ['R032'], kind: ['正常'], side: '送る' }, () => {
    for (const n of [360, 1440]) {
      const t = vca({ n }).text, tr = traces(t);
      ['R', 'L'].forEach((eye, k) => {
        const p = points(tr[k].values), xs = p.map(q => q.x), ys = p.map(q => q.y);
        const circ = p.reduce((s, q, i) => s + Math.hypot(p[(i + 1) % p.length].x - q.x, p[(i + 1) % p.length].y - q.y), 0);
        const near = (lab, v) => assert.ok(Math.abs(+fields(first(t, lab))[k] - v) <= 0.005, `${eye} ${lab}: ${fields(first(t, lab))[k]} / ${v}`);
        near('HBOX', Math.max(...xs) - Math.min(...xs));
        near('VBOX', Math.max(...ys) - Math.min(...ys));
        near('CIRC', circ);
      });
    }
  });

// ---- 穴あけ(5.5) ---------------------------------------------------------------
spec('穴が無ければ DRILLE=0 を 1 行だけ書く(5.5.2.10.9 の例)',
  { req: ['R072'], kind: ['規格の例'], side: '送る' }, () => {
    assert.deepEqual(lines(vca({ holes: [] }).text).filter(l => label(l) === 'DRILLE'), ['DRILLE=0']);
  });

spec('DRILLE の欄は 眼(R・L);基準 C;始点 x;始点 y;径 で、すべての穴が同じ基準(5.5.1.3・5.5.1.5・5.5.2.1-5.5.2.6)',
  { req: ['R052', 'R054', 'R055', 'R056', 'R050', 'O011', 'O014'], kind: ['正常'], side: '送る' }, () => {
    const holes = [{ x: 22.3, y: 4.1, diameter: 1.4 }, { x: -23, y: 3.5, diameter: 1.2, xEnd: -20.5, yEnd: 3.5 }];
    for (const eye of ['R', 'L']) {
      const dr = lines(vca({ eye, holes }).text).filter(l => label(l) === 'DRILLE');
      assert.equal(dr.length, 4);
      for (const l of dr) {
        const f = fields(l);
        assert.ok(['R', 'L'].includes(f[0]), l);
        assert.equal(f[1], 'C', l);
        assert.match(f[2], /^-?\d+\.\d\d$/, l);
        assert.match(f[3], /^-?\d+\.\d\d$/, l);
        assert.match(f[4], /^\d+\.\d\d$/, l);
      }
      assert.deepEqual(dr.map(l => fields(l)[0]), ['R', 'R', 'L', 'L'], '右眼を先に');
    }
  });

spec('DRILLE の眼が R・L でない、始点が無い穴は誤りにして書かない(5.5.2.1・5.5.2.4)',
  { req: ['R054', 'R052', 'O014'], kind: ['異常'], side: '送る' }, () => {
    for (const eye of ['', undefined, 'B', 'X', '?']) assert.throws(() => Shape.drillRecords([{ eye, x: 1, y: 2, diameter: 1 }]), /眼/, String(eye));
    for (const [x, y] of [['', 2], [1, undefined], ['?', 2], [1, null]]) assert.throws(() => Shape.drillRecords([{ eye: 'R', x, y, diameter: 1 }]), /位置/, `${x},${y}`);
  });

spec('長穴は径の後に終点を書く。径が無ければ径の欄を空にして ; を残す。径の無い丸穴は 4 欄で終える(5.5.1.3・5.5.2.6)',
  { req: ['R046', 'O011'], kind: ['正常', '境界'], side: '送る' }, () => {
    assert.deepEqual(Shape.drillRecords([{ eye: 'R', x: 1, y: 2, diameter: 1.2, xEnd: 3, yEnd: 2 }]), ['DRILLE=R;C;1.00;2.00;1.20;3.00;2.00']);
    assert.deepEqual(Shape.drillRecords([{ eye: 'R', x: 1, y: 2, xEnd: 3, yEnd: 2 }]), ['DRILLE=R;C;1.00;2.00;;3.00;2.00']);
    assert.deepEqual(Shape.drillRecords([{ eye: 'L', x: -1, y: 2 }]), ['DRILLE=L;C;-1.00;2.00']);
  });
