'use strict';

import { Ble } from './ble.js';
import {
  cmd, LED_TYPES, DIY_FUN, DIY_MOVE, simple, crc32,
  buildBodyBlocks, CHANNEL_IMAGE, CHANNEL_GIF, CHANNEL_TEXT,
  textBody, glyphTag, convertTime
} from './protocol.js';
import { encodeGif } from './gif.js';

const qs = (s) => document.querySelector(s);
const ble = new Ble();

const state = {
  led: [64, 64],
  screenType: 4,
  grid: null,       // Uint8Array(64*64*3) DIY grid
  fonts: []
};

// ---------- UI helpers ----------
const logEl = qs('#log');
function log (m) {
  const t = new Date().toLocaleTimeString();
  logEl.textContent += `[${t}] ${m}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}
function status (m) {
  qs('#conn-status').textContent = m;
  qs('#conn-status').className = 'conn';
}
function setStatus (m) {
  qs('#conn-status').textContent = m;
  qs('#conn-status').className = m.includes('Connect') ? 'conn' : 'conn ok';
}
function tr (s, ...a) { return s.replace('%1', a[0]); }

document.querySelectorAll('.side button').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.side button').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    qs(`#panel-${b.dataset.tab}`).classList.add('active');
  };
});

function progress (on, pct, label) {
  const w = qs('#progress-wrap');
  w.hidden = !on;
  if (on) {
    qs('#progress-fill').style.width = `${pct}%`;
    qs('#progress-label').textContent = `${label} ${pct}%`;
  }
}
ble.on('status', (m) => { setStatus(m); log(m); });
ble.on('disconnected', () => { status('Not connected'); log('Disconnected'); });
ble.on('deviceinfo', (info) => {
  const dims = LED_TYPES[info.screenType] || LED_TYPES[4];
  state.led = dims; state.screenType = info.screenType;
  syncCanvases();
  qs('#device-card').innerHTML = `
    <b>${ble.device ? ble.device.name || ble.device.id : ''}</b><br>
    Firmware: <b>${info.fwMajor}.${String(info.fwMinor).padStart(2, '0')}</b> —
    Panel: <b>${dims[0]}×${dims[1]}</b> (type ${info.screenType}) —
    PIN required: <b>${info.pwdFlag ? 'yes' : 'no'}</b>`;
  log(`Device info: fw=${info.fwMajor}.${info.fwMinor} screenType=${info.screenType} pwd=${info.pwdFlag}`);
});

// ---------- connect ----------
qs('#btn-connect').onclick = async () => {
  try {
    await ble.requestDevice();
    await ble.connect();
    log(`Connected to ${ble.device.name || ble.device.id}. Probing device…`);
    await ble.write(cmd.getDevice(), { silent: true });
    await ble.write(cmd.syncTime(), { silent: true });
  } catch (e) {
    log('Connect failed: ' + e.message);
    status('Not connected');
  }
};

function syncCanvases () {
  for (const id of ['#img-preview', '#gif-preview', '#txt-preview', '#draw-grid']) {
    const c = qs(id);
    c.width = state.led[0];
    c.height = state.led[1];
  }
  // redisplay current previews
  if (imgData) paintImageData(qs('#img-preview'), imgData);
  if (gifFrames) paintImageData(qs('#gif-preview'), gifFrames[0]);
  drawRedraw();
}

// ---------- image tab ----------
let imgData = null; // ImageData-sized RGB bytes
qs('#img-file').onchange = async () => {
  const f = qs('#img-file').files[0];
  if (!f) return;
  imgData = await loadStill(f, qs('#img-fit').value);
  paintImageData(qs('#img-preview'), imgData);
  log(`Loaded image: scaled to ${state.led[0]}×${state.led[1]}`);
};
qs('#img-fit').onchange = async () => {
  const f = qs('#img-file').files[0];
  if (f && imgData) {
    imgData = await loadStill(f, qs('#img-fit').value);
    paintImageData(qs('#img-preview'), imgData);
  }
};
qs('#img-send').onclick = async () => {
  if (!imgData) return warn('Load an image first');
  await requireDevice();
  const body = new Uint8Array(imgData.data);
  const secs = +qs('#img-duration').value;
  const fmt = +qs('#img-mode').value || 13;
  await pushMaterial(CHANNEL_IMAGE, body, fmt, secs, 'Image');
};

