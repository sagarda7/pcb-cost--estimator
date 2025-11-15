import { signApiToken } from "@/lib/auth";
import { LeadPayload } from "@/lib/db";

export async function sendEmailSummaryAction(payload:LeadPayload) {
  console.log("sendEmailSummaryAction called with payload:", payload);
  const token = await signApiToken({ sub: "send-summary" }, "10m"); // or we can call api/auth also
  
  // 2) Call the protected email API
  const res = await fetch("/api/send-summary", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Email API failed: ${res.status}`);
  }
}
