/* ============================================================================
   effects.js — 跟着鼠标走的四个小效果
   ① 磁吸（Magnet）：鼠标靠近时按钮轻轻被"吸"过去
   ② 聚光灯 + 3D 倾斜：卡片跟着鼠标亮 / 微微转向
   ③ 点击火花（ClickSpark）：点卡片时溅出 6 个光点
   ④ 拖动光痕（DragTrail）：按住鼠标拖动时，拖出一条光痕 + 几点星尘
   ⚠️ 全部只在"有鼠标的宽屏"上启用；触屏设备上这些效果既费电又没意义。
   ⚠️ 所有鼠标移动共用一个监听器（utils.js 里的 onPointerMove），
      一帧只算一次，绝不每个效果各挂一个监听器。
      （④ 是唯一的例外：它要的是「沿途每一个点」，不是「这一帧的最后一点」，
        所以取点用直连监听器，理由写在它自己的注释里。）
   ========================================================================== */

'use strict';

(function () {

  /* ==========================================================================
     一、磁吸
     元素加 .magnet，鼠标在它附近移动时，它朝鼠标方向平移一点点。
     ========================================================================== */

  function initMagnet(selector, strength) {
    if (!APP.flags.canHover || APP.flags.isSmall) return;

    var s = (typeof strength === 'number') ? strength : 0.28;
    var els = APP.$$(selector || '.magnet');
    if (!els.length) return;

    els.forEach(function (el) {
      var inside = false;

      // 鼠标在元素内部移动：算它离中心多远，然后按比例推过去
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        inside = true;
        var dx = (e.clientX - (r.left + r.width / 2)) * s;
        var dy = (e.clientY - (r.top + r.height / 2)) * s;
        el.style.transform = 'translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0)';
      });

      // 鼠标离开：松开，交还给 CSS 自己定义的状态
      el.addEventListener('pointerleave', function () {
        if (!inside) return;
        inside = false;
        el.style.transform = '';
      });

      // 键盘 Tab 到按钮时也要能"复位"，否则会一直歪着
      el.addEventListener('blur', function () {
        el.style.transform = '';
      });
    });
  }

  /* ==========================================================================
     二、聚光灯（关卡片）+ 3D 倾斜（身份卡）
     两者共用一个鼠标移动回调。
     ========================================================================== */

  function initPointerEffects() {
    if (!APP.flags.canHover) return;

    var cards = APP.$$('.level-card');   // 聚光灯
    var tilts = APP.flags.isWide ? APP.$$('.file-card') : []; // 3D 倾斜（只在 ≥1200px）

    if (!cards.length && !tilts.length) return;

    // 记录每张倾斜卡当前是否"热"（被鼠标罩着），用来判断什么时候该复位
    var tiltHot = [];
    var i;
    for (i = 0; i < tilts.length; i++) tiltHot.push(false);

    APP.onPointerMove(function (e) {
      var r, k;

      /* 聚光灯：把鼠标坐标写进卡片的 --mx / --my（CSS 用它们定位光斑） */
      for (k = 0; k < cards.length; k++) {
        r = cards[k].getBoundingClientRect();
        // 允许超出边界 80px：这样光斑滑动更自然，不会在边缘"跳"
        if (e.clientX > r.left - 80 && e.clientX < r.right + 80 &&
            e.clientY > r.top - 80 && e.clientY < r.bottom + 80) {
          cards[k].style.setProperty('--mx', (e.clientX - r.left).toFixed(1) + 'px');
          cards[k].style.setProperty('--my', (e.clientY - r.top).toFixed(1) + 'px');
        }
      }

      /* 3D 倾斜：身份卡跟着鼠标转很小的角度（最多 ±6 度，多了会晕） */
      for (k = 0; k < tilts.length; k++) {
        r = tilts[k].getBoundingClientRect();
        if (!r.width || !r.height) continue;

        var inside = e.clientX > r.left - 60 && e.clientX < r.right + 60 &&
                     e.clientY > r.top - 60 && e.clientY < r.bottom + 60;

        if (inside) {
          var rx = ((e.clientY - r.top - r.height / 2) / r.height) * -6;
          var ry = ((e.clientX - r.left - r.width / 2) / r.width) * 6;
          tilts[k].style.transform =
            'perspective(1000px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
          tiltHot[k] = true;
        } else if (tiltHot[k]) {
          // 鼠标走开了 → 归位
          tilts[k].style.transform = '';
          tiltHot[k] = false;
        }
      }
    });
  }

  /* ==========================================================================
     三、点击火花
     点击时在鼠标位置生成 6 个光点，沿 6 个方向飞出去 34px 后消失。
     ========================================================================== */

  function initClickSpark(selector) {
    // 小屏或触屏不做（点了手指会挡住，看不到效果，还白费性能）
    if (APP.flags.isSmall || !APP.flags.canHover) return;
    if (!APP.motionOK()) return;

    var targets = APP.$$(selector || '.level-card, .door');
    if (!targets.length) return;

    var COUNT = 6;      // 光点数量
    var RADIUS = 34;    // 飞行距离（px）

    targets.forEach(function (target) {
      target.addEventListener('click', function (e) {
        var x = e.clientX;
        var y = e.clientY;
        // 键盘触发（回车）时没有真实坐标，就不放火花
        if (!x && !y) return;

        for (var i = 0; i < COUNT; i++) {
          var angle = (Math.PI * 2 * i) / COUNT;

          var dot = document.createElement('span');
          dot.className = 'spark';
          dot.setAttribute('aria-hidden', 'true');
          dot.style.left = x + 'px';
          dot.style.top = y + 'px';
          dot.style.setProperty('--dx', (Math.cos(angle) * RADIUS).toFixed(1) + 'px');
          dot.style.setProperty('--dy', (Math.sin(angle) * RADIUS).toFixed(1) + 'px');

          // 动画播完自动清理，避免 DOM 里越堆越多
          dot.addEventListener('animationend', function () {
            if (dot.parentNode) dot.parentNode.removeChild(dot);
          });

          document.body.appendChild(dot);
        }
      });
    });
  }

  /* ==========================================================================
     四、拖动光痕 + 星尘
     按住左键拖动时，光标后面拖出一条光痕，沿路撒下几点星尘，松手自己消散。

     颜色取自**当前这一页**的主题色：每个子页面的 .section--level 上都带行内
     --char-rgb（跟卡片、徽章用的是同一个变量），所以故事页拖出来偏暖黄、
     生活页是薰衣草紫 —— 不用另配一套颜色，也就不跟 token 纪律打架。
     首页没有 .section--level，读不到就退回 --accent-rgb。

     为什么用 canvas，而不是像点击火花那样撒 DOM：
       光痕是**连续**的，高速拖动时一帧要补好几个点。撒 DOM 的话一次拖动就是
       几百个节点进进出出，既占内存又逼着浏览器反复重排；canvas 只有一个元素，
       画完 clearRect 就结束，页面结构从头到尾没变过。

     什么时候不做：
       · 触屏 / 小屏 —— 和点击火花同一套判断（手指会挡住，而且拖动本来就是滚屏）；
       · 系统开了「减少动态效果」—— 这是纯动效，CSS 里还有一道 display:none 兜底。

     克制的地方：
       · 只认「主指针 + 左键」，右键 / 中键 / 多指一律不碰；
       · 位移超过 3px 才开始画（单击那一下交给点击火花，别两个效果叠一起）；
       · **不调 preventDefault** —— 拖选文字、拖链接这些原生行为保持原样，
         所以「选一段文字时顺带划出一道光」是预期效果，不是 bug；
       · 星尘有上限，长时间一直拖着也不会越堆越多；
       · 窗口失焦 / 切到后台 / 开始拖原生对象（dragstart）都立刻收笔。
     ========================================================================== */

  function initDragTrail() {
    // 触屏、小屏、开了「减少动态效果」：都不做
    if (APP.flags.isSmall || !APP.flags.canHover) return;
    if (!APP.motionOK()) return;

    var MAX_PTS = 26;     // 光痕最多留这么多个点（再多也看不出来）
    var MAX_DUST = 90;    // 星尘上限
    var HEAD_W = 3.2;     // 光痕最粗处（px，在笔尖那一段）
    var MIN_MOVE = 3;     // 起画门槛（px）：小于它不算拖动，算单击
    var DECAY = 0.90;     // 每 1/60 秒的衰减系数
    var GAP = 10;         // 两点间距超过它就补插值，光痕才不会断成虚线

    var canvas = null;    // 整块画布：第一次真的拖动时才创建
    var ctx = null;
    var sprite = null;    // 星尘贴图：径向渐变只画一次，之后一直 drawImage
    var streak = '';      // 本页主题色，形如 '198, 168, 255'

    var drawing = false;  // 左键还按着吗
    var armed = false;    // 位移过门槛了吗（过了才真正开始画）
    var downX = 0;
    var downY = 0;
    var pts = [];         // 光痕：{ x, y, life }
    var dust = [];        // 星尘：{ x, y, vx, vy, r, life }
    var raf = 0;          // 当前的帧请求（0 = 没在跑）
    var last = 0;         // 上一帧的时间戳（0 = 新的一轮）

    /* ------------------------------------------------------------------------
       画布
       ------------------------------------------------------------------------ */

    function resize() {
      var w = canvas.clientWidth;    // 用画布自己的 CSS 尺寸，别用 innerWidth：
      var h = canvas.clientHeight;   // 后者把滚动条也算进去，会差出十几个像素
      var dpr = Math.min(window.devicePixelRatio || 1, 2); // 再高就是白费显存
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      // 之后绘制一律用 CSS 像素坐标 —— 和 clientX / clientY 是同一个坐标系
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pts.length = 0;
      dust.length = 0;
      ctx.clearRect(0, 0, w, h);
    }

    function ensureCanvas() {
      if (canvas) return true;
      canvas = document.createElement('canvas');
      canvas.className = 'drag-trail';
      canvas.setAttribute('aria-hidden', 'true');   // 纯装饰，读屏不用念
      document.body.appendChild(canvas);
      ctx = canvas.getContext('2d');
      if (!ctx) {                                    // 极少数环境拿不到 2d 上下文
        document.body.removeChild(canvas);
        canvas = null;
        return false;
      }
      resize();
      window.addEventListener('resize', resize);
      return true;
    }

    /* 本页主题色：子页面的 .section--level 上带行内 --char-rgb */
    function readTheme() {
      var host = APP.$('.section--level') || document.documentElement;
      var v = getComputedStyle(host).getPropertyValue('--char-rgb').trim();
      if (!v) {
        v = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
      }
      // 只认 "数字, 数字, 数字"：防止哪天读回没算开的 var(...) 塞进 canvas 里
      return /^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(v) ? v : '53, 199, 255';
    }

    /* 星尘贴图：一张 32×32 的柔光点，比每帧现算径向渐变便宜得多 */
    function makeSprite() {
      var s = 32;
      var c = document.createElement('canvas');
      c.width = s;
      c.height = s;
      var g = c.getContext('2d');
      if (!g) return null;
      var rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      rg.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      rg.addColorStop(0.35, 'rgba(' + streak + ', 0.55)');
      rg.addColorStop(1, 'rgba(' + streak + ', 0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, s, s);
      return c;
    }

    /* ------------------------------------------------------------------------
       取点
       ------------------------------------------------------------------------ */

    function addPoint(x, y) {
      pts.push({ x: x, y: y, life: 1 });
      if (pts.length > MAX_PTS) pts.shift();

      // 沿路撒星尘：一半的点带一颗，给一点随机方向和轻微上浮
      if (dust.length < MAX_DUST && Math.random() < 0.5) {
        dust.push({
          x: x + (Math.random() - 0.5) * 7,
          y: y + (Math.random() - 0.5) * 7,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5 - 0.18,
          r: 1.6 + Math.random() * 2.4,
          life: 1
        });
      }
    }

    function push(x, y) {
      var p = pts[pts.length - 1];
      if (p) {
        var dx = x - p.x;
        var dy = y - p.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1.5) return;   // 手抖级别的位移，记了也看不出来
        // 甩得快时一帧能跑出去几十像素，中间补几个点，光痕才连得上
        if (d > GAP) {
          var n = Math.min(Math.floor(d / GAP), 6);   // 补点也要封顶，别一次塞进去一堆
          for (var i = 1; i <= n; i++) {
            var t = i / (n + 1);
            addPoint(p.x + dx * t, p.y + dy * t);
          }
        }
      }
      addPoint(x, y);
    }

    /* ------------------------------------------------------------------------
       每帧绘制
       ------------------------------------------------------------------------ */

    function schedule() {
      if (raf) return;
      raf = window.requestAnimationFrame(frame);
    }

    function frame(now) {
      raf = 0;
      // 没画布就不该有帧在跑。理论上不会发生，但不守卫的话
      // 一次意外就会在控制台刷一堆 TypeError
      if (!canvas || !ctx) return;
      // 掉帧时 dt 会很大，夹一下，免得一次衰减过头（光痕凭空消失）
      var dt = last ? Math.min(now - last, 48) : 16.7;
      last = now;
      // 换成「每 1/60 秒衰减 10%」：120Hz 屏幕上不会消散得更快
      var k = Math.pow(DECAY, dt / 16.7);
      var step = dt / 16.7;

      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      // 加法混色：光叠光的地方更亮，才像光而不像一根颜料线
      ctx.globalCompositeOperation = 'lighter';

      var i, p;

      // 光痕上的点按帧衰减，淡到看不见就丢掉
      for (i = pts.length - 1; i >= 0; i--) {
        pts[i].life *= k;
        if (pts[i].life < 0.02) pts.splice(i, 1);
      }

      // 光痕：从尾到头逐段画，越靠笔尖越亮越粗
      var n = pts.length;
      if (n > 1) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (i = 1; i < n; i++) {
          var a = pts[i - 1];
          var b = pts[i];
          var t = i / (n - 1);            // 0 = 尾巴，1 = 笔尖
          var wgt = t * b.life;           // 这一段的亮度权重
          var lw = HEAD_W * (0.3 + 0.7 * t);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          // 同一段画两道：宽而淡的柔光 + 窄而亮的芯
          ctx.lineWidth = lw * 3;
          ctx.strokeStyle = 'rgba(' + streak + ',' + (0.05 * wgt).toFixed(3) + ')';
          ctx.stroke();
          ctx.lineWidth = lw;
          ctx.strokeStyle = 'rgba(' + streak + ',' + (0.30 * wgt).toFixed(3) + ')';
          ctx.stroke();
        }
      }

      // 星尘：往上飘一点，慢慢淡掉
      for (i = dust.length - 1; i >= 0; i--) {
        p = dust[i];
        p.life *= Math.pow(0.965, step);
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.vx *= 0.99;
        p.vy *= 0.99;
        if (p.life < 0.03) {
          dust.splice(i, 1);
          continue;
        }
        if (sprite) {
          ctx.globalAlpha = p.life * 0.9;
          ctx.drawImage(sprite, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        }
      }

      // 笔尖那一点光：让人看出这道痕是从光标那儿出来的
      p = pts[pts.length - 1];
      if (p && sprite) {
        var hr = 14 * p.life;
        ctx.globalAlpha = 0.6 * p.life;
        ctx.drawImage(sprite, p.x - hr, p.y - hr, hr * 2, hr * 2);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // 还有东西在动就继续；全消散了就停帧，不给页面留一个常驻的 rAF
      if (pts.length || dust.length) schedule();
      else last = 0;
    }

    /* ------------------------------------------------------------------------
       起笔 / 收笔
       ------------------------------------------------------------------------ */

    function onDown(e) {
      if (e.button !== 0 || e.isPrimary === false) return;   // 只认主指针的左键
      drawing = true;
      armed = false;
      downX = e.clientX;
      downY = e.clientY;
    }

    /* 真的开始拖了才建画布、才读颜色：单纯点一下不该留下任何东西 */
    function start() {
      // 手机菜单开着时不画：那是一块盖住整页的菜单，光痕压在上面很怪
      if (APP.$('.mobile-menu.is-open')) return false;
      if (!ensureCanvas()) return false;
      streak = readTheme();      // 每次起笔重读一次，页面换主题色也能跟上
      sprite = makeSprite();
      pts.length = 0;            // 一笔归一笔，新的一笔不接上一笔的尾巴
      return true;
    }

    function stop() {
      if (!drawing) return;
      drawing = false;
      armed = false;
      // 不立刻清空：让已经画出来的光痕自己散掉
      schedule();
    }

    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', stop, true);
    document.addEventListener('pointercancel', stop, true);  // 手势被系统接管
    document.addEventListener('dragstart', stop, true);      // 开始拖原生对象（链接 / 图片）
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
    });

    /* 为什么这里没用 APP.onPointerMove（那是一条「一帧只算一次」的调度器）：
       调度器只保留**这一帧的最后一次**事件，而这道光痕要的是**沿途的每一个点**。
       页面在后台 / 被遮挡时，浏览器会把 rAF 压到 1 秒才 1 次，那时调度器拿到的事件
       会晚一整秒才落地 —— 抬手之后才轮到它，一笔都画不出来。
       所以**取点用直连监听器**（同步、按发生顺序），**画**仍然交给 rAF。
       取点本身只做一次平方距离比较，既不读布局也不写 DOM，开销可以忽略。 */
    document.addEventListener('pointermove', function (e) {
      if (!drawing) return;

      if (!armed) {
        var dx = e.clientX - downX;
        var dy = e.clientY - downY;
        if (dx * dx + dy * dy < MIN_MOVE * MIN_MOVE) return;
        if (!start()) {
          drawing = false;    // 建画布都失败了（极罕），别再每帧试一次
          return;
        }
        armed = true;
        addPoint(downX, downY);        // 补上按下的那一点，光痕从按下处起
      }

      push(e.clientX, e.clientY);
      schedule();
    }, { passive: true });
  }

  /* ==========================================================================
     五、导出
     ========================================================================== */
  APP.initMagnet = initMagnet;
  APP.initPointerEffects = initPointerEffects;
  APP.initClickSpark = initClickSpark;
  APP.initDragTrail = initDragTrail;

})();