async function loadStill (file, fit) {
  const bmp = await createImageBitmap(await file.arrayBuffer());
  return scaleToPanel(bmp, fit || 'fit');
}
function scaleToPanel (bmp, fit) {
  return scaleRgbaToPanel(toRgba(bmp), bmp.width, bmp.height, fit);
}
function toRgba (bmp) {
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  c.getContext('2d').drawImage(bmp, 0, 0);
  return c.getContext('2d').getImageData(0, 0, bmp.width, bmp.height).data;
}
function scaleRgbaToPanel (px, sw, sh, fit) {
  const [w, h] = state.led;
  const src = new OffscreenCanvas(sw, sh);
  src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px), sw, sh), 0, 0);
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  if (fit === 'stretch') {
    g.drawImage(src, 0, 0, sw, sh, 0, 0, w, h);
  } else {
    const s = Math.min(w / sw, h / sh);
    const dw = Math.max(1, Math.floor(sw * s)), dh = Math.max(1, Math.floor(sh * s));
    g.drawImage(src, 0, 0, sw, sh, (w - dw) >> 1, (h - dh) >> 1, dw, dh);
  }
  const d = g.getImageData(0, 0, w, h).data;
  return rgbaToRgb(d, w * h);
}
function rgbaToRgb (px, n) {
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = px[i * 4];
    out[i * 3 + 1] = px[i * 4 + 1];
    out[i * 3 + 2] = px[i * 4 + 2];
  }
  return { data: out, rgba: px };
}
function paintImageData (canvas, obj) {
  const g = canvas.getContext('2d');
  g.putImageData(new ImageData(new Uint8ClampedArray(obj.rgba), canvas.width, canvas.height), 0, 0);
}

// ---------- gif tab ----------
let gifFrames = null, gifInfo = null;
qs('#gif-file').onchange = async () => {
  const f = qs('#gif-file').files[0];
  if (!f) return;
  try {
    const frames = await decodeGifFrameRgba(f);
    if (!frames.length) return warn('No frames decoded.');
    const fit = qs('#gif-fit').value;
    const [w, h] = state.led;
    const scaled = [];
    const delays = [];
    for (const fr of frames) {
      scaled.push(scaleRgbaToPanel(fr.packed, fr.w, fr.h, fit));
      delays.push(fr.delayMs);
    }
    gifFrames = scaled; gifInfo = { delays };
    paintImageData(qs('#gif-preview'), gifFrames[0]);
    log(`GIF decoded: ${frames.length} frames → ${w}×${h}`);
  } catch (e) {
    log('GIF decode failed (ImageDecoder unavailable?): ' + e.message);
    warn('GIF decode failed — use Image tab for single frames or a newer runtime.');
  }
};
qs('#gif-send').onclick = async () => {
  if (!gifFrames) return warn('Load a GIF first');
  await requireDevice();
  const [w, h] = state.led;
  const pal = buildPaletteFromFrames(gifFrames);
  const indexed = [];
  for (const fr of gifFrames) indexed.push(indexFrameColor(fr, pal, w, h));
  // use median frame delay
  const delays = gifInfo.delays.filter(d => d > 0);
  const ms = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 200;
  const cs = Math.max(1, Math.round(ms / 10));
  const gifBytes = encodeGif(indexed, w, h, cs, pal);
  const secs = +qs('#gif-duration').value;
  await pushMaterial(CHANNEL_GIF, gifBytes, 13, secs, 'Animation');
};

async function decodeGifFrameRgba (file) {
  if (typeof ImageDecoder === 'undefined') throw new Error('ImageDecoder API missing');
  const dec = new ImageDecoder({ data: await file.arrayBuffer(), type: 'image/gif' });
  await dec.tracks.ready; await dec.completed;
  const track = dec.tracks.selectedTrack;
  const out = [];
  for (let i = 0; i < Math.min(track.frameCount, 200); i++) {
    const { image } = await dec.decode({ frameIndex: i });
    const w = image.codedWidth, h = image.codedHeight;
    const cv = new OffscreenCanvas(w, h);
    const ctx = cv.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const d = ctx.getImageData(0, 0, w, h);
    const durUs = image.duration || 0; // microseconds
    out.push({ packed: d.data, w, h, delayMs: durUs > 0 && durUs < 1e7 ? Math.round(durUs / 1000) : 200 });
    image.close();
  }
  return out;
}

