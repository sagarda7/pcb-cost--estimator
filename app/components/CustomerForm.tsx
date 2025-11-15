"use client";
import React, { useMemo, useState } from "react";
import type { CustomerDetails } from "../lib/db"; // change to "@/lib/db" if your alias works

export default function CustomerForm({ onSubmit, submitting }: {
  onSubmit: (details: CustomerDetails) => Promise<void> | void;
  submitting?: boolean;
}) {
  const [form, setForm] = useState<CustomerDetails>({
    fullName: "",
    email: "",
    phone: "",
    projectDescription: "",
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const mark = (k: keyof CustomerDetails) => setTouched((t) => ({ ...t, [k]: true }));

  const errors = useMemo(() => {
    const e: Partial<Record<keyof CustomerDetails, string>> = {};
    // Full name: at least 2 chars
    if (!form.fullName.trim() || form.fullName.trim().length < 2) e.fullName = "Please enter your full name.";

    // Email: simple pattern
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
    if (!emailOk) e.email = "Enter a valid email address.";

    // Phone: digits, length 7–15 (covers most E.164 without +)
    const digits = form.phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) e.phone = "Enter a valid phone number (7–15 digits).";

    // Project description: at least 10 chars
    if (!form.projectDescription.trim() || form.projectDescription.trim().length < 10) e.projectDescription = "Please describe your project (min 10 characters).";

    return e;
  }, [form]);

  const isValid = Object.keys(errors).length === 0;

  function set<K extends keyof CustomerDetails>(k: K, v: CustomerDetails[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  const submit = () => {
    setTouched({ fullName: true, email: true, phone: true, projectDescription: true });
    if (!isValid || submitting) return;
    onSubmit(form);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium">Full name</label>
        <input
          className={`mt-1 w-full rounded-lg border p-2 ${touched.fullName && errors.fullName ? "border-red-500" : ""}`}
          value={form.fullName}
          onBlur={() => mark("fullName")}
          onChange={(e) => set("fullName", e.target.value)}
          placeholder="Your name"
        />
        {touched.fullName && errors.fullName && <p className="text-xs text-red-600 mt-1">{errors.fullName}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            type="email"
            className={`mt-1 w-full rounded-lg border p-2 ${touched.email && errors.email ? "border-red-500" : ""}`}
            value={form.email}
            onBlur={() => mark("email")}
            onChange={(e) => set("email", e.target.value)}
            placeholder="you@example.com"
          />
          {touched.email && errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium">Phone</label>
          <input
            className={`mt-1 w-full rounded-lg border p-2 ${touched.phone && errors.phone ? "border-red-500" : ""}`}
            value={form.phone}
            onBlur={() => mark("phone")}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="98XXXXXXXX"
          />
          {touched.phone && errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">Project description</label>
        <textarea
          className={`mt-1 w-full rounded-lg border p-2 ${touched.projectDescription && errors.projectDescription ? "border-red-500" : ""}`}
          rows={4}
          value={form.projectDescription}
          onBlur={() => mark("projectDescription")}
          onChange={(e) => set("projectDescription", e.target.value)}
          placeholder="Brief overview of your PCB project, constraints, timeline, etc."
        />
        {touched.projectDescription && errors.projectDescription && (
          <p className="text-xs text-red-600 mt-1">{errors.projectDescription}</p>
        )}
      </div>

      <button
        disabled={!isValid || submitting}
        onClick={submit}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {submitting ? "Saving..." : "Get a quote"}
      </button>
    </div>
  );
}
