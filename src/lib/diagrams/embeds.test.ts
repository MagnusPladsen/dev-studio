import { describe, expect, it } from "vitest";
import { embedFor, imageUrlFor, isImageUrl, linkKind, normalizeUrl, playerSrc, type Embed } from "./embeds";

const player = (link: string) => embedFor(link)?.player;

describe("normalizeUrl", () => {
  it("should add https when a bare domain is pasted", () => {
    expect(normalizeUrl(" youtube.com/watch?v=abc ")).toBe("https://youtube.com/watch?v=abc");
  });

  it("should reject the text when it is not a web link", () => {
    expect(normalizeUrl("hello world")).toBeNull();
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("notes")).toBeNull();
  });
});

describe("embedFor videos", () => {
  it("should embed YouTube when the link is a watch, short or youtu.be link", () => {
    for (const link of [
      "https://www.youtube.com/watch?v=yorTG9at90g",
      "https://youtu.be/yorTG9at90g",
      "https://youtube.com/shorts/yorTG9at90g",
    ]) {
      const embed = embedFor(link);
      expect(embed).toMatchObject({ kind: "video", provider: "youtube", thumbnail: "https://i.ytimg.com/vi/yorTG9at90g/hqdefault.jpg" });
      expect(embed?.player?.src).toContain("youtube-nocookie.com/embed/yorTG9at90g");
    }
  });

  it("should keep the start time when a YouTube link has one", () => {
    expect(player("https://youtu.be/yorTG9at90g?t=90")?.src).toContain("start=90");
  });

  it("should embed Vimeo as a video when the link has a video id", () => {
    expect(embedFor("https://vimeo.com/76979871")).toMatchObject({
      kind: "video",
      player: { src: "https://player.vimeo.com/video/76979871?autoplay=1", aspect: 16 / 9 },
    });
  });

  it("should embed a Twitch clip when the link is a clips or channel clip link", () => {
    expect(player("https://clips.twitch.tv/FunnyClipSlug-abc123")?.src).toBe("https://clips.twitch.tv/embed?clip=FunnyClipSlug-abc123&autoplay=true");
    expect(player("https://www.twitch.tv/somechannel/clip/FunnyClipSlug-abc123?filter=clips")?.src).toBe(
      "https://clips.twitch.tv/embed?clip=FunnyClipSlug-abc123&autoplay=true"
    );
  });

  it("should embed a Twitch past broadcast when the link is a videos link", () => {
    expect(player("https://www.twitch.tv/videos/1234567890")?.src).toBe("https://player.twitch.tv/?video=1234567890&autoplay=true");
  });

  it("should add the page host when a Twitch player is shown", () => {
    const embed = embedFor("https://www.twitch.tv/videos/1234567890") as Embed;
    expect(playerSrc(embed, embed.player!, "localhost")).toBe("https://player.twitch.tv/?video=1234567890&autoplay=true&parent=localhost");
  });

  it("should embed TikTok as an upright video when the link is a video link", () => {
    expect(embedFor("https://www.tiktok.com/@someone/video/7234567890123456789?is_from_webapp=1")).toMatchObject({
      kind: "video",
      provider: "tiktok",
      player: { src: "https://www.tiktok.com/player/v1/7234567890123456789?autoplay=1", aspect: 9 / 16 },
    });
  });

  it("should embed Streamable when the link is a video page", () => {
    expect(player("https://streamable.com/moo12x")?.src).toBe("https://streamable.com/e/moo12x?autoplay=1");
  });
});

