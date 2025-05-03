import { Browser, chromium } from "playwright-core";
import { Command } from "@cliffy/command";

async function withBrowser<A>(
  callback: (browser: Browser) => Promise<A>,
): Promise<A> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    return await callback(browser);
  } finally {
    await browser?.close();
  }
}

function errorToString(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  } else {
    return String(e ?? "Unknown error");
  }
}

type GenerateHarResult = { success: true; path: string } | {
  success: false;
  error: string;
};

interface HarPage {
  id: string;
  title: string;
  startedDateTime: string;
  pageTimings: {
    onContentLoad: number;
    onLoad: number;
    _fullyLoaded: number;
  };
}

type EventChoice = keyof HarPage["pageTimings"];

interface HarEntry {
  request: {
    url: string;
    method: string;
    startedDateTime: string;
    time: number;
  };
  response: {
    status: number;
    content?: { size: number; mimeType: string; text?: string };
    bodySize: number;
    _transferSize?: number;
    timings: {
      "dns": number;
      "connect": number;
      "ssl": number;
      "send": number;
      "wait": number;
      "receive": number;
    };
  };
}

interface HarLog {
  version: string;
  creator: { name: string; version: string };
  browser?: { name: string; version: string };
  pages?: HarPage[];
  entries: HarEntry[];
}

interface HarFile {
  log: HarLog;
}

type LoadedHarResult = { success: true; result: HarFile } | {
  success: false;
  error: string;
};

async function generateHar(
  browser: Browser,
  url: URL,
  timeout: number,
): Promise<GenerateHarResult> {
  try {
    const temp = await Deno.makeTempFile();
    const context = await browser.newContext({
      recordHar: {
        mode: "full",
        path: temp,
      },
      acceptDownloads: false,
      viewport: { width: 1280, height: 720 },
      userAgent: "Laggometer Speedtest",
    });
    const page = await context.newPage();
    await page.goto(url.toString(), {
      timeout,
      waitUntil: "networkidle",
    });
    await page.close();
    await context.close();
    return { success: true, path: temp };
  } catch (e) {
    return { success: false, error: errorToString(e) };
  }
}

async function loadHar(
  browser: Browser,
  url: URL,
  timeout: number,
): Promise<LoadedHarResult> {
  const harFile = await generateHar(browser, url, timeout);
  if (harFile.success) {
    try {
      const har = await Deno.readTextFile(harFile.path);
      const harContent: HarFile = JSON.parse(har);
      for (const entry of harContent.log.entries) {
        if (entry.response?.content) {
          delete entry.response.content.text;
        }
      }
      return {
        success: true,
        result: harContent,
      };
    } finally {
      await Deno.remove(harFile.path);
    }
  } else {
    return harFile;
  }
}

async function bestHarResult(
  browser: Browser,
  url: URL,
  timeout: number,
  attempts: number,
  rankBy: EventChoice,
): Promise<LoadedHarResult> {
  let best: LoadedHarResult = { success: false, error: "No attempts done" };
  for (let i = 0; i < attempts; i++) {
    const har = await loadHar(browser, url, timeout);
    if (!best.success) {
      best = har;
    } else if (har.success) {
      const untilNow = best.result.log.pages?.[0].pageTimings[rankBy];
      const newTiming = har.result.log.pages?.[0].pageTimings[rankBy];
      if (!untilNow || (newTiming && newTiming < untilNow)) {
        best = har;
      }
    }
  }
  return best;
}

async function collectHars(
  urls: URL[],
  timeout: number,
  attempts: number,
  rankBy: EventChoice,
): Promise<LoadedHarResult[]> {
  return await withBrowser(async (browser) => {
    const results: LoadedHarResult[] = [];
    for (const url of urls) {
      results.push(
        await bestHarResult(browser, url, timeout, attempts, rankBy),
      );
    }
    return results;
  });
}

await new Command()
  .name("laggometer")
  .version("0.1.0")
  .option(
    "-a --attempts <attempts:number>",
    "Try several times and use the best HAR",
    { default: 3 },
  )
  .option(
    "-t --timeout <timeout:number>",
    "Timeout in milliseconds to wait for an URL",
    { default: 10000 },
  )
  .option(
    "-c --choose-by <value:EventChoice>",
    "Rank HAR files by time until this event",
    {
      default: "onLoad",
    },
  )
  .arguments("<urls...:string>")
  .action(async (options, ...urls: string[]) => {
    if (urls.length == 0) {
      console.error("Provide at least one url");
      Deno.exit(1);
    } else {
      // Let it crash with invalid URLs
      const parsed = urls.map((u) => new URL(u));
      const hars = await collectHars(
        parsed,
        options.timeout,
        options.attempts,
        options.chooseBy as EventChoice,
      );
      const result = Object.fromEntries(
        parsed.map((
          key,
          index,
        ) => [
          key,
          hars[index].success ? hars[index].result : hars[index].error,
        ]),
      );
      console.log(JSON.stringify(result, null, 2));
    }
  }).parse(Deno.args);
