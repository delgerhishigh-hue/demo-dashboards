// Салбарын 3D тавцан (голограмм диорама) — газрын зургийн дээр хөвөх three.js дүрслэл.
//   spec = { title, tint, staff:[{k,label,n,color}], towers:[{label,val,txt,color}], drops, sats:[{label,txt,share,color,n}], ownLoop, loopTxt }
//   anchor() → {x,y} дэлгэцийн цэг (салбарын байршил) эсвэл null (байршилгүй бол дэлгэцийн дунд).
// Бүх загвар процедураар үүснэ (гадны GLB байхгүй). Хөдөлгөөн: тавцан гарч ирэх, цамхаг ургах, хүмүүс гарч ирэх,
// шинээр хэтэрсэн зээл тэнгэрээс 1–30 цамхаг руу унах, хэтэрсэн багц Төлүүлэлт/тусгай хяналт руу урсах.
import * as THREE from './vendor/three.module.min.js';

const W = 780, H = 480, R = 100;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wrap = document.createElement('div');
wrap.id = 'holo';
wrap.innerHTML = '<canvas></canvas><div class="hl"></div>';
document.body.appendChild(wrap);
const canvas = wrap.querySelector('canvas'), labs = wrap.querySelector('.hl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) { console.warn('diorama: WebGL алга', e); }
if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(32, W / H, 1, 3000);
cam.position.set(95, 255, 430); cam.lookAt(95, 26, 0);
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x1a2a40, 1.25));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-160, 300, 180); scene.add(sun);
const rim = new THREE.DirectionalLight(0x38bdf8, .9); rim.position.set(200, 80, -220); scene.add(rim);

const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const back = t => { t = Math.min(1, Math.max(0, t)); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .75, metalness: .05, flatShading: true, ...o });

function radialTex(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, inner); gr.addColorStop(.75, outer); gr.addColorStop(1, '#0b1a2c');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  // нарийн торон шугам — «голограмм» мэдрэмж
  g.strokeStyle = 'rgba(160,220,255,.10)'; g.lineWidth = 1;
  for (let i = 0; i <= 256; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function windowsTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#1b2b44'; g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 120; y += 14) for (let x = 6; x < 60; x += 14) { g.fillStyle = Math.random() < .75 ? '#ffd98a' : '#3a5578'; g.fillRect(x, y, 8, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const WIN = windowsTex();

let root = null, items = [], labels = [], anim = [], T0 = 0, anchorFn = null, visible = false, raf = 0, spin = 0;

function clear() {
  if (root) { scene.remove(root); root.traverse(o => { o.geometry && o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { m.map && m.map !== WIN && m.map.dispose(); m.dispose(); }); }); }
  root = null; items = []; anim = []; labels.forEach(l => l.el.remove()); labels = [];
}
function label(html, obj, off, cls = '') {
  const el = document.createElement('div'); el.className = 'hlab ' + cls; el.innerHTML = html; labs.appendChild(el);
  const l = { el, obj, off: off || new THREE.Vector3() }; labels.push(l); return l;
}
function person(color, s = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.4 * s, 3.4 * s, 9 * s, 10), M(color));
  body.position.y = 4.5 * s; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(2.6 * s, 14, 10), M(0xf1d3b3, { flatShading: false }));
  head.position.y = 11.6 * s; g.add(head);
  return g;
}

