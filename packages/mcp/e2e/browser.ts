import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import { check, section } from "./check";
import type { E2eEnv } from "./env";
import type { Created } from "./tools";

/** Tool folder per asset type, as in `ASSET_KINDS` (src/lib/assets.ts). */
const TOOL_PATH: Record<string, string> = { issue: "board", note: "notebook", story: "story", decision: "decisions", diagram: "diagrams" };

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

function itemUrl(env: E2eEnv, projectId: string, item: Created["items"][number]) {
  const element = item.elementId ? `&element=${encodeURIComponent(item.elementId)}` : "";
  return `${env.appUrl}/project/${projectId}/${TOOL_PATH[item.type]}?open=${encodeURIComponent(item.id)}${element}`;
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function openPage(page: Page, url: string, text: string, errors: string[], viewport: string, label: string, shotDir: string) {
  errors.length = 0;
  await page.goto(url, { waitUntil: "networkidle" });
  // Titles are often editable fields, so their value counts as shown text too.
  const shown = await page
    .waitForFunction(
      (wanted) =>
        document.body.innerText.includes(wanted) ||
        Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")).some((field) => field.value.includes(wanted)),
      text,
      { timeout: 20_000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!check(`${viewport}: ${label} shows "${text}"`, shown, page.url())) {
    await page.screenshot({ path: join(shotDir, `${viewport}-${label.replace(/\W+/g, "-")}.png`) }).catch(() => undefined);
  }
  check(`${viewport}: ${label} has no page errors`, errors.length === 0, errors);
  if (viewport === "phone") {
    const overflow = await horizontalOverflow(page);
    check(`${viewport}: ${label} has no horizontal overflow`, overflow <= 0, `${overflow}px wider than the screen`);
  }
}

/** Opens everything the tools made in the locally built app, signed in as A, on desktop and phone. */
export async function checkInApp(env: E2eEnv, browser: Browser, signedIn: BrowserContext, created: Created) {
  const storageState = await signedIn.storageState();
  for (const viewport of VIEWPORTS) {
    section(`App at ${viewport.width}×${viewport.height}`);
    const context = await browser.newContext({ storageState, viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.name === "phone", hasTouch: viewport.name === "phone" });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await openPage(page, `${env.appUrl}/projects`, "E2E Tidepool", errors, viewport.name, "projects list", env.work);
      await openPage(page, `${env.appUrl}/project/${created.projectId}/assets`, "E2E Tidepool", errors, viewport.name, "project dashboard", env.work);
      for (const item of created.items) await openPage(page, itemUrl(env, created.projectId, item), item.text, errors, viewport.name, item.label, env.work);
    } finally {
      await context.close();
    }
  }
}
