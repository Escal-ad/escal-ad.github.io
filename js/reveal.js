/* ============================================================================
   reveal.js — 所有"入场动画"
   ① 普通淡入（reveal / reveal-scale）② 列表依次浮现（stagger）
   ③ Hero 标题逐字升起（SplitText 手写版）+ 关键词连续渐变测量
   ④ 小节标题逐字浮入（ScrollFloat）⑤ 乱码解码（ScrambleText）⑥ 数字滚动
   原则：只用 opacity + transform，不改变布局；每个动画只播一次。
   ========================================================================== */

'use strict';

(function () {

  /* ==========================================================================
     一、通用逐字拆分器
     把一段文字拆成 <span class="char-unit"><span class="char-move"><span class="char">字</span>…
     为什么是三层？
       .char-unit 负责"遮罩"（overflow:hidden），
       .char-move 负责"位移"，
       .char      负责"字形与渐变"（不能带 transform，否则渐变会失效）。
     ========================================================================== */

  /** 数一段文字里有多少个可见字符（含空格，空格也要占一个节拍） */
  function countChars(str) {
    return str.replace(/[\r\n\t]/g, '').split('').length;
  }

  /** 把一段纯文字做成若干个 char-unit 节点 */
  function buildCharUnits(str, startIndex, staggerMs, markGrad) {
    var frag = document.createDocumentFragment();
    var chars = str.replace(/[\r\n\t]/g, '').split('');
    var i;

    for (i = 0; i < chars.length; i++) {
      var ch = chars[i];

      var unit = document.createElement('span');
      unit.className = 'char-unit';

      var move = document.createElement('span');
      move.className = 'char-move';
      // --d 是这一字的延迟：越靠后越晚出现
      move.style.setProperty('--d', ((startIndex + i) * staggerMs) + 'ms');

      var glyph = document.createElement('span');
      glyph.className = 'char' + (markGrad ? ' char--grad' : '');
      // 空格在 inline-block 里会被压掉，换成不间断空格保住宽度
      glyph.textContent = (ch === ' ') ? '\u00A0' : ch;

      move.appendChild(glyph);
      unit.appendChild(move);
      frag.appendChild(unit);
    }
    return frag;
  }

  /**
   * 拆分一个标题元素（支持里面夹一个 <em> 作为关键词）
   * @returns {number} 总共拆出多少个字符
   */
  function splitElement(el, staggerMs) {
    var nodes = Array.prototype.slice.call(el.childNodes);
    var frag = document.createDocumentFragment();
    var cursor = 0; // 当前排到第几个字（用来算延迟）
    var i;

    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i];

      // ① 纯文字
      if (node.nodeType === 3) {
        var text = node.nodeValue;
        if (!text.replace(/[\s\r\n\t]/g, '')) continue; // 纯空白跳过
        frag.appendChild(buildCharUnits(text, cursor, staggerMs, false));
        cursor += countChars(text);

      // ② 关键词 <em>：保留标签，内部逐字拆，并标记为需要渐变
      } else if (node.nodeType === 1 && node.tagName === 'EM') {
        var em = document.createElement('em');
        em.appendChild(buildCharUnits(node.textContent, cursor, staggerMs, true));
        frag.appendChild(em);
        cursor += countChars(node.textContent);

      // ③ 其它元素（例如 <br>）：原样保留
      } else if (node.nodeType === 1) {
        frag.appendChild(node.cloneNode(true));
      }
    }

    el.textContent = '';
    el.appendChild(frag);
    return cursor;
  }

  /* ==========================================================================
     二、Hero 标题逐字升起
     ========================================================================== */

  /**
   * 让 <em> 里每个字显示「整条渐变」的对应窗口，拼成一条连续的彩带。
   *
   * 为什么不是给每个字写渐变 stop 的百分比？
   *   因为 background 里的百分比是相对「元素自己的盒子」算的。
   *   把 em 的相对位置（比如 0%~16.6%）直接写成这个字的 stop，
   *   等于说「这个字宽度的 16.6% 处就是终点」，颜色会整体反过去。
   * 所以改成两步：
   *   ① --grad-w：把渐变条撑成和整个 em 一样宽
   *   ② --grad-x：把渐变条往左挪这个字到 em 左边的距离（取负）
   * 结果是每个字都在看同一条彩带的不同位置，接缝自然连续。
   */
  function measureGradient() {
    var em = APP.$('.hero__h1 em');
    if (!em) return;

    var chars = APP.$$('.char--grad', em);
    if (!chars.length) return;

    var box = em.getBoundingClientRect();
    if (!box.width) return; // 隐藏状态（比如 display:none）直接跳过

    chars.forEach(function (c) {
      var r = c.getBoundingClientRect();
      var offset = r.left - box.left; // 这个字离 em 左边缘多远
      c.style.setProperty('--grad-w', box.width.toFixed(2) + 'px');
      c.style.setProperty('--grad-x', (-offset).toFixed(2) + 'px');
    });
  }

  function initHeroSplit() {
    var h1 = APP.$('[data-split]');
    if (!h1) return;

    splitElement(h1, 40);           // 每字间隔 40ms

    // 等排版稳定后再测量渐变与起播
    window.requestAnimationFrame(function () {
      measureGradient();
      h1.closest('.hero').classList.add('is-ready');

      // 窗口尺寸变了，字的位置会变，渐变要重算（用 rAF 节流）
      var resizing = false;
      window.addEventListener('resize', function () {
        if (resizing) return;
        resizing = true;
        window.requestAnimationFrame(function () {
          resizing = false;
          measureGradient();
        });
      }, { passive: true });

      // 字体下载完成后宽度会变，也要重算一次
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          window.requestAnimationFrame(measureGradient);
        });
      }
    });
  }

  /* ==========================================================================
     三、小节标题逐字浮入（H2）
     ========================================================================== */

  function initH2Float() {
    var heads = APP.$$('.section__head');

    heads.forEach(function (head) {
      var h2 = APP.$('.h2', head);
      if (h2) splitElement(h2, 50);   // 每字间隔 50ms
    });

    if (!heads.length) return;

    // 进入视口 → 给 head 和它的 h2 都挂 .in-view（CSS 里两条规则各自负责）
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var head = entry.target;
        head.classList.add('in-view');
        var h2 = APP.$('.h2', head);
        if (h2) h2.classList.add('in-view');
        io.unobserve(head);
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });

    heads.forEach(function (head) { io.observe(head); });
  }

  /* ==========================================================================
     四、普通淡入 / 缩放淡入
     ⚠️ .file-card 也在这里观察：它的"扫描线"动画依赖 .in-view。
        为了不重复观察（重复会重复触发），下面的写法保证每个元素只 observe 一次。
     ========================================================================== */

  function initReveal() {
    var targets = APP.$$('.reveal, .reveal-scale, .file-card');
    if (!targets.length) return;

    // 浏览器太老、不支持 IntersectionObserver 时，直接全部显示（内容绝不丢失）
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('in-view'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);   // 只播一次
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });

    // 用 Set 去重：同一个元素即使同时匹配多个选择器也只观察一次
    var seen = [];
    targets.forEach(function (el) {
      if (seen.indexOf(el) !== -1) return;
      seen.push(el);
      io.observe(el);
    });
  }

  /* ==========================================================================
     五、列表依次浮现
     给容器加 .stagger-reveal，它的直接子元素会按顺序错开出现。
     ========================================================================== */

  function initStagger() {
    var wraps = APP.$$('.stagger-reveal');
    if (!wraps.length) return;

    if (!('IntersectionObserver' in window)) {
      wraps.forEach(function (w) { w.classList.add('in-view'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var wrap = entry.target;

        // 给每个子元素写延迟，最多不超过 0.6s（否则最后一个会等太久）
        Array.prototype.slice.call(wrap.children).forEach(function (child, i) {
          child.style.transitionDelay = Math.min(i * 0.1, 0.6) + 's';
        });

        wrap.classList.add('in-view');
        io.unobserve(wrap);
      });
    }, { threshold: 0.15 });

    wraps.forEach(function (w) { io.observe(w); });
  }

  /* ==========================================================================
     六、乱码解码（ScrambleText）
     做法：先把文字里的字母数字临时换成乱码字符，逐帧"还原"。
     中文不参与乱码（换成拉丁字符会难看），改为从 35% 透明度渐显，
     所以中英混排的 eyebrow 也能看到明显的"解码"感。
     ========================================================================== */

  var SCRAMBLE_POOL = '01#/%*ABCDEF'; // 乱码字符池：和"机密档案"的气质一致

  function scramble(el, frames) {
    var finalText = el.getAttribute('data-text');
    if (finalText === null) {
      finalText = el.textContent;
      el.setAttribute('data-text', finalText); // 原文只记一次，之后反复播放也安全
    }

    var chars = finalText.split('');
    var total = frames || 12;
    var frame = 0;

    // 每个字的"解锁时刻"：靠前的字先锁
    var unlockAt = chars.map(function (ch, i) {
      return Math.round((i / Math.max(chars.length - 1, 1)) * (total - 4));
    });

    el.classList.add('is-scrambling');

    var timer = window.setInterval(function () {
      frame++;
      var out = '';

      for (var i = 0; i < chars.length; i++) {
        var ch = chars[i];
        var isLatin = /[0-9A-Za-z]/.test(ch);

        if (frame >= unlockAt[i] || ch === ' ') {
          out += ch;
        } else if (isLatin) {
          out += SCRAMBLE_POOL.charAt(Math.floor(Math.random() * SCRAMBLE_POOL.length));
        } else if (ch.charCodeAt(0) > 255) {
          out += ch;          // 中文原样保留（避免乱码观感）
        } else {
          out += ch;
        }
      }

      el.textContent = out;

      if (frame >= total) {
        window.clearInterval(timer);
        el.textContent = finalText;
        el.classList.remove('is-scrambling');
      }
    }, 40);
  }

  function initScrambleOnView() {
    var targets = APP.$$('[data-scramble]');
    if (!targets.length) return;

    if (!('IntersectionObserver' in window)) return; // 不支持就直接显示原文

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        scramble(entry.target, 12);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.6 });

    targets.forEach(function (t) { io.observe(t); });
  }

  /* ==========================================================================
     七、数字滚动（例如"06 个关卡""06 件道具"）
     标记方式：<span data-count="6">0</span>
     ========================================================================== */

  function initCountUp() {
    var targets = APP.$$('[data-count]');
    if (!targets.length) return;

    if (!('IntersectionObserver' in window)) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var end = parseFloat(el.getAttribute('data-count')) || 0;
        var pad = el.hasAttribute('data-count-pad'); // 补零成 2 位（01、02…）
        var dur = 900;
        var t0 = null;

        function step(ts) {
          if (t0 === null) t0 = ts;
          var p = APP.clamp((ts - t0) / dur, 0, 1);
          // ease-out：开头快、结尾慢
          var eased = 1 - Math.pow(1 - p, 3);
          var v = Math.round(end * eased);
          var text = String(v);
          if (pad && text.length < 2) text = '0' + text;
          el.textContent = text;
          if (p < 1) window.requestAnimationFrame(step);
        }

        window.requestAnimationFrame(step);
        io.unobserve(el);
      });
    }, { threshold: 0.6 });

    targets.forEach(function (t) { io.observe(t); });
  }

  /* ==========================================================================
     八、导出（main.js 会按顺序调用）
     ========================================================================== */
  APP.initHeroSplit = initHeroSplit;
  APP.initH2Float = initH2Float;
  APP.initReveal = initReveal;
  APP.initStagger = initStagger;
  APP.initScrambleOnView = initScrambleOnView;
  APP.initCountUp = initCountUp;
  APP.measureGradient = measureGradient;

})();
