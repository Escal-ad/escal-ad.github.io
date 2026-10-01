/* ============================================================================
   sfx.js — 六件秘密道具，各自的声音

   六个子页面各有自己的道具（时光机 / 记忆面包 / 竹蜻蜓 / 缩小灯 / 翻译魔芋 /
   任意门），这一页负责让它们在「被点开」的那一刻发一声符合自己性格的动静。
   声音全部由 Web Audio 现场合成：不下载音频文件、离线可用、没有版权问题，
   也不会给首屏多一个请求 —— 和 js/bell.js 那颗黄铃铛是同一个路子。

   什么时候响（就是需求里要的那两种）：
     ① 点导航 / 手机菜单里那条链接时：立刻响，响 NAV_DELAY 毫秒再真的跳转。
        为什么不等跳过去再响：浏览器只允许「用户刚刚点过的那一页」出声，
        新页面得等下一次点击才有这个权限，所以只能先把声音放出来、再走。
     ② 直接打开 / 刷新 / 从微信里点进来时：这一页自己响一次。
        这时还没有用户手势，浏览器多半把 AudioContext 挂起 —— 先试着唤醒，
        醒不过来就记着「欠一声」，等用户在本页第一次点击 / 按键时补上。
        所以「刚进来可能没声音，点一下就有了」是预期行为，不是坏了。

   怎么关（右上角那个小喇叭）：
     点一下静音，图标变成带斜杠的喇叭，选择记在 localStorage（键 wqxw-sfx）。
     静音时不创建 AudioContext，也不接管任何链接 —— 点击行为与从前一模一样。

   克制的地方（和 bell.js 同一套规矩）：
     - 只接管「普通左键」的点击：带 Ctrl/⌘/Shift 的点击、中键、右键、
       target="_blank"、download 的链接一律放行，不挡浏览器自带的操作；
     - AudioContext 在被需要之前不创建（静音时整个文件相当于不存在）；
     - 浏览器不支持 / 任何一步出错都吞掉：一个装饰性音效不值得打断页面；
     - 「减少动态效果」只管"动"，不管声音 —— 声音的开关就是那个小喇叭。
   ========================================================================== */

'use strict';

