/* ============================================================================
   drawer.js — 本站唯一的一个"巧思"
   Hero 里那个半透明的四次元口袋 → 点击/回车 从右侧滑出「道具清单」抽屉。
   抽屉里是 6 件道具 = 6 个关卡的快捷跳转，外加一句只在抽屉里出现的话。
   手机端底部那颗「已通关 x/6」胶囊点开的是同一个抽屉。
   无障碍要求（DESIGN.md §9）：
     · 打开时焦点移到关闭按钮
     · Esc 关闭并把焦点还给刚才那个触发按钮
     · aria-hidden / aria-expanded 同步
   ========================================================================== */

'use strict';

(function () {

  function initPocketDrawer() {
    var drawer = APP.$('.drawer');
    var scrim = APP.$('.drawer-scrim');
    if (!drawer || !scrim) return;

    var closeBtn = APP.$('[data-drawer-close]', drawer);

    /* 两个触发点：Hero 的口袋按钮 + 手机端底部胶囊 */
    var triggers = APP.$$('[data-pocket]');

    /* 记住这一次是谁打开的，关闭时把焦点还回去 */
    var lastTrigger = null;

    /* 用来把焦点锁在抽屉里（关闭状态让整体不可聚焦） */
    var supportsInert = 'inert' in HTMLElement.prototype;

    /* ----------------------------------------------------------------------
       开关
       ---------------------------------------------------------------------- */
    function setOpen(open) {
      drawer.classList.toggle('is-open', open);
      scrim.classList.toggle('is-open', open);

      drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      scrim.setAttribute('aria-hidden', open ? 'false' : 'true');

      /* 打开时禁止背景滚动，否则滚轮会带着页面跑 */
      document.body.classList.toggle('is-drawer-open', open);

      /* 关闭时让抽屉整体不可被 Tab 聚焦（避免焦点跑到屏幕外） */
      if (supportsInert) {
        if (open) drawer.removeAttribute('inert');
        else drawer.setAttribute('inert', '');
      }

      triggers.forEach(function (t) {
        t.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      if (open) {
        /* 等滑出动画开始后再放焦点，浏览器才不会"抢"回滚动位置 */
        window.setTimeout(function () {
          if (closeBtn) closeBtn.focus();
        }, 60);
      } else if (lastTrigger && typeof lastTrigger.focus === 'function') {
        lastTrigger.focus();
        lastTrigger = null;
      }
    }

    function isOpen() {
      return drawer.classList.contains('is-open');
    }

    /* ----------------------------------------------------------------------
       触发：口袋按钮、底部胶囊
       ---------------------------------------------------------------------- */
    triggers.forEach(function (trigger) {
      // .pocket 是 <button>，本来就能被键盘激活
      trigger.addEventListener('click', function () {
        lastTrigger = trigger;
        setOpen(true);
      });
    });

    /* ----------------------------------------------------------------------
       关闭：遮罩点击、关闭按钮、抽屉内任一链接、Esc
       ---------------------------------------------------------------------- */
    scrim.addEventListener('click', function () { setOpen(false); });

    if (closeBtn) {
      closeBtn.addEventListener('click', function () { setOpen(false); });
    }

    /* 点了某件道具 → 收起抽屉，交给 <a href> 正常跳转 */
    APP.$$('.drawer__item', drawer).forEach(function (item) {
      item.addEventListener('click', function () { setOpen(false); });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) setOpen(false);
    });

    /* ----------------------------------------------------------------------
       初始化：确保一打开页面时抽屉是"关闭且不可聚焦"的状态
       ---------------------------------------------------------------------- */
    setOpen(false);
  }

  /* 导出 */
  APP.initPocketDrawer = initPocketDrawer;

})();
