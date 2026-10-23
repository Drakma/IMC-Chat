'use strict';
// The ad-break finder against a made-up Twitch playlist. Run: node hls-ads-test.js
const assert = require('assert'), { parseAds, adLeft } = require('./hls-ads');

const seg = (t) => '#EXTINF:2.000,live\n' + 'https://video.example/seg' + t + '.ts';
const playlist = [
  '#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:6', '#EXT-X-MEDIA-SEQUENCE:100',
  '#EXT-X-DATERANGE:ID="stitched-ad-1",CLASS="twitch-stitched-ad",START-DATE="2026-10-23T02:00:10.000Z",DURATION=30.0,X-TV-TWITCH-AD-ROLL-TYPE="MIDROLL"',
  '#EXT-X-DATERANGE:ID="chapter",CLASS="other",START-DATE="2026-10-23T02:00:00.000Z",DURATION=500.0',
  '#EXT-X-PROGRAM-DATE-TIME:2026-10-23T02:00:00.000Z', seg(1), seg(2), seg(3), seg(4), seg(5), seg(6), seg(7), seg(8), seg(9), seg(10),
].join('\n');
const p = parseAds(playlist);
assert.equal(p.windows.length, 1, 'only the ad range counts, not other date ranges'); assert.equal(p.windows[0].end - p.windows[0].start, 30000);
assert.equal(p.edge, Date.parse('2026-10-23T02:00:20.000Z'), 'ten 2 s segments from 02:00:00 end at 02:00:20');
// the playlist's newest segment ends at 02:00:20; VLC shows what is 6 s older: 02:00:14, inside the ad (10 to 40)
assert.equal(adLeft(p, 6000), 26, 'in the ad, 26 s of it left');
assert.equal(adLeft(p, 14000), 0, 'at 02:00:06 the ad has not started');
const later = parseAds(playlist.replace('02:00:10.000Z', '01:59:10.000Z'));   // an ad that ended at 01:59:40
assert.equal(adLeft(later, 6000), 0, 'an old ad is not an ad now');
assert.equal(adLeft(parseAds('#EXTM3U\n#EXTINF:2.0,\nseg.ts'), 6000), 0, 'no dates, no ads'); assert.equal(adLeft(null), 0);
// an END-DATE instead of a DURATION
assert.equal(parseAds('#EXT-X-DATERANGE:ID="x",CLASS="twitch-stitched-ad",START-DATE="2026-10-23T02:00:00.000Z",END-DATE="2026-10-23T02:00:15.000Z"').windows[0].end - Date.parse('2026-10-23T02:00:00.000Z'), 15000);
console.log('hls-ads test passed');
