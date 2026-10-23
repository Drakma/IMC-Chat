# IMC-Chat

A Twitch chat client for Windows, in the same style as [ItMeCasey Stream](https://github.com/Drakma/ItMeCasey-Stream): a tray app with a local Node server (no dependencies) and a retro window. **Join any channel**, read and send chat, with tabs, emotes, replies and mention highlights. Free, GPL-3.0.

## Use it
1. Install and open IMC-Chat (or `cd app && npm install && npm start`).
2. Press **Connect Twitch**, open the link, type the code. The login works like Stream's (device code): the app never sees your password.
3. Type a channel name (or paste a twitch.tv link) in the box at the top and press **Join**. Each channel is a tab; a dot shows new messages (red = someone said your name).

## What is in the window
- **Chat:** emotes, Twitch badges (hover for the name), GIFs, replies, mention highlights, and the Twitch events: subs, resubs, gifts, raids, cheers, first messages and announcements (in their colour).
- **Hover a name** for a card: picture, badges, account age, bio (and the moderator buttons where you are a moderator).
- **Tabs:** horizontal or vertical (settings), drag to reorder. Your channels, their order, the open tab and every setting are remembered between sessions.
- **Settings (gear):** font (IMC Sans, IMC Serif, IMC Dyslexia or your system font), size, weight (Thin to Black), and 9 themes: Forge, Midnight, Ember (dark), Dusk, Slate, Moss (mid), Cream, Paper, Sky (light).
- **Moderator tools:** in channels where you are a mod (and your own) the tab gets a sword. Hover a message to delete, timeout 10 minutes or ban; the name card has 1m/10m/1h/1d, ban and unban; the bar above the message box switches slow, followers, subs-only, emote-only and unique chat on and off, and clears the chat. Reconnect Twitch once after updating to grant the permissions.
- Twitch gives viewers no way to vote in polls or predictions from outside twitch.tv, and only a channel's owner can follow them, so IMC-Chat does not show them.

## Fonts
`_build/make_fonts.py` draws the three typefaces from stroke skeletons: nine weights each, upright and italic, with the Latin accents. Run it to rebuild `server/public/fonts/`.

## Where things are
- `server/twitch.js`: login, channels, one EventSub connection for all chats (tested by `node server/twitch-test.js`).
- `server/server.js`: the local server (port 8430, this PC only). `server/public/index.html`: the chat window.
- `app/`: the Electron shell (tray, window, restarts the server if it stops).
- Your login and channel list are in the app's data folder (tray menu: *Open my data folder*), never in the repository.

## Develop
```
npm install && npm run lint && npm test
cd app && npm install && npm start
```
