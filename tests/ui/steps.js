// Shape Maker の画面検査
module.exports = async (t) => {
  const ok = (cond, msg) => t.log((cond ? 'OK   ' : 'NG   ') + msg);
  const $ = id => `document.getElementById(${JSON.stringify(id)})`;
  const set = async (id, v) => t.eval(`(() => { const e = ${$(id)}; e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  const click = async sel => t.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);
  const text = id => t.eval(`${$(id)}.textContent`);
  const visiblePanes = () => t.eval(`[...document.querySelectorAll('[role=tabpanel]')].filter(p => !p.hidden).map(p => p.id).join(',')`);
  const overflowX = () => t.eval(`document.documentElement.scrollWidth - innerWidth`);
  const raf = () => t.sleep(150);
  const drag = (fx0, fy0, fx1, fy1) => t.eval(`(() => { const c = ${$('stage')}, r = c.getBoundingClientRect();
    const ev = (type, fx, fy) => c.dispatchEvent(new PointerEvent(type, { clientX: r.left + r.width * fx, clientY: r.top + r.height * fy, button: 0, buttons: 1, bubbles: true, pointerId: 1, isPrimary: true }));
    ev('pointerdown', ${fx0}, ${fy0}); for (let k = 1; k <= 5; k++) ev('pointermove', ${fx0} + (${fx1} - ${fx0}) * k / 5, ${fy0} + (${fy1} - ${fy0}) * k / 5); ev('pointerup', ${fx1}, ${fy1}); })()`);
  const tap = (fx, fy) => t.eval(`(() => { const c = ${$('stage')}, r = c.getBoundingClientRect();
    for (const type of ['pointerdown', 'pointerup']) c.dispatchEvent(new PointerEvent(type, { clientX: r.left + r.width * ${fx}, clientY: r.top + r.height * ${fy}, button: 0, bubbles: true, pointerId: 1, isPrimary: true })); })()`);

  // 1. はじめの表示
  ok((await text('spec')).startsWith('右眼 R'), '上の帯に条件が出る: ' + await text('spec'));
  ok((await text('sum')).includes('形を作ると'), '形が無いとき下の帯に案内: ' + await text('sum'));
  ok(await visiblePanes() === 'pane-img', 'はじめは画像のタブだけ見える');
  ok(await t.eval(`${$('save')}.disabled && ${$('copy')}.disabled`), '形が無いとき保存・コピーは押せない');
  await t.shot('01-start');

  // 2. タブ
  for (const p of ['shape', 'size', 'hole', 'vca', 'img']) {
    await click(`.tabs [data-pane=${p}]`);
    ok(await visiblePanes() === 'pane-' + p, `タブ ${p} を押すとその面だけ見える`);
  }
  await t.eval(`document.querySelector('.tabs [data-pane=img]').focus(); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowLeft', bubbles:true}))`);
  ok(await visiblePanes() === 'pane-vca', '左矢印キーで最後のタブへ回る');
  ok(await t.eval(`[...document.querySelectorAll('.tabs [role=tab]')].every(b => b.tabIndex === (b.getAttribute('aria-selected') === 'true' ? 0 : -1) && document.getElementById(b.getAttribute('aria-controls'))?.getAttribute('aria-labelledby') === b.id)`), 'タブは選んだものだけ Tab キーで止まり、中身の面と結び付いている');
  await click('.tabs [data-pane=img]');

  // 3. 白紙に箱を描いて作る
  await click('#modeBox');
  await drag(0.3, 0.3, 0.7, 0.65); await raf(); await raf();
  ok(await t.eval('st.ctrl.length') >= 3, '箱を描くと形ができる（点 ' + await t.eval('st.ctrl.length') + '）');
  ok((await text('sum')).includes('玉形'), '下の帯に寸法: ' + await text('sum'));
  ok(await t.eval(`!${$('save')}.disabled && !${$('copy')}.disabled`), '形ができると保存・コピーが押せる');
  await t.shot('03-box');

  // 4. VCA のタブ：隠れていた左右の図が描けているか
  await click('.tabs [data-pane=vca]'); await raf(); await raf();
  const ink = await t.eval(`(() => { const c = ${$('preview')}, g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return [c.width, n]; })()`);
  ok(ink[0] > 0 && ink[1] > 100, `VCA のタブを開くと左右の玉形の図が描ける（幅 ${ink[0]}、塗った点 ${ink[1]}）`);
  ok((await t.eval(`${$('vca')}.value`)).includes('TRCFMT=1;360;E;R;F'), 'VCA のテキスト（360 点）');
  await t.shot('04-tab-vca');

  // 5. 寸法を変えると上の帯と VCA が変わる
  await click('.tabs [data-pane=size]');
  await set('npts', '1440'); await set('eye', 'L'); await set('A', '50'); await set('dbl', '20'); await raf(); await raf();
  const spec = await text('spec');
  ok(spec.startsWith('左眼 L') && spec.includes('A 50') && spec.includes('DBL 20') && spec.includes('1440 点'), '寸法を変えると上の帯が変わる: ' + spec);
  ok((await t.eval(`${$('vca')}.value`)).includes('TRCFMT=1;1440;E;'), 'VCA のテキストが 1440 点になる');
  ok((await text('sum')).includes('50.00'), '下の帯の玉形幅が 50.00: ' + await text('sum'));

  // 6. 入力の誤り：どのタブでも知らせが見える
  await set('A', '10'); await raf(); await raf();
  await click('.tabs [data-pane=img]');
  const m = await t.eval(`[${$('msg')}.textContent, ${$('msg')}.getBoundingClientRect().height]`);
  ok(m[0].includes('20〜90') && m[1] > 0, '玉形幅の誤りが別のタブでも見える: ' + m[0]);
  ok((await text('sum')).includes('入力を直すと'), '形があって入力が誤っているとき、下の帯は「入力を直すと」: ' + await text('sum'));
  await t.shot('06-error');
  await click('.tabs [data-pane=size]');
  await set('A', '52'); await set('npts', '360'); await set('eye', 'R'); await set('dbl', '18'); await raf(); await raf();
  ok(!(await text('msg')).includes('20〜90'), '直すと誤りの知らせが消える');

  // 7. 元に戻す・やり直す・消す
  await click('.tabs [data-pane=shape]');
  await click('#clear'); await raf();
  ok(await t.eval('st.ctrl.length') === 0, '形を消す');
  ok((await text('sum')).includes('形を作ると'), '形を消すと下の帯が案内に戻る');
  await click('#undo'); await raf();
  ok(await t.eval('st.ctrl.length') >= 3, '元に戻す');
  await click('#redo'); await raf();
  ok(await t.eval('st.ctrl.length') === 0, 'やり直す');
  await click('#undo'); await raf();

  // 7b. 穴（縁なしフレーム）：数値で足す・直す・長穴・画像の上で置く・ドラッグ・外の知らせ・反転・削除
  // 書き出す本文（CR LF のまま）から DRILLE を拾う。テキスト欄の値は改行が LF になるので使わない
  const drills = async () => ((await t.eval(`st.out ? st.out.text : ''`)).match(/^DRILLE=[^\r\n]*/gm) || []);
  const setHole = (i, k, v) => t.eval(`(() => { const e = document.querySelector('#holes .hole:nth-child(${i}) [data-k=${k}]'); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  const atPx = (fn, x0, y0, x1, y1) => t.eval(`(() => { const c = ${$('stage')}, r = c.getBoundingClientRect();
    const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: r.left + x, clientY: r.top + y, button: 0, buttons: 1, bubbles: true, pointerId: 1, isPrimary: true }));
    ${fn} })()`);
  await click('.tabs [data-pane=hole]'); await raf(); await raf();
  ok(await visiblePanes() === 'pane-hole', '穴のタブを押すとその面だけ見える');
  ok((await drills()).join() === 'DRILLE=0', '穴が無いとき VCA に DRILLE=0 を書く: ' + (await drills()).join(' '));
  ok((await text('holeNote')).includes('DRILLE=0'), '穴が無いときの説明: ' + await text('holeNote'));
  await click('#holeAdd'); await raf(); await raf();
  const hb = await t.eval('st.out.hbox');
  const ax = (Math.round((hb / 2 - 3) * 100) / 100).toFixed(2);
  ok((await drills()).join() === `DRILLE=R;C;${ax};0.00;1.40,DRILLE=L;C;-${ax};0.00;1.40`, `「穴を足す」で右眼の鼻側（+x）に穴、左眼は x を反転: ${(await drills()).join(' ')}`);
  await setHole(1, 'x', '10'); await setHole(1, 'y', '3.5'); await setHole(1, 'diameter', '1.2'); await raf(); await raf();
  ok((await drills()).join() === 'DRILLE=R;C;10.00;3.50;1.20,DRILLE=L;C;-10.00;3.50;1.20', '数値で位置と径を直せる: ' + (await drills()).join(' '));
  await setHole(1, 'xEnd', '12.5'); await setHole(1, 'yEnd', '3.5'); await raf(); await raf();
  ok((await drills()).join() === 'DRILLE=R;C;10.00;3.50;1.20;12.50;3.50,DRILLE=L;C;-10.00;3.50;1.20;-12.50;3.50', '終点を入れると長穴になり、反対の眼は終点の x も反転: ' + (await drills()).join(' '));
  await setHole(1, 'yEnd', ''); await raf(); await raf();
  ok((await text('msg')).includes('両方'), '長穴の終点が片方だけなら誤りと知らせる: ' + await text('msg'));
  await setHole(1, 'xEnd', ''); await raf(); await raf();
  ok((await drills()).length === 2 && !(await text('msg')).includes('両方'), '終点を両方空にすると丸穴に戻り、知らせが消える');
  // 画像の上で置く：箱の中心をクリックすると、ほぼ (0, 0) に穴
  await click('#modeHole');
  ok(await t.eval('st.mode') === 'hole', '「画像の上で置く」で穴を置く状態になる');
  const c0 = await t.eval(`(() => { const q = holeScr(0, 0); return [q.x, q.y]; })()`);
  await atPx(`ev('pointerdown', ${c0[0]}, ${c0[1]}); ev('pointerup', ${c0[0]}, ${c0[1]});`); await raf(); await raf();
  const h2 = await t.eval('st.holes[1]');
  ok(h2 && Math.abs(h2.x) < 0.2 && Math.abs(h2.y) < 0.2 && h2.diameter === 1.2, `画像の箱の中心をクリックすると穴 2 が (0, 0) 付近に、径は前の穴と同じ: ${JSON.stringify(h2)}`);
  await t.eval(`setMode('edit')`);
  // ドラッグで動かす：右へ 30 画素 → x が増え、数値の欄も変わる
  const ctrl0 = await t.eval('JSON.stringify(st.ctrl)');
  await atPx(`ev('pointerdown', ${c0[0]}, ${c0[1]}); for (let k = 1; k <= 5; k++) ev('pointermove', ${c0[0]} + 6 * k, ${c0[1]}); ev('pointerup', ${c0[0] + 30}, ${c0[1]});`); await raf(); await raf();
  const moved = await t.eval(`[st.holes[1].x, st.holes[1].y, +document.querySelector('#holes .hole:nth-child(2) [data-k=x]').value]`);
  ok(moved[0] > 1 && Math.abs(moved[1] - h2.y) < 0.05 && moved[2] === moved[0], `穴をドラッグで動かすと x が増え、数値の欄も変わる: ${moved}`);
  ok(await t.eval('JSON.stringify(st.ctrl)') === ctrl0, '穴のドラッグで形は動かない');
  // 玉形の外
  await setHole(2, 'x', '40'); await raf(); await raf();
  ok((await text('msg')).includes('穴 2') && (await text('msg')).includes('外'), '穴の中心が玉形の外なら知らせる: ' + await text('msg'));
  ok(await t.eval(`document.querySelector('#holes .hole:nth-child(2) .st').classList.contains('out')`), '外の穴は一覧でも「玉形の外」');
  await t.shot('07b-hole-outside');
  await setHole(2, 'x', '-15'); await raf(); await raf();
  ok(!(await text('msg')).includes('外'), '内側に直すと知らせが消える');
  // 写した眼を左眼にすると、入力した穴が L、反転した穴が R になる（右眼を先に書く）
  await t.eval(`(() => { const e = ${$('eye')}; e.value = 'L'; e.dispatchEvent(new Event('input', {bubbles:true})); })()`); await raf(); await raf();
  const dl = await drills();
  ok(dl[0].startsWith('DRILLE=R;C;-10.00;3.50') && dl[1].startsWith('DRILLE=R;C;15.00') && dl[2].startsWith('DRILLE=L;C;10.00;3.50') && dl[3].startsWith('DRILLE=L;C;-15.00'), '左眼として写すと、左眼は入力のまま、右眼は x を反転: ' + dl.join(' '));
  await t.eval(`(() => { const e = ${$('eye')}; e.value = 'R'; e.dispatchEvent(new Event('input', {bubbles:true})); })()`); await raf(); await raf();
  ok((await text('sum')).includes('穴 2'), '下の帯に穴の数: ' + await text('sum'));
  await click('.tabs [data-pane=vca]'); await raf(); await raf();
  await t.shot('07b-hole-vca');
  await click('.tabs [data-pane=hole]');
  await t.shot('07b-hole');
  // 削除
  await click('#holes .hole:nth-child(1) [data-del]'); await raf(); await raf();
  ok(await t.eval('st.holes.length') === 1 && (await drills())[0].startsWith('DRILLE=R;C;-15.00'), '穴 1 を削除すると、残った穴が穴 1 になる: ' + (await drills()).join(' '));
  await click('#holes .hole:nth-child(1) [data-del]'); await raf(); await raf();
  ok((await drills()).join() === 'DRILLE=0', 'すべて削除すると DRILLE=0 に戻る');

  // 8. サンプル画像からクリックで取り出す
  await click('.tabs [data-pane=img]');
  await click('#sample'); await t.sleep(500);
  ok(await t.eval('st.mode') === 'pick', 'サンプル画像を読み込むと「クリックで自動抽出」になる（ボタンは押すたびに切り替わる）');
  let got = false;
  for (const [fx, fy] of [[0.35, 0.5], [0.3, 0.5], [0.4, 0.5], [0.65, 0.5], [0.7, 0.5], [0.33, 0.45]]) {
    await t.eval('st.ctrl = []'); await tap(fx, fy); await raf();
    if (await t.eval('st.ctrl.length') >= 3) { got = true; t.log(`     クリック位置 ${fx}, ${fy} で取り出せた`); break; }
  }
  ok(got, 'サンプル画像のレンズの内側をクリックすると形を取り出せる: ' + await text('msg'));
  await t.eval(`setMode('edit')`);
  await t.shot('08-pick');

  // 9. 保存・コピー
  await click('#save'); await t.sleep(200);
  ok((await text('msg')).includes('保存しました'), '保存: ' + await text('msg'));
  await click('#copy'); await t.sleep(300);
  ok((await text('msg')).includes('コピーしました'), 'コピー: ' + await text('msg'));

  // 10. ダークモード
  await t.emulate(1280, 800, true); await t.sleep(600);
  await click('.tabs [data-pane=vca]'); await raf(); await raf();
  await t.shot('10-dark');
  await t.emulate(1280, 800, false); await t.sleep(400);

  // 11. 狭い画面
  for (const w of [375, 768, 1024]) {
    await t.emulate(w, 800); await t.sleep(700);
    const o = await overflowX();
    ok(o <= 0, `幅 ${w}px で横にはみ出さない（${o}px）`);
    const fitIn = await t.eval(`(() => { const r = ${$('stage')}.getBoundingClientRect(), v = st.view; return v.ox >= -1 && v.oy >= -1 && v.ox + st.src.width * v.s <= r.width + 1 && v.oy + st.src.height * v.s <= r.height + 1; })()`);
    ok(fitIn, `幅 ${w}px に変えても、全体表示のままなら画像が枠に収まる`);
    await t.shot('11-w' + w);
  }
  await t.emulate(1280, 800); await t.sleep(500);
  // 拡大してから幅を変えると、拡大は保ったまま中心がずれない
  await click('#zoomIn'); await t.sleep(200);
  const before = await t.eval(`(() => { const r = ${$('stage')}.getBoundingClientRect(), v = st.view; return [(r.width / 2 - v.ox) / v.s, (r.height / 2 - v.oy) / v.s, v.s]; })()`);
  await t.emulate(1000, 800); await t.sleep(600);
  const after = await t.eval(`(() => { const r = ${$('stage')}.getBoundingClientRect(), v = st.view; return [(r.width / 2 - v.ox) / v.s, (r.height / 2 - v.oy) / v.s, v.s]; })()`);
  ok(Math.abs(before[0] - after[0]) < 1 && Math.abs(before[1] - after[1]) < 1 && before[2] === after[2], `拡大中に幅を変えても中心と倍率を保つ（${before.map(v => v.toFixed(1))} → ${after.map(v => v.toFixed(1))}）`);
  await t.emulate(1280, 800);
};
