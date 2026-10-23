'use strict';
/**
 * IMC-Chat's own player window: a normal resizable window with our own controls, and VLC drawing the video inside it.
 *  - the window (frame, title, resize) holds the control strip (the page /player.html);
 *  - a second, borderless window sits over the video area and VLC is told to draw into it (--drawable-hwnd);
 *  - Streamlink feeds VLC; VLC's own web interface (localhost, random port and password) is how the controls drive it.
 * The strip shows while the mouse moves over the window and hides after a few idle seconds, so the video gets the whole window.
 */
const { BrowserWindow, screen, ipcMain } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const crypto = require('node:crypto');
const net = require('node:net');

const BAR = 64, IDLE_MS = 3000, QUALITIES = ['best', '1080p60', '720p60', '720p', '480p', '360p', '160p', 'audio_only'];

module.exports = function createVlcWindows(o) {
  const wins = new Map();   // channel -> record

  const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  /** one call to VLC's web interface: returns its status, or null */
  const vlcReq = (port, pw, query) => new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port, path: '/requests/status.json' + (query ? '?' + query : ''), headers: { Authorization: 'Basic ' + Buffer.from(':' + pw).toString('base64') }, timeout: 1500 }, (res) => {
      let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve(null); } });
    });
    r.on('error', () => resolve(null)); r.on('timeout', () => { r.destroy(); resolve(null); }); r.end();
  });
  /** the qualities Streamlink can offer for a channel (it asks Twitch once) */
  const listQualities = (sl, login) => new Promise((resolve) => {
    let out = ''; let c; try { c = spawn(sl, ['--json', 'https://www.twitch.tv/' + login], { windowsHide: true, shell: false }); } catch (e) { return resolve([]); }
    const t = setTimeout(() => { try { c.kill(); } catch (e) { /* gone */ } resolve([]); }, 15000);
    c.stdout.on('data', (d) => { out += d; }); c.on('error', () => { clearTimeout(t); resolve([]); });
    c.on('exit', () => { clearTimeout(t); try { const names = Object.keys(JSON.parse(out).streams || {}); resolve(QUALITIES.filter((q) => names.includes(q))); } catch (e) { resolve([]); } });
  });
  const killTree = (pid) => { if (pid) { try { spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }); } catch (e) { /* gone */ } } };

  async function watch(channel, opt) {
    const login = String(channel || '').toLowerCase(); if (!/^[a-z0-9_]{3,25}$/.test(login)) throw new Error('Unknown channel');
    const have = wins.get(login); if (have && !have.host.isDestroyed()) { if (have.host.isMinimized()) have.host.restore(); have.host.show(); have.host.focus(); return { ok: true, player: 'VLC', again: true }; }
    const found = o.locate(opt && opt.playerPath, 'vlc'); if (!found.streamlink) throw new Error('Streamlink is not installed. Press Install Streamlink in Settings.');
    if (!found.player || found.player.kind !== 'vlc') throw new Error('VLC was not found. Install VLC (videolan.org), or choose another window style in Settings.');
    const port = await freePort(), pw = crypto.randomBytes(9).toString('hex');
    const host = new BrowserWindow({ width: 960, height: 540 + BAR, useContentSize: true, minWidth: 420, minHeight: 240 + BAR, backgroundColor: '#000000', title: '#' + login + ' - IMC-Chat', icon: o.icon, autoHideMenuBar: true, show: false,
      webPreferences: { preload: o.preload, contextIsolation: true, sandbox: true } });
    const video = new BrowserWindow({ parent: host, frame: false, show: false, focusable: false, skipTaskbar: true, resizable: false, movable: false, minimizable: false, maximizable: false, hasShadow: false, backgroundColor: '#000000' });
    const rec = { login, host, video, port, pw, bar: true, top: false, quality: (opt && opt.quality) || 'best', qualities: [], proc: null, ended: '', closing: false, vol: opt && Number.isFinite(opt.volume) ? opt.volume : 100, last: { x: -1, y: -1 }, moved: Date.now() };
    wins.set(login, rec);
    const place = () => {   // the video window covers the host's content area, minus the strip while it shows
      if (host.isDestroyed() || video.isDestroyed()) return; const cb = host.getContentBounds(), h = rec.bar && !rec.ended ? cb.height - BAR : cb.height;
      video.setBounds({ x: cb.x, y: cb.y, width: Math.max(40, cb.width), height: Math.max(40, h) });
    };
    const send = (d) => { if (!host.isDestroyed()) host.webContents.send('player:event', d); };
    const start = () => {
      killTree(rec.proc && rec.proc.pid); rec.ended = '';
      const hwnd = video.getNativeWindowHandle().readBigUInt64LE(0).toString();
      const pa = ['--drawable-hwnd=' + hwnd, '--no-video-title-show', '--intf', 'dummy', '--extraintf=http', '--http-host=127.0.0.1', '--http-port=' + port, '--http-password=' + pw, '--volume=' + Math.round(rec.vol * 2.56), '--no-qt-privacy-ask'].join(' ');
      let out = ''; const c = spawn(found.streamlink, ['--player', found.player.path, '--player-args=' + pa, '--title', '{author} - {title}', 'https://www.twitch.tv/' + login, rec.quality], { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      rec.proc = c; const grab = (d) => { if (out.length < 4000) out += String(d); }; c.stdout.on('data', grab); c.stderr.on('data', grab);
      c.on('exit', (code) => {
        if (rec.proc !== c || rec.closing) return; rec.ended = /offline|no playable streams|not found/i.test(out) ? 'The stream is offline' : code === 0 ? 'The stream ended' : (out.trim().split('\n').pop() || 'The player stopped').replace(/^\[cli\]\[error\]\s*/, '').slice(0, 160);
        if (!video.isDestroyed()) video.hide(); send({ type: 'state', ended: rec.ended }); place();
      });
      if (!video.isDestroyed()) video.showInactive(); place();
    };
    host.on('page-title-updated', (e) => e.preventDefault());   // the window keeps its channel title
    host.once('ready-to-show', () => { host.show(); place(); video.showInactive(); });
    ['resize', 'move', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen'].forEach((e) => host.on(e, place));
    host.on('minimize', () => { if (!video.isDestroyed()) video.hide(); }); host.on('restore', () => { if (!video.isDestroyed() && !rec.ended) video.showInactive(); place(); });
    const timer = setInterval(async () => {   // the strip follows the mouse; the state of VLC goes to the strip
      if (host.isDestroyed()) return; const pt = screen.getCursorScreenPoint(), b = host.getContentBounds(), inside = host.isVisible() && !host.isMinimized() && pt.x >= b.x && pt.x < b.x + b.width && pt.y >= b.y && pt.y < b.y + b.height;
      if (pt.x !== rec.last.x || pt.y !== rec.last.y) { rec.last = pt; rec.moved = Date.now(); }
      const overBar = rec.bar && inside && pt.y >= b.y + b.height - BAR, want = rec.ended ? true : inside && (Date.now() - rec.moved < IDLE_MS || overBar);
      if (want !== rec.bar) { rec.bar = want; send({ type: 'bar', show: want }); place(); }
      const st = rec.ended ? null : await vlcReq(port, pw, ''); if (host.isDestroyed()) return;
      send({ type: 'state', state: st ? st.state : rec.ended ? 'ended' : 'starting', volume: st ? Math.round(st.volume / 2.56) : rec.vol, top: host.isAlwaysOnTop(), full: host.isFullScreen(), quality: rec.quality, qualities: rec.qualities, ended: rec.ended });
    }, 800);
    host.on('closed', () => { rec.closing = true; clearInterval(timer); killTree(rec.proc && rec.proc.pid); if (!video.isDestroyed()) video.destroy(); wins.delete(login); });
    host.webContents.once('did-finish-load', () => { send({ type: 'init', channel: login, bar: BAR }); });
    await video.loadURL('data:text/html;charset=utf-8,<body style="background:%23000;margin:0"></body>'); host.loadURL(o.url() + 'player.html?channel=' + encodeURIComponent(login));
    start(); listQualities(found.streamlink, login).then((q) => { rec.qualities = q; });
    rec.restart = (q) => { rec.quality = q; start(); };
    return { ok: true, player: 'VLC' };
  }

  /** what the control strip asks for */
  async function command(wc, c) {
    const rec = Array.from(wins.values()).find((r) => !r.host.isDestroyed() && r.host.webContents.id === wc.id); if (!rec || !c) return null;
    const q = (x) => vlcReq(rec.port, rec.pw, x);
    switch (c.a) {
      case 'pause': return q('command=pl_pause');
      case 'volume': rec.vol = Math.max(0, Math.min(100, Math.round(Number(c.v) || 0))); return q('command=volume&val=' + Math.round(rec.vol * 2.56));
      case 'top': rec.host.setAlwaysOnTop(!rec.host.isAlwaysOnTop()); return null;
      case 'full': rec.host.setFullScreen(!rec.host.isFullScreen()); return null;
      case 'quality': if (QUALITIES.includes(c.q) && (rec.qualities.includes(c.q) || c.q === 'best')) rec.restart(c.q); return null;
      case 'chat': if (o.openChat) o.openChat(rec.login); return null;
      case 'retry': rec.restart(rec.quality); return null;
      case 'close': rec.host.close(); return null;
      default: return null;
    }
  }
  ipcMain.handle('player:cmd', (e, c) => command(e.sender, c));
  const closeAll = () => { for (const r of wins.values()) { r.closing = true; killTree(r.proc && r.proc.pid); } };
  return { watch, closeAll, wins };
};
