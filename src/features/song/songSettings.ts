import { sanitizeSongSettings, type SongSettings } from '../../domain/preferences';

const key = (id: string) => `jubilate.song.${id}`;

export function loadSongSettings(id: string): SongSettings {
  try {
    return sanitizeSongSettings(JSON.parse(localStorage.getItem(key(id)) ?? '{}'));
  } catch {
    return sanitizeSongSettings({});
  }
}

export function saveSongSettings(id: string, s: SongSettings) {
  try {
    if (s.transpose === 0 && s.capo === 0) localStorage.removeItem(key(id));
    else localStorage.setItem(key(id), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