function buildPaletteFromFrames (frames) {
  const map = new Map();
  map.set(0, [0, 0, 0]);
  const q = (r, g, b) => ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);
  for (const f of frames) {
    for (let i = 0; i < f.data.length; i += 3) {
      const key = q(f.data[i], f.data[i + 1], f.data[i + 2]);
      if (!map.has(key)) {
        map.set(key, [f.data[i], f.data[i + 1], f.data[i + 2]]);
        if (map.size >= 256) break;
      }
    }
    if (map.size >= 256) break;
  }
  const pal = [];
  for (const [k, c] of map) pal.push(c);
  while (pal.length < 256) pal.push([0, 0, 0]);
  // shade to reduce banding artifacts of naive quantization
  const refined = paletteWhiteBackup(pal);
  return refined;
}
function paletteWhiteBackup (pal) {
  return pal;
}
function indexFrameColor (fr, pal, w, h) {
  const out = new Uint8Array(w * h);
  const qmap = new Map();
  const q = (r, g, b) => ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);
  for (let i = 0; i < w * h; i++) {
    const key = q(fr.data[i * 3], fr.data[i * 3 + 1], fr.data[i * 3 + 2]);
    let idx = qmap.get(key);
    if (idx === undefined) {
      // nearest palette entry (fast loop)
      let best = 0, bd = Infinity;
      for (let p = 1; p < 256; p++) {
        const c = pal[p];
        const dr = c[0] - fr.data[i * 3], dg = c[1] - fr.data[i * 3 + 1], db = c[2] - fr.data[i * 3 + 2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = p; }
      }
      idx = best; qmap.set(key, idx);
    }
    out[i] = idx;
  }
  return out;
}

// ---------- text tab ----------
// build font list
const SYSTEM_FONTS = ['Arial', 'Impact', 'Courier New', 'Georgia', 'Tahoma', 'Trebuchet MS', 'Verdana', 'Times New Roman', 'Comic Sans MS'];
{
  const sel = qs('#txt-font');
  sel.innerHTML = '<option value="">(system default)</option>' + SYSTEM_FONTS.map(f => `<option value="${f}">${f}</option>`).join('');
}

function renderGlyph (ch, bold) {
  // returns {bytes, tag} — 1bpp row-major, 8px/byte MSB-first per Text1664
  const H = 64;
  const cv = new OffscreenCanvas(256, H);
  const g = cv.getContext('2d');
  const font = `${bold ? 'bold ' : ''}${H}px ${qs('#txt-font').value || 'sans-serif'}`;
  g.font = font;
  const m = g.measureText(ch);
  let w = Math.ceil(m.width);
  w = Math.max(8, ((w + 7) >> 3) << 3);
  cv.width = w; cv.height = H;
  const g2 = cv.getContext('2d');
  g2.fillStyle = '#000'; g2.fillRect(0, 0, w, H);
  g2.fillStyle = '#fff';
  g2.font = font;
  g2.textAlign = 'center';
  g2.textBaseline = 'middle';
  g2.fillText(ch, w / 2, H / 2);
  const px = g2.getImageData(0, 0, w, H).data;
  const rows = H, cols = w;
  const nbytes = cols * rows / 8;
  const out = new Uint8Array(nbytes);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lum = px[(y * cols + x) * 4] * 0.299 + px[(y * cols + x) * 4 + 1] * 0.587 + px[(y * cols + x) * 4 + 2] * 0.114;
      if (lum > 64) {
        out[(y * cols + x) >> 3] |= (0x80 >> (x & 7));
      }
    }
  }
  return { bytes: out, tag: glyphTag(nbytes) };
}

function glyphWidthPx (gl) {
  return gl.widthPx || 8;
}

qs('#txt-input').oninput = () => renderTextPreview();
qs('#txt-font').onchange = () => renderTextPreview();
qs('#txt-color').oninput = () => renderTextPreview();
qs('#txt-bg').oninput = () => renderTextPreview();

