'use strict';
// Watching in VLC against a fake Streamlink: nothing is started. Run: node player-test.js
const assert = require('assert'), { EventEmitter } = require('events'), { PassThrough } = require('stream'), createPlayer = require('./player');

const have = new Set(['C:\\Program Files\\Streamlink\\bin\\streamlink.exe', 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe', 'D:\\mine\\player.exe', 'C:\\Program Files\\mpv\\mpv.exe']), calls = []; let mode = 'run';
const fake = (cmd, args, opt) => {
  calls.push({ cmd, args, opt }); const c = new EventEmitter(); c.stdout = new PassThrough(); c.stderr = new PassThrough(); c.unref = () => {};
  if (mode === 'offline') setImmediate(() => { c.stderr.write('[cli][error] No playable streams found on this URL: https://www.twitch.tv/x\n'); setImmediate(() => c.emit('exit', 1)); });
  if (mode === 'ok-exit') setImmediate(() => c.emit('exit', 0));
  return c;
};
const mk = (extra) => createPlayer(Object.assign({ spawn: fake, exists: (f) => have.has(f), env: { PATH: 'C:\\Windows', ProgramFiles: 'C:\\Program Files' }, waitMs: 80 }, extra));

(async () => {
  const P = mk(); assert.deepEqual(P.info(''), { streamlink: true, player: 'VLC', kind: 'vlc', mpv: true, vlc: true, winget: false, installing: '', installError: '' });
  const r = await P.play('Taylien', ''); assert.deepEqual(r, { ok: true, player: 'VLC', chromeless: true });
  const c = calls[0]; assert.equal(c.cmd, 'C:\\Program Files\\Streamlink\\bin\\streamlink.exe'); assert.deepEqual(c.args.slice(0, 2), ['--player', 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe']); assert.equal(c.args[c.args.length - 2], 'https://www.twitch.tv/taylien'); assert.equal(c.args[c.args.length - 1], 'best'); assert.equal(c.opt.shell, false, 'no shell: the channel name can not run anything');
  const pa = c.args.find((x) => x.startsWith('--player-args=')); assert.match(pa, /--no-video-deco/); assert.match(pa, /--video-on-top/); assert.match(pa, /--intf dummy/);
  await P.play('taylien', '', { style: 'normal' }); assert.ok(!calls[calls.length - 1].args.some((x) => x.startsWith('--player-args')), 'a normal window gets no extra options');
  const rm = await P.play('taylien', '', { pref: 'mpv' }); assert.equal(rm.player, 'mpv'); assert.match(calls[calls.length - 1].args.find((x) => x.startsWith('--player-args=')), /--no-border[\s\S]*--osc=yes/, 'mpv keeps its hover controls');
  calls.length = 0;
  await assert.rejects(P.play('bad name; calc', ''), /Unknown channel/); await assert.rejects(P.play('ab', ''), /Unknown channel/);
  assert.equal((await P.play('taylien', 'D:\\mine\\player.exe')).player, 'player', 'the player you chose'); assert.equal(calls[0].args[1], 'D:\\mine\\player.exe'); assert.ok(!calls[0].args.some((x) => x.startsWith('--player-args')), 'an unknown program gets no options');
  assert.equal((await P.play('taylien', 'D:\\nope\\x.exe')).player, 'VLC', 'a path that is missing falls back to VLC'); assert.equal((await P.play('taylien', 'D:\\mine\\player.txt')).player, 'VLC', 'only programs');
  mode = 'offline'; await assert.rejects(mk().play('taylien', ''), /The stream is offline/);
  mode = 'run'; await assert.rejects(createPlayer({ spawn: fake, exists: () => false, env: { PATH: '' } }).play('taylien', ''), /Streamlink is not installed/);
  const noPlayer = new Set(['C:\\Program Files\\Streamlink\\bin\\streamlink.exe']); await assert.rejects(mk({ exists: (f) => noPlayer.has(f) }).play('taylien', ''), /No video player found/);
  // the install button: winget runs once, and the result shows up in info()
  const inst = new Set(['C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe']); let ran = null, child = null; const env2 = { PATH: '', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', ProgramFiles: 'C:\\Program Files' };
  const have2 = new Set(inst); const I = createPlayer({ spawn: (cmd, args) => { ran = { cmd, args }; child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); return child; }, exists: (f) => have2.has(f), env: env2 });
  assert.deepEqual(I.info(''), { streamlink: false, player: '', kind: '', mpv: false, vlc: false, winget: true, installing: '', installError: '' });
  assert.deepEqual(await I.install(), { ok: true, installing: 'streamlink' }); assert.deepEqual(ran.args.slice(0, 3), ['install', '--id', 'Streamlink.Streamlink']); assert.ok(ran.args.includes('--silent')); assert.equal(I.info('').installing, 'streamlink');
  const calls2 = ran; await I.install(); assert.equal(ran, calls2, 'pressing it twice starts one install');
  have2.add('C:\\Program Files\\Streamlink\\bin\\streamlink.exe'); child.emit('exit', 0); assert.equal(I.info('').streamlink, true); assert.equal(I.info('').installing, ''); assert.equal((await I.install()).already, true);
  await I.install('mpv'); assert.equal(ran.args[2], 'shinchiro.mpv', 'mpv can be installed too'); child.emit('exit', 1); await assert.rejects(I.install('rm -rf'), /Unknown program/);
  const have3 = new Set(inst); const J = createPlayer({ spawn: () => { child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); return child; }, exists: (f) => have3.has(f), env: env2 }); await J.install(); child.stderr.write('Installer failed with exit code: 1603\n'); child.emit('exit', 1603);
  assert.equal(J.info('').streamlink, false); assert.match(J.info('').installError, /1603/); await assert.rejects(createPlayer({ spawn: fake, exists: () => false, env: { PATH: '' } }).install(), /winget/);
  console.log('player test passed');
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