function build(spec) {
  clear();
  root = new THREE.Group(); scene.add(root);
  const tint = new THREE.Color(spec.tint || '#0ca30c');
  // тавцан
  const plat = new THREE.Group(); root.add(plat);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R * .9, 12, 72), [M(0x16304d), M(0x1f3d2c, { map: radialTex('#2f6b4a', '#1d4a3a') }), M(0x0f2034)]);
  top.position.y = -6; plat.add(top);
  const tintDisc = new THREE.Mesh(new THREE.CircleGeometry(R * .985, 72), new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: .16, depthWrite: false }));
  tintDisc.rotation.x = -Math.PI / 2; tintDisc.position.y = .3; plat.add(tintDisc);
  const under = new THREE.Mesh(new THREE.ConeGeometry(R * .9, 46, 72, 1, true), M(0x0c1a2b, { side: THREE.DoubleSide }));
  under.rotation.x = Math.PI; under.position.y = -35; plat.add(under);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 4, 1.2, 8, 120), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = -4; plat.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(R + 13, .7, 6, 120, Math.PI * 1.55), new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: .85 }));
  ring2.rotation.x = Math.PI / 2; ring2.position.y = -8; plat.add(ring2);
  const halo = new THREE.Mesh(new THREE.RingGeometry(R + 2, R + 24, 96), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: .12, side: THREE.DoubleSide, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = -5; plat.add(halo);
  anim.push(t => { ring2.rotation.z = t * .35; halo.material.opacity = .08 + .06 * Math.sin(t * 2); });
  items.push({ o: plat, at: 0, dur: .9, kind: 'pop' });

  // салбарын барилга (төв)
  const bld = new THREE.Group(); root.add(bld);
  const bmat = M(0xffffff, { map: WIN, emissive: 0x332200, emissiveIntensity: .25 });
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(30, 34, 22), [bmat, bmat, M(0x2b4466), M(0x2b4466), bmat, bmat]);
  b1.position.y = 17; bld.add(b1);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(18, 14, 16), [bmat, bmat, M(0x2b4466), M(0x2b4466), bmat, bmat]);
  b2.position.set(-20, 7, 4); bld.add(b2);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(32, 2.5, 24), M(0x38bdf8, { emissive: 0x38bdf8, emissiveIntensity: .5 }));
  roof.position.y = 35; bld.add(roof);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, 16, 6), M(0xb9c6d8)); pole.position.set(10, 44, 6); bld.add(pole);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(9, 5, .6), M(0x38bdf8, { emissive: 0x38bdf8, emissiveIntensity: .7 })); flag.position.set(14.5, 49, 6); bld.add(flag);
  anim.push(t => { flag.rotation.y = Math.sin(t * 3) * .25; });
  bld.position.set(0, 0, -6);
  items.push({ o: bld, at: .35, dur: .7, kind: 'grow' });
  label(`<b>${spec.title}</b>`, bld, new THREE.Vector3(0, 92, 0), 'title');

  // ажилчид — урд талд хагас тойрогт; шошго нь тавцангийн урд нэг мөр домог
  const groups = spec.staff.filter(s => s.n > 0);
  const totalShow = groups.reduce((s, g) => s + Math.min(g.n, g.cap || 24), 0) || 1;
  const a0 = Math.PI * .16, span = Math.PI * .68; let idx = 0;
  groups.forEach((g, gi) => {
    const show = Math.min(g.n, g.cap || 24);
    for (let i = 0; i < show; i++, idx++) {
      const a = a0 + span * (idx + gi * 1.2 + .5) / (totalShow + groups.length * 1.2), row = i % 2, r = 50 + row * 16;
      const p = person(g.color, g.big ? 1.9 : 1.4);
      p.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      p.lookAt(0, 0, 0); p.rotateY(Math.PI);
      root.add(p);
      items.push({ o: p, at: 1.0 + (idx * .04), dur: .45, kind: 'pop' });
      const ph = Math.random() * 6;
      anim.push(t => { p.position.y = Math.max(0, Math.sin(t * 3 + ph)) * 1.4; });
    }
  });
  if (groups.length) {
    const fa = new THREE.Object3D(); fa.position.set(0, -26, R + 6); root.add(fa);
    label(groups.map(g => `<span class="sg"><i style="background:${g.css}"></i>${g.label} <b>${g.n}</b></span>`).join(''), fa, null, 'stf');
  }

  // багцын цамхагууд (хэтрэлтийн бүлэг) — арын хагас тойрог
  const tw = spec.towers, mx = Math.max(1, ...tw.map(t => t.val));
  const towerObjs = [];
  tw.forEach((t, i) => {
    const a = Math.PI * (1.12 + .76 * i / Math.max(1, tw.length - 1)), r = 74;
    const h = t.val > 0 ? 6 + 62 * Math.sqrt(t.val / mx) : 1.5;
    const g = new THREE.Group(); g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); root.add(g);
    const m = new THREE.Mesh(new THREE.BoxGeometry(12, h, 12), M(t.color, { emissive: t.color, emissiveIntensity: .22 }));
    m.position.y = h / 2; g.add(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(13, 1.2, 13), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55 }));
    cap.position.y = h + .6; g.add(cap);
    items.push({ o: g, at: .8 + i * .12, dur: .9, kind: 'grow' });
    const top = new THREE.Object3D(); top.position.set(0, h + 8, 0); g.add(top);
    label(`<span>${t.label}</span><b>${t.txt}</b>`, top, new THREE.Vector3(0, i % 2 ? 13 : 0, 0), 'tower');
    towerObjs.push({ g, h, a });
  });

  // шинээр хэтэрсэн зээл — тэнгэрээс 1–30 цамхаг руу унах улаан шоо
  const tgt = towerObjs[1];
  if (tgt && spec.drops > 0) {
    const n = Math.min(28, Math.max(3, Math.round(Math.sqrt(spec.drops) * 2))), geo = new THREE.BoxGeometry(3.2, 3.2, 3.2), mat = M(0xff5b5b, { emissive: 0xff2d2d, emissiveIntensity: .6 });
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(geo, mat); root.add(c);
      const ph = i / n, jx = (Math.random() - .5) * 40, jz = (Math.random() - .5) * 40;
      anim.push((t, el) => {
        if (el < 2.2) { c.visible = false; return; }
        const k = ((t * .32 + ph) % 1); c.visible = true;
        c.position.set(tgt.g.position.x + jx * (1 - k), 150 - (150 - tgt.h) * k * k, tgt.g.position.z + jz * (1 - k));
        c.rotation.set(t * 2 + i, t * 1.5, 0); c.scale.setScalar(k > .96 ? (1 - k) * 25 : 1);
      });
    }
    const sky = new THREE.Object3D(); sky.position.set(tgt.g.position.x, 150, tgt.g.position.z); root.add(sky);
    label(`▼ ${spec.dropsTxt}`, sky, null, 'drop');
  }

  // хариуцлагын урсгал — хэтэрсэн багц Төлүүлэлт / тусгай хяналт / тусгай баг руу (хиймэл дагуул тавцангууд)
  const sats = (spec.sats || []).filter(s => s.n > 0);
  sats.forEach((s, i) => {
    const k = sats.length > 1 ? i / (sats.length - 1) : .5;
    const pos = new THREE.Vector3(178 + 10 * Math.sin(k * Math.PI), 128 - k * 118, -70 + k * 120);
    const sg = new THREE.Group(); sg.position.copy(pos); root.add(sg);
    const rr = 14 + 18 * Math.sqrt(s.share);
    const d = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr * .85, 5, 40), M(0x1b3150, { emissive: s.color, emissiveIntensity: .25 }));
    sg.add(d);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(rr + 2, .8, 6, 60), new THREE.MeshBasicMaterial({ color: s.color })); glow.rotation.x = Math.PI / 2; sg.add(glow);
    for (let k = 0; k < Math.min(9, s.staff || 0); k++) { const p = person(s.color, .8); const aa = k / Math.min(9, s.staff) * Math.PI * 2; p.position.set(Math.cos(aa) * rr * .55, 2.5, Math.sin(aa) * rr * .55); sg.add(p); }
    items.push({ o: sg, at: 2.0 + i * .2, dur: .7, kind: 'pop' });
    anim.push(t => { sg.position.y = pos.y + Math.sin(t * 1.4 + i) * 3; glow.rotation.z = t; });
    const lt = new THREE.Object3D(); lt.position.set(rr + 6, 4, 0); sg.add(lt);
    label(`<i style="background:${s.css}"></i><b>${s.label}</b><span>${s.txt}</span>`, lt, null, 'sat');
    // нумарсан гүүр + урсах бөмбөлгүүд
    const from = towerObjs.length ? towerObjs[Math.min(towerObjs.length - 1, 3)] : { g: { position: new THREE.Vector3() }, h: 20 };
    const p0 = new THREE.Vector3(from.g.position.x * .4 + 40, 18, from.g.position.z * .2 + 30), p2 = pos.clone().add(new THREE.Vector3(-rr * .7, 0, 0));
    const p1 = p0.clone().lerp(p2, .5).add(new THREE.Vector3(0, 70, 0));
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, .7 + 2.2 * Math.sqrt(s.share), 6), new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: .35, depthWrite: false }));
    root.add(tube); items.push({ o: tube, at: 2.1 + i * .2, dur: .5, kind: 'fade' });
    const nb = Math.max(2, Math.round(3 + 14 * s.share)), bg = new THREE.SphereGeometry(1.9, 10, 8), bm = new THREE.MeshBasicMaterial({ color: s.color });
    for (let k = 0; k < nb; k++) {
      const b = new THREE.Mesh(bg, bm); root.add(b); const ph = k / nb;
      anim.push((t, el) => { if (el < 2.6) { b.visible = false; return; } b.visible = true; curve.getPoint((t * .22 + ph) % 1, b.position); });
    }
  });
  // ОН: олголт ба төлүүлэлтийг нэг ажилтан хамт хариуцдаг — ажилчдын эргэн тойронд эргэх сум
  if (spec.ownLoop) {
    const lg = new THREE.Group(); lg.position.set(0, 2, 0); root.add(lg);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(88, 1.3, 6, 90, Math.PI * .75), new THREE.MeshBasicMaterial({ color: 0x7dd3fc }));
    arc.rotation.x = Math.PI / 2; lg.add(arc);
    const head = new THREE.Mesh(new THREE.ConeGeometry(4, 9, 10), new THREE.MeshBasicMaterial({ color: 0x7dd3fc }));
    head.position.set(88, 0, 0); head.rotation.x = Math.PI / 2; lg.add(head);
    const arc2 = arc.clone(); arc2.rotation.z = Math.PI; lg.add(arc2);
    const head2 = head.clone(); head2.position.set(-88, 0, 0); head2.rotation.x = -Math.PI / 2; lg.add(head2);
    anim.push(t => { lg.rotation.y = -t * .5; });
    items.push({ o: lg, at: 2.2, dur: .6, kind: 'pop' });
    const lt = new THREE.Object3D(); lt.position.set(0, 0, 112); root.add(lt);
    label(spec.loopTxt, lt, null, 'loop');
  }
  items.forEach(it => { it.o.userData.s0 = it.o.scale.clone(); it.o.scale.setScalar(.0001); if (it.kind === 'fade') { it.o.scale.setScalar(1); it.o.material.opacity = 0; it.o.userData.op = .35; } });
  labels.forEach(l => l.el.style.opacity = 0);
}

