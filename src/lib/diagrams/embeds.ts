export type VideoProvider = "youtube" | "vimeo" | "twitch" | "tiktok" | "streamable";
export type AudioProvider = "spotify" | "appleMusic" | "tidal" | "deezer" | "youtubeMusic" | "soundcloud" | "bandcamp";
export type EmbedProvider = VideoProvider | AudioProvider;

/** A player for an iframe: video players keep a width/height ratio, compact music players a fixed height. */
export type Player = { src: string; aspect: number } | { src: string; height: number };

export interface VideoEmbed {
  kind: "video";
  provider: VideoProvider;
  player: { src: string; aspect: number };
  thumbnail?: string;
}

export interface AudioEmbed {
  kind: "audio";
  provider: AudioProvider;
  /** Missing when the service has no inline player that can be built from the link. */
  player?: Player;
  thumbnail?: string;
}

export type Embed = VideoEmbed | AudioEmbed;

export const PROVIDER_NAMES: Record<EmbedProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  twitch: "Twitch",
  tiktok: "TikTok",
  streamable: "Streamable",
  spotify: "Spotify",
  appleMusic: "Apple Music",
  tidal: "TIDAL",
  deezer: "Deezer",
  youtubeMusic: "YouTube Music",
  soundcloud: "SoundCloud",
  bandcamp: "Bandcamp",
};

// Brand accents, literal so the PNG and SVG exports can use them too.
export const PROVIDER_COLORS: Record<EmbedProvider, string> = {
  youtube: "#ff0033",
  vimeo: "#17d5ff",
  twitch: "#9146ff",
  tiktok: "#25f4ee",
  streamable: "#0f90fa",
  spotify: "#1ed760",
  appleMusic: "#fa2d48",
  tidal: "#33ffee",
  deezer: "#a238ff",
  youtubeMusic: "#ff0000",
  soundcloud: "#ff5500",
  bandcamp: "#1da0c3",
};