(function () {

  /* --------------------------------------------------------------------------
     〇、常量与状态
     -------------------------------------------------------------------------- */
  var STORE_KEY = 'wqxw-sfx';     // localStorage 里只记一个 'off'
  var NAV_MARK = 'wqxw-sfx-nav';  // 「刚从站内点过来」的信物，见 §四
  var NAV_DELAY = 460;            // 点链接时：先让音效响出来，过这么久再跳转
  var LEVEL = 0.85;               // 总音量（各条音效内部的比例已经配好）

  var ctx = null;                 // 全站复用一个 AudioContext
  var master = null;              // 总音量节点，所有声音都汇到它这里
  var noiseBuf = null;            // 白噪声缓冲只生成一次
  var navTimer = 0;               // 延迟跳转的计时器
  var mutedCache = null;          // 缓存静音状态，避免每点一次都去读 localStorage
  var pageKey = '';               // 本页自己的道具音效（<body data-sfx="…">）

  /* --------------------------------------------------------------------------
     一、能不能响 / 用户想不想它响
     -------------------------------------------------------------------------- */

  function audioCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function muted() {
    if (mutedCache === null) {
      var v = '';
      try { v = window.localStorage.getItem(STORE_KEY) || ''; } catch (e) { v = ''; }
      mutedCache = (v === 'off');
    }
    return mutedCache;
  }

  function setMuted(v) {
    mutedCache = !!v;
    try { window.localStorage.setItem(STORE_KEY, mutedCache ? 'off' : 'on'); } catch (e) { /* 无痕模式等：记不住就记不住 */ }
  }

  // 所有声音共用的出口（顺便当总音量）
  function out(ac) {
    if (!master) {
      master = ac.createGain();
      master.gain.value = LEVEL;
      master.connect(ac.destination);
    }
    return master;
  }

  /* ==========================================================================
     二、发声零件
     一条音效由若干「层」叠出来，一层 = 一个振荡器（或一段噪声）+ 一条包络。
     层的写法就是下面 RECIPES 里那些字面量对象，字段含义：

       type  波形：sine / triangle / square / sawtooth
       f0    起始频率（Hz）
       f1    结束频率；不给就是定音，给了就一路扫过去
       t     相对这条音效起点的延迟（秒）
       dur   持续时长（秒）
       gain  峰值音量（0~1，最后还要乘总音量 LEVEL）
       atk   起音时间（秒），越大越"柔"
       hold  在峰上保持多久再开始衰减（秒，可选），竹蜻蜓的嗡嗡声靠它撑住
       lp    低通截止（可选）：削掉刺耳的高次谐波
       hp    高通截止（可选）：噪声层用它做"风"或"呲"
       trem  颤音 { rate 赫兹, depth 0~0.5 }：桨叶那种嗡嗡
       wob   音高抖动 { rate 赫兹, cents 音分 }：果冻那种晃
       noise 写成 true 就是一段白噪声，配 hp / lp 变成气流或闪光
     ========================================================================== */

  // 白噪声：只生成一次，之后所有"风"共用（loop 起来想多长就多长）
  function noiseBuffer(ac) {
    if (noiseBuf) return noiseBuf;
    var len = Math.max(1, Math.floor(ac.sampleRate * 0.8));
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    var data = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  // 按需串低通 / 高通，返回这一串滤波器的出口
  function chain(ac, node, o) {
    if (o.hp) {
      var hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = o.hp;
      node.connect(hp);
      node = hp;
    }
    if (o.lp) {
      var lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lp;
      node.connect(lp);
      node = lp;
    }
    return node;
  }

  // 起音 → （可选保持）→ 指数衰减。
  // ⚠️ 不能真的写 0：exponentialRampToValueAtTime 不接受 0，会抛异常，
  //    所以两头都用 0.0001 这种"听不见但合法"的值。
  function envelope(amp, t0, o) {
    var peak = Math.max(0.0002, o.gain);
    var atk = o.atk || 0.01;
    var end = t0 + o.dur;

    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    if (o.hold && t0 + atk + o.hold < end) {
      amp.gain.setValueAtTime(peak, t0 + atk + o.hold);
    }
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
  }

  function playTone(ac, t0, o) {
    var osc = ac.createOscillator();
    var amp = ac.createGain();
    var end = t0 + o.dur;

    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 && o.f1 !== o.f0) {
      if (o.curve === 'lin') osc.frequency.linearRampToValueAtTime(o.f1, end);
      else osc.frequency.exponentialRampToValueAtTime(o.f1, end);
    }

    var tail = chain(ac, osc, o);

    // 颤音单独占一级增益，只推它、不推包络那级：
    // 否则 LFO 会把已经衰减到近零的音量推成负数，尾部出现"咔哒"声。
    if (o.trem) {
      var depth = Math.min(0.5, o.trem.depth === undefined ? 0.4 : o.trem.depth);
      var trem = ac.createGain();
      var lfo = ac.createOscillator();
      var amount = ac.createGain();
      trem.gain.value = 1 - depth;
      lfo.frequency.setValueAtTime(o.trem.rate || 20, t0);
      amount.gain.setValueAtTime(depth, t0);
      lfo.connect(amount);
      amount.connect(trem.gain);
      lfo.start(t0);
      lfo.stop(end + 0.02);
      tail.connect(trem);
      tail = trem;
    }

    tail.connect(amp);
    amp.connect(out(ac));
    envelope(amp, t0, o);

    // 音高抖动（翻译魔芋的"晃"）
    if (o.wob) {
      var wl = ac.createOscillator();
      var wd = ac.createGain();
      wl.frequency.setValueAtTime(o.wob.rate || 6, t0);
      wd.gain.setValueAtTime(o.wob.cents || 20, t0);
      wl.connect(wd);
      wd.connect(osc.detune);
      wl.start(t0);
      wl.stop(end + 0.02);
    }

    osc.start(t0);
    osc.stop(end + 0.02);
  }

  function playNoise(ac, t0, o) {
    var src = ac.createBufferSource();
    var amp = ac.createGain();
    src.buffer = noiseBuffer(ac);
    src.loop = true;

    var tail = chain(ac, src, o);
    tail.connect(amp);
    amp.connect(out(ac));
    envelope(amp, t0, o);

    src.start(t0);
    src.stop(t0 + o.dur + 0.02);
  }

  /* ==========================================================================
     三、六件道具的声音
     每一条都按"前 400ms 就要听出是谁"来配 —— 点链接时 NAV_DELAY 之后页面就
     跳走了，后半段尾巴是留给"直接打开 / 刷新"那种完整播放的。
     ========================================================================== */

  var RECIPES = {

    /* 时光机：一条向上扫过整个频谱的"呜——"，底下垫一层往下沉的低频。
       两边一升一降，听着就是"离开现在，去了别的时候"，加一点风。 */
    'time-machine': { voices: [
      { type: 'sine',  f0: 150, f1: 1900, t: 0,     dur: 0.62, gain: 0.26, atk: 0.025 },
      { type: 'sine',  f0: 225, f1: 2850, t: 0.055, dur: 0.56, gain: 0.10, atk: 0.025 },
      { type: 'sine',  f0: 110, f1: 48,   t: 0,     dur: 0.42, gain: 0.26, atk: 0.012 },
      { noise: true, hp: 500, lp: 3600, t: 0.02, dur: 0.50, gain: 0.07, atk: 0.12 }
    ] },

    /* 记忆面包：三颗柔和的木琴音（E-G-B 上行），像记忆一点点浮上来。
       三角波 + 慢衰减，软得没有棱角，不打断正在读字的人。 */
    'memory-bread': { voices: [
      { type: 'triangle', f0: 329.63, t: 0,    dur: 0.34, gain: 0.09, atk: 0.012 },
      { type: 'triangle', f0: 659.25, t: 0,    dur: 0.50, gain: 0.24, atk: 0.008 },
      { type: 'triangle', f0: 783.99, t: 0.10, dur: 0.52, gain: 0.20, atk: 0.008 },
      { type: 'triangle', f0: 987.77, t: 0.20, dur: 0.72, gain: 0.18, atk: 0.008 }
    ] },

    /* 竹蜻蜓：桨叶声就是"嗡嗡"—— 一条锯齿波从低往高转上去，
       再用 26Hz 的颤音切它，就成了转起来才有的那种嗡嗡。
       低通固定不动、音高往上走，正好是"转速变快、声音越来越亮"。 */
    'takecopter': { voices: [
      { type: 'sawtooth', f0: 165, f1: 420, t: 0,    dur: 0.80, gain: 0.20, atk: 0.06,
        hold: 0.30, lp: 1100, trem: { rate: 26, depth: 0.5 } },
      { type: 'triangle', f0: 330, f1: 840, t: 0.02, dur: 0.72, gain: 0.09, atk: 0.07,
        hold: 0.28, trem: { rate: 26, depth: 0.4 } }
    ] },

    /* 缩小灯：一道短促的"呲——"，像闪光灯一样从低往高飙上去，
       后面跟一颗正在下落的高频小星星 —— 东西正在变小。 */
    'shrink-light': { voices: [
      { type: 'square', f0: 320,  f1: 2750, t: 0,    dur: 0.30, gain: 0.17, atk: 0.008, lp: 5200 },
      { type: 'sine',   f0: 640,  f1: 5200, t: 0,    dur: 0.26, gain: 0.10, atk: 0.006 },
      { noise: true,    hp: 2400,           t: 0,    dur: 0.14, gain: 0.08, atk: 0.005 },
      { type: 'sine',   f0: 3520, f1: 1980, t: 0.16, dur: 0.26, gain: 0.07, atk: 0.006 }
    ] },

    /* 翻译魔芋：电子设备"翻好了"的那种四连音（哔·哔·哔——哔），
       最后一颗带一点晃（wob），像果冻抖了一下。 */
    'translation-jelly': { voices: [
      { type: 'square', f0: 784,  t: 0,     dur: 0.10, gain: 0.14, atk: 0.006, lp: 3600 },
      { type: 'square', f0: 1046, t: 0.115, dur: 0.10, gain: 0.14, atk: 0.006, lp: 3600 },
      { type: 'square', f0: 784,  t: 0.245, dur: 0.10, gain: 0.13, atk: 0.006, lp: 3600 },
      { type: 'square', f0: 1568, t: 0.36,  dur: 0.18, gain: 0.12, atk: 0.006, lp: 3600,
        wob: { rate: 9, cents: 45 } },
      { type: 'sine',   f0: 392,  t: 0,     dur: 0.52, gain: 0.07, atk: 0.04 }
    ] },

    /* 任意门：先"咚"一声把门立住，然后是空气涌进来的声音，
       再有一束往上飘的光 —— 门开了，后面是别的地方。 */
    'anywhere-door': { voices: [
      { type: 'sine',     f0: 104,  f1: 58,   t: 0,    dur: 0.34, gain: 0.30, atk: 0.006 },
      { noise: true,      lp: 760,            t: 0.02, dur: 0.55, gain: 0.11, atk: 0.20 },
      { type: 'sine',     f0: 520,  f1: 1560, t: 0.09, dur: 0.50, gain: 0.14, atk: 0.06 },
      { type: 'triangle', f0: 1560, f1: 2340, t: 0.30, dur: 0.55, gain: 0.08, atk: 0.02,
        wob: { rate: 6, cents: 25 } }
    ] },

    /* 首页没有道具，就用这一声当「音效已经打开了」的确认 */
    'ui-on': { voices: [
      { type: 'sine', f0: 659.25, t: 0,    dur: 0.22, gain: 0.16, atk: 0.008 },
      { type: 'sine', f0: 987.77, t: 0.09, dur: 0.34, gain: 0.14, atk: 0.008 }
    ] }
  };

  function play(key) {
    if (!key || muted()) return;
    var rec = RECIPES[key];
    if (!rec) return;

    var ac = audioCtx();
    if (!ac) return;
    if (ac.state === 'suspended' && typeof ac.resume === 'function') ac.resume();

    try {
      // 留 20ms 提前量：太贴 currentTime 的话有些浏览器会把开头吞掉
      var t0 = ac.currentTime + 0.02;
      for (var i = 0; i < rec.voices.length; i++) {
        var v = rec.voices[i];
        var at = t0 + (v.t || 0);
        if (v.noise) playNoise(ac, at, v);
        else playTone(ac, at, v);
      }
    } catch (e) {
      /* 静默失败：一个装饰性音效不值得打断页面 */
    }
  }

  /* ==========================================================================
     四、把「上一页已经响过了」这件事带到下一页
     点链接时声音是在**旧页面**上放的（见文件开头第 ① 条），新页面不该再响一遍。
     跨页面传一句话，只有两个地方靠得住：
       · sessionStorage —— http / https 下最干净；
       · window.name    —— file:// 直接双击打开时 storage 未必通，这个一定通。
     两个都写下、两个都读，读到就删（一次性信物）。
     刷新页面时信物已经用掉了，所以刷新会重新响一遍 —— 这正是想要的效果。
     ========================================================================== */

  function markNav(key) {
    try { window.sessionStorage.setItem(NAV_MARK, key); } catch (e) { /* 忽略 */ }
    try { window.name = NAV_MARK + ':' + key; } catch (e) { /* 忽略 */ }
  }

  function tookNavMark(key) {
    var hit = false;
    try {
      if (window.sessionStorage.getItem(NAV_MARK) === key) {
        window.sessionStorage.removeItem(NAV_MARK);
        hit = true;
      }
    } catch (e) { /* 忽略 */ }
    try {
      if (window.name && window.name.indexOf(NAV_MARK + ':') === 0) {
        if (window.name.slice(NAV_MARK.length + 1) === key) hit = true;
        window.name = '';
      }
    } catch (e) { /* 忽略 */ }
    return hit;
  }

  /* ==========================================================================
     五、点链接：先出声，再走
     ========================================================================== */

  // 这一下点击落在一个「带道具音效的站内链接」上吗？
  function linkFor(e) {
    var t = e.target;
    if (!t || !t.closest) return null;
    var a = t.closest('a[data-sfx]');
    if (!a || !a.getAttribute('data-sfx')) return null;
    if (a.target && a.target !== '' && a.target !== '_self') return null; // 要开新标签页：不碰
    if (a.hasAttribute('download')) return null;
    return a;
  }

  function samePage(href) {
    if (!href) return false;
    try {
      return new URL(href, location.href).pathname === location.pathname;
    } catch (e) {
      return false;   // 老浏览器没有 URL 构造器：当作要跳转，照常放行
    }
  }

  function onDocumentClick(e) {
    // 只用"普通左键"，其余一律放行（可能要开新标签页、存链接、用浏览器菜单）
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (muted()) return;

    var a = linkFor(e);
    if (!a) return;

    var key = a.getAttribute('data-sfx');

    // 导航里「当前这一页」那条链接：响一声就够了，没必要白刷一次页面
    if (samePage(a.getAttribute('href'))) {
      play(key);
      return;
    }

    // 真要跳转：先让声音出来，再走
    e.preventDefault();
    markNav(key);
    play(key);
    window.clearTimeout(navTimer);
    navTimer = window.setTimeout(function () {
      location.href = a.href;
    }, NAV_DELAY);
  }

  /* ==========================================================================
     六、右上角那个小喇叭
     ========================================================================== */

  var LABEL_ON = '关闭页面音效';
  var LABEL_OFF = '打开页面音效';

  function paintToggle(btn) {
    var off = muted();
    btn.classList.toggle('is-off', off);
    btn.setAttribute('aria-pressed', off ? 'false' : 'true');
    btn.setAttribute('aria-label', off ? LABEL_OFF : LABEL_ON);
    btn.setAttribute('title', off ? LABEL_OFF : LABEL_ON);
  }

  function initToggle() {
    var btn = APP.$('.nav__sfx');
    if (!btn) return;
    paintToggle(btn);

    btn.addEventListener('click', function () {
      var next = !muted();
      setMuted(next);
      paintToggle(btn);
      // 刚打开：当场响一声，证明它真的在工作（首页没有道具，就用确认音）
      if (!next) play(pageKey || 'ui-on');
    });
  }

  /* ==========================================================================
     七、到站：直接打开 / 刷新时，这一页自己响一次
     ========================================================================== */

  function waitForGesture(key) {
    function done(e) {
      document.removeEventListener('pointerdown', done, true);
      document.removeEventListener('keydown', done, true);
      // 要是这一下点的正好是"去别的子页面"的链接，就把这一声让给目标页，别抢拍
      var t = e && e.target;
      if (t && t.closest && t.closest('a[data-sfx]')) return;
      play(key);
    }
    document.addEventListener('pointerdown', done, true);
    document.addEventListener('keydown', done, true);
  }

  function arrival(key) {
    if (muted()) return;

    var ac = audioCtx();
    if (!ac) return;

    // 已经解锁过（比如站内点过链接、刚回来）：直接响
    if (ac.state === 'running') {
      play(key);
      return;
    }

    // 还没解锁：先试着唤醒。醒不过来就记着"欠一声"，等第一次交互补上。
    var settled = false;
    function owe() {
      if (settled) return;
      settled = true;
      waitForGesture(key);
    }
    // 有的浏览器 resume() 返回的 promise 会一直挂着不 resolve，兜一下
    window.setTimeout(owe, 220);

    try {
      var p = ac.resume();
      if (p && typeof p.then === 'function') {
        p.then(function () {
          if (settled || ac.state !== 'running') return;
          settled = true;
          play(key);
        }, function () { /* 拒绝就交给 owe() */ });
      }
    } catch (e) { /* 交给 owe() */ }
  }

  function initSfx() {
    pageKey = (document.body && document.body.getAttribute('data-sfx')) || '';

    document.addEventListener('click', onDocumentClick, true);
    initToggle();

    if (!pageKey) return;              // 首页没有道具音效：那是黄铃铛的活儿

    var viaNav = tookNavMark(pageKey); // 不管用不用，都要把信物收掉
    if (!viaNav) arrival(pageKey);
  }

  /* ==========================================================================
     八、导出
     ========================================================================== */
  APP.sfx = { play: play, muted: muted, setMuted: setMuted };
  APP.initSfx = initSfx;

})();
