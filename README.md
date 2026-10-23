# IMC-Chat

A Twitch chat client for Windows, in the same style as [ItMeCasey Stream](https://github.com/Drakma/ItMeCasey-Stream): a tray app with a local Node server (no dependencies) and a retro window. **Join any channel**, read and send chat, with tabs, emotes, replies and mention highlights. Free, GPL-3.0.

## Use it
1. Install and open IMC-Chat (or `cd app && npm install && npm start`).
2. Press **Connect Twitch**, open the link, type the code. The login works like Stream's (device code): the app never sees your password.
3. Type a channel name (or paste a twitch.tv link) in the box at the top and press **Join**. Each channel is a tab; a dot shows new messages (red = someone said your name).

## Polls and predictions
Twitch only lets the owner of a channel follow its polls and predictions, and gives viewers **no way to vote from outside twitch.tv**. So IMC-Chat shows the polls and predictions of **your own channel** live (with results), and a button opens twitch.tv to vote. Voting by driving the website would break Twitch's terms, so it is not done.

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
