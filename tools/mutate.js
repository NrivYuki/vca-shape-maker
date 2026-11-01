// ミューテーションテスト: 実装の一部をわざと壊し、テストが失敗するかを確かめる(npm run mutate)
//
// テストが「確かめているはずの処理」を本当に確かめているかを調べる。壊してもテストが通るもの(生き残り)は、
// その処理を通る場面をテストが作っていない。生き残りがあれば終了コード 1 で終わる。
//   node tools/mutate.js            すべて試す
//   node tools/mutate.js JOB         名前に「JOB」を含むものだけ試す
// 壊したファイルは各回のあとに元に戻す(途中で Ctrl+C で止めても戻す)。
// 一覧に無い壊し方まで検出できることの保証ではない。規格の決まりを守る処理を足したら、ここにも壊し方を足すこと。
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const repo = path.join(__dirname, '..');
const TESTS = ['tests/shape.test.js', 'tests/conformance.test.js'];
const S = 'shape.js';

// [名前, ファイル, 元の文字列, 壊した文字列]。元の文字列はファイルの中にちょうど 1 か所あること(改行は LF で書く)
const M = [
  ['REQ を FIL 以外にする', S, "recs.push('REQ=FIL',", "recs.push('REQ=TRC',"],
  ['JOB を 2 行目に書かない', S, "recs.push('REQ=FIL', `JOB=${job}`, `DBL=${fix(o.dbl)}`,", "recs.push('REQ=FIL', `DBL=${fix(o.dbl)}`, `JOB=${job}`,"],
  ['JOB が空でも ? にしない', S, "if (s === '' || s === '?') return '?';", "if (s === '?') return '?';"],
  ['JOB の上限 12 → 13', S, 'if (s.length > 12)', 'if (s.length > 13)'],
  ['JOB の文字の範囲を見ない', S, 'if (/[^\\x20-\\x7f]/.test(s))', 'if (false)'],
  ['JOB の 127 を誤りにする', S, 'if (/[^\\x20-\\x7f]/.test(s))', 'if (/[^\\x20-\\x7e]/.test(s))'],
  ['JOB の予約文字を見ない', S, 'const bad = s.match(/[;=,*?|]/);', 'const bad = null;'],
  ['JOB の ; だけ見る', S, 'const bad = s.match(/[;=,*?|]/);', 'const bad = s.match(/[;]/);'],
  ['写した眼に B を認める', S, "if (o.eye !== 'R' && o.eye !== 'L') throw", "if (o.eye !== 'R' && o.eye !== 'L' && o.eye !== 'B') throw"],
  ['左右のレコードを値 1 つにする', S, 'const both = v => `${fix(v)};${fix(v)}`;', 'const both = v => `${fix(v)}`;'],
  ['TRCFMT の 5 番目の欄を書かない', S, 'recs.push(`TRCFMT=1;${o.n};E;${e};F`);', 'recs.push(`TRCFMT=1;${o.n};E;${e}`);'],
  ['TRCFMT を形式 2 と書く', S, 'recs.push(`TRCFMT=1;${o.n};E;${e};F`);', 'recs.push(`TRCFMT=2;${o.n};E;${e};F`);'],
  ['R の行の 80 文字を見ない', S, 'if (cur && next.length > 80)', 'if (cur && next.length > 800)'],
  ['R の行を 16 個ずつにする', S, 'function splitLines(label, vals, per = 15)', 'function splitLines(label, vals, per = 16)'],
  ['ZFMT=0 を書かない', S, "      recs.push('ZFMT=0');", ''],
  ['半径を時計回りに並べる', S, 'const a = (2 * Math.PI * i) / n, dx = Math.cos(a), dy = Math.sin(a);', 'const a = (-2 * Math.PI * i) / n, dx = Math.cos(a), dy = Math.sin(a);'],
  ['半径の中心を箱の中心からずらす', S, 'let c = { x: bb.cx, y: bb.cy }, best = null;', 'let c = { x: bb.cx + 0.5, y: bb.cy }, best = null;'],
  ['書いた点の箱の中心に合わせ直さない', S, 'if (off <= 0.005) break;', 'break;'],
  ['HBOX を丸める前の半径で計算する', S, '.map(r => Math.round(r * 100) / 100);', ';'],
  ['穴なしで DRILLE=0 を書かない', S, "if (!holes || !holes.length) return ['DRILLE=0'];", 'if (!holes || !holes.length) return [];'],
  ['DRILLE の眼を確かめない', S, "if (!/^[RL]$/.test(h.eye)) throw", 'if (false) throw'],
  ['DRILLE の位置を確かめない', S, 'if (!finite(h.x) || !finite(h.y)) throw', 'if (false) throw'],
  ['DRILLE の基準を書かない', S, "const f = [h.eye, 'C', fix(+h.x)", "const f = [h.eye, '', fix(+h.x)"],
  ['径の無い長穴の ; を詰める', S, "const f = [h.eye, 'C', fix(+h.x), fix(+h.y), finite(h.diameter) ? fix(+h.diameter) : ''];", "const f = [h.eye, 'C', fix(+h.x), fix(+h.y)].concat(finite(h.diameter) ? [fix(+h.diameter)] : []);"],
];

function apply(file, from, to) {
  const p = path.join(repo, file), orig = fs.readFileSync(p, 'utf8');
  const crlf = orig.includes('\r\n'), text = crlf ? orig.replace(/\r\n/g, '\n') : orig;
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`${file} に「${from.slice(0, 40)}」が ${n} か所あります(1 か所のはず)`);
  const out = text.replace(from, () => to);
  fs.writeFileSync(p, crlf ? out.replace(/\n/g, '\r\n') : out);
  return () => fs.writeFileSync(p, orig);
}

const filter = process.argv[2];
const list = M.filter(m => !filter || m[0].includes(filter));
let restore = null;
process.on('SIGINT', () => { if (restore) restore(); process.exit(130); });
const survived = [];
for (const [name, file, from, to] of list) {
  restore = apply(file, from, to);
  const r = spawnSync(process.execPath, ['--test', ...TESTS], { cwd: repo, encoding: 'utf8' });
  restore(); restore = null;
  const caught = r.status !== 0;
  console.log(`${caught ? '✓ 検出' : '✗ 生き残り'}  ${name}`);
  if (!caught) survived.push(name);
}
console.log(`${list.length} 通り中 ${list.length - survived.length} 通りを検出`);
process.exitCode = survived.length ? 1 : 0;
