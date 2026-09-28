import { build, preview } from "vite";

const base = "/RainFlix/";
await build({ base });
const server = await preview({
  base,
  preview: {
    host: "127.0.0.1",
    port: Number(process.env.PLAYWRIGHT_PAGES_PORT) || 4175,
    strictPort: true,
  },
});
server.printUrls();
