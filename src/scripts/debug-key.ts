import * as fs from "fs";
import * as path from "path";

// Manually load .env
try {
    const envPath = path.resolve(__dirname, "../../.env");
    const envFile = fs.readFileSync(envPath, "utf8");
    envFile.split("\n").forEach(line => {
        const [key, value] = line.split("=");
        if (key && value) {
            // Basic parsing: remove quotes if present
            process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, "");
        }
    });
} catch (e) {
    console.warn("Could not load .env file manually:", e);
}

const key = process.env.FIREBASE_PRIVATE_KEY;

console.log("--- Firebase Key Debug ---");
if (!key) {
    console.error("❌ FIREBASE_PRIVATE_KEY is missing!");
} else {
    console.log("✅ Key found.");
    console.log(`Length: ${key.length}`);
    console.log(`First 20 chars: ${key.substring(0, 20)}`);
    console.log(`Last 20 chars: ${key.substring(key.length - 20)}`);

    const formatted = key.replace(/\\n/g, "\n").replace(/^"|"$/g, "");
    console.log(`Formatted Length: ${formatted.length}`);
    console.log(`Contains real newlines? ${formatted.includes("\n")}`);

    if (formatted.includes("-----BEGIN PRIVATE KEY-----")) {
        console.log("✅ Header found.");
    } else {
        console.error("❌ Header MISSING (-----BEGIN PRIVATE KEY-----)");
    }
}
