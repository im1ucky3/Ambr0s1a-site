import { getDb } from "../db";
import { siteContent } from "../db/schema";
import { siteTextDefaults, SiteTextKey } from "./site-text";

export async function getSiteText() {
  const content = { ...siteTextDefaults } as Record<SiteTextKey, string>;
  try {
    const db = await getDb();
    const rows = await db.select().from(siteContent);
    for (const row of rows) {
      if (row.key in content) content[row.key as SiteTextKey] = row.value;
    }
  } catch {
    // Keep the public page available with its built-in copy when storage is unavailable.
  }
  return content;
}
