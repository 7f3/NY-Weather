import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const host = "127.0.0.1";
const port = 5173;
const root = process.cwd();

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = normalize(join(root, requested));

  if (!file.startsWith(root) || !existsSync(file)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": types[extname(file)] ?? "application/octet-stream"
  });
  createReadStream(file).pipe(response);
});

server.on("error", (error) => {
  console.error(`Could not start Weather on http://${host}:${port}`);
  console.error(error.message);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Weather is running at http://${host}:${port}`);
});
