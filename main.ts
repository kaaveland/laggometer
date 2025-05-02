import { Browser, chromium } from "playwright-core";
import { Command } from "@cliffy/command";

async function withBrowser<A>(
  callback: (browser: Browser) => Promise<A>,
): Promise<A> {
  let browser;
  try {
    browser = await chromium.launch();
    return await callback(browser);
  } finally {
    if (browser) {
      browser.close();
    }
  }
}

async function generateHar(
  browser: Browser,
  url: URL,
  timeout: number,
): Promise<string> {
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
  await context.close();
  return temp;
}

async function collectHars(urls: URL[], timeout: number): Promise<string[]> {
  return await withBrowser(async (browser) => {
    const results: string[] = [];
    for (const url of urls) {
      const harPath = await generateHar(browser, url, timeout);
      results.push(harPath);
    }
    return results;
  });
}

await new Command()
  .name("laggometer")
  .version("0.1.0")
  .option(
    "-t --timeout <timeout:number>",
    "Timeout in milliseconds to wait for an URL",
    { default: 10000 },
  )
  .arguments("<urls...:string>")
  .action(async (options, ...urls: string[]) => {
    if (urls.length == 0) {
      console.error("Provide at least one url");
      Deno.exit(1);
    } else {
      // Let it crash with invalid URLs
      const parsed = urls.map((u) => new URL(u));
      const hars = await collectHars(parsed, options.timeout);

      // Read the HAR files and map them
      const result: Record<string, string> = {};
      for (let i = 0; i < parsed.length; i++) {
        const urlStr = parsed[i].toString();
        const harContent = await Deno.readTextFile(hars[i]);
        const harJson = JSON.parse(harContent);

        if (harJson?.log?.entries) {
          for (const entry of harJson.log.entries) {
            if (entry.response && entry.response.content) {
              // This bloats the .har for no good purpose
              entry.response.content.text = "dropped";
            }
          }
        }

        result[urlStr] = harJson;
      }

      console.log(JSON.stringify(result, null, 2));
    }
  }).parse(Deno.args);
