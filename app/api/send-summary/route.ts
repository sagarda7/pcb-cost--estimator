import { formatKeyLabel } from "@/lib/utils";
import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const allowedOrigin = process.env.ALLOWED_ORIGIN;

export async function OPTIONS() {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "600");
  return res;
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || (allowedOrigin && origin !== allowedOrigin)) {
    return NextResponse.json({ ok:false, error:"Forbidden origin" }, { status: 403 });
  }


  const { calculatorType, inputs, summary, customer } = await req.json();

  try {
    const html = `
      <h2>New PCB Quote</h2>
      <h3>Customer</h3>
      <p><b>Name:</b> ${customer.fullName}</p>
      <p><b>Email:</b> ${customer.email}</p>
      <p><b>Phone:</b> ${customer.phone}</p>
      <p><b>Project:</b> ${customer.projectDescription}</p>
      <p><b>Type:</b> ${calculatorType?.toUpperCase()}</p>
      <hr/>
      <h3>Inputs</h3>
      <table cellpadding="6" cellspacing="0" border="0">
        ${Object.entries(inputs)
          .map(([k, v]) => `<tr><td><b>${formatKeyLabel(k)}</b></td><td>${v}</td></tr>`)
          .join("")}
      </table>
      <hr/>
      <h3>Summary</h3>
      <table cellpadding="6" cellspacing="0" border="0">
        ${Object.entries(summary)
          .map(([k, v]) => `<tr><td><b>${formatKeyLabel(k)}</b></td><td>${v}</td></tr>`)
          .join("")}
      </table>
    `;

    await resend.emails.send({
      from: "Techasdy Estimator <no-reply@techasdy.com>", // add a verified domain or use onresend.com domain
      to: ["techasdy@gmail.com"],
      subject: `New PCB Quote from ${customer.fullName}`,
      html,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