describe("embedFor music", () => {
  it("should use the short Spotify player when the link is a track", () => {
    expect(embedFor("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc")).toMatchObject({
      kind: "audio",
      provider: "spotify",
      player: { src: "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC", height: 152 },
    });
  });

  it("should use the tall Spotify player when the link is a playlist with a locale prefix", () => {
    expect(player("https://open.spotify.com/intl-de/playlist/37i9dQZF1DX8Uebhn9wzrS")).toMatchObject({ height: 352 });
  });

  it("should use the tall Spotify player when the link is an album", () => {
    expect(player("https://open.spotify.com/album/1ZfETfec0U02KrKNI8w3Gf")).toMatchObject({ height: 352 });
  });

  it("should embed one Apple Music song when an album link picks a track with ?i=", () => {
    expect(embedFor("https://music.apple.com/us/album/celeste-original-soundtrack/1335232043?i=1335232046&ls=1")).toMatchObject({
      kind: "audio",
      provider: "appleMusic",
      player: { src: "https://embed.music.apple.com/us/album/celeste-original-soundtrack/1335232043?i=1335232046", height: 175 },
    });
  });

  it("should embed the whole Apple Music album when the link has no track", () => {
    expect(player("https://music.apple.com/gb/album/celeste-original-soundtrack/1335232043")).toEqual({
      src: "https://embed.music.apple.com/gb/album/celeste-original-soundtrack/1335232043",
      height: 450,
    });
  });

  it("should embed an Apple Music song or playlist when the link is one", () => {
    expect(player("https://music.apple.com/us/song/resurrections/1335232046")).toEqual({
      src: "https://embed.music.apple.com/us/song/resurrections/1335232046",
      height: 175,
    });
    expect(player("https://music.apple.com/us/playlist/chill/pl.u-abc123XYZ")?.src).toBe("https://embed.music.apple.com/us/playlist/chill/pl.u-abc123XYZ");
  });

  it("should embed TIDAL tracks, albums and playlists when the link is a browse link", () => {
    expect(player("https://tidal.com/browse/track/77646169?u")).toEqual({ src: "https://embed.tidal.com/tracks/77646169", height: 120 });
    expect(player("https://listen.tidal.com/album/77646168")?.src).toBe("https://embed.tidal.com/albums/77646168");
    expect(player("https://tidal.com/browse/playlist/1b1f6c1e-1a2b-4c3d-9e8f-0123456789ab")?.src).toBe(
      "https://embed.tidal.com/playlists/1b1f6c1e-1a2b-4c3d-9e8f-0123456789ab"
    );
  });

  it("should embed the Deezer widget when the link has a locale prefix", () => {
    expect(player("https://www.deezer.com/en/track/3135556?utm=x")).toEqual({ src: "https://widget.deezer.com/widget/dark/track/3135556", height: 152 });
    expect(player("https://www.deezer.com/album/302127")?.src).toBe("https://widget.deezer.com/widget/dark/album/302127");
    expect(player("https://deezer.com/fr/playlist/908622995")?.src).toBe("https://widget.deezer.com/widget/dark/playlist/908622995");
  });

  it("should show YouTube Music as a song when the link is a watch link", () => {
    expect(embedFor("https://music.youtube.com/watch?v=yorTG9at90g&list=RDAMVM")).toMatchObject({
      kind: "audio",
      provider: "youtubeMusic",
      thumbnail: "https://i.ytimg.com/vi/yorTG9at90g/hqdefault.jpg",
    });
  });

  it("should show SoundCloud as a song when the link is a track", () => {
    const embed = embedFor("https://soundcloud.com/artist/track-name");
    expect(embed).toMatchObject({ kind: "audio", provider: "soundcloud" });
    expect(embed?.player?.src).toContain(encodeURIComponent("https://soundcloud.com/artist/track-name"));
  });

  it("should show Bandcamp as a song without a player when the link is a track or album", () => {
    expect(embedFor("https://artist.bandcamp.com/track/some-song")).toEqual({ kind: "audio", provider: "bandcamp" });
    expect(embedFor("https://artist.bandcamp.com/album/some-album")?.kind).toBe("audio");
  });
});

describe("embedFor other links", () => {
  it("should return null when the link is not a video or song", () => {
    for (const link of [
      "https://lospec.com/palette-list",
      "https://www.youtube.com/@GMTK",
      "https://www.twitch.tv/somechannel",
      "https://www.tiktok.com/@someone",
      "https://streamable.com/login",
    ]) {
      expect(embedFor(link)).toBeNull();
    }
  });

  it("should return null when a music link is an artist page", () => {
    for (const link of [
      "https://open.spotify.com/artist/0OdUWJ0sBjDrqHygGUXeCF",
      "https://music.apple.com/us/artist/lena-raine/1065981054",
      "https://tidal.com/browse/artist/7804",
      "https://www.deezer.com/en/artist/27",
      "https://soundcloud.com/artist",
      "https://soundcloud.com/artist/tracks",
      "https://artist.bandcamp.com/",
    ]) {
      expect(embedFor(link)).toBeNull();
    }
  });
});

describe("isImageUrl", () => {
  it("should spot an image when the path ends in an image extension", () => {
    expect(isImageUrl("https://example.com/art/ref.PNG?size=2")).toBe(true);
    expect(isImageUrl("https://example.com/page")).toBe(false);
  });
});

describe("imageUrlFor", () => {
  it("should keep the link when it is an image file", () => {
    expect(imageUrlFor("https://i.imgur.com/abc1234.png")).toBe("https://i.imgur.com/abc1234.png");
  });

  it("should point at the picture when the link is an Imgur single-image page", () => {
    expect(imageUrlFor("https://imgur.com/abc1234")).toBe("https://i.imgur.com/abc1234.jpg");
  });

  it("should return null when the link is an Imgur album or gallery", () => {
    expect(imageUrlFor("https://imgur.com/a/abc1234")).toBeNull();
    expect(imageUrlFor("https://imgur.com/gallery/abc1234")).toBeNull();
  });
});

describe("linkKind", () => {
  it("should sort links into video, audio, image and plain link when asked", () => {
    expect(linkKind("https://www.youtube.com/watch?v=yorTG9at90g")).toBe("video");
    expect(linkKind("https://open.spotify.com/album/1ZfETfec0U02KrKNI8w3Gf")).toBe("audio");
    expect(linkKind("https://imgur.com/abc1234")).toBe("image");
    expect(linkKind("https://lospec.com/palette-list")).toBe("link");
  });
});