const v = new THREE.Vector3();
function frame(now) {
  raf = 0;
  if (!visible || !renderer) return;
  const el = (now - T0) / 1000, t = now / 1000;
  // байршил: салбарын цэгийн дээр хөвнө
  const a = anchorFn && anchorFn();
  const pw = innerWidth > 900 ? innerWidth - 440 : innerWidth;
  let x = a ? a.x : pw / 2, y = a ? a.y : innerHeight * .62;
  // тавцангийн төвийг (root origin) салбарын цэгийн дээр тааруулна; canvas бүхэлдээ самбарын зүүн талд багтана
  v.set(0, -40, 0).project(cam);
  const px = (v.x + 1) / 2 * W, py = (1 - v.y) / 2 * H;
  let L = x - px, T = y - py - 40;
  L = Math.max(4, Math.min(pw - W - 4, L)); T = Math.max(64, Math.min(innerHeight - H - 10, T));
  wrap.style.transform = `translate(${Math.round(L)}px,${Math.round(T)}px)`;
  for (const it of items) {
    const k = (el - it.at) / it.dur, s0 = it.o.userData.s0;
    if (it.kind === 'pop') it.o.scale.copy(s0).multiplyScalar(Math.max(.0001, RM ? 1 : back(k)));
    else if (it.kind === 'grow') it.o.scale.set(s0.x * Math.min(1, ease(k * 2)), s0.y * Math.max(.0001, RM ? 1 : ease(k)), s0.z * Math.min(1, ease(k * 2)));
    else if (it.kind === 'fade') it.o.material.opacity = it.o.userData.op * ease(k);
  }
  for (const f of anim) f(t, el);
  if (root) { spin += (RM ? 0 : .0016); root.rotation.y = Math.sin(spin) * .32; }
  renderer.render(scene, cam);
  for (const l of labels) {
    l.obj.getWorldPosition(v); v.add(l.off).project(cam);
    const show = el > (l.el.classList.contains('title') ? .5 : l.el.classList.contains('sat') || l.el.classList.contains('loop') || l.el.classList.contains('drop') ? 2.4 : 1.4);
    l.el.style.transform = `translate(${l.el.classList.contains('sat') ? '0,-50%' : '-50%,-100%'}) translate(${((v.x + 1) / 2 * W).toFixed(1)}px,${((1 - v.y) / 2 * H).toFixed(1)}px)`;
    l.el.style.opacity = show ? 1 : 0;
  }
  raf = requestAnimationFrame(frame);
}

window.Holo = {
  ok: !!renderer,
  show(spec, anchor) {
    if (!renderer) return;
    build(spec); anchorFn = anchor; T0 = performance.now(); visible = true; spin = 0;
    wrap.classList.add('on');
    if (!raf) raf = requestAnimationFrame(frame);
  },
  hide() { visible = false; wrap.classList.remove('on'); setTimeout(() => { if (!visible) clear(); }, 400); }
};
window.dispatchEvent(new Event('holo-ready'));
