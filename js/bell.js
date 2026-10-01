/* ============================================================================
   bell.js — 站标上那颗黄铃铛
   全站左上角的站标（口袋图标）里画着一颗黄色小铃铛，就是它。点一下会发生三件事：
     ① 听：现场合成一声铜铃（Web Audio），不下载任何音频文件 ——
        离线可用、没有版权问题，也不会给首屏多一个请求。
     ② 看：站标整个摆一摆、外圈荡开一圈波纹
        （关键帧在 css/animations.css 第 1 节，样式在 css/components.css 的「2. 导航」节）
     ③ 走：站标同时还挂着"回首页"的链接，所以这里先让「叮」响出来，
        过 RING_DELAY 毫秒再真的跳转；已经在首页就什么都不做 —— 没必要白刷一次。
        键盘用户按 Enter 一样会响、一样会跳转。

   克制的地方：
     - 「减少动态效果」下跳过摇摆，声音照旧：是用户自己点的，不算自动播放；
     - 浏览器不支持 AudioContext 就静默降级，只是不响，绝不报错；
     - AudioContext 在被点之前不创建，既省资源也不违反浏览器的自动播放策略；
     - 只接管"普通左键"的点击，带 Ctrl/⌘/Shift 的点击、中键、右键一律放行，
       免得挡住"在新标签页打开"这类浏览器自带操作。
   ========================================================================== */

'use strict';

(function () {

  var RING = 'is-ring';     // 加在站标上，CSS 靠它触发摇摆和波纹
  var SWING_MS = 900;       // 比最长的那个关键帧（bellSwing 720ms）多留一点余量
  var RING_DELAY = 400;     // 先让「叮」响出来，再跳转
  var DOUBLE_MS = 350;      // pointerdown 已经响过的话，click 里就不再重复响

  var ctx = null;           // 复用同一个 AudioContext
  var timer = 0;            // 摘类的兜底计时器
  var navTimer = 0;         // 延迟跳转的计时器
  var lastRing = 0;         // 上一次响铃的时间（避免按下和点击各响一次）

  /* ==========================================================================
     一、声音：用几个非谐分音凑一声"叮"
     真铃铛不是单一频率，而是好几层分音一起响、各自衰减。
     所以这里同时起 6 个正弦波：高音衰减快（清脆的那一下），低音衰减慢（撑住余韵）。
     ========================================================================== */

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

  // 一个分音 = [频率 Hz, 音量, 衰减时长 秒]
  var PARTIALS = [
    [440,  0.10, 1.20],   // 低频余韵
    [880,  0.22, 0.80],   // 主音
    [1056, 0.13, 0.50],   // 三度：决定"铜"味
    [1320, 0.09, 0.36],   // 五度
    [1760, 0.06, 0.26],   // 清亮的那一下
    [2730, 0.03, 0.16]
  ];

  function playBell() {
    var ac = audioCtx();
    if (!ac) return;

    // 首次点击时上下文多半还是 suspended，恢复它（必须在用户手势里调用）
    if (ac.state === 'suspended' && typeof ac.resume === 'function') ac.resume();

    try {
      var t0 = ac.currentTime + 0.01;

      PARTIALS.forEach(function (p) {
        var osc = ac.createOscillator();
        var amp = ac.createGain();
        var end = t0 + p[2];

        osc.type = 'sine';
        osc.frequency.setValueAtTime(p[0], t0);

        // 8ms 冲上去，然后指数衰减回近乎无声。
        // 不能真的写 0：exponentialRampToValueAtTime 不接受 0，会抛异常。
        amp.gain.setValueAtTime(0.0001, t0);
        amp.gain.exponentialRampToValueAtTime(p[1], t0 + 0.008);
        amp.gain.exponentialRampToValueAtTime(0.0001, end);

        osc.connect(amp);
        amp.connect(ac.destination);
        osc.start(t0);
        osc.stop(end + 0.02);
      });
    } catch (e) {
      /* 静默失败：一个装饰性音效不值得打断页面 */
    }
  }

  /* ==========================================================================
     二、响一下：先出声，再（可选地）摇
     同一个类连着加两次浏览器不会重播动画，所以必须"摘掉 → 强制回流 → 再加"。
     ========================================================================== */

  function ring(el) {
    lastRing = Date.now();
    playBell();                     // 声音在「减少动态效果」下也照旧
    if (!APP.motionOK()) return;    // 只要声音，不摇

    el.classList.remove(RING);
    void el.offsetWidth;            // 读一次布局，逼浏览器先结算样式
    el.classList.add(RING);

    // 兜底：万一 animationend 没送到（例如中途切走了标签页），也把类摘干净
    window.clearTimeout(timer);
    timer = window.setTimeout(function () {
      el.classList.remove(RING);
    }, SWING_MS);
  }

  /* ==========================================================================
     三、初始化：站标既会响，也是"回首页"的链接
     ========================================================================== */

  // 这个链接是不是"当前这一页"（在首页时，站标指向的就是首页自己）
  function samePage(href) {
    if (!href) return false;
    try {
      return new URL(href, location.href).pathname === location.pathname;
    } catch (e) {
      return false;                 // 老浏览器没有 URL 构造器：当作要跳转，照常放行
    }
  }

  function initNavBell() {
    var el = APP.$('.nav__logo');
    if (!el || el.dataset.bellReady === '1') return;   // 页面上没有站标就安静退出
    el.dataset.bellReady = '1';

    // 按下就响：比等 click 更跟手，也照顾"按下去又拖开、没形成点击"的情况
    el.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;   // 右键留给浏览器菜单
      ring(el);
    });

    // 拿最长的那个关键帧（bellSwing）当"演完了"的信号
    el.addEventListener('animationend', function (e) {
      if (e.animationName !== 'bellSwing') return;     // 波纹的 bellRipple 也会冒泡上来
      window.clearTimeout(timer);
      el.classList.remove(RING);
    });

    el.addEventListener('click', function (e) {
      // 带修饰键 / 中键的点击一律放行，交给浏览器（可能要开新标签页、存链接）
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      // 键盘 Enter 不经过 pointerdown，这里补响一次；鼠标点过的就不重复了
      if (Date.now() - lastRing > DOUBLE_MS) ring(el);

      var href = el.getAttribute('href');
      if (!href) return;

      // 已经在首页了：不跳转（白刷一次没意义，还会把铃声掐断）
      if (samePage(href)) {
        e.preventDefault();
        return;
      }

      // 真要跳转：先让「叮」响出来，再走
      e.preventDefault();
      window.clearTimeout(navTimer);
      navTimer = window.setTimeout(function () {
        location.href = href;
      }, RING_DELAY);
    });
  }

  /* ==========================================================================
     四、导出
     ========================================================================== */
  APP.initNavBell = initNavBell;

})();
