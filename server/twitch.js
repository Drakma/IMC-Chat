'use strict';
/**
 * IMC-Chat's Twitch side: login (device code, like ItMeCasey Stream), the channels you joined, and one EventSub connection that carries
 * the chat of all of them. Polls and predictions are only offered by Twitch to the channel's owner, so they come from your own channel only.
 */
const fs = require('node:fs');
const path = require('node:path');

const SCOPES = ['user:read:chat', 'user:write:chat', 'channel:read:polls', 'channel:read:predictions', 'user:read:emotes'];
const OWN_ONLY = [['channel.poll.begin', '1'], ['channel.poll.progress', '1'], ['channel.poll.end', '1'], ['channel.prediction.begin', '1'], ['channel.prediction.progress', '1'], ['channel.prediction.lock', '1'], ['channel.prediction.end', '1']];

module.exports = function createTwitch(ctx) {
  const log = ctx.log || (() => {}), doFetch = ctx.fetch || ((...a) => fetch(...a)), WS = ctx.WebSocket || globalThis.WebSocket, now = ctx.now || Date.now, emit = ctx.emit || (() => {});
  const ID = ctx.idUrl || 'https://id.twitch.tv/oauth2', HELIX = ctx.helixUrl || 'https://api.twitch.tv/helix', WSURL = ctx.eventsubUrl || 'wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30';
  const TOK = path.join(ctx.dir, 'tokens.json'), CH = path.join(ctx.dir, 'channels.json');
  const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
  const write = (f, v) => { try { fs.mkdirSync(ctx.dir, { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2)); } catch (e) { log('could not save', path.basename(f), e.message); } };
  let tokens = read(TOK, null), channels = read(CH, []), device = null, auth = { status: tokens ? 'ok' : 'none', message: tokens ? 'Logged in as ' + tokens.login : 'Not connected' };
  let ws = null, session = '', subs = new Map(), ready = false, pending = new Set(), ka = null, closed = false;   // subs: key "type|channelId" -> subscription id
  const history = new Map(), live = { poll: null, prediction: null }, badgeCache = new Map();   // badgeCache: 'global' or a channel id -> { 'set/version': image url }

  const form = (o) => new URLSearchParams(o).toString();
  async function idPost(ep, body) { const r = await doFetch(ID + ep, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(body) }); return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) }; }
  const status = () => ({ auth, login: tokens ? tokens.login : '', userId: tokens ? tokens.user_id : '', device: device && { code: device.user_code, url: device.verification_uri }, connected: ready, channels: channels.slice(), poll: live.poll, prediction: live.prediction });
  const changed = () => emit('status', status());

  // ---------------------------------------------------------------- login
  async function startLogin() {
    if (!ctx.clientId) throw new Error('No Twitch Client ID');
    if (device && now() < device.expires) return status();   // a code is already waiting: do not make a new one
    const r = await idPost('/device', { client_id: ctx.clientId, scopes: SCOPES.join(' ') });
    if (!r.ok) throw new Error('Twitch refused the request: ' + (r.json.message || r.status));
    device = { user_code: r.json.user_code, verification_uri: r.json.verification_uri, expires: now() + r.json.expires_in * 1000 };
    auth = { status: 'pending', message: 'Open the link and enter the code' }; poll(r.json.device_code, (r.json.interval || 5) * 1000); changed(); return status();
  }
  async function poll(code, every) {
    while (device && now() < device.expires) {
      await (ctx.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))))(every);
      const r = await idPost('/token', { client_id: ctx.clientId, scopes: SCOPES.join(' '), device_code: code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
      if (r.ok) {
        const v = await doFetch(ID + '/validate', { headers: { Authorization: 'OAuth ' + r.json.access_token } }).then((x) => x.json()).catch(() => ({}));
        tokens = { access_token: r.json.access_token, refresh_token: r.json.refresh_token, expires_at: now() + (r.json.expires_in || 14400) * 1000, user_id: v.user_id, login: v.login, scopes: r.json.scope };
        write(TOK, tokens); device = null; auth = { status: 'ok', message: 'Logged in as ' + tokens.login }; log('login ok:', tokens.login); changed(); connect(); return;
      }
      if (!/authorization_pending|slow_down/i.test(r.json.message || '')) { auth = { status: 'error', message: 'Login failed: ' + (r.json.message || r.status) }; device = null; return changed(); }
    }
    if (device) { device = null; auth = { status: 'error', message: 'Login code expired: press Connect again' }; changed(); }
  }
  let refreshing = null;
  const refresh = () => refreshing || (refreshing = (async () => {
    const r = await idPost('/token', { client_id: ctx.clientId, grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
    if (!r.ok) { auth = { status: 'error', message: 'Session expired: press Connect again' }; changed(); throw new Error('refresh failed'); }
    tokens = Object.assign({}, tokens, { access_token: r.json.access_token, refresh_token: r.json.refresh_token || tokens.refresh_token, expires_at: now() + (r.json.expires_in || 14400) * 1000 }); write(TOK, tokens);
  })().finally(() => { refreshing = null; }));
  async function helix(method, p, body, retry = true) {
    if (!tokens) throw new Error('Not logged in');
    if (tokens.expires_at - now() < 300000) await refresh();
    const r = await doFetch(HELIX + p, { method, headers: { 'Client-Id': ctx.clientId, Authorization: 'Bearer ' + tokens.access_token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 && retry) { await refresh(); return helix(method, p, body, false); }
    return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) };
  }
  function logout() { closeWs(); tokens = null; subs.clear(); try { fs.unlinkSync(TOK); } catch (e) { /* none */ } auth = { status: 'none', message: 'Not connected' }; changed(); }

  // ---------------------------------------------------------------- badges
  async function loadBadges(id) {
    if (badgeCache.has(id)) return;
    const r = await helix('GET', '/chat/badges' + (id === 'global' ? '/global' : '?broadcaster_id=' + id)).catch(() => null), map = {};
    for (const set of (r && r.json.data) || []) for (const v of set.versions || []) map[set.set_id + '/' + v.id] = v.image_url_2x || v.image_url_1x;
    if (r && r.ok) badgeCache.set(id, map);
  }
  /** the badge pictures for one channel: its own (subscriber, bits) over the global ones */
  async function badges(channel) {
    const c = channels.find((x) => x.login === clean(channel)); await loadBadges('global'); if (c) await loadBadges(c.id);
    return Object.assign({}, badgeCache.get('global'), c && badgeCache.get(c.id));
  }

  // ---------------------------------------------------------------- channels
  const clean = (x) => String(x || '').trim().replace(/^#/, '').replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '').split(/[/?\s]/)[0].toLowerCase();
  async function join(name) {
    const login = clean(name); if (!/^[a-z0-9_]{3,25}$/.test(login)) throw new Error('That is not a channel name');
    if (channels.some((c) => c.login === login)) return status();
    const r = await helix('GET', '/users?login=' + login); const u = r.json.data && r.json.data[0]; if (!u) throw new Error('No channel called ' + login);
    channels.push({ login: u.login, id: u.id, name: u.display_name }); write(CH, channels); if (ready) await subscribeChannel(channels[channels.length - 1]); changed(); return status();
  }
  async function leave(name) {
    const login = clean(name), c = channels.find((x) => x.login === login); if (!c) return status();
    channels = channels.filter((x) => x !== c); write(CH, channels); history.delete(login);
    for (const [k, id] of Array.from(subs)) if (k.endsWith('|' + c.id)) { subs.delete(k); helix('DELETE', '/eventsub/subscriptions?id=' + id).catch(() => {}); }
    changed(); return status();
  }
  async function sub(type, version, condition) {
    const k = type + '|' + condition.broadcaster_user_id; if (subs.has(k)) return;
    const r = await helix('POST', '/eventsub/subscriptions', { type, version, condition, transport: { method: 'websocket', session_id: session } });
    if (r.ok && r.json.data && r.json.data[0]) subs.set(k, r.json.data[0].id); else log('subscription', type, 'refused:', (r.json && r.json.message) || r.status);
  }
  async function subscribeChannel(c) {
    const me = tokens.user_id;
    await sub('channel.chat.message', '1', { broadcaster_user_id: c.id, user_id: me });
    await sub('channel.chat.message_delete', '1', { broadcaster_user_id: c.id, user_id: me });
    await sub('channel.chat.clear_user_messages', '1', { broadcaster_user_id: c.id, user_id: me });
    await sub('channel.chat.clear', '1', { broadcaster_user_id: c.id, user_id: me });
    if (c.id === me) for (const [t, v] of OWN_ONLY) await sub(t, v, { broadcaster_user_id: me });   // only the owner of a channel can follow its polls and predictions
  }

  // ---------------------------------------------------------------- EventSub
  function closeWs() { closed = true; ready = false; clearTimeout(ka); if (ws) { try { ws.close(); } catch (e) { /* gone */ } } ws = null; }
  function connect(url) {
    if (!tokens || !WS) return;
    if (!url) { closeWs(); subs.clear(); }
    closed = false; const w = new WS(url || WSURL); const old = ws; if (url) pending.add(w); else ws = w;
    const watchdog = () => { clearTimeout(ka); ka = setTimeout(() => { log('chat connection went quiet; reconnecting'); if (!closed) { ready = false; changed(); try { w.close(); } catch (e) { /* gone */ } } }, 40000); if (ka.unref) ka.unref(); };
    w.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; } watchdog();
      const t = m.metadata && m.metadata.message_type;
      if (t === 'session_welcome') {
        session = m.payload.session.id;
        if (url) { pending.delete(w); ws = w; try { old && old.close(); } catch (e) { /* gone */ } }   // moved to a new address: the subscriptions came along
        else Promise.all(channels.map((c) => subscribeChannel(c))).then(() => { ready = true; changed(); }).catch((e) => log('subscribe failed:', e.message));
        if (url) { ready = true; changed(); }
      } else if (t === 'session_reconnect') connect(m.payload.session.reconnect_url);
      else if (t === 'notification') onEvent(m.metadata.subscription_type, m.payload.event);
    };
    w.onclose = () => { if (ws !== w || closed) return; ready = false; subs.clear(); changed(); setTimeout(() => { if (!closed && tokens) connect(); }, ctx.retryMs || 5000); };
    w.onerror = () => {};
  }

  // ---------------------------------------------------------------- events
  function onEvent(type, e) {
    if (type === 'channel.chat.message') {
      const ch = e.broadcaster_user_login, me = tokens && tokens.login;
      const m = { id: e.message_id, channel: ch, uid: e.chatter_user_id, login: e.chatter_user_login, name: e.chatter_user_name || e.chatter_user_login, color: e.color || '', badges: (e.badges || []).map((b) => b.set_id + '/' + b.id),
        frags: ((e.message && e.message.fragments) || [{ type: 'text', text: (e.message && e.message.text) || '' }]).map((f) => ({ type: f.type, text: f.text, id: f.emote ? f.emote.id : undefined })),
        text: (e.message && e.message.text) || '', kind: e.message_type || 'text', ts: now(), mention: !!me && new RegExp('(^|\\W)@?' + me + '(\\W|$)', 'i').test((e.message && e.message.text) || ''),
        reply: e.reply ? { name: e.reply.parent_user_name, text: String(e.reply.parent_message_body || '').slice(0, 100) } : null, mine: !!tokens && e.chatter_user_id === tokens.user_id };
      const list = history.get(ch) || []; list.push(m); if (list.length > 300) list.shift(); history.set(ch, list); emit('chat', m);
    } else if (type === 'channel.chat.message_delete') {
      for (const m of history.get(e.broadcaster_user_login) || []) if (m.id === e.message_id) m.gone = true; emit('chatmod', { channel: e.broadcaster_user_login, type: 'delete', id: e.message_id });
    } else if (type === 'channel.chat.clear_user_messages') {
      for (const m of history.get(e.broadcaster_user_login) || []) if (m.uid === e.target_user_id) m.gone = true; emit('chatmod', { channel: e.broadcaster_user_login, type: 'clearUser', uid: e.target_user_id });
    } else if (type === 'channel.chat.clear') {
      history.delete(e.broadcaster_user_login); emit('chatmod', { channel: e.broadcaster_user_login, type: 'clear' });
    } else if (type.startsWith('channel.poll.')) {
      live.poll = type.endsWith('.end') ? Object.assign({}, e, { done: true }) : e; changed();
    } else if (type.startsWith('channel.prediction.')) {
      live.prediction = type.endsWith('.end') ? Object.assign({}, e, { done: true }) : e; changed();
    }
  }
  async function send(channel, text, replyTo) {
    const c = channels.find((x) => x.login === clean(channel)); if (!c) throw new Error('Join that channel first');
    text = String(text || '').trim().slice(0, 500); if (!text) throw new Error('Nothing to send');
    const r = await helix('POST', '/chat/messages', Object.assign({ broadcaster_id: c.id, sender_id: tokens.user_id, message: text }, replyTo ? { reply_parent_message_id: String(replyTo) } : {}));
    const d = r.json.data && r.json.data[0];
    if (!r.ok) throw new Error(r.json.message || 'Twitch refused the message');
    if (d && d.is_sent === false) throw new Error((d.drop_reason && d.drop_reason.message) || 'The message was not sent'); return { ok: true };
  }
  return { startLogin, logout, join, leave, send, connect: () => connect(), status, badges, history: (ch) => (history.get(clean(ch)) || []).filter((m) => !m.gone), onEvent, stop: closeWs };
};
