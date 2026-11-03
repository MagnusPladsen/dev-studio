# GameDev Studio <sup>beta</sup>

[![Live site](https://img.shields.io/badge/live-gamedev--studio.pladsen.dev-7c5cfc?style=flat-square)](https://gamedev-studio.pladsen.dev)
[![Status: beta](https://img.shields.io/badge/status-beta-fbbf24?style=flat-square)](#)
[![Latest release](https://img.shields.io/github/v/release/MagnusPladsen/dev-studio?include_prereleases&style=flat-square&label=release)](https://github.com/MagnusPladsen/dev-studio/releases)
[![License: MIT](https://img.shields.io/github/license/MagnusPladsen/dev-studio?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/MagnusPladsen/dev-studio?style=flat-square)](https://github.com/MagnusPladsen/dev-studio/stargazers)
[![Forks](https://img.shields.io/github/forks/MagnusPladsen/dev-studio?style=flat-square)](https://github.com/MagnusPladsen/dev-studio/forks)
[![Open issues](https://img.shields.io/github/issues/MagnusPladsen/dev-studio?style=flat-square)](https://github.com/MagnusPladsen/dev-studio/issues)
[![Last commit](https://img.shields.io/github/last-commit/MagnusPladsen/dev-studio?style=flat-square)](https://github.com/MagnusPladsen/dev-studio/commits/main)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-000?style=flat-square&logo=nextdotjs)](https://nextjs.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-34d399?style=flat-square)](#contributing)

A free, open source game development toolkit. Create pixel art, music, sound effects, tilemaps, dialogue trees, story worlds, moodboards and diagrams, all in one app where everything links together.

**No watermarks. No paywalls. No account required.** Everything you make is yours.

### Two apps, one codebase

This repo builds two apps from the same code:

| App | Tools | Live |
| --- | --- | --- |
| **GameDev Studio** | Every tool below | [gamedev-studio.pladsen.dev](https://gamedev-studio.pladsen.dev) |
| **Dev Studio** | Task Board, Canvas, Wiki (Story), Notebook and Decision log, for any software project | [dev-studio.pladsen.dev](https://dev-studio.pladsen.dev) |

The `NEXT_PUBLIC_APP` environment variable picks which one a build is (`dev-studio`, or unset for GameDev Studio).
Each app has its own landing page, name, examples and help text; the editors, storage and sync are shared, so a
fix lands in both. Signed in with the same account, each app can list your projects from the other and open them there.

**[Open the app →](https://gamedev-studio.pladsen.dev)** &nbsp;·&nbsp; [Download the desktop app](https://github.com/MagnusPladsen/dev-studio/releases/latest) &nbsp;·&nbsp; [Report a bug](https://github.com/MagnusPladsen/dev-studio/issues/new)

> **Beta:** GameDev Studio is under active development. Features may change and bugs are expected.
> Use *Export project* now and then to keep a backup, and please [open an issue](https://github.com/MagnusPladsen/dev-studio/issues) if something breaks.

## Tools

| Tool | What it does |
| --- | --- |
| **Task Board** | Jira-style sprints: To Do, In Progress, Testing, Done (columns are yours to change), backlog, issue notes, links to assets |
| **Pixel Art** | Sprites with layers, animation frames, onion skinning, project palettes, PNG, sprite sheet and animated GIF export |
| **Music** | Piano-roll composer with melody, harmony, bass and drum channels, zoomable. WAV export |
| **SFX** | Retro sound effect generator (jump, laser, coin, explosion…) with sliders and WAV export |
| **Tilemap** | Paint levels with the sprites you drew, on multiple layers. PNG export |
| **Canvas** | Milanote-style boards for moodboards, story flow, level planning and reference collections: notes, to-do lists, images, YouTube/Spotify/Vimeo/SoundCloud players, link previews, asset cards, groups and colours. Also flow charts and state machines |
| **Story** | Obsidian-style wiki: `[[links]]`, hover summaries, backlinks, graph view, templates |
| **Dialogue** | Branching conversations with choices, conditions and a play-through preview. JSON export |
| **Palettes** | Shared colour palettes with PICO-8, Game Boy, NES and more presets |
| **Sprite sheets** | Pack sprites and their animation frames into one PNG plus a JSON atlas |
| **3D Pixel Art** | Pixel art with depth (voxel art): build 3D models with add, erase, paint, eyedropper, fill, box and select tools, X/Y/Z mirror and a flat Slice view. Turn a sprite into a 3D model (flat or puffy), or render a model back into 8-direction sprites for 2D games. Export .glb, .obj + .mtl, MagicaVoxel .vox and .png. Free, no watermark |
| **Notebook** | Ideas, to-do lists, design docs and bug lists, with clickable checklists and `[[links]]` |
| **Decision log** | Architecture decision records: numbered ADR-001, ADR-002…, with status (proposed, accepted, superseded, deprecated, rejected), date, context, options, decision and consequences in Markdown. Supersede a decision in one click. Export one ADR or the whole log as Markdown, or JSON |

Everything saves automatically. New projects can start with **Pip's Quest**, a small sample game spread across every
tool that you can learn from, edit, or remove in one click.

Undo and redo work everywhere: <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> and <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>
(or <kbd>Ctrl</kbd>+<kbd>Y</kbd>), plus buttons in every toolbar.

**Everything connects.** Any asset can link to any other: a character's story entry links to their sprite and voice
sound, a tilemap shows which sprites it uses, a diagram node opens the dialogue it describes. The project page
lists every asset with its links.

Every tool ships with small hand-made examples to edit, so what you export is your own work.

## Where your work is saved

| Mode | How |
| --- | --- |
| **This browser** (default) | No account needed. Saved in the browser's local storage |
| **Your account** | Sign in with GitHub or an email link to sync across devices. The first time you sign in, projects already in the browser are moved into your account |
| **A folder on your computer** | *Save to a local folder* writes every project as JSON files (Chrome/Edge). Great for self-hosting and for keeping projects in git |
| **Export file** | *Export project* downloads one `.gamedev.json` you can import anywhere |

## Desktop app

Download GameDev Studio or Dev Studio for macOS (`.dmg`), Windows (`.exe`) or Linux (`.AppImage` / `.deb`) from the
[latest release](https://github.com/MagnusPladsen/dev-studio/releases/latest), or on a Mac with Homebrew:

```bash
brew install --cask magnuspladsen/tap/gamedev-studio
brew install --cask magnuspladsen/tap/dev-studio
```

They work offline and need no account. Projects are saved inside the app, or use *Save to a local folder* to keep
them as JSON files on disk.

The builds aren't code-signed yet, so the first launch shows a warning: on macOS open System Settings →
Privacy & Security → *Open Anyway* (or run `xattr -dr com.apple.quarantine "/Applications/Dev Studio.app"`); on
Windows click *More info* → *Run anyway*.

The app (in `desktop/`) is Electron running the studio's own Next.js server on `127.0.0.1` (port 47615 for
GameDev Studio, 47616 for Dev Studio, so both can run side by side). `NEXT_PUBLIC_APP` picks the app for both
builds. To build it yourself:

```bash
DESKTOP_BUILD=1 npm run build        # NEXT_PUBLIC_APP=dev-studio for Dev Studio, on this and electron-builder
cd desktop
npm install
npm run prepare-server
npm start          # run it, or: npx electron-builder --mac / --win / --linux
```

## Releases

Every merge to `main` (except changes to Markdown files only) is a release. The *Desktop release* workflow
(`.github/workflows/release.yml`) bumps the patch of the latest `v*` tag (`v0.1.0-beta` → `v0.1.1-beta`), builds
both apps for every platform, then tags the merge commit and publishes one GitHub Release titled with the version,
with generated notes. Merges are released one at a time, so two quick merges never share a version.

Each release holds both apps' installers:

| | GameDev Studio | Dev Studio |
|---|---|---|
| macOS Apple Silicon | `GameDev-Studio-mac-arm64.dmg` | `Dev-Studio-mac-arm64.dmg` |
| macOS Intel | `GameDev-Studio-mac-x64.dmg` | `Dev-Studio-mac-x64.dmg` |
| Windows | `GameDev-Studio-windows-x64.exe` | `Dev-Studio-windows-x64.exe` |
| Linux | `GameDev-Studio-linux-x64.AppImage` / `.deb` | `Dev-Studio-linux-x64.AppImage` / `.deb` |

The file names never change, so `releases/latest/download/<file>` always gets the newest build. Releases are not
marked as pre-releases, because `releases/latest` skips those.

The last job points the `gamedev-studio` and `dev-studio` casks in
[MagnusPladsen/homebrew-tap](https://github.com/MagnusPladsen/homebrew-tap) at the new dmgs. It needs a
`HOMEBREW_TAP_TOKEN` secret (a fine-grained token with *Contents: read and write* on the tap repo); without it the
job only logs a warning. Running the workflow by hand only builds, with the installers attached to the run.

## Run it yourself

You need [Node.js](https://nodejs.org) 20.9 or newer.

**With git**

```bash
git clone https://github.com/MagnusPladsen/dev-studio.git
cd dev-studio
npm install
npm run build
npm start
```

**Without git:** download the source zip from the [latest release](https://github.com/MagnusPladsen/dev-studio/releases/latest),
unzip it, and run the same `npm install`, `npm run build`, `npm start` commands inside the folder.

Open <http://localhost:3000>. It works without any configuration. Run `NEXT_PUBLIC_APP=dev-studio npm run dev`
to work on Dev Studio instead. Use *Save to a local folder* to keep your
projects on disk. (Use `npm run dev` instead of build + start if you want to change the code.)

**Your own online copy:**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMagnusPladsen%2Fdev-studio)

### Optional: cloud sync with Supabase

1. Create a project at [supabase.com](https://supabase.com) (the free tier is plenty).
2. Run the migration in `supabase/migrations/` in the SQL editor, or `npx supabase db push`, or connect the repo
   with Supabase's GitHub integration so migrations apply automatically.
3. `cp .env.example .env.local` and fill in your project URL and anon/publishable key.
4. In Supabase → **Authentication → URL Configuration**, set the Site URL to your domain and add
   `https://your-domain/auth/callback` (and `http://localhost:3000/auth/callback`) to the redirect URLs.
5. For GitHub sign-in: **Authentication → Sign In / Providers → GitHub**, using a GitHub OAuth app whose
   callback URL is `https://<project-ref>.supabase.co/auth/v1/callback`.

Each user can only read and write their own rows (row level security).

### Deploying both apps

Create two Vercel projects from this repo with the same Supabase env vars. On the Dev Studio project, also set
`NEXT_PUBLIC_APP=dev-studio`. Add both domains' `/auth/callback` URLs to Supabase's redirect URLs. Both apps share
the same tables; each project row records which app it belongs to.

## Tech

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Web Audio API · Canvas · Supabase (optional) · Vercel Analytics

## Contributing

Issues and pull requests are welcome. `npm run build` must pass.

## License

MIT. Do whatever you want with it.
