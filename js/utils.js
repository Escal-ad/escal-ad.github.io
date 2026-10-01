/* ============================================================================
   utils.js — 共用工具
   ① APP 命名空间 ② 共用的 rAF 调度器 ③ 软降级开关 ④ 插画登记表 IMG
   所有其它 js 文件都依赖本文件，所以它必须最先加载。
   ========================================================================== */

'use strict';

/* ---------------------------------------------------------------------------
   APP：全局命名空间。所有模块都挂在它上面，避免污染 window。
   --------------------------------------------------------------------------- */
var APP = (function () {

  /* -------------------------------------------------------------------------
     一、共用调度器
     滚动与鼠标移动事件一秒可能触发上百次。如果每次都直接算，
     页面会掉帧。这里的做法是：
       · 同一个事件在"一帧"内只处理一次（用 requestAnimationFrame 节流）
       · 所有模块共用一个监听器，而不是各挂各的
     ------------------------------------------------------------------------- */

  /**
   * 创建一个"一帧只跑一次"的调度器
   * @param {string} eventName 要监听的事件名
   * @param {object} opts      传给 addEventListener 的选项
   */
  function createScheduler(eventName, opts) {
    var callbacks = [];     // 注册进来的处理函数
    var scheduled = false;  // 本帧是否已经排过队
    var latestEvent = null; // 本帧最后一次事件对象

    // 真正执行的那一下
    function run() {
      scheduled = false;
      var e = latestEvent;
      latestEvent = null;
      for (var i = 0; i < callbacks.length; i++) {
        try {
          callbacks[i](e);
        } catch (err) {
          /* 单个模块出错不影响其它模块 */
          if (window.console) console.error('[APP] 调度器回调出错：', err);
        }
      }
    }

    // 事件入口：只记住最后一次事件，并申请一帧
    function handle(e) {
      latestEvent = e;
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(run);
    }

    window.addEventListener(eventName, handle, opts || false);

    return {
      /** 注册一个处理函数 */
      add: function (fn) {
        if (typeof fn === 'function') callbacks.push(fn);
      }
    };
  }

  // 全局唯二的调度器：滚动 + 指针移动
  // passive:true 告诉浏览器"我们不会阻止默认行为"，滚动能更顺滑
  var scrollScheduler = createScheduler('scroll', { passive: true });
  var pointerScheduler = createScheduler('pointermove', { passive: true });

  /* -------------------------------------------------------------------------
     二、软降级开关（能力检测，只在启动时判断一次）
     ------------------------------------------------------------------------- */
  var mq = function (q) {
    return window.matchMedia ? window.matchMedia(q).matches : false;
  };

  var flags = {
    /** 用户是否要求"减少动态效果"（系统设置里的无障碍选项） */
    reduce: mq('(prefers-reduced-motion: reduce)'),
    /** 大屏：1024px 以上才启用氛围背景层 */
    isDesktop: mq('(min-width: 1024px)'),
    /** 桌面级指针：1200px 以上才启用磁吸 / 3D 倾斜等重效果 */
    isWide: mq('(min-width: 1200px)'),
    /** 中小屏：899px 及以下关掉点击火花、3D 倾斜 */
    isSmall: mq('(max-width: 899px)'),
    /** 设备是否支持 hover（触屏设备通常不支持） */
    canHover: mq('(hover: hover) and (pointer: fine)')
  };

  /* -------------------------------------------------------------------------
     三、插画登记表
     本站所有插画都是手绘 inline SVG，直接写在 index.html 里，
     用 data-art="名字" 标记。JS 需要操作某张插画时，用 IMG 里的名字去找，
     而不是到处硬写选择器字符串（改名字时只改这一处）。
     ------------------------------------------------------------------------- */
  var IMG = {
    heroPocket: 'hero-pocket',          // Hero：四次元口袋
    briefFile: 'brief-file',            // 身份档案：档案夹
    avatar: 'avatar',                   // 身份档案：自绘头像剪影
    timeMachine: 'time-machine',        // 关卡 01 · 大雄
    memoryBread: 'memory-bread',        // 关卡 02 · 静香
    takecopter: 'takecopter',           // 关卡 03 · 小夫
    shrinkLight: 'shrink-light',        // 关卡 04 · 胖虎
    translationJelly: 'translation-jelly', // 关卡 05 · 哆啦A梦
    anywhereDoor: 'anywhere-door'       // 关卡 06 · 任意门
  };

  /* -------------------------------------------------------------------------
     四、小工具函数
     ------------------------------------------------------------------------- */

  /** 查询单个元素（找不到返回 null） */
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  /** 查询一组元素，返回真数组（可以放心用 forEach / map） */
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  /** 按插画名字取元素，例：art('timeMachine') */
  function art(name) {
    return $('[data-art="' + (IMG[name] || name) + '"]');
  }

  /** 把数字限制在 [min, max] 区间内 */
  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  /** 线性插值：t=0 返回 a，t=1 返回 b */
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** 页面是否真的需要动画（= 系统没开"减少动态效果"） */
  function motionOK() {
    return !flags.reduce;
  }

  /* -------------------------------------------------------------------------
     五、导出
     ------------------------------------------------------------------------- */
  return {
    // 调度器
    onScroll: scrollScheduler.add,
    onPointerMove: pointerScheduler.add,
    // 开关
    flags: flags,
    motionOK: motionOK,
    // 插画
    IMG: IMG,
    art: art,
    // 工具
    $: $,
    $$: $$,
    clamp: clamp,
    lerp: lerp
  };
})();
