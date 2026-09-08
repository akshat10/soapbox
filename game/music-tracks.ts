export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  artistUrl: string;
  sourceUrl: string;
  license: "CC0 1.0" | "CC BY 4.0";
  licenseUrl: string;
  src: string;
}

/** Locally hosted soundtrack. Source licenses and changes: /audio/music/CREDITS.md. */
export const MUSIC_TRACKS: readonly MusicTrack[] = [
  {
    "id": "sweet-70s",
    "title": "Sweet 70s",
    "artist": "Clement Panchout",
    "artistUrl": "http://www.clementpanchout.com/",
    "sourceUrl": "https://opengameart.org/content/funky-sweet-70s",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "src": "/audio/music/sweet-70s.mp3"
  },
  {
    "id": "eat",
    "title": "Eat",
    "artist": "Holizna",
    "artistUrl": "https://opengameart.org/users/holizna",
    "sourceUrl": "https://opengameart.org/content/funk-collection",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "src": "/audio/music/eat.mp3"
  },
  {
    "id": "sleep",
    "title": "Sleep",
    "artist": "Holizna",
    "artistUrl": "https://opengameart.org/users/holizna",
    "sourceUrl": "https://opengameart.org/content/funk-collection",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "src": "/audio/music/sleep.mp3"
  },
  {
    "id": "breath",
    "title": "Breath",
    "artist": "Holizna",
    "artistUrl": "https://opengameart.org/users/holizna",
    "sourceUrl": "https://opengameart.org/content/funk-collection",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "src": "/audio/music/breath.mp3"
  },
  {
    "id": "make-money",
    "title": "Make Money",
    "artist": "Holizna",
    "artistUrl": "https://opengameart.org/users/holizna",
    "sourceUrl": "https://opengameart.org/content/funk-collection",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "src": "/audio/music/make-money.mp3"
  },
  {
    "id": "make-love",
    "title": "Make Love",
    "artist": "Holizna",
    "artistUrl": "https://opengameart.org/users/holizna",
    "sourceUrl": "https://opengameart.org/content/funk-collection",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "src": "/audio/music/make-love.mp3"
  },
  {
    "id": "make-funk",
    "title": "Make Funk",
    "artist": "Holizna",
    "artistUrl": "https://opengameart.org/users/holizna",
    "sourceUrl": "https://opengameart.org/content/funk-collection",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "src": "/audio/music/make-funk.mp3"
  },
  {
    "id": "rhythm-factory",
    "title": "Rhythm Factory",
    "artist": "Zane Little",
    "artistUrl": "https://opengameart.org/users/zane-little-music",
    "sourceUrl": "https://opengameart.org/content/rhythm-factory",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "src": "/audio/music/rhythm-factory.mp3"
  },
  {
    "id": "barriers",
    "title": "Barriers",
    "artist": "Zane Little",
    "artistUrl": "https://opengameart.org/users/zane-little-music",
    "sourceUrl": "https://opengameart.org/content/barriers",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "src": "/audio/music/barriers.mp3"
  },
  {
    "id": "pure-raceway",
    "title": "Pure Raceway",
    "artist": "MintoDog",
    "artistUrl": "https://opengameart.org/users/mintodog",
    "sourceUrl": "https://opengameart.org/content/pure-raceway",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "src": "/audio/music/pure-raceway.mp3"
  },
  {
    "id": "hot-roadway",
    "title": "Hot Roadway",
    "artist": "MintoDog",
    "artistUrl": "https://opengameart.org/users/mintodog",
    "sourceUrl": "https://opengameart.org/content/hot-roadway",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "src": "/audio/music/hot-roadway.mp3"
  },
  {
    "id": "dizzy-racing",
    "title": "Dizzy Racing",
    "artist": "Zane Little",
    "artistUrl": "https://opengameart.org/users/zane-little-music",
    "sourceUrl": "https://opengameart.org/content/dizzy-racing",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "src": "/audio/music/dizzy-racing.mp3"
  }
];
