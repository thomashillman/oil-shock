import fs from "node:fs/promises";
import path from "node:path";

const requiredFiles = [
  "docs/deploy.md",
  "docs/replay-validation.md",
  "app/README.md"
];

for (const file of requiredFiles) {
  const absolute = path.join(process.cwd(), file);
  try {
    await fs.access(absolute);
  } catch {
    console.error(`Missing required documentation file: ${file}`);
    process.exit(1);
  }
}

const deployDoc = await fs.readFile(path.join(process.cwd(), "docs/deploy.md"), "utf8");
const requiredSections = ["Cloudflare", "Vercel", "Environment Variables", "Preview vs Production"];

for (const section of requiredSections) {
  if (!deployDoc.includes(section)) {
    console.error(`docs/deploy.md missing section: ${section}`);
    process.exit(1);
  }
}

console.log("Documentation checks passed.");
