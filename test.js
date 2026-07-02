import { Client } from "exaroton";

// The exaroton API rate-limits by request rate: bursts return HTTP 429 with an
// HTML (non-JSON) body, which the exaroton library mis-surfaces as
// "TypeError: Cannot read properties of null (reading 'success')".
// We avoid it two ways: (1) a global throttle that spaces out request starts to
// stay under the limit, and (2) retry-with-backoff as a safety net.

const MIN_GAP_MS = 150; // ~6.6 requests/second globally
let nextSlot = 0;
async function throttle() {
    const now = Date.now();
    const wait = Math.max(0, nextSlot - now);
    nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
    if (wait) await new Promise((r) => setTimeout(r, wait));
}

async function withRetry(fn, { retries = 5, baseDelay = 500, path = "" } = {}) {
    let attempt = 0;
    for (;;) {
        try {
            await throttle();
            return await fn();
        } catch (err) {
            attempt++;
            if (attempt > retries) throw err;
            const delay = baseDelay * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
            console.warn(`retry ${attempt}/${retries} ${path} in ${delay}ms (${err.message})`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
}

async function recursiveScan(client, serverId, root = "/", concurrency = 4) {
    const excludedDirs = new Set([
        "/plugins/Nexo/pack/template_packs",
        "/libraries",
    ]);

    const tree = {};
    const visited = new Set();

    const queue = [root];
    let active = 0;

    async function worker() {
        while (active > 0 || queue.length > 0) {
            const path = queue.shift();
            if (!path) {
                await new Promise((r) => setTimeout(r, 20)); // poczekaj, może coś przyjdzie
                continue;
            }
            if (visited.has(path) || excludedDirs.has(path)) continue;
            visited.add(path);
            active++;
            try {
                const children = await withRetry(
                    () => client.server(serverId).getFile(path).getChildren(),
                    { path }
                );
                const node = path === "/" ? tree : getNode(tree, path);
                for (const child of children) {
                    const fullPath = path === "/" ? `/${child.name}` : `${path}/${child.name}`;
                    if (child.isDirectory || child.type === "dir") {
                        queue.push(fullPath);
                    } else {
                        (node.files ??= []).push(child.name);
                    }
                }
            } catch (err) {
                console.error("ERR", path, err.message);
            } finally {
                active--;
            }
        }
    }

    function getNode(tree, path) {
        const parts = path.split("/").filter(Boolean);
        let current = tree;

        for (const p of parts) {
            current[p] ??= {};
            current = current[p];
        }

        return current;
    }

    const workers = [];
    for (let i = 0; i < concurrency; i++) {
        workers.push(worker());
    }

    await Promise.all(workers);

    return tree;
}

const client = new Client(process.env.EXAROTON_API_TOKEN);

const tree = await recursiveScan(
    client,
    "eVfhSRZaRzElGNUt",
    "/plugins",
    4
);

console.dir(tree, { depth: null });
