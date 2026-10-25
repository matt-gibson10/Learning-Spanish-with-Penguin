/* ==========================================================================
   Penguin — the sombrero-wearing penguin mascot of "Learning Spanish with Penguin"
   --------------------------------------------------------------------------
   Pure JS, no dependencies, no external assets. Every mood is assembled from
   the same shared parts so Penguin always stays on-model.

   API (global window.Penguin):
     Penguin.name                       -> "Penguin"
     Penguin.moods                      -> ["happy","talking","thinking","cheer","oops","proud","sleepy","wave"]
     Penguin.svg(mood, size)            -> SVG markup string (size in px, default 120)
     Penguin.coach(el, mood, html)      -> renders penguin + speech bubble into `el`
                                           (optional 4th arg: {size:120, name:true})
     Penguin.lines                      -> {good:[], close:[], miss:[], streak:[], done:[], welcome:[]}
     Penguin.line(kind)                 -> one random line of that kind
     Penguin.moodFor                    -> {good:"happy", close:"thinking", miss:"oops", streak:"cheer", done:"sleepy", welcome:"wave"}
     Penguin.say(el, kind, extraHtml)   -> coach() with a random line + the matching mood
   ========================================================================== */
(function (global) {
  'use strict';

  var NAME = 'Penguin';
  var MOODS = ['happy', 'talking', 'thinking', 'cheer', 'oops', 'proud', 'sleepy', 'wave'];

  /* ---- palette (mirrors theme.css tokens; hard-coded so the SVGs stand alone) ---- */
  var C = {
    ink: '#2A2E45', ink2: '#3C4470', inkDeep: '#1E2238',
    belly: '#FFFDF8', belly2: '#F6EDDD',
    beak: '#F6952E', beakDark: '#D9731A', mouth: '#8E3A48', tongue: '#F08A8A',
    cheek: '#F7A3A3',
    straw: '#F2D592', strawLight: '#FBE9BE', strawDark: '#CDA55A', strawDeep: '#B08A3E',
    rosa: '#C8156A', jade: '#1A7F50', marigold: '#F7A51C', talavera: '#1B65A6', terracotta: '#BD4F35',
    white: '#FFFFFF', sweat: '#6FBDEB', gold: '#F2B632', goldDark: '#C98A0A'
  };

  var uid = 0;

  /* ---------------- shared parts ---------------- */

  function defs(id) {
    return (
      '<defs>' +
        '<linearGradient id="' + id + '-body" x1="0.2" y1="0" x2="0.8" y2="1">' +
          '<stop offset="0" stop-color="' + C.ink2 + '"/><stop offset="1" stop-color="' + C.inkDeep + '"/>' +
        '</linearGradient>' +
        '<linearGradient id="' + id + '-belly" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="' + C.belly + '"/><stop offset="1" stop-color="' + C.belly2 + '"/>' +
        '</linearGradient>' +
        '<linearGradient id="' + id + '-crown" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="' + C.strawLight + '"/><stop offset="0.55" stop-color="' + C.straw + '"/><stop offset="1" stop-color="' + C.strawDark + '"/>' +
        '</linearGradient>' +
        '<linearGradient id="' + id + '-brim" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="' + C.strawLight + '"/><stop offset="1" stop-color="' + C.straw + '"/>' +
        '</linearGradient>' +
        '<clipPath id="' + id + '-crownclip"><path d="' + CROWN + '"/></clipPath>' +
      '</defs>'
    );
  }

  /* egg-shaped body, head included (top y=62, bottom y=226) */
  var BODY = 'M120,62 C162,62 186,106 186,160 C186,206 157,226 120,226 C83,226 54,206 54,160 C54,106 78,62 120,62 Z';
  /* white face+belly mask with a heart-shaped top */
  var MASK = 'M120,101 C129,88 154,90 160,113 C167,138 171,160 169,182 C167,207 147,220 120,220 C93,220 73,207 71,182 C69,160 73,138 80,113 C86,90 111,88 120,101 Z';
  /* sombrero crown (sits on the head, base at y=70) */
  var CROWN = 'M78,72 C78,46 94,22 120,22 C146,22 162,46 162,72 Z';

  function body(id) {
    return (
      '<g class="pg-body">' +
        '<path d="' + BODY + '" fill="url(#' + id + '-body)"/>' +
        /* glossy highlight on the upper-left of the head */
        '<path d="M86,86 C92,74 104,67 116,66 C106,72 96,82 92,96 C89,98 86,92 86,86 Z" fill="#FFFFFF" opacity="0.16"/>' +
        '<path d="' + MASK + '" fill="url(#' + id + '-belly)"/>' +
      '</g>'
    );
  }

  function feet() {
    var foot = function (cx) {
      return (
        '<g>' +
          '<ellipse cx="' + cx + '" cy="226" rx="17" ry="6.5" fill="' + C.beak + '"/>' +
          '<ellipse cx="' + (cx - 10) + '" cy="228" rx="6.5" ry="5" fill="' + C.beak + '"/>' +
          '<ellipse cx="' + cx + '" cy="229.5" rx="6.5" ry="5" fill="' + C.beak + '"/>' +
          '<ellipse cx="' + (cx + 10) + '" cy="228" rx="6.5" ry="5" fill="' + C.beak + '"/>' +
        '</g>'
      );
    };
    return '<g class="pg-feet">' + foot(99) + foot(141) + '</g>';
  }

  /* eyes: variant = open | up | side | closed | smile | sleepy ; brows = none | worried | raised */
  function eyes(variant, brows) {
    var L = { x: 101, y: 119 }, R = { x: 139, y: 119 };
    var out = '<g class="pg-eyes">';

    function openEye(e, dx, dy) {
      return (
        '<circle cx="' + (e.x + dx) + '" cy="' + (e.y + dy) + '" r="9.5" fill="' + C.ink + '"/>' +
        '<circle cx="' + (e.x + dx + 3.2) + '" cy="' + (e.y + dy - 3.4) + '" r="3.1" fill="#FFFFFF"/>' +
        '<circle cx="' + (e.x + dx - 3.6) + '" cy="' + (e.y + dy + 3.4) + '" r="1.5" fill="#FFFFFF" opacity="0.9"/>'
      );
    }
    function lidded(e, dx, dy) {
      /* open eye with a soft upper lid (sheepish) */
      return (
        openEye(e, dx, dy) +
        '<path d="M' + (e.x - 10.5) + ',' + (e.y - 4) + ' Q' + e.x + ',' + (e.y - 13) + ' ' + (e.x + 10.5) + ',' + (e.y - 4) + ' L' + (e.x + 10.5) + ',' + (e.y - 14) + ' L' + (e.x - 10.5) + ',' + (e.y - 14) + ' Z" fill="' + C.belly + '"/>' +
        '<path d="M' + (e.x - 9) + ',' + (e.y - 5) + ' Q' + e.x + ',' + (e.y - 12) + ' ' + (e.x + 9) + ',' + (e.y - 5) + '" stroke="' + C.ink + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
      );
    }

    if (variant === 'open') {
      out += openEye(L, 0, 0) + openEye(R, 0, 0);
    } else if (variant === 'up') {
      out += openEye(L, 1.5, -3.5) + openEye(R, 1.5, -3.5);
    } else if (variant === 'side') {
      out += openEye(L, -2.5, 2) + openEye(R, -2.5, 2);
    } else if (variant === 'smile') {
      /* happy closed eyes ^ ^ */
      out += '<path d="M' + (L.x - 9) + ',' + (L.y + 3) + ' Q' + L.x + ',' + (L.y - 9) + ' ' + (L.x + 9) + ',' + (L.y + 3) + '" stroke="' + C.ink + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
      out += '<path d="M' + (R.x - 9) + ',' + (R.y + 3) + ' Q' + R.x + ',' + (R.y - 9) + ' ' + (R.x + 9) + ',' + (R.y + 3) + '" stroke="' + C.ink + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
    } else if (variant === 'sleepy') {
      /* closed, relaxed, curving down with tiny lashes */
      [L, R].forEach(function (e) {
        out += '<path d="M' + (e.x - 9) + ',' + (e.y - 1) + ' Q' + e.x + ',' + (e.y + 8) + ' ' + (e.x + 9) + ',' + (e.y - 1) + '" stroke="' + C.ink + '" stroke-width="3.6" fill="none" stroke-linecap="round"/>';
        out += '<path d="M' + (e.x - 8) + ',' + (e.y + 3.5) + ' l-2.5,3.5 M' + e.x + ',' + (e.y + 5.5) + ' l0,4 M' + (e.x + 8) + ',' + (e.y + 3.5) + ' l2.5,3.5" stroke="' + C.ink + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>';
      });
    }

    if (brows === 'worried') {
      out += '<path d="M90,105 Q99,100 109,103" stroke="' + C.ink + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
      out += '<path d="M131,103 Q141,100 150,105" stroke="' + C.ink + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
    } else if (brows === 'raised') {
      out += '<path d="M92,104 Q101,99 110,103" stroke="' + C.ink + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
      out += '<path d="M129,98 Q139,92 149,97" stroke="' + C.ink + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
    }
    out += '</g>';
    return out;
  }

  /* beak: variant = smile | open | small */
  function beak(variant) {
    var out = '<g class="pg-beak">';
    if (variant === 'open') {
      /* dark mouth, tongue, then upper + dropped lower mandible */
      out += '<path d="M106,135 C110,154 130,154 134,135 Z" fill="' + C.mouth + '"/>';
      out += '<ellipse cx="120" cy="148" rx="6" ry="3.5" fill="' + C.tongue + '"/>';
      out += '<path d="M108,146 C112,156 128,156 132,146 C128,150 112,150 108,146 Z" fill="' + C.beakDark + '"/>';
      out += '<path d="M104,133 C110,127 130,127 136,133 C132,138 126,140 120,140 C114,140 108,138 104,133 Z" fill="' + C.beak + '"/>';
    } else {
      /* lower mandible peeks out below the upper one -> reads as a smile */
      out += '<path d="M108,138 C112,149 128,149 132,138 Z" fill="' + C.beakDark + '"/>';
      out += '<path d="M104,133 C110,127 130,127 136,133 C133,140 126,146 120,146 C114,146 107,140 104,133 Z" fill="' + C.beak + '"/>';
      out += '<path d="M110,131 Q120,128.5 130,131" stroke="#FFFFFF" stroke-width="1.6" fill="none" opacity="0.45" stroke-linecap="round"/>';
    }
    out += '</g>';
    return out;
  }

  function cheeks(big) {
    var rx = big ? 9 : 7.5, ry = big ? 5.5 : 4.5;
    return (
      '<g class="pg-cheeks" opacity="0.8">' +
        '<ellipse cx="90" cy="139" rx="' + rx + '" ry="' + ry + '" fill="' + C.cheek + '"/>' +
        '<ellipse cx="150" cy="139" rx="' + rx + '" ry="' + ry + '" fill="' + C.cheek + '"/>' +
      '</g>'
    );
  }

  /* one flipper. side = -1 (viewer's left) | 1 (viewer's right); lift = degrees from hanging-down (0) to raised */
  function flipper(side, lift, cls) {
    var sx = side < 0 ? 66 : 174, sy = 142;
    /* local shape points down with a soft outward bulge; origin = shoulder */
    var d = 'M0,-6 C-6,-4 -17,10 -22,34 C-25,50 -16,60 -8,58 C2,56 10,38 12,16 C13,4 8,-6 0,-6 Z';
    var rot = side < 0 ? lift : -lift; /* mirrored side rotates the other way */
    return (
      '<g class="pg-flipper ' + (cls || '') + '" transform="translate(' + sx + ',' + sy + ') rotate(' + rot + ') scale(' + (side < 0 ? 1 : -1) + ',1)">' +
        '<g class="pg-flipper-inner">' +
          '<path d="' + d + '" fill="' + C.ink2 + '"/>' +
          '<path d="M-2,2 C-8,8 -14,20 -16,34" stroke="#FFFFFF" stroke-width="2" opacity="0.14" fill="none" stroke-linecap="round"/>' +
        '</g>' +
      '</g>'
    );
  }

  /* the sombrero: back half (drawn behind the head) and front (crown + brim rim, drawn in front) */
  var BRIM = { cx: 120, cy: 70, rx: 86, ry: 17, irx: 44, iry: 9 };
  var HAT_DY = 10; /* how far the hat sits down over the head */

  function sombreroBack(id, tilt) {
    var b = BRIM;
    return (
      '<g class="pg-hat-back" transform="translate(0,' + HAT_DY + ') rotate(' + tilt + ' 120 70)">' +
        '<ellipse cx="' + b.cx + '" cy="' + (b.cy + 2) + '" rx="' + b.rx + '" ry="' + b.ry + '" fill="' + C.strawDeep + '" opacity="0.35"/>' +
        '<ellipse cx="' + b.cx + '" cy="' + b.cy + '" rx="' + b.rx + '" ry="' + b.ry + '" fill="url(#' + id + '-brim)" stroke="' + C.strawDark + '" stroke-width="2"/>' +
        /* embroidered edge, back half (front half is redrawn on top later) */
        '<ellipse cx="' + b.cx + '" cy="' + b.cy + '" rx="' + (b.rx - 7) + '" ry="' + (b.ry - 4) + '" fill="none" stroke="' + C.rosa + '" stroke-width="2.2" stroke-dasharray="1 5" stroke-linecap="round"/>' +
      '</g>'
    );
  }

  function sombreroFront(id, tilt) {
    var b = BRIM;
    var lo = b.cx - b.rx, ro = b.cx + b.rx, li = b.cx - b.irx, ri = b.cx + b.irx;
    var ring = 'M' + lo + ',' + b.cy + ' A' + b.rx + ',' + b.ry + ' 0 0 0 ' + ro + ',' + b.cy +
               ' L' + ri + ',' + b.cy + ' A' + b.irx + ',' + b.iry + ' 0 0 1 ' + li + ',' + b.cy + ' Z';
    var edge = 'M' + (lo + 7) + ',' + b.cy + ' A' + (b.rx - 7) + ',' + (b.ry - 4) + ' 0 0 0 ' + (ro - 7) + ',' + b.cy;
    return (
      '<g class="pg-hat" transform="translate(0,' + HAT_DY + ') rotate(' + tilt + ' 120 70)">' +
        /* crown */
        '<path d="' + CROWN + '" fill="url(#' + id + '-crown)" stroke="' + C.strawDark + '" stroke-width="2" stroke-linejoin="round"/>' +
        /* pinch/dent on top */
        '<path d="M104,34 Q120,26 136,34" stroke="' + C.strawDark + '" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.7"/>' +
        /* embroidered band around the crown base */
        '<g clip-path="url(#' + id + '-crownclip)">' +
          '<rect x="70" y="54" width="100" height="18" fill="' + C.rosa + '"/>' +
          '<rect x="70" y="54" width="100" height="3" fill="' + C.jade + '"/>' +
          '<rect x="70" y="69" width="100" height="3" fill="' + C.talavera + '"/>' +
          '<path d="M72,66 L78,59 L84,66 L90,59 L96,66 L102,59 L108,66 L114,59 L120,66 L126,59 L132,66 L138,59 L144,66 L150,59 L156,66 L162,59 L168,66" stroke="' + C.marigold + '" stroke-width="2.2" fill="none" stroke-linejoin="round"/>' +
          '<path d="M78,62 l1.8,1.8 -1.8,1.8 -1.8,-1.8 Z M102,62 l1.8,1.8 -1.8,1.8 -1.8,-1.8 Z M126,62 l1.8,1.8 -1.8,1.8 -1.8,-1.8 Z M150,62 l1.8,1.8 -1.8,1.8 -1.8,-1.8 Z" fill="' + C.white + '"/>' +
        '</g>' +
        /* front rim of the brim (covers the forehead edge) */
        '<path d="' + ring + '" fill="' + C.straw + '" stroke="' + C.strawDark + '" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="' + edge + '" fill="none" stroke="' + C.rosa + '" stroke-width="2.2" stroke-dasharray="1 5" stroke-linecap="round"/>' +
        /* soft shadow the brim casts on the face */
        '<path d="M' + li + ',' + b.cy + ' A' + b.irx + ',' + b.iry + ' 0 0 0 ' + ri + ',' + b.cy + ' A' + b.irx + ',' + (b.iry + 7) + ' 0 0 1 ' + li + ',' + b.cy + ' Z" fill="' + C.inkDeep + '" opacity="0.18"/>' +
      '</g>'
    );
  }

  /* ---------------- extras per mood ---------------- */

  function sweatDrop() {
    return (
      '<g class="pg-sweat">' +
        '<path d="M70,102 C70,102 61,114 61,119 A9,9 0 0 0 79,119 C79,114 70,102 70,102 Z" fill="' + C.sweat + '"/>' +
        '<circle cx="66.5" cy="119" r="2.2" fill="#FFFFFF" opacity="0.8"/>' +
      '</g>'
    );
  }

  function zz() {
    var z = function (x, y, s, o) {
      return '<path transform="translate(' + x + ',' + y + ') scale(' + s + ')" d="M0,0 L12,0 L0,12 L12,12" stroke="' + C.talavera + '" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="' + o + '"/>';
    };
    return '<g class="pg-zz">' + z(184, 104, 1, 0.9) + z(204, 88, 1.25, 0.75) + z(220, 62, 1.5, 0.55) + '</g>';
  }

  function confetti() {
    var bits = [
      [24, 40, C.rosa, 'r', 20], [44, 18, C.jade, 'c', 0], [66, 48, C.marigold, 'r', -30], [20, 96, C.talavera, 'c', 0],
      [216, 44, C.marigold, 'r', 35], [196, 18, C.rosa, 'c', 0], [228, 100, C.jade, 'r', -20], [172, 42, C.talavera, 'r', 15],
      [34, 150, C.marigold, 'c', 0], [208, 158, C.rosa, 'r', 40], [12, 200, C.jade, 'c', 0], [230, 196, C.talavera, 'r', -40],
      [100, 10, C.terracotta, 'r', 25], [146, 8, C.jade, 'c', 0]
    ];
    var out = '<g class="pg-confetti">';
    bits.forEach(function (b) {
      if (b[3] === 'c') out += '<circle cx="' + b[0] + '" cy="' + b[1] + '" r="4" fill="' + b[2] + '"/>';
      else out += '<rect x="' + (b[0] - 5) + '" y="' + (b[1] - 3) + '" width="10" height="6" rx="1.5" fill="' + b[2] + '" transform="rotate(' + b[4] + ' ' + b[0] + ' ' + b[1] + ')"/>';
    });
    out += '</g>';
    return out;
  }

  function medal() {
    /* a little star medal pinned on the chest */
    var star = function (cx, cy, r) {
      var pts = [];
      for (var i = 0; i < 10; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
        pts.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1));
      }
      return pts.join(' ');
    };
    return (
      '<g class="pg-medal">' +
        '<path d="M86,160 L96,176 L104,160 Z" fill="' + C.rosa + '"/>' +
        '<path d="M90,160 L96,176 L100,160 Z" fill="' + C.jade + '"/>' +
        '<circle cx="96" cy="182" r="11" fill="' + C.goldDark + '"/>' +
        '<circle cx="96" cy="181" r="9.5" fill="' + C.gold + '"/>' +
        '<polygon points="' + star(96, 181.5, 6.5) + '" fill="' + C.white + '" opacity="0.95"/>' +
      '</g>'
    );
  }

  function sparkles() {
    var s = function (x, y, r, col) {
      return '<path d="M' + x + ',' + (y - r) + ' Q' + x + ',' + y + ' ' + (x + r) + ',' + y + ' Q' + x + ',' + y + ' ' + x + ',' + (y + r) + ' Q' + x + ',' + y + ' ' + (x - r) + ',' + y + ' Q' + x + ',' + y + ' ' + x + ',' + (y - r) + ' Z" fill="' + col + '"/>';
    };
    return '<g class="pg-sparkles">' + s(196, 108, 9, C.marigold) + s(212, 134, 5, C.rosa) + s(40, 112, 7, C.marigold) + s(30, 136, 4, C.talavera) + '</g>';
  }

  function waveLines() {
    return (
      '<g class="pg-wavelines" stroke="' + C.talavera + '" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.8">' +
        '<path d="M30,70 Q26,80 30,90"/><path d="M20,64 Q14,80 20,96"/>' +
      '</g>'
    );
  }

  function thoughtDots() {
    return (
      '<g class="pg-thought" fill="' + C.talavera + '" opacity="0.8">' +
        '<circle cx="190" cy="100" r="3"/><circle cx="202" cy="86" r="4.5"/><circle cx="218" cy="66" r="6.5"/>' +
      '</g>'
    );
  }

  /* ---------------- mood recipes ---------------- */

  var RECIPES = {
    happy:    { eyes: 'open',   brows: 'none',    beak: 'smile', left: 14,  right: 14,  tilt: -4, cheeks: false },
    talking:  { eyes: 'open',   brows: 'none',    beak: 'open',  left: 48,  right: 10,  tilt: -4, cheeks: false },
    thinking: { eyes: 'up',     brows: 'raised',  beak: 'smile', left: 10,  right: 'chin', tilt: -4, cheeks: false, extra: thoughtDots },
    cheer:    { eyes: 'open',   brows: 'none',    beak: 'open',  left: 152, right: 152, tilt: -8, cheeks: true,  extra: confetti },
    oops:     { eyes: 'side',   brows: 'worried', beak: 'smile', left: 8,   right: 'scratch', tilt: 4, cheeks: true, extra: sweatDrop },
    proud:    { eyes: 'smile',  brows: 'none',    beak: 'smile', left: 36,  right: 36,  tilt: -4, cheeks: true,  extra: function () { return medal() + sparkles(); } },
    sleepy:   { eyes: 'sleepy', brows: 'none',    beak: 'smile', left: 6,   right: 6,   tilt: 6,  cheeks: false, extra: zz },
    wave:     { eyes: 'open',   brows: 'none',    beak: 'smile', left: 150, right: 12,  tilt: -4, cheeks: false, extra: waveLines }
  };

  function flippers(r) {
    var out = '';
    out += flipper(-1, r.left, 'pg-flipper-l');
    if (r.right === 'chin') {
      /* flipper crosses the body and rests under the beak */
      out += '<g class="pg-flipper pg-flipper-r" transform="translate(174,142) rotate(72) scale(-0.9,0.9)">' +
               '<g class="pg-flipper-inner"><path d="M0,-6 C-6,-4 -17,10 -22,34 C-25,50 -16,60 -8,58 C2,56 10,38 12,16 C13,4 8,-6 0,-6 Z" fill="' + C.ink2 + '"/></g>' +
             '</g>';
    } else if (r.right === 'scratch') {
      /* sheepish head scratch: flipper up to the hat brim */
      out += '<g class="pg-flipper pg-flipper-r" transform="translate(174,142) rotate(-150) scale(-0.8,0.8)">' +
               '<g class="pg-flipper-inner"><path d="M0,-6 C-6,-4 -17,10 -22,34 C-25,50 -16,60 -8,58 C2,56 10,38 12,16 C13,4 8,-6 0,-6 Z" fill="' + C.ink2 + '"/></g>' +
             '</g>';
    } else {
      out += flipper(1, r.right, 'pg-flipper-r');
    }
    return out;
  }

  function svg(mood, size, opts) {
    mood = MOODS.indexOf(mood) >= 0 ? mood : 'happy';
    size = size || 120;
    opts = opts || {};
    var r = RECIPES[mood];
    var id = 'pg' + (++uid);
    var label = NAME + ' (' + mood + ')';

    var inner =
      defs(id) +
      (mood === 'cheer' ? confetti() : '') +
      sombreroBack(id, r.tilt) +
      feet() +
      body(id) +
      cheeks(r.cheeks) +
      eyes(r.eyes, r.brows) +
      beak(r.beak) +
      flippers(r) +
      sombreroFront(id, r.tilt) +
      (r.extra && mood !== 'cheer' ? r.extra() : '');

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="' + size + '" height="' + size + '" ' +
      'class="penguin penguin-' + mood + '" role="img" aria-label="' + label + '" data-mood="' + mood + '">' +
      (opts.title === false ? '' : '<title>' + label + '</title>') +
      inner +
      '</svg>'
    );
  }

  /* ---------------- voice ---------------- */

  var LINES = {
    good: [
      '¡Muy bien! That\'s exactly it.',
      '¡Perfecto! You nailed it.',
      '¡Órale! Clean as a fresh tortilla.',
      '¡Excelente! That one\'s yours now.',
      '¡Así es! Just like a chilango would say it.',
      '¡Eso! You\'re going to sound great in Mexico.',
      '¡Bravo! Not a feather out of place.',
      'Sí, señor. That\'s the one.',
      '¡Qué bien! I\'d order from you any day.',
      '¡Muy bien hecho! Keep that rhythm going.',
      '¡Chido! You got it on the first try.',
      '¡Correcto! Easy as pan dulce.',
      'Wow — ¡perfecto! Even the accent.'
    ],
    close: [
      '¡Casi! You had the idea — just a small detail to polish.',
      'So close. The meaning is there; let\'s tidy the form.',
      'Almost — I understood you perfectly. One tiny fix.',
      '¡Ya casi! That\'s 90% of the way there.',
      'Good recall. A little grammar slip, nothing more.',
      'You remembered the important part. ¡Bien!',
      'Nearly there — a waiter in Mexico would understand you.',
      '¡Casi, casi! One word off.',
      'Nice try — the pieces are right, just one needs a swap.',
      'I knew what you meant. Let\'s make it shine.',
      'Close one! Have a look at the marked word.',
      'Un detallito — a small detail. The rest is great.',
      '¡Bien! Just watch that one ending.'
    ],
    miss: [
      'No pasa nada — that one\'s tricky. Here\'s the answer.',
      'Not yet, but now you\'ve seen it. It\'ll stick next time.',
      'Tranquilo. This one takes a couple of tries for everyone.',
      'Hmm, not this time. Read it once, say it once, and we move on.',
      'Not quite. Let\'s look at it together — no rush.',
      'That\'s a hard one. Now you have the answer in your pocket.',
      'No worries. Even I forget words before breakfast.',
      'Let\'s try that one again later. ¡Tú puedes!',
      'Not the one — but a good guess. Here\'s what it was.',
      'Still learning this one, and that\'s totally fine.',
      'Nope — pero no pasa nada. We\'ll see it again soon.',
      'This word is shy. It\'ll come out next time.',
      'Missed it, but now it\'s in your brain. ¡Ánimo!'
    ],
    streak: [
      '¡Órale! Three in a row!',
      '¡Qué racha! You\'re on fire.',
      '¡Increíble! Keep it going.',
      'Streak! Someone has been practising.',
      '¡Wow! That\'s a serious run.',
      '¡Eso, eso, eso! Unstoppable.',
      'You\'re making this look easy. ¡Sigue así!',
      'A streak like that deserves tacos.',
      '¡Vamos! Another one in the bag.',
      '¡Fantástico! Don\'t stop now.',
      '¡Ándale! You\'ve found your rhythm.',
      'Five straight! The sombrero tips to you.'
    ],
    done: [
      'That\'s all for today. ¡Buen trabajo!',
      'Done for today — your brain will file it while you sleep.',
      '¡Listo! Go have a horchata; you earned it.',
      'Session complete. Hasta mañana, amigo.',
      'That\'s the daily goal. Rest up — the words keep settling.',
      'All done. Tomorrow we review and add a few more.',
      '¡Terminamos! Nice steady work today.',
      'Enough for now. Little and often beats a lot at once.',
      'You finished today\'s set. ¡Qué bien!',
      'Zzz… I mean: great session. See you tomorrow.',
      '¡Ya está! Every day gets you closer to that first taco order.',
      'Daily goal reached. Go enjoy your day — nos vemos.'
    ],
    welcome: [
      '¡Hola! I\'m Penguin. Ready for a bit of Spanish?',
      '¡Bienvenido! Let\'s pick up where we left off.',
      '¿Qué onda? Shall we do a quick round?',
      '¡Buenos días! A few words now, a lot of words by October 30th.',
      'Hey there — your words are waiting for you.',
      '¡Hola, hola! Time for a little review.',
      'Welcome back. Small steps, big trip.',
      '¡Qué gusto verte! Let\'s go.',
      'Ready when you are. Just press the big button.',
      '¡Vamos! One lesson, one step closer to Mexico.'
    ]
  };

  var MOOD_FOR = { good: 'happy', close: 'thinking', miss: 'oops', streak: 'cheer', done: 'sleepy', welcome: 'wave' };

  function line(kind) {
    var arr = LINES[kind] || LINES.good;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function coach(el, mood, html, opts) {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) return null;
    opts = opts || {};
    var size = opts.size || 120;
    el.innerHTML =
      '<div class="penguin-coach" data-mood="' + (mood || 'happy') + '">' +
        '<div class="penguin-coach-avatar">' + svg(mood, size) + '</div>' +
        '<div class="speech-bubble">' +
          (opts.name === false ? '' : '<div class="speech-name">' + NAME + '</div>') +
          '<div class="speech-text">' + (html || '') + '</div>' +
        '</div>' +
      '</div>';
    return el.firstChild;
  }

  function say(el, kind, extraHtml, opts) {
    var text = '<p class="speech-line">' + line(kind) + '</p>' + (extraHtml || '');
    return coach(el, MOOD_FOR[kind] || 'happy', text, opts);
  }

  var Penguin = {
    name: NAME,
    moods: MOODS,
    svg: svg,
    coach: coach,
    lines: LINES,
    line: line,
    moodFor: MOOD_FOR,
    say: say,
    colors: C
  };

  global.Penguin = Penguin;
  if (typeof module !== 'undefined' && module.exports) module.exports = Penguin;
})(typeof window !== 'undefined' ? window : this);
