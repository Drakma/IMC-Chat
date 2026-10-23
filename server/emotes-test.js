'use strict';
// The emote lists against a fake Twitch, 7TV, BetterTTV and FrankerFaceZ: nothing leaves this PC. Run: node emotes-test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), createEmotes = require('./emotes'), createTwitch = require('./twitch');

const hits = [];
const fake = async (url) => {
  hits.push(url); const j = (v, ok) => ({ ok: ok !== false, status: ok === false ? 404 : 200, json: async () => v });
  if (url === 'https://7tv.io/v3/emote-sets/global') return j({ emotes: [{ name: 'EZ', data: { host: { url: '//cdn.7tv.app/emote/g1' }, flags: 0 } }, { name: 'Wide', data: { host: { url: '//cdn.7tv.app/emote/g2' }, flags: 256 } }] });
  if (url === 'https://7tv.io/v3/users/twitch/11') return j({ emote_set: { emotes: [{ name: 'AliceHype', data: { host: { url: '//cdn.7tv.app/emote/c1' }, flags: 0 } }, { name: 'EZ', data: { host: { url: '//cdn.7tv.app/emote/c2' }, flags: 0 } }] } });
  if (url === 'https://api.betterttv.net/3/cached/emotes/global') return j([{ id: 'b1', code: 'OMEGALUL' }]);
  if (url === 'https://api.betterttv.net/3/cached/users/twitch/11') return j({ channelEmotes: [{ id: 'b2', code: 'aliceBTTV' }], sharedEmotes: [{ id: 'b3', code: 'bad name!' }] });
  if (url === 'https://api.frankerfacez.com/v1/set/global') return j({ sets: { 3: { emoticons: [{ name: 'ZrehplaR', urls: { 1: '//cdn.frankerfacez.com/a/1', 2: '//cdn.frankerfacez.com/a/2' } }] } } });
  if (url === 'https://api.frankerfacez.com/v1/room/id/11') return j({}, false);   // a site that is down adds nothing
  return j({}, false);
};
(async () => {
  const E = createEmotes({ fetch: fake }), list = await E.forChannel('11'), by = Object.fromEntries(list.map((e) => [e.n, e]));
  assert.equal(by.AliceHype.u, 'https://cdn.7tv.app/emote/c1/2x.webp'); assert.equal(by.EZ.u, 'https://cdn.7tv.app/emote/c2/2x.webp', 'the channel version wins over the global one'); assert.equal(by.Wide, undefined, 'zero-width emotes are left out');
  assert.equal(by.OMEGALUL.u, 'https://cdn.betterttv.net/emote/b1/2x'); assert.ok(by.aliceBTTV); assert.equal(by['bad name!'], undefined, 'odd names are refused'); assert.equal(by.ZrehplaR.u, 'https://cdn.frankerfacez.com/a/2'); assert.equal(by.ZrehplaR.g, 'f');
  const n = hits.length; await E.forChannel('11'); assert.equal(hits.length, n, 'cached for an hour'); await E.forChannel('12'); assert.ok(hits.filter((u) => u.includes('emote-sets/global')).length === 1, 'the global lists are fetched once');

  // Twitch's own: the channel's, the ones you own, the global ones
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imc-emo-')); const scopes = ['user:read:chat', 'user:write:chat', 'user:read:emotes'];
  fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: Date.now() + 1e7, user_id: '99', login: 'mememe', scopes })); fs.writeFileSync(path.join(dir, 'channels.json'), JSON.stringify([{ login: 'alice', id: '11', name: 'Alice' }]));
  const em = (name, owner) => ({ name, owner_id: owner, images: { url_2x: 'https://static-cdn.jtvnw.net/' + name + '/2' } }); let userCalls = 0;
  const helix = async (url) => {
    const u = url.replace('https://api.twitch.tv/helix', ''), j = (data, cursor) => ({ ok: true, status: 200, json: async () => ({ data, pagination: cursor ? { cursor } : {} }) });
    if (u.startsWith('/chat/emotes?broadcaster_id=11')) return j([em('aliceSub', '11'), em('aliceFollow', '11')]);
    if (u.startsWith('/chat/emotes/global')) return j([em('Kappa', '0'), em('PogChamp', '0')]);
    if (u.startsWith('/chat/emotes/user?user_id=99&broadcaster_id=11')) { userCalls++; return u.includes('after=') ? j([em('zedSub', '55')]) : j([em('aliceSub', '11'), em('Kappa', '0')], 'next'); }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const T = createTwitch({ dir, clientId: 'c', fetch: helix, WebSocket: function () {}, thirdParty: E.forChannel });
  const all = await T.emotes('alice'), g = (k) => all.filter((e) => e.g === k).map((e) => e.n);
  assert.deepEqual(g('c'), ['aliceSub'], 'only the channel emotes you can use'); assert.deepEqual(g('m'), ['zedSub'], 'yours from other channels (the pages are followed)');
  assert.deepEqual(g('g'), ['Kappa', 'PogChamp']); assert.ok(g('7').includes('AliceHype') && g('b').includes('OMEGALUL')); assert.equal(userCalls, 2); await T.emotes('alice'); assert.equal(userCalls, 2, 'cached');
  await assert.rejects(T.emotes('nobody'), /Join that channel first/);
  // without the permission every channel emote is listed
  fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: Date.now() + 1e7, user_id: '99', login: 'mememe', scopes: ['user:read:chat'] }));
  const T2 = createTwitch({ dir, clientId: 'c', fetch: helix, WebSocket: function () {} }); const base = await T2.emotes('alice'); assert.deepEqual(base.filter((e) => e.g === 'c').map((e) => e.n), ['aliceSub', 'aliceFollow']); assert.equal(T2.status().needsModScopes, true);
  console.log('emotes test passed'); process.exit(0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
