// One Electron wrapper, two apps: NEXT_PUBLIC_APP picks the same app as the web build it packages
// (see src/lib/app-config.ts). GameDev Studio keeps the names, id and port it shipped with.
import type { Configuration } from "electron-builder";
import { appConfigFor } from "../src/lib/app-config";

const APP = appConfigFor(process.env.NEXT_PUBLIC_APP);
const isDevStudio = APP.id === "dev-studio";
const artifactPrefix = APP.name.replaceAll(" ", "-");

const config: Configuration = {
  appId: `dev.pladsen.${APP.id}`,
  productName: APP.name,
  // Read by main.mjs at runtime. Each app needs its own port: browser storage belongs to the origin.
  extraMetadata: {
    name: `${APP.id}-desktop`,
    productName: APP.name,
    description: isDevStudio
      ? "Free, open source planning toolkit for software projects that runs on your own computer."
      : "Free, open source game-dev toolkit that runs on your own computer.",
    homepage: APP.url,
    studioPort: isDevStudio ? 47616 : 47615,
  },
  directories: {
    output: "dist",
    buildResources: isDevStudio ? "build/dev-studio" : "build",
  },
  files: ["main.mjs", "package.json"],
  afterPack: "scripts/after-pack.mjs",
  mac: {
    category: "public.app-category.developer-tools",
    target: "dmg",
    identity: "-",
    artifactName: `${artifactPrefix}-mac-\${arch}.\${ext}`,
  },
  win: {
    target: "nsis",
    artifactName: `${artifactPrefix}-windows-x64.\${ext}`,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  linux: {
    target: ["AppImage", "deb"],
    category: "Development",
    artifactName: `${artifactPrefix}-linux-x64.\${ext}`,
  },
};

export default config;
