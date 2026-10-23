'use strict';
/**
 * Finds Twitch's stitched ad breaks in a live media playlist, so the player can mute while an ad plays.
 * Twitch marks them with #EXT-X-DATERANGE lines (class "twitch-stitched-ad") that give the start and length of the break;
 * the playlist's own #EXT-X-PROGRAM-DATE-TIME lines say what time each segment belongs to.
 */
const attr = (line, name) => { const m = new RegExp('(?:^|[,:])' + name + '="?([^",]+)"?').exec(line); return m ? m[1] : ''; };

/** the ad breaks in a playlist (as start/end times in ms) and the time of its newest segment's end */
function parseAds(text) {
  const windows = []; let pdt = 0, dur = 0, edge = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    const l = raw.trim();
    if (l.startsWith('#EXT-X-DATERANGE:')) {
      if (!/stitched-ad|twitch-ad|X-TV-TWITCH-AD/i.test(l)) continue;
      const start = Date.parse(attr(l, 'START-DATE')), endAttr = attr(l, 'END-DATE'), end = endAttr ? Date.parse(endAttr) : start + (parseFloat(attr(l, 'DURATION')) || 0) * 1000;
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) windows.push({ start, end });
    } else if (l.startsWith('#EXT-X-PROGRAM-DATE-TIME:')) { const t = Date.parse(l.slice(25).trim()); if (Number.isFinite(t)) pdt = t; }
    else if (l.startsWith('#EXTINF:')) dur = parseFloat(l.slice(8)) || 0;
    else if (l && l[0] !== '#' && pdt) { edge = pdt + dur * 1000; pdt = edge; }   // a segment: it ends where the next one starts
  }
  return { windows, edge };
}

/** is the picture VLC is showing inside an ad break? VLC plays some seconds behind the newest segment (lagMs); returns the seconds left, or 0 */
function adLeft(parsed, lagMs) {
  if (!parsed || !parsed.edge) return 0; const at = parsed.edge - (lagMs == null ? 6000 : lagMs);
  for (const w of parsed.windows) if (at >= w.start - 400 && at <= w.end) return Math.max(1, Math.ceil((w.end - at) / 1000));
  return 0;
}

module.exports = { parseAds, adLeft };
