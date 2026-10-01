/* ============================================================================
   scroll.js — 一切"跟着滚动走"的东西
   ① 导航栏滚动态  ② 顶部阅读进度条  ③ 当前所在分区高亮（ScrollSpy）
   ④ 通关计数与轨道点亮（单页闯关版遗留，多页面版已经不再使用）
   ⑤ 移动端全屏菜单  ⑥ 右侧轨道的点击跳转（同上，已不再使用）
   性能做法：所有计算都挤进"每帧一次"的调度回调里（来自 utils.js 的 onScroll），
   并且把每个分区的绝对位置**缓存**起来，避免每帧都去读布局（会掉帧）。

   【多页面版说明】
   本站现在是「首页 index.html + 6 个独立子页面」，每个页面都加载这个文件。
   子页面里不存在 #lv-0x 这些分区，所以：
     · measure() 里每个 id 找不到元素就直接 return，不会报错；
     · "当前在哪一页"的高亮改由 HTML 里写死的 aria-current="page" 负责
       （见 css/pages.css 第 1 节），这里只负责"同一页内滚动到哪一节"。
   所以本文件可以原样被所有页面共用，不需要任何分支判断。
   ========================================================================== */

'use strict';

(function () {

  /* 页面里所有能当"一节"看的分区，顺序必须与页面从上到下一致 */
  var SECTION_IDS = ['start', 'brief', 'levels', 'lv-01', 'lv-02', 'lv-03', 'lv-04', 'lv-05', 'lv-06'];

  /* 真正算"关卡"的六个分区（用来算通关进度 x/6） */
  var LEVEL_IDS = ['lv-01', 'lv-02', 'lv-03', 'lv-04', 'lv-05', 'lv-06'];

  var TOTAL_LEVELS = LEVEL_IDS.length;

  /* 缓存：每个分区的绝对纵向位置（px） */
  var tops = {};

  /* 上次算出来的结果，用来避免每帧都写 DOM */
  var lastActive = '';
  var lastCleared = -1;

  /* --------------------------------------------------------------------------
     测量：把每个分区距离页面顶部的绝对位置记下来
     分三种时机重测 —— 打开时、窗口尺寸变化时、字体加载完成时
     -------------------------------------------------------------------------- */
  function measure() {
    SECTION_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      tops[id] = el.getBoundingClientRect().top + window.pageYOffset;
    });
  }

  /* --------------------------------------------------------------------------
     主逻辑：返回一个函数，交给每帧一次的调度器
     -------------------------------------------------------------------------- */
  function initNavAndProgress() {
    var nav = APP.$('.nav');
    var progress = APP.$('.progress-bar');
    var spyLineRatio = 0.45;   // 判定"我看到哪一节了"的那条隐形横线：屏幕高度的 45%
    var countEls = APP.$$('[data-cleared-count]');
    var railNodes = APP.$$('.rail__node');
    var navLinks = APP.$$('.nav__link');

    measure();

    // 尺寸或字体变化后位置会变，重测
    var remeasure = { timer: 0 };
    function scheduleRemeasure() {
      window.clearTimeout(remeasure.timer);
      remeasure.timer = window.setTimeout(measure, 120);
    }
    window.addEventListener('resize', scheduleRemeasure, { passive: true });
    window.addEventListener('load', measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

    /* 每帧只跑一次的核心函数 */
    function update() {
      var y = window.pageYOffset;
      var vh = window.innerHeight;
      var spyY = y + vh * spyLineRatio;

      /* ① 导航栏：滚过 50px 就换成"毛玻璃"外观 */
      if (nav) nav.classList.toggle('scrolled', y > 50);

      /* ② 顶部进度条：0 → 1 映射成 scaleX */
      if (progress) {
        var max = document.documentElement.scrollHeight - vh;
        var pct = max > 0 ? APP.clamp(y / max, 0, 1) : 0;
        progress.style.transform = 'scaleX(' + pct.toFixed(4) + ')';
      }

      /* ③ 我在哪一节？（取"最后一个顶部已经越过判定线"的分区） */
      var active = '';
      for (var i = 0; i < SECTION_IDS.length; i++) {
        var t = tops[SECTION_IDS[i]];
        if (typeof t === 'number' && t <= spyY) active = SECTION_IDS[i];
      }

      /* ④ 已通关的关卡数（顶部越过判定线就算到达） */
      var cleared = 0;
      for (var j = 0; j < LEVEL_IDS.length; j++) {
        var lt = tops[LEVEL_IDS[j]];
        if (typeof lt === 'number' && lt <= spyY) cleared++;
      }

      /* —— 以下只在结果真的变了的时候才写 DOM —— */

      if (active !== lastActive) {
        lastActive = active;

        navLinks.forEach(function (link) {
          var href = link.getAttribute('href') || '';

          /* 多页面版：跨页面的链接（比如 story.html）不参与"滚到哪就高亮哪"。
             它们的当前页高亮是 HTML 里写死的 aria-current="page"，不要动它。 */
          if (href.charAt(0) !== '#') return;

          var isOn = href === '#' + active;
          link.classList.toggle('is-active', isOn);
          if (isOn) { link.setAttribute('aria-current', 'true'); }
          else { link.removeAttribute('aria-current'); }
        });

        railNodes.forEach(function (node) {
          node.classList.toggle('is-active', node.getAttribute('data-target') === active);
        });
      }

      if (cleared !== lastCleared) {
        lastCleared = cleared;

        /* 底部/导航里的"已通关 x/6" */
        countEls.forEach(function (el) {
          el.textContent = cleared + '/' + TOTAL_LEVELS;
        });

        /* 轨道节点点亮 */
        railNodes.forEach(function (node) {
          var t = node.getAttribute('data-target');
          var idx = LEVEL_IDS.indexOf(t);
          node.classList.toggle('is-cleared', idx !== -1 && idx < cleared);
        });

        /* 通关后给页面根节点挂个标记，方便以后做"全站通关"彩蛋 */
        document.documentElement.classList.toggle('is-cleared-all', cleared >= TOTAL_LEVELS);
      }
    }

    APP.onScroll(update);
    update(); // 打开页面先算一次（比如带 #hash 直接进来时）
  }

  /* --------------------------------------------------------------------------
     移动端全屏菜单（全屏模态：进焦点 / 锁焦点 / 背景 inert / 退出还焦点）

     评审意见：原来只是「藏起来 / 显示出来」三件事做了一半——
       · Tab 还能走到遮罩后面的正文（背景只是不能滚，并没有被禁掉）
       · 打开后按钮的可访问名仍是「打开页面菜单」，和真实状态不符
       · 只有 Esc 会把焦点还给按钮；点条目 / 拉宽窗口关闭时焦点会丢
     现在按 W3C ARIA APG 的模态对话框模式补齐：
       打开 → 焦点进第一个条目；Tab / Shift+Tab 在菜单内循环；
              背景（main / 跳转链接 / 站标 / 页脚）inert + aria-hidden；
       关闭 → 焦点一定回到开关按钮（按钮不可见时不硬塞）；状态与名字同步。

     为什么没加 aria-modal：这里是用 inert 真的把背景从无障碍树里摘掉，
     背景里的链接也真的 Tab 不到，状态和行为已经一致，不需要再声明一遍。
     （评审原文：「不要只加 aria-modal，ARIA 状态要和实际行为一致」。）
     -------------------------------------------------------------------------- */
  function initMobileMenu() {
    var toggle = APP.$('.nav__toggle');
    var menu = APP.$('.mobile-menu');
    if (!toggle || !menu) return;

    var items = APP.$$('.mobile-menu__item', menu);

    // 打开时要从无障碍树 + Tab 序列里摘掉的「背景」。
    // 注意：都是没有任何祖先 aria-hidden 的元素，所以关闭时直接 removeAttribute 是安全的。
    var background = APP.$$('main, .skip-link, .nav__logo, .footer');

    var OPEN_LABEL = '打开页面菜单';
    var CLOSE_LABEL = '关闭页面菜单';

    function isOpen() {
      return menu.classList.contains('is-open');
    }

    // 菜单里所有可聚焦元素（现在是 6 个条目；写成通用形式，以后加东西不用改）
    function focusables() {
      return APP.$$('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])', menu);
    }

    function setBackgroundInert(on) {
      background.forEach(function (el) {
        if (on) {
          el.setAttribute('inert', '');           // 现代浏览器：无障碍树和 Tab 序列一起摘掉
          el.setAttribute('aria-hidden', 'true'); // 老引擎兜底（没有 inert 时至少挡住读屏）
        } else {
          el.removeAttribute('inert');
          el.removeAttribute('aria-hidden');
        }
      });
    }

    function setOpen(open) {
      menu.classList.toggle('is-open', open);
      document.body.classList.toggle('is-menu-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? CLOSE_LABEL : OPEN_LABEL);
      menu.setAttribute('aria-hidden', open ? 'false' : 'true');
      setBackgroundInert(open);
    }

    function open() {
      setOpen(true);

      // 焦点进菜单：优先第一个条目；没有条目时退回菜单容器（模板里带 tabindex="-1"）
      var first = focusables()[0] || menu;

      // ⚠️ 这里有个坑：菜单是靠 visibility 隐显的，而 visibility 是离散属性。
      // 刚加上 .is-open 的那一瞬间浏览器还没重算样式，元素仍是 hidden，
      // 而 focus() 打到隐藏元素上会被静默忽略 —— 结果是焦点留在按钮上，
      // 读屏软件完全不知道菜单开了。
      // CSS 那边已经把「打开」时的 visibility 改成 0 延迟（见 components.css 的
      // .mobile-menu.is-open），这里再强制一次重排把样式落地，然后移焦点。
      void menu.offsetHeight;
      first.focus();

      // 兜底：万一引擎把重算拖到了下一帧，就在接下来几帧里接着试（最多 ~20 帧）。
      if (document.activeElement !== first) {
        var tries = 0;
        (function retry() {
          if (!isOpen() || document.activeElement === first || tries++ > 20) return;
          first.focus();
          window.requestAnimationFrame(retry);
        })();
      }
    }

    function close() {
      if (!isOpen()) return;
      setOpen(false);
      // 拉宽到桌面宽度会自动关闭，这时开关按钮本身是 display:none，
      // 把焦点塞给看不见的元素只会让它掉到 <body> 上 —— 所以先确认它真的可见。
      if (toggle.getClientRects().length) toggle.focus();
    }

    toggle.addEventListener('click', function () {
      if (isOpen()) close();
      else open();
    });

    // 点了某一项就自动收起（焦点还给按钮，保持和 Esc 一致的行为）
    items.forEach(function (item) {
      item.addEventListener('click', function () { close(); });
    });

    // Esc 收起 + Tab / Shift+Tab 锁在菜单内。
    // 挂在 document 上而不是 menu 上：万一焦点落到菜单容器或 <body>，
    // 挂在 menu 上的监听器就收不到事件，Tab 会漏到背景去。
    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;

      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key !== 'Tab') return;

      var list = focusables();
      if (!list.length) return;   // 没有可聚焦元素就别拦 Tab

      var first = list[0];
      var last = list[list.length - 1];
      var active = document.activeElement;
      var inside = list.indexOf(active) !== -1;

      if (e.shiftKey && (!inside || active === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    });

    // 回到桌面宽度时强制收起（否则菜单会"卡"在打开状态）
    if (window.matchMedia) {
      var mq = window.matchMedia('(min-width: 901px)');
      var onWide = function (ev) { if (ev.matches) close(); };
      if (mq.addEventListener) mq.addEventListener('change', onWide);
      else if (mq.addListener) mq.addListener(onWide);
    }
  }

  /* --------------------------------------------------------------------------
     右侧关卡轨道：点击跳到对应关卡
     （节点本身就是 <a href="#lv-0x">，这里只是补一个平滑滚动的兜底）
     -------------------------------------------------------------------------- */
  function initRail() {
    APP.$$('.rail__node').forEach(function (node) {
      node.addEventListener('click', function (e) {
        var target = document.getElementById(node.getAttribute('data-target'));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* --------------------------------------------------------------------------
     导出
     -------------------------------------------------------------------------- */
  APP.initNavAndProgress = initNavAndProgress;
  APP.initMobileMenu = initMobileMenu;
  APP.initRail = initRail;

})();
