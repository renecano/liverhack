// Genera un token para MCP_AUTH_TOKEN y su SHA-256 para mcp-server/.env.
//   npm run token
import { createHash, randomBytes } from "node:crypto";

const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token, "utf8").digest("hex");
console.log("1) En claude_desktop_config.json (bloque env):");
console.log(`   "MCP_AUTH_TOKEN": "${token}"`);
console.log("");
console.log("2) En mcp-server/.env:");
console.log(`   MCP_AUTH_TOKEN_SHA256=${hash}`);
