'use strict';

// ---------------------------------------------------------------------------
// iDotMatrix BLE protocol — ported from decompiled com.tech.idotmatrix 2.1.7
// Evidence: see PROTOCOL.md (file:line citations of re/jadx-out sources).
// ---------------------------------------------------------------------------

export const SVC_APP = 0xfa00;
export const UUIDS = {
  service: '0000fa00-0000-1000-8000-00805f9b34fb',
  write: '0000fa02-0000-1000-8000-00805f9b34fb',
  otaService: '0000ae00-0000-1000-8000-00805f9b34fb',
  otaWrite: '0000ae01-0000-1000-8000-00805f9b34fb',
  otaNotify: '0000ae02-0000-1000-8000-00805f9b34fb'
};

// AppData.setLedType — screenType byte -> [w, h]
export const LED_TYPES = {
  1: [16, 16], 2: [8, 32], 3: [32, 32], 4: [64, 64],
  6: [24, 48], 7: [16, 32], 11: [16, 64], 12: [16, 48]
};

// DiyImageFun modes (enterDiy arg)
export const DIY_FUN = { QUIT_NO_SAVE: 0, ENTER_CLEAR: 1, QUIT_KEEP_SHOWN: 2, ENTER_KEEP: 3 };
// DiyImageMoveType (paint packet option byte)
export const DIY_MOVE = { NO_EFFECT: 0, HORIZONTAL_MIRROR: 1, VERTICAL_MIRROR: 2, OVERALL_MOVE: 3, ERASE: 4 };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

// IEEE CRC32 (CrcUtils.CRC32 in com.tiro.jlotalibrary.util)
export function crc32 (bytes, start = 0, end = bytes.length) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16le (v) { return [v & 0xff, (v >> 8) & 0xff]; }
function u16be (v) { return [(v >> 8) & 0xff, v & 0xff]; }
function u32le (v) { return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]; }

// --- simple frames: [len_lo, len_hi, cmd, arg, payload...] (SendCore.header / BleProtocolN) ---
export function simple (cmd, arg, payload = []) {
  const len = 4 + payload.length;
  return new Uint8Array([len & 0xff, (len >> 8) & 0xff, cmd & 0xff, arg & 0xff, ...payload]);
}

