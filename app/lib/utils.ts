import { signApiToken } from "@/lib/auth";
import { LeadPayload } from "@/lib/db";

// lib/sendEmailSummary.ts (client-side)

export function formatKeyLabel(key: string): string {
  // If it's entirely lowercase → capitalize first letter
  if (/^[a-z]+$/.test(key)) {
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  // Otherwise, insert space before each capital letter and capitalize the first letter overall
  const withSpaces = key.replace(/([A-Z])/g, " $1");
  const trimmed = withSpaces.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

