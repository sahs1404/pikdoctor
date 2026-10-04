(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const CROP_EMOJI = { tomato: '🍅', grape: '🍇', corn: '🌽', potato: '🥔', pepper: '🫑' };
  const VOICE = { mr: 'mr-IN', hi: 'hi-IN', en: 'en-IN' };
  const SAMPLES = ['s1', 's2', 's3', 's4', 's5', 's6'];
  const st = { lang: 'en', crop: 'auto', kb: null, model: null, byId: {}, last: null, installEvt: null };

  function lsGet(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage may be blocked */ } }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = (o) => (o && (o[st.lang] || o.en)) || '';
  const U = (k) => tr(st.kb.ui[k]);

  function detectLang() {
    const saved = lsGet('pik.lang', '');
    if (['mr', 'hi', 'en'].includes(saved)) return saved;
    const n = (navigator.language || 'en').toLowerCase();
    return n.startsWith('hi') ? 'hi' : n.startsWith('en') ? 'en' : 'mr';
  }

  // ---------- boot ----------
  async function boot() {
    st.lang = detectLang();
    try {
      st.kb = await (await fetch('data/kb.json')).json();
      st.kb.classes.forEach((c) => { st.byId[c.id] = c; });
    } catch (e) { document.body.textContent = 'Could not load app data.'; return; }
    renderChrome();
    updateNet();
    window.addEventListener('online', updateNet); window.addEventListener('offline', updateNet);
    $('modelPill').textContent = U('model_loading');
    try {
      st.model = await PikEngine.loadModel('model/');
      $('modelPill').textContent = '✓ ' + U('model_ready');
    } catch (e) { $('modelPill').textContent = '⚠ model'; }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ---------- chrome / i18n ----------
  function renderChrome() {
    document.documentElement.lang = st.lang;
    $('appName').textContent = U('app_name'); $('tagline').textContent = U('tagline');
    document.querySelectorAll('[data-lang]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.lang === st.lang));
      b.onclick = () => { st.lang = b.dataset.lang; lsSet('pik.lang', st.lang); renderChrome(); updateNet(); if (st.model) $('modelPill').textContent = '✓ ' + U('model_ready'); if (st.last) renderResult(st.last); };
    });
    $('whichCrop').textContent = U('which_crop');
    const box = $('crops'); box.innerHTML = '';
    const items = [['auto', '🔍', U('crop_auto')]].concat(Object.keys(st.kb.crops).map((k) => [k, CROP_EMOJI[k], tr(st.kb.crops[k])]));
    items.forEach(([k, e, label]) => {
      const b = document.createElement('button'); b.className = 'crop'; b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(st.crop === k)); b.innerHTML = '<span class="e">' + e + '</span><span>' + esc(label) + '</span>';
      b.onclick = () => { st.crop = k; renderChrome(); }; box.appendChild(b);
    });
    $('takeTxt').textContent = U('take_photo'); $('pickTxt').textContent = U('choose_photo');
    $('photoTip').textContent = U('photo_tip'); $('covered').textContent = U('covered');
    $('disclaimer').textContent = U('disclaimer'); $('busyTxt').textContent = U('checking');
    $('histTitle').textContent = U('history'); $('clearHist').textContent = U('clear');
    $('samplesTitle').textContent = ({ en: 'No leaf with you? Try a sample photo', hi: 'पत्ती पास नहीं है? नमूना फोटो आज़माएँ', mr: 'पान जवळ नाही? नमुना फोटो वापरून पहा' })[st.lang];
    $('installBtn').textContent = U('install');
    renderSamples(); renderHistory();
  }
  function updateNet() {
    const on = navigator.onLine, p = $('netPill');
    p.textContent = (on ? '● ' + U('online') + ' · ' : '✈ ') + U('offline'); p.className = 'pill' + (on ? '' : ' off');
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); st.installEvt = e; const b = $('installBtn'); b.hidden = false; b.onclick = async () => { b.hidden = true; st.installEvt.prompt(); }; });

  // ---------- image -> prediction ----------
  async function toBitmap(file) {
    if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* fall through */ } }
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); });
  }
  function allowedIdx() {
    if (st.crop === 'auto') return null;
    const idx = []; st.model.m.classes.forEach((id, i) => { if (st.byId[id] && (st.byId[id].crop === st.crop || st.byId[id].crop === 'other')) idx.push(i); });
    return idx;
  }
  async function analyse(source) {
    show('busy'); await new Promise((r) => setTimeout(r, 60));
    try {
      const sw = source.width || source.naturalWidth, sh = source.height || source.naturalHeight, side = Math.min(sw, sh);
      const cv = $('work'), ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, 256, 256);
      const px = ctx.getImageData(0, 0, 256, 256).data;
      let lum = 0; for (let i = 0; i < px.length; i += 16) lum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      lum /= px.length / 16;
      const x = PikEngine.preprocess(px, 256, 256, st.model.m);
      const ranked = PikEngine.classifyTTA(st.model, x, allowedIdx());
      const thumb = document.createElement('canvas'); thumb.width = thumb.height = 112;
      thumb.getContext('2d').drawImage(cv, 0, 0, 112, 112);
      const res = { t: Date.now(), crop: st.crop, lum, thumb: thumb.toDataURL('image/jpeg', .7),
        top: ranked.slice(0, 3).map((o) => ({ id: st.model.m.classes[o.i], p: o.p })) };
      st.last = res; saveHistory(res); renderResult(res);
    } catch (e) { console.error(e); show('home'); alert(U('error')); }
  }
  async function fromFile(f) { if (f) { try { await analyse(await toBitmap(f)); } catch (e) { alert(U('error')); } } }
  $('camInput').onchange = (e) => { fromFile(e.target.files[0]); e.target.value = ''; };
  $('galInput').onchange = (e) => { fromFile(e.target.files[0]); e.target.value = ''; };

  function renderSamples() {
    const box = $('samples'); box.innerHTML = '';
    SAMPLES.forEach((s) => {
      const b = document.createElement('button'); b.className = 'sample'; b.setAttribute('aria-label', 'sample ' + s);
      b.innerHTML = '<img src="samples/' + s + '.jpg" alt="" loading="lazy">';
      b.onclick = () => { const im = new Image(); im.onload = () => analyse(im); im.src = 'samples/' + s + '.jpg'; };
      box.appendChild(b);
    });
  }

  // ---------- result ----------
  function list(ids) { return '<ul>' + ids.map((k) => '<li>' + esc(tr(st.kb.snippets[k])) + '</li>').join('') + '</ul>'; }
  function renderResult(r) {
    const m = st.model.m, top = r.top[0], c = st.byId[top.id], conf = Math.round(top.p * 100);
    const other = c.crop === 'other', sure = !other && top.p >= m.minConf;
    let h = '<div class="card' + (sure ? '' : ' warn') + '"><div class="hero"><img alt="" src="' + r.thumb + '"><div>';
    if (sure) {
      h += '<h2>' + esc(tr(c.name)) + '</h2>';
      h += '<span class="badge b-type">' + esc(tr(st.kb.crops[c.crop])) + ' · ' + esc(tr(st.kb.ui.types[c.type])) + '</span>';
      h += '<span class="badge b-' + c.urgency + '">' + esc(tr(st.kb.ui.urgency[c.urgency])) + '</span>';
    } else if (other) {
      h += '<h2>' + esc(U('other_title')) + '</h2><p class="small">' + esc(U('other_body')) + '</p>';
    } else {
      h += '<h2>' + esc(U('not_sure_title')) + '</h2><p class="small">' + esc(U('not_sure_body')) + '</p>';
    }
    if (!other) h += '<div class="small">' + esc(U('confidence')) + ': ' + conf + '%</div><div class="meter' + (sure ? '' : ' low') + '"><i style="width:' + conf + '%"></i></div>';
    h += '</div></div>';
    if (r.lum < 45 || r.lum > 235) h += '<p class="small">⚠ ' + esc(({ en: 'The photo looks too ' + (r.lum < 45 ? 'dark' : 'bright') + '. Try again in daylight.', hi: 'फोटो बहुत ' + (r.lum < 45 ? 'अँधेरा' : 'चमकीला') + ' है। दिन की रोशनी में दोबारा लें।', mr: 'फोटो खूप ' + (r.lum < 45 ? 'अंधारा' : 'तेजस्वी') + ' आहे. दिवसाच्या प्रकाशात पुन्हा काढा.' })[st.lang]) + '</p>';
    h += '</div>';
    if (sure) {
      h += '<div class="card sec"><h3>' + esc(U('what_see')) + '</h3><p>' + esc(tr(c.see)) + '</p></div>';
      h += '<div class="card sec"><h3>' + esc(U('what_do')) + '</h3>' + list(c.do) + '</div>';
      h += '<div class="card sec"><h3>' + esc(U('how_prevent')) + '</h3>' + list(c.prevent) + '</div>';
    } else if (!other) {
      h += '<div class="card sec"><h3>' + esc(U('best_guess')) + '</h3><p>' + esc(tr(st.byId[top.id].name)) + ' (' + esc(tr(st.kb.crops[st.byId[top.id].crop])) + ')</p></div>';
    }
    if (!other && r.top.length > 1) {
      h += '<div class="card sec"><h3>' + esc(U('other_possible')) + '</h3>' + r.top.slice(1).filter((o) => st.byId[o.id].crop !== 'other').map((o) => { const k = st.byId[o.id]; return '<div class="alt"><span>' + esc(tr(k.name)) + ' <span class="small">(' + esc(tr(st.kb.crops[k.crop])) + ')</span></span><b>' + Math.round(o.p * 100) + '%</b></div>'; }).join('') + '</div>';
    }
    h += '<div class="card help sec"><h3>' + esc(U('get_help')) + '</h3><p>' + esc(U('kcc')) + '</p></div>';
    h += '<div class="cta"><button class="btn fill" id="listenBtn">🔊 ' + esc(U('listen')) + '</button><button class="btn" id="againBtn">' + esc(U('again')) + '</button></div><p class="small" id="voiceNote"></p>';
    $('result').innerHTML = h; show('result'); window.scrollTo(0, 0);
    $('againBtn').onclick = () => { stopSpeak(); st.last = null; show('home'); };
    $('listenBtn').onclick = () => toggleSpeak(sure ? speechFor(c) : other ? U('other_title') + '. ' + U('other_body') : U('not_sure_title') + '. ' + U('not_sure_body'));
  }
  function speechFor(c) {
    const parts = [tr(c.name), tr(st.kb.crops[c.crop]), tr(st.kb.ui.types[c.type]), tr(st.kb.ui.urgency[c.urgency]), U('what_do')].concat(c.do.map((k) => tr(st.kb.snippets[k])));
    return parts.join('. ');
  }
  function stopSpeak() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
  function toggleSpeak(text) {
    if (!('speechSynthesis' in window)) { $('voiceNote').textContent = U('no_voice'); return; }
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; }
    const lang = VOICE[st.lang], u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = 0.9;
    const v = speechSynthesis.getVoices().filter((x) => x.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2)));
    $('voiceNote').textContent = v.length ? '' : U('no_voice');
    if (v.length) u.voice = v.find((x) => x.lang.toLowerCase().startsWith(lang.toLowerCase())) || v[0];
    speechSynthesis.speak(u);
  }

  // ---------- history ----------
  function loadHistory() { try { return JSON.parse(lsGet('pik.history', '[]')); } catch (e) { return []; } }
  function saveHistory(r) { const h = loadHistory(); h.unshift(r); lsSet('pik.history', JSON.stringify(h.slice(0, 12))); renderHistory(); }
  function renderHistory() {
    const box = $('history'), h = loadHistory(); box.innerHTML = '';
    $('clearHist').hidden = !h.length;
    if (!h.length) { box.innerHTML = '<p class="small">' + esc(U('history_empty')) + '</p>'; return; }
    h.forEach((r) => {
      const c = st.byId[r.top[0].id]; if (!c) return;
      const b = document.createElement('button'); b.className = 'hitem';
      b.innerHTML = '<img alt="" src="' + esc(r.thumb) + '"><span><b>' + esc(tr(c.name)) + '</b><small>' + esc(tr(st.kb.crops[c.crop])) + ' · ' + Math.round(r.top[0].p * 100) + '% · ' + new Date(r.t).toLocaleDateString(st.lang === 'en' ? 'en-IN' : st.lang + '-IN') + '</small></span>';
      b.onclick = () => { st.last = r; renderResult(r); }; box.appendChild(b);
    });
  }
  $('clearHist').onclick = () => { lsSet('pik.history', '[]'); renderHistory(); };

  function show(which) { ['home', 'busy', 'result'].forEach((k) => { $(k).hidden = k !== which; }); }
  boot();
})();