/** Accepts what people paste ("youtube.com/watch?v=…", " https://… ") and returns a clean http(s) URL. */
export function normalizeUrl(input: string): string | null {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isImageUrl(url: string): boolean {
  try {
    return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

const IMGUR_ID = /^[A-Za-z0-9]{5,8}$/;

/** The address of the one picture a link shows: image files, and single-image pages on Imgur. */
export function imageUrlFor(link: string): string | null {
  if (isImageUrl(link)) return link;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  if ((host === "imgur.com" || host === "i.imgur.com") && parts.length === 1 && IMGUR_ID.test(parts[0])) {
    return `https://i.imgur.com/${parts[0]}.jpg`;
  }
  return null;
}

function pathParts(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

const YOUTUBE_ID = /^[\w-]{11}$/;

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
  if (url.pathname === "/watch") return url.searchParams.get("v");
  const match = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/);
  return match ? match[1] : null;
}

function youtubePlayer(url: URL, id: string): { src: string; aspect: number } {
  const start = parseInt(url.searchParams.get("t") ?? url.searchParams.get("start") ?? "", 10);
  const params = new URLSearchParams({ autoplay: "1" });
  if (start > 0) params.set("start", String(start));
  return { src: `https://www.youtube-nocookie.com/embed/${id}?${params}`, aspect: 16 / 9 };
}

function youtube(url: URL): Embed | null {
  const id = youtubeId(url);
  if (!id || !YOUTUBE_ID.test(id)) return null;
  const thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  if (url.hostname === "music.youtube.com") {
    return { kind: "audio", provider: "youtubeMusic", player: youtubePlayer(url, id), thumbnail };
  }
  return { kind: "video", provider: "youtube", player: youtubePlayer(url, id), thumbnail };
}

function vimeo(url: URL): Embed | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
  const match = url.pathname.match(/(?:^|\/)(\d{5,})(?:\/|$)/);
  if (!match) return null;
  return { kind: "video", provider: "vimeo", player: { src: `https://player.vimeo.com/video/${match[1]}?autoplay=1`, aspect: 16 / 9 } };
}

const TWITCH_SLUG = /^[\w-]+$/;

function twitchQuery(url: URL): string | null {
  const host = url.hostname.replace(/^(www|m)\./, "");
  const parts = pathParts(url);
  if (host === "clips.twitch.tv" && parts.length === 1 && TWITCH_SLUG.test(parts[0])) return `clip=${parts[0]}`;
  if (host !== "twitch.tv") return null;
  if (parts[0] === "videos" && /^\d+$/.test(parts[1] ?? "")) return `video=${parts[1]}`;
  if (parts[1] === "clip" && TWITCH_SLUG.test(parts[2] ?? "")) return `clip=${parts[2]}`;
  return null;
}

/** Twitch clips and past broadcasts; the player also needs the page's host, which `playerSrc` adds. */
function twitch(url: URL): Embed | null {
  const query = twitchQuery(url);
  if (!query) return null;
  const base = query.startsWith("clip=") ? "https://clips.twitch.tv/embed" : "https://player.twitch.tv/";
  return { kind: "video", provider: "twitch", player: { src: `${base}?${query}&autoplay=true`, aspect: 16 / 9 } };
}

function tiktok(url: URL): Embed | null {
  if (url.hostname.replace(/^(www|m)\./, "") !== "tiktok.com") return null;
  const match = url.pathname.match(/^\/@[^/]+\/video\/(\d+)/);
  if (!match) return null;
  return { kind: "video", provider: "tiktok", player: { src: `https://www.tiktok.com/player/v1/${match[1]}?autoplay=1`, aspect: 9 / 16 } };
}

const STREAMABLE_PAGES = new Set(["login", "signup", "upload", "pricing", "about", "privacy", "terms", "blog", "careers", "settings", "videos", "help", "documentation"]);

function streamable(url: URL): Embed | null {
  if (url.hostname.replace(/^www\./, "") !== "streamable.com") return null;
  const parts = pathParts(url);
  const id = parts[0] === "e" || parts[0] === "o" ? parts[1] : parts.length === 1 ? parts[0] : undefined;
  if (!id || !/^[a-z0-9]{4,10}$/i.test(id) || STREAMABLE_PAGES.has(id.toLowerCase())) return null;
  return { kind: "video", provider: "streamable", player: { src: `https://streamable.com/e/${id}?autoplay=1`, aspect: 16 / 9 } };
}

const SPOTIFY_KINDS = ["track", "album", "playlist", "episode", "show"];

function spotify(url: URL): Embed | null {
  if (url.hostname !== "open.spotify.com") return null;
  const parts = pathParts(url);
  if (parts[0]?.startsWith("intl-")) parts.shift();
  const [kind, id] = parts;
  if (!SPOTIFY_KINDS.includes(kind) || !id || !/^[A-Za-z0-9]+$/.test(id)) return null;
  const height = kind === "track" || kind === "episode" ? 152 : 352;
  return { kind: "audio", provider: "spotify", player: { src: `https://open.spotify.com/embed/${kind}/${id}`, height } };
}

const APPLE_KINDS = ["album", "song", "playlist"];

function appleMusic(url: URL): Embed | null {
  if (url.hostname !== "music.apple.com") return null;
  const parts = pathParts(url);
  if (/^[a-z]{2}$/i.test(parts[0] ?? "")) parts.shift();
  const [kind, ...rest] = parts;
  const id = rest[rest.length - 1];
  if (!APPLE_KINDS.includes(kind) || !id || rest.length > 2 || !/^(\d+|pl\.[\w-]+)$/.test(id)) return null;
  const song = url.searchParams.get("i");
  const isSong = kind === "song" || (kind === "album" && !!song && /^\d+$/.test(song));
  const query = kind === "album" && isSong ? `?i=${song}` : "";
  const country = url.pathname.split("/").filter(Boolean)[0];
  const prefix = /^[a-z]{2}$/i.test(country) ? `/${country.toLowerCase()}` : "/us";
  const src = `https://embed.music.apple.com${prefix}/${kind}/${rest.join("/")}${query}`;
  return { kind: "audio", provider: "appleMusic", player: { src, height: isSong ? 175 : 450 } };
}

const TIDAL_KINDS: Record<string, string> = { track: "tracks", album: "albums", playlist: "playlists" };

function tidal(url: URL): Embed | null {
  const host = url.hostname.replace(/^(www|listen)\./, "");
  if (host !== "tidal.com") return null;
  const parts = pathParts(url);
  if (parts[0] === "browse") parts.shift();
  const [kind, id] = parts;
  if (!TIDAL_KINDS[kind] || !id || parts.length > 2 || !/^[\w-]+$/.test(id)) return null;
  const height = kind === "track" ? 120 : 400;
  return { kind: "audio", provider: "tidal", player: { src: `https://embed.tidal.com/${TIDAL_KINDS[kind]}/${id}`, height } };
}

const DEEZER_KINDS = ["track", "album", "playlist"];

function deezer(url: URL): Embed | null {
  if (url.hostname.replace(/^www\./, "") !== "deezer.com") return null;
  const parts = pathParts(url);
  if (/^[a-z]{2}(-[a-z]{2})?$/i.test(parts[0] ?? "")) parts.shift();
  const [kind, id] = parts;
  if (!DEEZER_KINDS.includes(kind) || !/^\d+$/.test(id ?? "") || parts.length > 2) return null;
  const height = kind === "track" ? 152 : 300;
  return { kind: "audio", provider: "deezer", player: { src: `https://widget.deezer.com/widget/dark/${kind}/${id}`, height } };
}

const SOUNDCLOUD_PAGES = new Set(["tracks", "albums", "sets", "popular-tracks", "reposts", "likes", "followers", "following", "comments"]);

function soundcloud(url: URL): Embed | null {
  const host = url.hostname.replace(/^(www|m)\./, "");
  if (host !== "soundcloud.com") return null;
  const parts = pathParts(url);
  if (parts.length < 2 || (parts.length === 2 && SOUNDCLOUD_PAGES.has(parts[1]))) return null;
  const track = `https://soundcloud.com${url.pathname}`;
  const height = parts[1] === "sets" ? 300 : 166;
  return {
    kind: "audio",
    provider: "soundcloud",
    player: { src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(track)}&auto_play=true&visual=false`, height },
  };
}

/** Bandcamp's player needs a numeric id the link doesn't carry, so these cards have no inline player. */
function bandcamp(url: URL): Embed | null {
  if (!url.hostname.endsWith(".bandcamp.com")) return null;
  const [kind, slug] = pathParts(url);
  if ((kind !== "track" && kind !== "album") || !slug) return null;
  return { kind: "audio", provider: "bandcamp" };
}

const MATCHERS = [youtube, vimeo, twitch, tiktok, streamable, spotify, appleMusic, tidal, deezer, soundcloud, bandcamp];

/** A video or music embed for links from those sites; null for any other link. */
export function embedFor(link: string): Embed | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  for (const match of MATCHERS) {
    const embed = match(url);
    if (embed) return embed;
  }
  return null;
}

/** The iframe address for a player shown on `pageHost`; Twitch only plays on pages it is told about. */
export function playerSrc(embed: Embed, player: Player, pageHost: string): string {
  return embed.provider === "twitch" ? `${player.src}&parent=${encodeURIComponent(pageHost)}` : player.src;
}

export type LinkKind = "video" | "audio" | "image" | "link";

/** How a link card shows its link: as a video, a song, the picture itself, or a plain link. */
export function linkKind(link: string): LinkKind {
  if (imageUrlFor(link)) return "image";
  return embedFor(link)?.kind ?? "link";
}
