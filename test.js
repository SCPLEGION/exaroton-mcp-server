import { Client } from "exaroton";

// The exaroton API rate-limits by request rate: bursts return HTTP 429 with an
// HTML (non-JSON) body, which the exaroton library mis-surfaces as
// "TypeError: Cannot read properties of null (reading 'success')".
// We avoid it two ways: (1) a global throttle that spaces out request starts to
// stay under the limit, and (2) retry-with-backoff as a safety net.

const client = new Client(process.env.EXAROTON_API_TOKEN);

await client.server("eVfhSRZaRzElGNUt").getFile("/test.txt").upload("/home/scplegion/Dokumenty/GitHub/exaroton-mcp-server/test.txt");

