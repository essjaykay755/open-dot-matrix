'use strict';

// GIF89a encoder (LZW) — re-encodes resized frames so the device can decode
// them natively (the phone packs GIFs likewise: DiyAnimAddActivity → GIFUtils.makeGif2).

export function encodeGif (indexedFrames, w, h, frameDelayCs = 20, palette = null) {
  // indexedFrames: Array<Uint8Array> with palette indices 0..255 per pixel, row-major
  const pal = palette || [[255, 0, 0], [0, 255, 0], [0, 0, 255]]; // index0 must be set by caller; simple default only if no palette given
  const global = normalizePalette(pal);

  const out = [];
  const byte = (n) => out.push(n & 0xff);
  const wri = (s) => { for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff); };

  wri('GIF89a');
  uint16LE(out, w); uint16LE(out, h);
  byte(0xf5); // global color table flag=1, color resolution 7, sort=0, size=7 (256 entries)
  byte(0);    // background color index
  byte(0);    // pixel aspect ratio
  for (const c of global) { byte(c[0]); byte(c[1]); byte(c[2]); }

  // NETSCAPE2.0 loop ext
  byte(0x21, 0xff, 0x0b); wri('NETSCAPE2.0');
  byte(0x03, 0x01, 0x00, 0x00, 0x00); // loop forever

  const codeBits = 8;
  for (const idx of indexedFrames) {
    // graphic control ext
    byte(0x21, 0xf9, 0x04);
    byte(0x04); // disposal = 1 (do not dispose)
    byte(frameDelayCs & 0xff); byte((frameDelayCs >> 8) & 0xff);
    byte(0x00); byte(0x00);
    // image descriptor
    byte(0x2c);
    uint16LE(out, 0); uint16LE(out, 0); uint16LE(out, w); uint16LE(out, h);
    byte(0x00); // no local color table
    byte(codeBits);
    const lzw = lzwEncode(idx, codeBits);
    for (let i = 0; i < lzw.length; i += 255) {
      const n = Math.min(255, lzw.length - i);
      byte(n);
      for (let j = 0; j < n; j++) byte(lzw[i + j]);
    }
    byte(0x00); // block terminator
  }
  byte(0x3b);
  return new Uint8Array(out);
}

function uint16LE (out, v) { out.push(v & 0xff); out.push((v >> 8) & 0xff); }

function normalizePalette (palette) {
  const pal = [];
  for (let i = 0; i < 256; i++) {
    const c = palette[i] || [0, 0, 0];
    pal.push([c[0] & 0xff, c[1] & 0xff, c[2] & 0xff]);
  }
  return pal;
}

function lzwEncode (data, codeBits) {
  const clear = 1 << codeBits, eoi = clear + 1;
  let table = new Map();
  let size = eoi + 1;
  let codeLen = codeBits + 1;

  const bits = []; // compressed byte stream (we re-chunk outside)
  let acc = 0, nbits = 0;
  const put = (code) => {
    acc |= code << nbits; nbits += codeLen;
    while (nbits >= 8) { bits.push(acc & 0xff); acc >>>= 8; nbits -= 8; }
  };

  put(clear);
  let w = data[0];
  for (let i = 1; i < data.length; i++) {
    const k = data[i];
    const key = (w << 8) | k;
    if (table.has(key)) { w = table.get(key); continue; }
    put(w);
    if (size === (1 << codeLen) && codeLen < 12) codeLen++;
    if (size >= 4096) { put(clear); table = new Map(); size = eoi + 1; codeLen = codeBits + 1; }
    else table.set(key, size++);
    w = k;
  }
  put(w);
  put(eoi);
  if (nbits > 0) bits.push(acc & 0xff);
  return bits;
}
