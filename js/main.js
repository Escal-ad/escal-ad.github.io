/* ============================================================================
   main.js — 启动入口
   做两件事：
     ① 页面结构准备好之后，按正确顺序把各个模块叫醒。
        顺序很重要：
          先拆字（Hero / H2）→ 再挂入场观察 → 再挂滚动监听 → 最后挂鼠标效果，
          否则先挂观察的模块可能拿到还没拆开的 DOM。
     ② 联系方式页的「一键复制」（initCopyContact）。
        页面上两个触发器长得一模一样：都是 .contact-item__value--copy 的 <button>，
        里面就是那段要复制的文字本身，没有额外的可见按钮。
        它是纯交互、跟动效无关，所以不放进下面任何一段动画初始化里，
        而是和「减少动态效果」无关地、在 boot() 最开头无条件挂上。

   另外这里有一个重要的"护身符"：如果用户在系统里打开了
   「减少动态效果」，我们就跳过绝大部分动画初始化。
   CSS 里也有对应的 @media (prefers-reduced-motion: reduce) 兜底，
   两道保险叠加，保证**信息永远完整可读**。
   ========================================================================== */

'use strict';

(function () {

  /* --------------------------------------------------------------------------
     联系方式页 · 「一键复制」（邮箱 / 微信号）

     页面上两个触发器长得一模一样：都是 .contact-item__value--copy 的 <button>，
     里面就是那段要复制的文字本身，没有额外的可见按钮，所以这里只有一种形态。
     成功后给按钮加 .is-done，让 CSS 把文字变绿 + 下划线，约 2.4s 后自己撤掉。
     （不能把文案改成「已复制」—— 那串文字本身就是邮箱地址 / 微信号，
       改了就等于把它改没了。）

     为什么不是一句 navigator.clipboard.writeText 就完事：
       · 剪贴板 API 只在「安全上下文」里存在。https 和 localhost 算，
         file:// 也算，但 file:// 下仍可能被拒 —— 所以留了 execCommand('copy')
         兜底（临时 textarea + select），两条路都走不通就退化成「把那串文字选中」，
         让用户自己按 Ctrl/Cmd+C。**点下去必须始终有反应**，不能像没事发生。
       · 变绿是给眼睛看的；读屏听不到颜色变化，所以另配了一个 role="status" 的
         .sr-only 区域来播报（见生成器 CONTACT_INFO 里的 .contact-item__status）。

     ⚠️ 复制的内容取自 data-copy-text，不是页面上的可见文字 ——
        可见文字将来加了空格或换行都不会污染剪贴板。
     -------------------------------------------------------------------------- */
  function initCopyContact() {
    var btns = APP.$$('[data-copy-text]');
    if (!btns.length) return;

    var RESET_MS = 2400;

    // 老路：临时 textarea + execCommand('copy')。返回是否成功。
    function legacyCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');          // 只读：避免移动端弹键盘
      ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }

    function copyText(text) {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
      }
      return legacyCopy(text)
        ? Promise.resolve()
        : Promise.reject(new Error('execCommand copy failed'));
    }

    // 最后的兜底：把那串文字刷成选中态，用户直接 Ctrl/Cmd+C
    function selectText(el) {
      var sel = window.getSelection && window.getSelection();
      if (!sel || !el) return;
      var range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    btns.forEach(function (btn) {
      var text = btn.getAttribute('data-copy-text') || '';
      // 播报时用的称呼（「邮箱」/「微信号」）。写死在 HTML 里，JS 不自己猜。
      var name = btn.getAttribute('data-copy-name') || '内容';
      var card = btn.closest ? btn.closest('.contact-item') : null;
      var statusEl = card ? card.querySelector('.contact-item__status') : null;
      var baseAria = btn.getAttribute('aria-label') || ('复制 ' + name + ' ' + text);
      var timer = 0;

      function reset() {
        btn.classList.remove('is-done');
        btn.setAttribute('aria-label', baseAria);
        if (statusEl) statusEl.textContent = '';
      }

      // done 接进 aria-label（焦点回到这串文字上时能听到「已复制」），
      // announce 接进 .sr-only 的 role="status" 区域（不抢焦点的主动播报）。
      function flash(done, announce) {
        btn.classList.add('is-done');
        btn.setAttribute('aria-label', text + ' ' + done);
        if (statusEl) statusEl.textContent = announce;
        window.clearTimeout(timer);
        timer = window.setTimeout(reset, RESET_MS);
      }

      btn.addEventListener('click', function () {
        copyText(text).then(
          function () {
            flash('已复制', name + ' ' + text + ' 已复制到剪贴板');
          },
          function () {
            // 复制不了就把那串文字选中，别让这一下点击白费
            selectText(btn);
            flash('已选中', '自动复制不可用，已选中' + name + '，请按 Ctrl 加 C 复制');
          }
        );
      });
    });
  }

  function boot() {
    var reduce = APP.flags.reduce;

    // 一键复制和动效无关，两种模式下都要挂上（放在 reduce 分支之前，避免写两遍）
    initCopyContact();

    /* ----------------------------------------------------------------------
       情况 A：用户要求减少动态效果
       只保留三段文字/渐变这类"静态美化"，其余全部不初始化。
       ---------------------------------------------------------------------- */
    if (reduce) {
      // 拆字不是为了动画，而是为了让 Hero 关键词拿到连续的渐变
      if (typeof APP.initHeroSplit === 'function') APP.initHeroSplit();

      // 把所有入场元素直接推到"已就位"状态（双保险）
      APP.$$('.reveal, .reveal-scale, .stagger-reveal, .file-card, .section__head')
        .forEach(function (el) { el.classList.add('in-view'); });

      if (typeof APP.initNavAndProgress === 'function') APP.initNavAndProgress();
      if (typeof APP.initMobileMenu === 'function') APP.initMobileMenu();
      if (typeof APP.initRail === 'function') APP.initRail();

      // 滚轮翻页：这改的是「怎么换页」，不是「页面怎么动」，所以 reduce 下照样启用
      if (typeof APP.initWheelNav === 'function') APP.initWheelNav();

      // 站标上那颗铃铛：是用户自己点的，控制权在手上，reduce 下也留着（只是不摇）
      if (typeof APP.initNavBell === 'function') APP.initNavBell();

      // 页面音效（右上角那个小喇叭管开关）：同样由用户自己决定要不要听，reduce 不管声音
      if (typeof APP.initSfx === 'function') APP.initSfx();

      if (typeof APP.initPocketDrawer === 'function') APP.initPocketDrawer();
      return;
    }

    /* ----------------------------------------------------------------------
       情况 B：允许动画（默认情况）
       ---------------------------------------------------------------------- */

    /* 1. 文字拆分与渐变（必须先做，后面的观察器依赖拆好的结构） */
    if (typeof APP.initHeroSplit === 'function') APP.initHeroSplit();
    if (typeof APP.initH2Float === 'function') APP.initH2Float();

    /* 2. 入场 */
    if (typeof APP.initReveal === 'function') APP.initReveal();
    if (typeof APP.initStagger === 'function') APP.initStagger();

    /* 3. 文字特效 */
    if (typeof APP.initScrambleOnView === 'function') APP.initScrambleOnView();
    if (typeof APP.initCountUp === 'function') APP.initCountUp();

    /* 4. 滚动相关 */
    if (typeof APP.initNavAndProgress === 'function') APP.initNavAndProgress();
    if (typeof APP.initMobileMenu === 'function') APP.initMobileMenu();
    if (typeof APP.initRail === 'function') APP.initRail();

    /* 4.5 滚轮翻页：在子页面之间滑动鼠标就能换页（见 js/wheel.js）
           它直接 click 导航里那条链接，所以音效 / 延迟 / 跳转全和点击一致 */
    if (typeof APP.initWheelNav === 'function') APP.initWheelNav();

    /* 5. 鼠标相关（内部各自还会再判断设备是否适合，触屏会自动跳过） */
    if (typeof APP.initMagnet === 'function') APP.initMagnet('.magnet', 0.28);
    if (typeof APP.initPointerEffects === 'function') APP.initPointerEffects();
    if (typeof APP.initClickSpark === 'function') APP.initClickSpark('.level-card, .door');

    /* 5.2 拖动光痕：按住拖动时拖出一道光痕 + 星尘（纯动效，reduce 下自己会退出） */
    if (typeof APP.initDragTrail === 'function') APP.initDragTrail();

    /* 6. 站标上那颗铃铛（摇一下 + 响一声，顺带给"回首页"垫一点响铃时间） */
    if (typeof APP.initNavBell === 'function') APP.initNavBell();

    /* 6.5 页面音效：每个子页面一个符合自己道具的合成音，点链接时先响再跳
           （右上角那个小喇叭负责静音，选择记在 localStorage —— 见 js/sfx.js） */
    if (typeof APP.initSfx === 'function') APP.initSfx();

    /* 7. 彩蛋抽屉（不管什么设备都要有，因为里面是真实的导航内容） */
    if (typeof APP.initPocketDrawer === 'function') APP.initPocketDrawer();
  }

  /* DOM 已经就绪就直接跑，否则等就绪（脚本都带 defer，通常这里已经是就绪态） */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