// --- system commands (BleProtocolN.java, all seen) ---
export const cmd = {
  getDevice: () => simple(0x01, 0x80),                                        // BaseSend.getLedType {4,0,1,-128}
  syncTime: (dt = new Date()) => {                                            // synchronizedTime {11,0,1,0x80,...}
    const yy = dt.getFullYear() % 100;
    const mm = dt.getMonth() + 1, dd = dt.getDate();
    const wd = dt.getDay() === 0 ? 7 : dt.getDay();
    return simple(0x01, 0x80, [yy, mm, dd, wd, dt.getHours(), dt.getMinutes(), dt.getSeconds()]);
  },
  reset: () => simple(0x03, 0x80, []),                                        // restDevice {4,0,3,0x80}
  brightness: (v) => simple(0x04, 0x80, [v & 0xff]),                          // setLight {5,0,4,0x80}
  setDiyFun: (mode) => simple(0x04, 0x01, [mode & 0xff]),                     // enterDiy/setDiyFunMode
  speed: (v) => simple(0x03, 0x01, [v & 0xff]),                               // sendSpeed
  rotate180: (on) => simple(0x06, 0x80, [on ? 1 : 0]),                        // setRotate180
  timeIndicator: (on) => simple(0x07, 0x80, [on ? 1 : 0]),                    // setTimeIndicator
  countdown: (h, m, s) => simple(0x08, 0x80, [h & 0xff, m & 0xff, s & 0xff]), // setCountDown
  chronograph: (mode) => simple(0x09, 0x80, [mode & 0xff]),                   // setSecondChronograph
  scoreboard: (left, right) => simple(0x0a, 0x80, [...u16be(left & 0xffff), ...u16be(right & 0xffff)]), // setScoreboard BE
  eco: (a, b, c, d, e, f) => simple(0x02, 0x80, [a, b, c, d, e, f]),          // setEco
  screenLight: (v) => simple(0x0f, 0x80, [v & 0xff]),                         // setScreenLight, 0xFF reads
  joint: (n) => simple(0x12, 0x80, [n & 0xff]),                               // sendJoint
  micType: (n) => simple(0x0b, 0x80, [n & 0xff]),
  clockMode: (mode, hourFmt, amPmFmt, data1, data2, data3) =>                 // sendClockMode {8,0,6,1,...}
    simple(0x06, 0x01, [
      (mode & 0x7f) | (hourFmt ? 0x80 : 0) | (amPmFmt ? 0x80 : 0),
      data1 & 0xff, data2 & 0xff, data3 & 0xff
    ]),
  switchplate: (on) => simple(0x07, 0x01, [on ? 1 : 0]),                      // sendSwitchplate
  rhythmColor: (r, g, b) => simple(0x02, 0x02, [r, g, b]),                    // sendColor (rhythm bg)
  rhythmStop: () => simple(0x00, 0x02, [0, 0]),                               // sendStopMicRhythm {6,0,0,2,0,0}
  deleteMaterials: () =>                                                      // Agreement.deleteDeviceMaterial
    new Uint8Array([17, 0, 0x02, 0x01, 12, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
  setPwd: (setMode, digits) => simple(0x04, 0x02, [setMode & 0xff, ...digits.slice(0, 3)]), // setPwd {8,0,4,2,...}
  verifyPwd: (digits) => simple(0x05, 0x02, digits.slice(0, 3))               // verifyPwd {7,0,5,2,...}
};

// --- live DIY paint (SendCore.sendDiyImageData, type 5) ---
export function diyFrame (moveType, rgb, points) {
  const body = [...rgb];
  for (const p of points) body.push(p[0], p[1]);
  const len = 5 + body.length;
  return new Uint8Array([len & 0xff, (len >> 8) & 0xff, 0x05, 0x01, moveType & 0xff, ...body]);
}

// --- material upload (ImageAgreement / GifAgreement / TextAgreement common shape) ---
// body -> 4096 block frames with BE packet length + MTU chunks.
const BLOCK = 4096;

export function buildBodyBlocks (channel, body, { fmt, seconds = 5 }) {
  const totalLen = u32le(body.length);
  const crc = u32le(crc32(body));
  const time = fmt === 12 ? [0, 0] : u16be(seconds & 0xffff); // fmt 12 => time 0,0 (seen in ImageAgreement/TextAgreement)
  const blocks = [];
  for (let off = 0; off < body.length; off += BLOCK) {
    const part = body.slice(off, Math.min(off + BLOCK, body.length));
    const pkt = new Uint8Array(16 + part.length);
    const pktLen = pkt.length;
    pkt[0] = (pktLen >> 8) & 0xff; pkt[1] = pktLen & 0xff; // BE length (short2Bytes swap, seen)
    pkt[2] = channel[0]; pkt[3] = channel[1];
    pkt[4] = off === 0 ? 0 : 2;
    pkt.set(totalLen, 5);
    pkt.set(crc, 9);
    pkt[13] = time[0]; pkt[14] = time[1];
    pkt[15] = fmt;
    pkt.set(part, 16);
    blocks.push(pkt);
  }
  return blocks;
}

export const CHANNEL_IMAGE = [0x02, 0x00]; // still image (ImageAgreement)
export const CHANNEL_GIF = [0x01, 0x00];   // animation material (GifAgreement)
export const CHANNEL_TEXT = [0x03, 0x00];  // text material (TextAgreement)

// --- text material body (TextAgreement.sendTextTo6464) ---
export function textBody (glyphs, opts) {
  // glyphs: [{bytes: Uint8Array(1bpp), tag: 7|8}]
  const out = [];
  out.push(...u16be(glyphs.length));            // char count BE
  out.push(0x01, 0x01);                          // cmd 01, arg 01
  out.push(opts.mode & 0xff);
  out.push(opts.speed & 0xff);
  out.push(opts.colorMode & 0xff);
  const c = opts.color;                          // {r,g,b}
  let b = c.b;
  if (c.r === 0 && c.g === 0) b = c.b === 0 ? 1 : c.b; // blue-0 quirk (seen)
  out.push(c.r, c.g, b);
  out.push(opts.bgMode & 0xff);
  out.push(opts.bg.r, opts.bg.g, opts.bg.b);
  for (const g of glyphs) {
    out.push(g.tag, 0xff, 0xff, 0xff);
    for (const x of g.bytes) out.push(x);
  }
  return new Uint8Array(out);
}

export function glyphTag (nbytes) { return nbytes === 256 ? 7 : 8; }

// parse device notifications (parseDataFinish / parseDiyDataFinish seen)
export function isMaterialAck (ch, b) {
  // [?, 0x00, cmd1, cmd2, 0x03] finish (ImageAgreement.parseDataFinish)
  return b.length >= 5 && b[1] === 0 && b[2] === ch[0] && b[3] === ch[1] && b[4] === 3;
}
export function isDiyAck (b) {
  return b.length >= 5 && b[0] === 0 && b[2] === 0 && b[3] === 0 && (b[4] === 1 || b[4] === 0);
}

// device info frame after connect (MainActivity parse: b[2]==1&&b[3]==0x80, b7=screenType)
export function parseDeviceInfo (b) {
  if (b.length < 9 || b[2] !== 0x01 || b[3] !== 0x80) return null;
  return {
    fwMajor: b[4], fwMinor: b[5], unknown: b[6],
    screenType: b[7], pwdFlag: b[8],
    raw: Array.from(b.slice(0, 9))
  };
}

// scale helpers
export function scaleBright (data, bright) { // SendCore.changeLight
  if (bright >= 100) return data;
  const out = new Uint8Array(data);
  for (let i = 0; i < out.length; i++) out[i] *= bright / 100;
  return out;
}
export function convertTime (sign) { // DeviceMaterialTimeConvert
  return sign === 1 ? 10 : sign === 2 ? 30 : sign === 3 ? 60 : sign === 4 ? 300 : 5;
}
