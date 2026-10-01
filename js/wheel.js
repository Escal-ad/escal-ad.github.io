/* ============================================================================
   wheel.js — 滚轮翻页（在子页面之间滑动鼠标就能换页）

   【做什么】
   在 6 个子页面里，鼠标滚轮向下 = 翻到下一篇，向上 = 翻回上一篇，
   顺序就是导航栏里那 6 个入口的顺序（01 我的故事 → 06 联系方式）。

   【为什么不用自己写跳转】
   导航栏里那 6 条链接都带着 data-sfx（点它会先放那件道具的音效，
   等 NAV_DELAY 之后再跳，见 js/sfx.js）。这里不去复制那套逻辑，
   而是**直接 click() 对应的那条导航链接**，于是音效、延迟、防重复信物
   全部自动复用 —— 滚轮和点击的行为一模一样，将来改导航也只需要改一处。

   【什么时候接管 / 什么时候放行】
     ① 只有「一屏一关」生效的那一档（≥901px，与 css/responsive.css §1.5 一致）
        才接管。窄屏上子页面本来就是要上下滚的，滚轮必须留给页面自己。
     ② 首页不接管：首页没有 aria-current / .is-current 的那条链接，
        找不到「当前是第几页」就直接不启用（首页本身也是要滚动的长页面）。
     ③ 页面自己还有得滚的时候放行 —— 窗口太矮（比如 1440×700）时子页面会溢出，
        这时先让页面滚，滚到底了再往下滚才翻页。永远不会有「滚不动」的死角。
     ④ 到头了不绕圈：第一页再往上滚、最后一页再往下滚，什么都不做。

   【防误触】
     · 阈值：累计位移超过 THRESHOLD 才算「想翻页」，碰一下不算；
     · 一次只翻一页：翻过一次就锁住（done），免得一次猛滚连跳好几页；
       1.6s 后解锁 —— 万一这一下没能跳成，不至于把功能永久锁死；
     · 冷启动期：新页面打开后的 COOLDOWN 毫秒内不理滚轮。
       触控板的惯性滑行能持续一两秒，不挡的话刚跳过来就会被残余惯性再推走一页；
     · 横向滑动（触控板左右划）不算翻页；
     · Ctrl + 滚轮是浏览器缩放，一律放行；
     · 别的模块已经 preventDefault 过的事件放行，不抢。
   ========================================================================== */

'use strict';

(function () {

  /* 只有 ≥ 这个宽度才接管（对齐 css/responsive.css 的「一屏一关」断点） */
  var MIN_WIDTH = 901;

  /* 累计位移超过这个数（px）才算「想翻页」 */
  var THRESHOLD = 48;

  /* 判定「到顶 / 到底」的容差（px） */
  var EDGE = 8;

  /* deltaMode = 1 是「行」，按一行约 16px 折算成像素 */
  var LINE = 16;

  /* 横向位移超过纵向这么多倍 → 当作横向滑动，放行 */
  var SIDE_MARGIN = 1.6;

  /* 新页面打开后先安静这么久（ms），挡掉上一页触控板的惯性尾巴 */
  var COOLDOWN = 650;

  /* 翻页后锁住多久（ms）再解锁，防止一次猛滚连跳几页 */
  var LOCK_MS = 1600;

  function initWheelNav() {
    /* ------------------------------------------------------------------------
       一、先找出「我在第几页」以及它的前后邻居

       完全不依赖 HTML 里额外加的标记：导航栏当前那一条带 .is-current
       （生成器按 PAGES 顺序写的，见 tools/拆分生成子页面.py 的 build_nav_and_menu）。
       首页的 6 条链接都不带 .is-current，所以 here 会是 -1，直接不启用。
       ------------------------------------------------------------------------ */
    var links = APP.$$('.nav__links .nav__link');
    if (links.length < 2) return;

    var here = -1;
    for (var i = 0; i < links.length; i++) {
      if (links[i].classList.contains('is-current')) { here = i; break; }
    }
    if (here < 0) return;                                  // 首页 / 认不出当前页 → 不接管

    var prev = here > 0 ? links[here - 1] : null;           // 上一篇（滚轮向上）
    var next = here < links.length - 1 ? links[here + 1] : null; // 下一篇（滚轮向下）
    if (!prev && !next) return;

    /* ------------------------------------------------------------------------
       二、状态
       ------------------------------------------------------------------------ */
    var acc = 0;                     // 本方向的累计位移，方向一变就清零
    var done = false;                // 本页是否已经翻过一次
    var armedAt = Date.now() + COOLDOWN;  // 早于这个时刻的滚轮一律不理

    function atTop() {
      return window.pageYOffset <= EDGE;
    }

    function atBottom() {
      return window.pageYOffset + window.innerHeight >=
             document.documentElement.scrollHeight - EDGE;
    }

    /* 真的去翻页：把这一下交给那条导航链接，剩下的（音效 + 延迟 + 跳转）它自己会做 */
    function go(link) {
      done = true;
      acc = 0;
      link.click();
      window.setTimeout(function () { done = false; }, LOCK_MS);
    }

    /* ------------------------------------------------------------------------
       三、滚轮入口

       必须 passive:false —— 只有可取消的监听器才能 preventDefault。
       注意我们**只在真要翻页的那一刻**才拦，其余情况一律让页面照常滚。
       ------------------------------------------------------------------------ */
    function onWheel(e) {
      if (done) return;
      if (e.defaultPrevented) return;                 // 别人已经处理过了，不抢
      if (e.ctrlKey) return;                          // Ctrl + 滚轮 = 缩放
      if (Date.now() < armedAt) return;               // 冷启动期：挡惯性尾巴
      if (window.innerWidth < MIN_WIDTH) return;      // 窄屏：滚轮留给页面自己

      var dx = e.deltaX || 0;
      var dy = e.deltaY || 0;

      if (e.deltaMode === 1) {                        // 行
        dx *= LINE;
        dy *= LINE;
      } else if (e.deltaMode === 2) {                 // 页
        dx *= window.innerHeight;
        dy *= window.innerHeight;
      }

      if (!dy) return;                                // 只有横向位移
      if (Math.abs(dx) > Math.abs(dy) * SIDE_MARGIN) return;

      // 页面自己还有得滚：先让它滚，这一下不算翻页
      if (dy > 0 && !atBottom()) { acc = 0; return; }
      if (dy < 0 && !atTop()) { acc = 0; return; }

      var target = dy > 0 ? next : prev;
      if (!target) return;                            // 第一页 / 最后一页，到头了

      if (acc * dy < 0) acc = 0;                      // 方向反了，重新累计
      acc += dy;
      if (Math.abs(acc) < THRESHOLD) return;          // 还没滚够，再等等

      e.preventDefault();                             // 确定要翻页了，才拦这一下
      go(target);
    }

    // 页面在后台（切换标签页）时不要响应 —— 免得回来那一下莫名其妙翻页
    window.addEventListener('wheel', function (e) {
      if (document.hidden) return;
      onWheel(e);
    }, { passive: false });
  }

  APP.initWheelNav = initWheelNav;

})();
