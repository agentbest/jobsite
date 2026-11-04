/* 右下のチャット風「かんたん相談」（求人サイト版）。
   元は agentbest-lp の src/components/ChatConsult.astro。見た目と流れを変えるときは両方直す。
   中身は相談フォームと同じ Apps Script 直送（kind: consultation_form → receiveConsultationForm_）。
   リアルタイムのやり取りはしない。返信は担当者が Gmail から本人のメールアドレスへ送る。
   読み込み：<script src="/assets/chat.js" defer></script>（apply.html には入れない） */
(function () {
  if (document.getElementById('abchat')) return;
  var NOTIFY_URL = "https://script.google.com/macros/s/AKfycbwSPDbvJuwN8zgP4tRW-VDP9WRbJ2mybZo43BxYdobpc6rts8t0WMh-sQ2Ivgq0mqYK/exec";
  var PRIVACY_URL = '/privacy.html';
  var st = document.createElement('style');
  st.textContent = ".abchat { position: fixed; right: 16px; bottom: 16px; z-index: 58; font-family: var(--sans, system-ui, sans-serif); } .abchat__launcher { display: inline-flex; align-items: center; gap: 8px; border: 0; cursor: pointer; background: #2A4CAE; color: #fff; padding: 12px 18px; border-radius: 999px; font-size: 14px; font-weight: 500; letter-spacing: .02em; box-shadow: 0 6px 20px rgba(22,32,46,.22); transition: background .15s, transform .15s; } .abchat__launcher:hover { background: #1E3A8A; transform: translateY(-1px); } .abchat[data-open=\"true\"] .abchat__launcher { display: none; } .abchat__panel { width: min(380px, calc(100vw - 32px)); height: min(600px, calc(100dvh - 32px)); display: flex; flex-direction: column; background: var(--paper, #F5F7FA); border: 1px solid var(--line, #DDE2EA); border-radius: 16px; overflow: hidden; box-shadow: 0 16px 48px rgba(22,32,46,.24); } .abchat__panel[hidden] { display: none; } .abchat__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 14px 16px; background: #161A26; color: #fff; } .abchat__title { margin: 0; font-size: 15px; font-weight: 700; } .abchat__sub { margin: 2px 0 0; font-size: 11.5px; color: rgba(255,255,255,.72); } .abchat__close { background: none; border: 0; color: #fff; font-size: 22px; line-height: 1; cursor: pointer; padding: 0 4px; } .abchat__log { flex: 1; overflow-y: auto; padding: 16px 14px 8px; display: flex; flex-direction: column; gap: 8px; } .abchat__msg { max-width: 85%; padding: 9px 12px; border-radius: 14px; font-size: 14px; line-height: 1.65; white-space: pre-wrap; word-break: break-word; } .abchat__msg--bot { align-self: flex-start; background: var(--surface, #fff); color: var(--ink, #161A26); border: 1px solid var(--line, #DDE2EA); border-bottom-left-radius: 4px; } .abchat__msg--me { align-self: flex-end; background: #2A4CAE; color: #fff; border-bottom-right-radius: 4px; } .abchat__msg a { color: inherit; } .abchat__typing { align-self: flex-start; color: var(--ink-3, #6E7686); font-size: 13px; padding: 4px 6px; } .abchat__input { border-top: 1px solid var(--line, #DDE2EA); padding: 10px 12px 12px; background: var(--surface, #fff); } .abchat__input:empty { display: none; } .abchat__chips { display: flex; flex-wrap: wrap; gap: 6px; } .abchat__chip { border: 1px solid var(--accent, #1E3A8A); color: var(--accent, #1E3A8A); background: var(--surface, #fff); border-radius: 999px; padding: 7px 12px; font-size: 13px; cursor: pointer; text-align: left; font-family: inherit; } .abchat__chip:hover { background: #2A4CAE; color: #fff; } .abchat__row { display: flex; gap: 8px; align-items: flex-end; } .abchat__field { flex: 1; min-width: 0; border: 1px solid var(--line, #DDE2EA); border-radius: 10px; padding: 9px 11px; font-size: 16px; /* 16px未満だとiPhoneで勝手に拡大される */ font-family: inherit; color: var(--ink, #161A26); background: var(--paper, #F5F7FA); resize: none; } .abchat__field:focus { outline: 2px solid var(--accent, #1E3A8A); outline-offset: -1px; } .abchat__send { border: 0; background: #2A4CAE; color: #fff; border-radius: 10px; padding: 10px 14px; font-size: 14px; cursor: pointer; white-space: nowrap; font-family: inherit; } .abchat__send:disabled { opacity: .5; cursor: default; } .abchat__skip { margin-top: 6px; background: none; border: 0; color: var(--ink-2, #4A5261); font-size: 12.5px; text-decoration: underline; cursor: pointer; padding: 0; font-family: inherit; } .abchat__err { margin: 6px 0 0; font-size: 12.5px; color: #B3261E; } .abchat__consent { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: var(--ink, #161A26); margin-bottom: 10px; line-height: 1.6; } .abchat__consent input { margin-top: 4px; } .abchat__hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; } @media (max-width: 480px) { .abchat { right: 12px; bottom: 12px; } .abchat[data-open=\"true\"] { left: 0; right: 0; bottom: 0; top: 0; } .abchat[data-open=\"true\"] .abchat__panel { width: 100vw; height: 100dvh; border-radius: 0; border: 0; } .abchat__launcher { padding: 11px 15px; font-size: 13px; } } @media print { .abchat { display: none; } }";
  document.head.appendChild(st);
  var wrap = document.createElement('div');
  wrap.innerHTML = "<div class=\"abchat\" id=\"abchat\" data-open=\"false\">\n  <button type=\"button\" class=\"abchat__launcher\" id=\"abchat-launcher\" aria-controls=\"abchat-panel\" aria-expanded=\"false\">\n    <svg viewBox=\"0 0 24 24\" width=\"22\" height=\"22\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-4.6 3.5A.9.9 0 0 1 3 20.8V6a2 2 0 0 1 1-2Zm3 6.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm5 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm5 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z\"/></svg>\n    <span class=\"abchat__launcher-label\">チャットで相談</span>\n  </button>\n\n  <section class=\"abchat__panel\" id=\"abchat-panel\" role=\"dialog\" aria-label=\"チャットで転職相談\" hidden>\n    <header class=\"abchat__head\">\n      <div>\n        <p class=\"abchat__title\">転職のご相談</p>\n        <p class=\"abchat__sub\">お返事はメールでお届けします（原則2営業日以内）</p>\n      </div>\n      <button type=\"button\" class=\"abchat__close\" id=\"abchat-close\" aria-label=\"閉じる\">×</button>\n    </header>\n    <div class=\"abchat__log\" id=\"abchat-log\" aria-live=\"polite\"></div>\n    <div class=\"abchat__input\" id=\"abchat-input\"></div>\n    <!-- 人には見えない欄。埋まっていたら bot（Apps Script 側でも同じ名前で弾く） -->\n    <input type=\"text\" id=\"abchat-site\" name=\"website\" tabindex=\"-1\" autocomplete=\"off\" aria-hidden=\"true\" class=\"abchat__hp\" />\n  </section>\n</div>";
  document.body.appendChild(wrap.firstElementChild);
  (function () {
    var root = document.getElementById('abchat');
    if (!root) return;
    var panel = document.getElementById('abchat-panel');
    var launcher = document.getElementById('abchat-launcher');
    var closeBtn = document.getElementById('abchat-close');
    var log = document.getElementById('abchat-log');
    var box = document.getElementById('abchat-input');
    var KEY = 'abchat-v1';

    var TOPICS = ['転職を考えている', '求人を紹介してほしい', '年収・キャリアの相談', '書類・面接の相談', 'その他'];
    /* /consultation/ の選択肢と同じ文字列にする（Airtable の単一選択に入るため） */
    var TIMINGS = ['すぐにでも転職したい（1ヶ月以内）', '3ヶ月以内には決めたい', '半年以内をめどに検討中',
      '1年以内に良い求人があれば', '時期は未定（良い求人があれば）', 'まずは情報収集・相談から'];
    var SCOUTS = [['求人のご案内も受け取る', '希望する'], ['このご相談の返信だけ', '希望しない（このご相談に関する連絡のみ）']];

    var a = {};          // 回答
    var step = 0;        // 何問目まで答えたか
    var done = false;
    var started = false;
    var sending = false;

    function track(name, params) {
      try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {}
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify({ a: a, step: step, done: done })); } catch (e) {} }
    function load() {
      try { var d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.a) { a = d.a; step = d.step || 0; done = !!d.done; } } catch (e) {}
    }
    function clearSaved() { try { localStorage.removeItem(KEY); } catch (e) {} }

    function scroll() { log.scrollTop = log.scrollHeight; }
    function bubble(text, who, html) {
      var el = document.createElement('div');
      el.className = 'abchat__msg abchat__msg--' + who;
      if (html) el.innerHTML = text; else el.textContent = text;
      log.appendChild(el);
      scroll();
      return el;
    }
    /* 「入力中…」を少し見せてから話す。復元のときは待たない */
    function say(text, instant, html) {
      return new Promise(function (resolve) {
        if (instant) { bubble(text, 'bot', html); resolve(); return; }
        var t = document.createElement('div');
        t.className = 'abchat__typing';
        t.textContent = '入力中…';
        log.appendChild(t); scroll();
        setTimeout(function () { t.remove(); bubble(text, 'bot', html); resolve(); }, 550);
      });
    }
    function clearInput() { box.innerHTML = ''; }
    /* 下の入力欄が出たり消えたりすると会話欄の高さが変わるので、そのたびに最新のメッセージまで送る */
    try { new MutationObserver(scroll).observe(box, { childList: true, subtree: true }); } catch (e) {}

    function chips(list, onPick) {
      clearInput();
      var wrap = document.createElement('div');
      wrap.className = 'abchat__chips';
      list.forEach(function (item) {
        var label = Array.isArray(item) ? item[0] : item;
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'abchat__chip'; b.textContent = label;
        b.addEventListener('click', function () { onPick(item, label); });
        wrap.appendChild(b);
      });
      box.appendChild(wrap);
    }

    function textInput(opts, onSend) {
      clearInput();
      var row = document.createElement('div'); row.className = 'abchat__row';
      var f = document.createElement(opts.multi ? 'textarea' : 'input');
      f.className = 'abchat__field';
      if (opts.multi) f.rows = 3; else f.type = opts.type || 'text';
      if (opts.autocomplete) f.autocomplete = opts.autocomplete;
      if (opts.inputmode) f.inputMode = opts.inputmode;
      f.placeholder = opts.placeholder || '';
      f.maxLength = opts.max || 200;
      var s = document.createElement('button');
      s.type = 'button'; s.className = 'abchat__send'; s.textContent = '送る';
      var err = document.createElement('p'); err.className = 'abchat__err'; err.hidden = true;
      function go() {
        var v = String(f.value || '').trim();
        var msg = opts.check ? opts.check(v) : (v ? '' : '入力してください');
        if (msg) { err.textContent = msg; err.hidden = false; f.focus(); return; }
        onSend(v);
      }
      s.addEventListener('click', go);
      f.addEventListener('keydown', function (e) {
        /* 1行の欄は Enter で送る。複数行は Ctrl/⌘+Enter。日本語変換中の Enter は無視 */
        if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
        if (opts.multi && !(e.ctrlKey || e.metaKey)) return;
        e.preventDefault(); go();
      });
      row.appendChild(f); row.appendChild(s);
      box.appendChild(row);
      box.appendChild(err);
      if (opts.skip) {
        var k = document.createElement('button');
        k.type = 'button'; k.className = 'abchat__skip'; k.textContent = opts.skip;
        k.addEventListener('click', function () { onSend(''); });
        box.appendChild(k);
      }
      setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, 30);
    }

    /* ---------- 質問の流れ ---------- */
    var Q = [
      { ask: 'どんなご相談ですか？',
        show: function (next) { chips(TOPICS, function (v) { next('topic', v, v); }); } },
      { ask: 'よろしければ、もう少し詳しく教えてください。\n（今のお仕事、気になっていること、希望など何でも）',
        show: function (next) {
          textInput({ multi: true, max: 2000, placeholder: '例）今は法人営業3年目。年収を上げたいがどこを受ければいいか分からない', skip: 'スキップする',
            check: function () { return ''; } },
            function (v) { next('detail', v, v || '（スキップ）'); });
        } },
      { ask: '転職の時期はいつ頃をお考えですか？',
        show: function (next) { chips(TIMINGS, function (v) { next('timing', v, v); }); } },
      { ask: 'お名前を教えてください。',
        show: function (next) {
          textInput({ autocomplete: 'name', max: 100, placeholder: '例）山田 太郎',
            check: function (v) { return v ? '' : 'お名前を入力してください'; } },
            function (v) { next('name', v, v); });
        } },
      { ask: 'お返事をお届けするメールアドレスを教えてください。\n※チャット画面ではなく、メールでご返信します。',
        show: function (next) {
          textInput({ type: 'email', autocomplete: 'email', inputmode: 'email', max: 200, placeholder: '例）taro@example.com',
            check: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'メールアドレスの形式をご確認ください'; } },
            function (v) { next('email', v, v); });
        } },
      { ask: 'あなたに合う求人が見つかったときに、ご案内をお送りしてもよいですか？',
        show: function (next) { chips(SCOUTS, function (item) { next('scout', item[1], item[0]); }); } }
    ];

    function answerShown(i) {
      var keys = ['topic', 'detail', 'timing', 'name', 'email', 'scout'];
      var k = keys[i], v = a[k];
      if (k === 'detail') return v || '（スキップ）';
      if (k === 'scout') { var hit = SCOUTS.filter(function (s) { return s[1] === v; })[0]; return hit ? hit[0] : v; }
      return v;
    }

    function ask(i, instant) {
      if (i >= Q.length) { confirmStep(instant); return; }
      say(Q[i].ask, instant).then(function () {
        Q[i].show(function (key, value, shown) {
          a[key] = value;
          step = i + 1;
          save();
          clearInput();
          bubble(shown, 'me');
          track('chat_step', { step: step });
          ask(i + 1);
        });
      });
    }

    function confirmStep(instant) {
      say('ありがとうございます。この内容で送信します。\n\n' + a.name + ' 様\n' + a.email + '\n\n送信後、担当者から上記のアドレスにメールでご連絡します。', instant).then(function () {
        clearInput();
        var lab = document.createElement('label'); lab.className = 'abchat__consent';
        var cb = document.createElement('input'); cb.type = 'checkbox';
        var sp = document.createElement('span');
        sp.innerHTML = '<a href="' + PRIVACY_URL + '" target="_blank" rel="noopener">個人情報の取り扱い</a>に同意します';
        lab.appendChild(cb); lab.appendChild(sp);
        var row = document.createElement('div'); row.className = 'abchat__row';
        var s = document.createElement('button'); s.type = 'button'; s.className = 'abchat__send'; s.textContent = '送信する'; s.style.flex = '1';
        var redo = document.createElement('button'); redo.type = 'button'; redo.className = 'abchat__skip'; redo.textContent = '最初からやり直す';
        var err = document.createElement('p'); err.className = 'abchat__err'; err.hidden = true;
        s.addEventListener('click', function () {
          if (!cb.checked) { err.textContent = '個人情報の取り扱いへの同意にチェックを入れてください'; err.hidden = false; return; }
          submit(s, err);
        });
        redo.addEventListener('click', restart);
        row.appendChild(s);
        box.appendChild(lab); box.appendChild(row); box.appendChild(err); box.appendChild(redo);
      });
    }

    function submit(btn, err) {
      if (sending) return;
      var hp = document.getElementById('abchat-site');
      sending = true; btn.disabled = true; btn.textContent = '送信中…'; err.hidden = true;

      var ref = ''; try { ref = sessionStorage.getItem('ab_ref') || ''; } catch (e) {}
      var lines = ['【サイトのチャットから】', '相談テーマ：' + (a.topic || '')];
      if (a.detail) lines.push('', a.detail);
      lines.push('', '（送信ページ：' + location.host + location.pathname + '／' + document.title.slice(0, 80) + (ref ? '／流入元：' + ref : '') + '）');

      var record = {
        full_name: a.name,
        email: a.email,
        timing: a.timing,
        message: lines.join('\n'),
        scout_consent: a.scout || null,
        consent: true,
        source: 'jobsite-chat',
        page_path: location.host + location.pathname,
        website: hp ? hp.value : ''
      };

      /* ヘッダーを付けない＝text/plain の単純リクエスト（Apps Script はプリフライトに応えないため） */
      fetch(NOTIFY_URL, { method: 'POST', body: JSON.stringify({ kind: 'consultation_form', record: record }) })
        .then(function (res) { if (!res.ok) throw new Error(String(res.status)); return res.json(); })
        .then(function (j) {
          if (!j || !/^ok/.test(String(j.result || ''))) throw new Error(String(j && j.result || 'bad reply'));
          done = true; save();
          track('chat_send', { timing: a.timing || '', topic: a.topic || '' });
          clearInput();
          finished(false);
        })
        .catch(function (e) {
          sending = false; btn.disabled = false; btn.textContent = '送信する';
          err.innerHTML = '送信できませんでした。時間をおいてもう一度お試しいただくか、<a href="https://www.agent-best.net/consultation/">相談フォーム</a>または <a href="mailto:r_matsuoka@agent-best.net">r_matsuoka@agent-best.net</a> へご連絡ください。';
          err.hidden = false;
          track('chat_error', { detail: String(e && e.message || '') });
        });
    }

    function finished(instant) {
      say('受け付けました。ご相談ありがとうございます。\n担当者から ' + a.email + ' あてに、原則2営業日以内にメールでご連絡します。\n\n迷惑メールフォルダに入ることがあるので、届かないときはそちらもご確認ください。', instant).then(function () {
        clearInput();
        var k = document.createElement('button');
        k.type = 'button'; k.className = 'abchat__skip'; k.textContent = '別のご相談を送る';
        k.addEventListener('click', restart);
        box.appendChild(k);
      });
    }

    function restart() {
      a = {}; step = 0; done = false; sending = false;
      clearSaved();
      log.innerHTML = ''; clearInput();
      greet(false);
    }

    function greet(instant) {
      return say('こんにちは、エージェントベストです。\n転職のご相談を、このチャットで受け付けています。いくつか質問にお答えいただくだけで、1〜2分で終わります。', instant)
        .then(function () { ask(0, instant); });
    }

    /* 途中まで答えていたら、その続きから。過去の質問と答えは一気に並べ直す */
    function start() {
      if (started) return;
      started = true;
      load();
      if (step === 0 && !done) { greet(false); return; }
      say('こんにちは、エージェントベストです。\n転職のご相談を、このチャットで受け付けています。', true);
      for (var i = 0; i < Math.min(step, Q.length); i++) { bubble(Q[i].ask, 'bot'); bubble(answerShown(i), 'me'); }
      if (done) { finished(true); return; }
      if (step < Q.length) ask(step, true); else confirmStep(true);
    }

    function open() {
      panel.hidden = false;
      root.setAttribute('data-open', 'true');
      /* スマホは全画面で開くので、裏のページがスクロールしないようにする */
      if (window.matchMedia('(max-width: 480px)').matches) document.documentElement.style.overflow = 'hidden';
      launcher.setAttribute('aria-expanded', 'true');
      track('chat_open', { page_path: location.pathname });
      start();
    }
    function close() {
      panel.hidden = true;
      root.setAttribute('data-open', 'false');
      document.documentElement.style.overflow = '';
      launcher.setAttribute('aria-expanded', 'false');
      launcher.focus();
    }

    function lift() {
      var bar = document.querySelector('.applybar');
      var h = bar && getComputedStyle(bar).display !== 'none' ? bar.offsetHeight : 0;
      root.style.bottom = h ? (h + 10) + 'px' : '';
    }
    lift();
    window.addEventListener('resize', lift);
    try { new MutationObserver(lift).observe(document.body, { attributes: true, attributeFilter: ['class'] }); } catch (e) {}
    launcher.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) close(); });
    /* ページ内のリンクから開けるように（例：<a href="#chat">チャットで相談</a>） */
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('[data-open-chat], a[href="#chat"]');
      if (t) { e.preventDefault(); open(); }
    });
  })();
})();
