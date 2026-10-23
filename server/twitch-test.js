'use strict';
// The Twitch side against a fake Twitch: nothing leaves this PC. Run: node twitch-test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), createTwitch = require('./twitch');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imc-')), events = [], subsMade = [], deleted = [], sent = []; let polls = 0, wsLast = null;
const users = { alice: { id: '11', login: 'alice', display_name: 'Alice' }, mememe: { id: '99', login: 'mememe', display_name: 'Me' } };
const fake = async (url, opt) => {
  opt = opt || {}; const j = (v, st) => ({ ok: !st || st < 400, status: st || 200, json: async () => v }), u = url.replace('https://api.twitch.tv/helix', '').replace('https://id.twitch.tv/oauth2', '');
  if (u === '/device') return j({ device_code: 'dc', user_code: 'ABCD', verification_uri: 'https://twitch.tv/activate', expires_in: 600, interval: 1 });
  if (u === '/token') { if (opt.body.includes('device_code')) return ++polls < 2 ? j({ message: 'authorization_pending' }, 400) : j({ access_token: 'at', refresh_token: 'rt', expires_in: 14400, scope: ['user:read:chat'] }); return j({ access_token: 'at2', refresh_token: 'rt2', expires_in: 14400 }); }
  if (u === '/validate') return j({ user_id: '99', login: 'mememe' });
  if (u.startsWith('/users?login=')) { const x = users[u.split('=')[1]]; return j({ data: x ? [x] : [] }); }
  if (u === '/eventsub/subscriptions' && opt.method === 'POST') { const b = JSON.parse(opt.body); subsMade.push(b); return j({ data: [{ id: 's' + subsMade.length }] }); }
  if (u.startsWith('/eventsub/subscriptions?id=')) { deleted.push(u.split('=')[1]); return j({}); }
  if (u === '/chat/messages') { const b = JSON.parse(opt.body); sent.push(b); return j({ data: [b.message === 'blocked' ? { is_sent: false, drop_reason: { message: 'AutoMod held it' } } : { is_sent: true }] }); }
  return j({ message: 'unknown ' + u }, 404);
};
class FakeWS { constructor(url) { this.url = url; FakeWS.all.push(this); wsLast = this; } close() { this.closed = true; } } FakeWS.all = [];
const T = createTwitch({ dir, clientId: 'cid', fetch: fake, WebSocket: FakeWS, sleep: async () => {}, emit: (e, d) => events.push([e, d]), retryMs: 1 });
const msg = (type, e) => ({ metadata: { message_type: 'notification', subscription_type: type }, payload: { event: e } });
const chat = (o) => msg('channel.chat.message', Object.assign({ broadcaster_user_login: 'alice', message_id: 'm1', chatter_user_id: '5', chatter_user_login: 'bob', chatter_user_name: 'Bob', color: '#fff', badges: [{ set_id: 'moderator' }], message_type: 'text', message: { text: 'hi Mememe!', fragments: [{ type: 'text', text: 'hi Mememe!' }] } }, o));

(async () => {
  assert.equal(T.status().auth.status, 'none'); await assert.rejects(T.join('alice'), /Not logged in/);
  const s = await T.startLogin(); assert.equal(s.device.code, 'ABCD'); await new Promise((r) => setTimeout(r, 50));
  assert.equal(T.status().auth.status, 'ok'); assert.equal(T.status().login, 'mememe'); assert.ok(FakeWS.all.length >= 1, 'connects after login');
  const tok = JSON.parse(fs.readFileSync(path.join(dir, 'tokens.json'), 'utf8')); assert.equal(tok.refresh_token, 'rt');
  // joining: any channel works, and the name can be a link
  await assert.rejects(T.join('!!'), /not a channel name/); await assert.rejects(T.join('nobody1'), /No channel called/);
  const ws = wsLast; ws.onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 'sess1' } } }) }); await new Promise((r) => setTimeout(r, 20));
  assert.equal(subsMade.length, 0, 'nothing to subscribe to until a channel is joined');
  await T.join('https://www.twitch.tv/Alice'); assert.deepEqual(T.status().channels.map((c) => c.login), ['alice']);
  assert.deepEqual(subsMade.map((b) => b.type), ['channel.chat.message', 'channel.chat.message_delete', 'channel.chat.clear_user_messages', 'channel.chat.clear'], 'no poll subscriptions in someone else\'s channel');
  assert.deepEqual(subsMade[0].condition, { broadcaster_user_id: '11', user_id: '99' }); assert.equal(subsMade[0].transport.session_id, 'sess1');
  // your own channel also gets polls and predictions
  await T.join('mememe'); assert.ok(subsMade.some((b) => b.type === 'channel.poll.begin') && subsMade.some((b) => b.type === 'channel.prediction.end'));
  // chat
  ws.onmessage({ data: JSON.stringify(chat()) }); const m = events.filter((e) => e[0] === 'chat')[0][1]; assert.equal(m.channel, 'alice'); assert.equal(m.mention, true, 'your name was said'); assert.deepEqual(m.badges, ['moderator']);
  assert.equal(T.history('alice').length, 1);
  ws.onmessage({ data: JSON.stringify(msg('channel.chat.message_delete', { broadcaster_user_login: 'alice', message_id: 'm1' })) }); assert.equal(T.history('alice').length, 0, 'deleted messages leave the history'); assert.equal(events.filter((e) => e[0] === 'chatmod').length, 1);
  // polls and predictions
  ws.onmessage({ data: JSON.stringify(msg('channel.poll.progress', { title: 'Best?', choices: [{ id: 'a', title: 'A', votes: 3 }] })) }); assert.equal(T.status().poll.title, 'Best?');
  ws.onmessage({ data: JSON.stringify(msg('channel.poll.end', { title: 'Best?', choices: [] })) }); assert.equal(T.status().poll.done, true);
  ws.onmessage({ data: JSON.stringify(msg('channel.prediction.begin', { title: 'Win?', outcomes: [] })) }); assert.equal(T.status().prediction.title, 'Win?');
  // sending
  await T.send('alice', 'hello', 'm9'); assert.deepEqual(sent[0], { broadcaster_id: '11', sender_id: '99', message: 'hello', reply_parent_message_id: 'm9' });
  await assert.rejects(T.send('alice', 'blocked'), /AutoMod held it/); await assert.rejects(T.send('alice', '   '), /Nothing to send/); await assert.rejects(T.send('zed', 'x'), /Join that channel first/);
  // moving to a new Twitch address keeps the subscriptions
  const before = subsMade.length; ws.onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_reconnect' }, payload: { session: { reconnect_url: 'wss://new' } } }) }); const ws2 = wsLast; assert.equal(ws2.url, 'wss://new');
  ws2.onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 'sess2' } } }) }); await new Promise((r) => setTimeout(r, 20)); assert.equal(subsMade.length, before, 'not subscribed twice'); assert.ok(ws.closed, 'the old connection is closed');
  // leaving
  await T.leave('alice'); assert.equal(deleted.length, 4); assert.deepEqual(T.status().channels.map((c) => c.login), ['mememe']);
  // channels survive a restart
  const T2 = createTwitch({ dir, clientId: 'cid', fetch: fake, WebSocket: FakeWS }); assert.deepEqual(T2.status().channels.map((c) => c.login), ['mememe']); assert.equal(T2.status().auth.status, 'ok');
  T.stop(); console.log('twitch test passed'); process.exit(0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
