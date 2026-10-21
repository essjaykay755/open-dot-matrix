'use strict';

import { UUIDS, isMaterialAck, isDiyAck } from './protocol.js';

// WebBluetooth transport (works in Electron on Windows/macOS/Linux).
// Mirrors the phone stack: write fa02, subscribe every notify/indicate char in
// services fa00 + ae00, 509/18-byte MTU chunking, pacing, ack tracking.

const EVT = {
  deviceInfo: 'deviceinfo',
  notify: 'notify',
  status: 'status',
  ack: 'ack'
};

export class Ble {
  constructor () {
    this.device = null;
    this.server = null;
    this.writeChar = null;
    this.notifying = [];
    this.listeners = {};
    this.connected = false;
    this.info = null;
    this.mtu = 18; // conservative until a 509 write succeeds (phone does the same)
  }

  on (evt, fn) { this.listeners[evt] = this.listeners[evt] || []; this.listeners[evt].push(fn); }
  emit (evt, ...argv) { (this.listeners[evt] || []).forEach(fn => { try { fn(...argv); } catch (e) { console.error(e); } }); }
  status (msg) { this.emit(EVT.status, msg); }

  async requestDevice () {
    this.status(tr('Scanning… choose your iDot device in the dialog.'));
    // acceptAllDevices + optionalServices lets any device be picked; we
    // validate services at connect (phone filters by ADV "TR\0", unavailable
    // through WebBluetooth advertising exposure).
    const dt = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [UUIDS.service, UUIDS.otaService]
    });
    this.device = dt;
    dt.addEventListener('gattserverdisconnected', () => {
      this.connected = false; this.notifying = []; this.info = null;
      this.status(tr('Device disconnected.'));
      this.emit('disconnected');
    });
    return dt;
  }

  async connect () {
    if (!this.device) throw new Error('No device selected.');
    this.status(tr('Connecting…'));
    this.server = await this.device.gatt.connect();
    // locate write char: fa02, fall back to ae01
    let svc = null;
    try { svc = await this.server.getPrimaryService(UUIDS.service); } catch (_) { /* no fa00 */ }
    if (svc) {
      try { this.writeChar = await svc.getCharacteristic(UUIDS.write); } catch (_) { /* keep null */ }
    }
    if (!this.writeChar) {
      try {
        const ota = await this.server.getPrimaryService(UUIDS.otaService);
        this.writeChar = await ota.getCharacteristic(UUIDS.otaWrite);
      } catch (_) { /* keep null */ }
    }
    if (!this.writeChar) throw new Error('Writable characteristic (fa02 / ae01) not found.');

    // subscribe ALL notify|indicate chars across fa00 ∪ ae00 (BleRequestImpl:670-712)
    this.notifying = [];
    for (const su of [UUIDS.service, UUIDS.otaService]) {
      let service = null;
      try { service = await this.server.getPrimaryService(su); } catch (_) { continue; }
      const chars = await service.getCharacteristics();
      for (const c of chars) {
        if ((c.properties.notify || c.properties.indicate) && !c.properties.broadcast) {
          try {
            await c.startNotifications();
            c.addEventListener('characteristicvaluechanged', ev => this._onNotify(ev));
            this.notifying.push(c.uuid);
          } catch (e) { console.warn('notify fail', c.uuid, e); }
        }
      }
    }
    this.connected = true;
    this.status(tr('Connected. Notifications on %1 chars.', this.notifying.length));
  }

  _onNotify (ev) {
    const dv = ev.target.value;
    const bytes = new Uint8Array(dv.buffer ? dv.buffer : dv);
    this.emit(EVT.notify, bytes);
    const info = require_device_info(bytes);
    if (info) { this.info = info; this.emit(EVT.deviceInfo, info); }
    // material finish acks (parseDataFinish) & DIY acks
    for (const ch of [[2, 0], [1, 0], [3, 0]]) {
      if (isMaterialAck(ch, bytes)) this.emit(EVT.ack, { channel: ch, frame: bytes });
    }
    if (isDiyAck(bytes)) this.emit(EVT.ack, { diy: true, frame: bytes });
  }

  async write (bytes, { silent } = {}) {
    if (!this.writeChar) throw new Error('Not connected.');
    await this.writeChar.writeValueWithResponse(bytes.slice(0));
    if (!silent) this.status(tr('Wrote %1 bytes.', bytes.length));
  }

  async writeChunks (flatten, chunkSize, delayMs, onProgress) {
    const n = Math.ceil(flatten.length / chunkSize);
    for (let i = 0; i < n; i++) {
      const part = flatten.subarray(i * chunkSize, Math.min((i + 1) * chunkSize, flatten.length));
      await this.writeChar.writeValueWithResponse(part.slice(0));
      if (onProgress) onProgress(i + 1, n);
      if (i < n - 1) await delay(delayMs);
    }
  }

  // full material upload = block frames + MTU + pacing (ImageAgreement pipeline)
  async uploadMaterial (blockFrames, { chunkSize, delayMs = 20, onProgress } = {}) {
    let size = chunkSize !== undefined ? chunkSize : await this._probeChunkSize(blockFrames);
    const all = new Uint8Array(blockFrames.reduce((n, f) => n + f.length, 0));
    let o = 0;
    for (const f of blockFrames) { all.set(f, o); o += f.length; }
    return this.writeChunks(all, size, delayMs, onProgress);
  }

  async _probeChunkSize (blockFrames) {
    const first = blockFrames[0];
    // try the fast path first (MTU 512 like the app); fall back to 18 bytes
    try {
      await this.writeChar.writeValueWithResponse(first.slice(0, Math.min(509, first.length)).slice(0));
      // First chunk went through → continue rest of that block at 509.
      const rest = first.subarray(Math.min(509, first.length));
      if (rest.length) await this.write(rest, { silent: true });
      return 509;
    } catch (_) {
      await this.write(first, { silent: true });
      return 18;
    }
  }

  async disconnect () { if (this.device) await this.device.gatt.disconnect(); this.connected = false; }
}

function delay (ms) { return new Promise(r => setTimeout(r, ms)); }

// device info may push its own frame after notify enable (MainActivity parse)
function require_device_info (b) {
  if (b.length >= 9 && b[2] === 0x01 && b[3] === 0x80) {
    return { fwMajor: b[4], fwMinor: b[5], unknown: b[6], screenType: b[7], pwdFlag: b[8] };
  }
  return null;
}
