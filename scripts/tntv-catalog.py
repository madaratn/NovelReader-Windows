#!/usr/bin/env python3
"""Catalog of the series that Tunisian TV channels publish on their official YouTube
channels, for the "Tunisian TV" source of the app (no YouTube key needed in the app).

Reads public YouTube pages with yt-dlp (lists only: no video is downloaded):
  channel (found by name) -> its playlists -> the videos of each playlist.
Writes  <out>/tntv-catalog.json   {at, channels:[{id,name,file}], playlists:[{id,title,thumb,channel,count}]}
        <out>/tntv-<n>.json       {playlists:{<id>:[[videoId,title],...]}}   one file per channel
"""
import json, subprocess, sys, time, urllib.parse, datetime, os

CHANNELS = ['Télévision Tunisienne', 'Elhiwar Ettounsi', 'Attessia TV', 'Carthage Plus TV', 'Nessma TV', 'Tunisna TV']
MAX_PLAYLISTS = int(os.environ.get('TNTV_MAX_PLAYLISTS', '400'))
MAX_VIDEOS = 400


def ytdlp(url, *extra, timeout=600):
    cmd = ['yt-dlp', '--flat-playlist', '-J', '--no-warnings', '--ignore-errors', '--extractor-args', 'youtube:lang=ar', *extra, url]
    for attempt in range(3):
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            if r.stdout.strip():
                return json.loads(r.stdout)
            print('  yt-dlp gave nothing for', url, (r.stderr or '').strip()[-300:], flush=True)
        except Exception as e:
            print('  yt-dlp failed for', url, str(e)[:200], flush=True)
        time.sleep(5 * (attempt + 1))
    return None


def find_channel(name):
    # YouTube search limited to channels (sp=EgIQAg==).
    d = ytdlp('https://www.youtube.com/results?search_query=' + urllib.parse.quote(name) + '&sp=EgIQAg%253D%253D', '--playlist-end', '5', timeout=120)
    for e in (d or {}).get('entries') or []:
        cid = e.get('channel_id') or (e.get('id') if str(e.get('id', '')).startswith('UC') else None)
        url = e.get('url') or ''
        if not cid and '/channel/' in url:
            cid = url.split('/channel/')[1].split('/')[0]
        if cid:
            return cid, e.get('title') or e.get('channel') or name
    return None, name


def thumb(e):
    t = e.get('thumbnails') or []
    return (t[-1].get('url') if t else '') or e.get('thumbnail') or ''


def main(out):
    os.makedirs(out, exist_ok=True)
    channels, playlists = [], []
    for n, name in enumerate(CHANNELS):
        cid, title = find_channel(name)
        print(f'{name}: channel {cid} ({title})', flush=True)
        if not cid:
            continue
        d = ytdlp(f'https://www.youtube.com/channel/{cid}/playlists', '--playlist-end', str(MAX_PLAYLISTS))
        entries = [e for e in ((d or {}).get('entries') or []) if e and e.get('id')]
        print(f'  {len(entries)} playlists', flush=True)
        videos = {}
        for i, p in enumerate(entries):
            pd = ytdlp('https://www.youtube.com/playlist?list=' + p['id'], '--playlist-end', str(MAX_VIDEOS), timeout=300)
            items = [[v['id'], v.get('title') or ''] for v in ((pd or {}).get('entries') or [])
                     if v and v.get('id') and (v.get('title') or '') not in ('[Private video]', '[Deleted video]', 'Private video', 'Deleted video')]
            if not items:
                continue
            videos[p['id']] = items
            first_thumb = next((thumb(v) for v in ((pd or {}).get('entries') or []) if v), '')
            playlists.append({'id': p['id'], 'title': p.get('title') or (pd or {}).get('title') or '', 'thumb': thumb(p) or first_thumb or f'https://i.ytimg.com/vi/{items[0][0]}/hqdefault.jpg',
                              'channel': name, 'count': len(items)})
            if i % 25 == 0:
                print(f'  … {i + 1}/{len(entries)}', flush=True)
        file = f'tntv-{n}.json'
        json.dump({'playlists': videos}, open(os.path.join(out, file), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        channels.append({'id': cid, 'name': name, 'file': file, 'playlists': len(videos)})
    catalog = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'), 'channels': channels, 'playlists': playlists}
    json.dump(catalog, open(os.path.join(out, 'tntv-catalog.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{len(playlists)} playlists from {len(channels)} channels', flush=True)
    for c in channels:
        print(f"  {c['name']}: {c['playlists']}")
    # Not published when YouTube refused the runner: the app keeps the previous catalog.
    return 0 if len(channels) >= 3 and len(playlists) >= 30 else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else 'tntv'))