function hexToRgb (hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function buildGlyphSet (text) {
  const glyphs = [];
  for (const ch of text) {
    if (ch === ' ') {
      glyphs.push({ bytes: new Uint8Array(64 * 8), tag: 8, widthPx: 16 });
      continue;
    }
    const gl = renderGlyph(ch, qs('#txt-bold').checked);
    gl.widthPx = gl.bytes.length * 8 / 64;
    glyphs.push(gl);
  }
  return glyphs;
}

function renderTextPreview () {
  const text = qs('#txt-input').value || 'ABC';
  const glyphs = buildGlyphSet(text);
  const c = qs('#txt-preview');
  const g = c.getContext('2d');
  g.fillStyle = qs('#txt-bg').value;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = qs('#txt-color').value;
  let x = 0;
  for (const gl of glyphs) {
    const wpx = gl.widthPx;
    for (let y = 0; y < 64; y++) {
      for (let gx = 0; gx < wpx; gx++) {
        if (gl.bytes[(y * wpx + gx) >> 3] & (0x80 >> (gx & 7))) {
          if (x + gx < c.width) g.fillRect(x + gx, y, 1, 1);
        }
      }
    }
    x += wpx + 1;
    if (x >= c.width) break;
  }
}
qs('#txt-send').onclick = async () => {
  const text = qs('#txt-input').value.trim();
  if (!text) return warn('Type some text');
  await requireDevice();
  const glyphs = buildGlyphSet(text);
  const body = textBody(glyphs, {
    mode: +qs('#txt-mode').value,
    speed: +qs('#txt-speed').value,
    colorMode: 1,
    color: hexToRgb(qs('#txt-color').value),
    bgMode: 0,
    bg: hexToRgb(qs('#txt-bg').value)
  });
  await pushMaterial(CHANNEL_TEXT, body, 12, 0, 'Text');
};

// ---------- draw tab ----------
const gridCanvas = qs('#draw-grid');
let drawing = false;
function drawRedraw () {
  const [w, h] = state.led;
  if (!state.grid || state.grid.length !== w * h * 3) state.grid = new Uint8Array(w * h * 3);
  const c = gridCanvas;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (state.grid[i] | state.grid[i + 1] | state.grid[i + 2]) {
        g.fillStyle = `rgb(${state.grid[i]},${state.grid[i + 1]},${state.grid[i + 2]})`;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
}
gridCanvas.onpointerdown = (e) => { drawing = true; paint(e); };
window.addEventListener('pointerup', () => { drawing = false; });
gridCanvas.onpointermove = (e) => { if (drawing) paint(e); };

function paint (e) {
  const r = gridCanvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * state.led[0]);
  const y = Math.floor((e.clientY - r.top) / r.height * state.led[1]);
  if (x < 0 || y < 0 || x >= state.led[0] || y >= state.led[1]) return;
  const erase = qs('#draw-erase').value === '1';
  const rgb = erase ? [0, 0, 0] : hexToRgb(qs('#draw-color').value);
  const swap = qs('#draw-rgb').value === 'BGR';
  const wire = swap ? [rgb[2], rgb[1], rgb[0]] : rgb;
  const i = (y * state.led[0] + x) * 3;
  state.grid[i] = wire[0]; state.grid[i + 1] = wire[1]; state.grid[i + 2] = wire[2];
  drawRedraw();
  if (ble.connected) {
    ble.write(diyFrame(erase ? DIY_MOVE.ERASE : DIY_MOVE.NO_EFFECT, wire, [[x, y]]), { silent: true });
  }
}
qs('#draw-enter-clear').onclick = async () => { await requireDevice(); await ble.write(cmd.setDiyFun(DIY_FUN.ENTER_CLEAR), { silent: true }); log('DIY: enter+clear'); };
qs('#draw-enter-keep').onclick = async () => { await requireDevice(); await ble.write(cmd.setDiyFun(DIY_FUN.ENTER_KEEP), { silent: true }); log('DIY: enter keep'); };
qs('#draw-quit').onclick = async () => { if (ble.connected) await ble.write(cmd.setDiyFun(DIY_FUN.QUIT_KEEP_SHOWN), { silent: true }); };
qs('#draw-quit-nosave').onclick = async () => { if (ble.connected) await ble.write(cmd.setDiyFun(DIY_FUN.QUIT_NO_SAVE), { silent: true }); };
qs('#draw-clear-grid').onclick = () => { state.grid = new Uint8Array(state.led[0] * state.led[1] * 3); drawRedraw(); };
qs('#draw-import-btn').onclick = () => qs('#draw-import').click();
qs('#draw-import').onchange = async () => {
  const f = qs('#draw-import').files[0];
  if (!f) return;
  const img = await loadStill(f, qs('#img-fit').value);
  const [w, h] = state.led;
  // place scaled image onto grid (drawn area center)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    state.grid[i] = img.data[i]; state.grid[i + 1] = img.data[i + 1]; state.grid[i + 2] = img.data[i + 2];
  }
  drawRedraw();
  log('Grid imported from image.');
};
qs('#grid-to-device').onclick = async () => {
  await requireDevice();
  const body = new Uint8Array(state.grid);
  const secs = +qs('#img-duration').value;
  await pushMaterial(CHANNEL_IMAGE, body, 13, secs, 'Grid image');
};

// ---------- control tab ----------
qs('#ctl-bright-set').onclick = async () => { if (await requireDevice()) await ble.write(cmd.brightness(+qs('#ctl-bright').value), { silent: true }); };
qs('#ctl-speed-set').onclick = async () => { if (await requireDevice()) await ble.write(cmd.speed(+qs('#ctl-speed').value), { silent: true }); };
qs('#ctl-countdown').onclick = async () => {
  if (await requireDevice())
    await ble.write(cmd.countdown(+qs('#cd-h').value, +qs('#cd-m').value, +qs('#cd-s').value), { silent: true });
};
qs('#ctl-stopwatch').onclick = async () => { if (await requireDevice()) await ble.write(cmd.chronograph(0), { silent: true }); };
qs('#ctl-score').onclick = async () => {
  if (await requireDevice())
    await ble.write(cmd.scoreboard(+qs('#sb-r').value, +qs('#sb-b').value), { silent: true });
};
qs('#ctl-time').onclick = async () => { if (await requireDevice()) await ble.write(cmd.syncTime(), { silent: true }); };
qs('#ctl-rotate').onclick = async () => { if (await requireDevice()) await ble.write(cmd.rotate180(true), { silent: true }); };
qs('#ctl-indicator').onclick = async () => { if (await requireDevice()) await ble.write(cmd.timeIndicator(true), { silent: true }); };
qs('#ctl-reset').onclick = async () => { if (await requireDevice()) await ble.write(cmd.reset(), { silent: true }); };
qs('#ctl-wipe').onclick = async () => { if (await requireDevice()) await ble.write(cmd.deleteMaterials(), { silent: true }); };
qs('#ctl-verify').onclick = async () => {
  const raw = qs('#ctl-pin').value;
  if (raw.length !== 6) return warn('PIN must be 6 digits (three 2-digit pairs, 0-99 each).');
  if (await requireDevice()) {
    await ble.write(cmd.verifyPwd(raw.split(/(\d\d)/).filter(Boolean).map(Number)), { silent: true });
    log('PIN sent.');
  }
};

// ---------- shared ----------
async function requireDevice () {
  if (!ble.connected) {
    warn('Not connected — click Connect first');
    return false;
  }
  return true;
}
function warn (m) { log('⚠ ' + m); }

async function pushMaterial (channel, body, fmt, secs, label) {
  const data = body instanceof Uint8Array ? body : new Uint8Array(body);
  if (data.length === 0) return warn('Nothing to send');
  const frames = buildBodyBlocks(channel, data, { fmt, seconds: secs });
  log(`${label}: ${data.length} bytes → ${frames.length} 4 kB block(s)`);
  try {
    await ble.uploadMaterial(frames, {
      onProgress: (done, total) => progress(true, Math.round(done / total * 100), `${label} upload`)
    });
    progress(false);
    log(`${label} sent successfully.`);
  } catch (e) {
    progress(false);
    log(`${label} upload failed: ${e.message}`);
    warn(`${label} upload failed: ${e.message}`);
  }
}

// init
syncCanvases();
renderTextPreview();
log('Ready. Connect your iDotMatrix display to begin.');
