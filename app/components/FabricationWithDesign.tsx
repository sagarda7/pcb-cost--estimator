"use client";
import React, { useState, ChangeEvent } from "react";
import { num, clampQty, roundup } from "./utils";
import { LeadPayload, saveLead } from "../lib/db";
import CustomerForm from "./CustomerForm";
import SummaryModal from "./SummaryModal";
import { sendEmailSummaryAction } from "@/actions";

import { pdf } from "@react-pdf/renderer";
import QuotePdf from "./QuotePdf";

type DesignInputs = {
  height: string;
  width: string;
  totalComponentsLegs: string;
  layers: string;
  qty: string;
};

const CONST = { elecChem: 60, cutting: 50, areaRatePer100: 220 };

function calculateDesignCost(totalLegs: number) {
  let remaining = totalLegs,
    cost = 0;
  const tiers = [
    { limit: 10, multiplier: 40 },
    { limit: 10, multiplier: 35 },
    { limit: 10, multiplier: 25 },
    { limit: 10, multiplier: 20 },
  ];
  for (const t of tiers) {
    if (remaining <= 0) break;
    const used = Math.min(remaining, t.limit);
    cost += used * t.multiplier;
    remaining -= used;
  }
  if (remaining > 0) cost += remaining * 15;
  return cost;
}

type Row = { label: string; value: string | number };
type Section = { title: string; rows: Row[] };

type Item = {
  id: string;
  inputs: DesignInputs;
  layerError: string | null;
};

function newItem(): Item {
  return {
    id: crypto?.randomUUID?.() ?? String(Date.now() + Math.random()),
    inputs: {
      height: "",
      width: "",
      totalComponentsLegs: "5",
      layers: "1",
      qty: "2",
    },
    layerError: null,
  };
}

function calcOne(inputs: DesignInputs) {
  const height = num(inputs.height);
  const width = num(inputs.width);
  const layers = num(inputs.layers);
  const legs = num(inputs.totalComponentsLegs);
  const qty = clampQty(inputs.qty);

  const area = height * width; // mm²
  const areaCost = roundup(area / 1000) * CONST.areaRatePer100;
  const designCost = calculateDesignCost(legs);

  const pcbCost = 150 * (Math.max(1, layers - 1) + (layers - 1) * 0.5);
  const elecChem = CONST.elecChem * Math.max(1, layers);
  const cutting = CONST.cutting;

  const assemblyLike = Math.max(100, 5 * legs);

  const unitCost = areaCost + pcbCost + elecChem + cutting + assemblyLike;
  const gross = unitCost * qty;
  const net = gross + designCost;

  const layersValid = layers === 1 || layers === 2;

  return {
    height,
    width,
    layers,
    legs,
    qty,

    area,
    areaCost,
    pcbCost,
    elecChem,
    cutting,
    assemblyLike,

    unitCost,
    gross,
    designCost,
    net,

    layersValid,
  };
}

export default function FabricationWithDesign() {
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  // IMPORTANT: this is sectioned summary now (for modal + pdf)
  const [rows, setRows] = useState<Section[]>([]);

  // store customer for PDF
  const [lastCustomer, setLastCustomer] = useState<any>(null);

  const updateItemInput = (itemId: string, e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;

        if (name === "layers") {
          const v = Number(value);
          const clamped = v <= 1 ? 1 : v >= 2 ? 2 : 1;
          return { ...it, inputs: { ...it.inputs, layers: String(clamped) }, layerError: null };
        }

        return { ...it, inputs: { ...it.inputs, [name]: value } as DesignInputs };
      })
    );
  };

  const addItem = () => setItems((s) => [...s, newItem()]);
  const removeItem = (id: string) => setItems((s) => (s.length <= 1 ? s : s.filter((x) => x.id !== id)));

  async function downloadPdf() {
    if (!rows?.length) return;

    const blob = await pdf(
      <QuotePdf
        title="Fabrication + Design — Quote Summary"
        sections={rows}
        customer={lastCustomer}
        meta={{ dateText: new Date().toLocaleString() }}
      />
    ).toBlob();

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quote-${Date.now()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleQuote(customer: any) {
    setLastCustomer(customer);

    const calcs = items.map((it) => ({ id: it.id, inputs: it.inputs, calc: calcOne(it.inputs) }));

    const invalidIds = calcs.filter((x) => !x.calc.layersValid).map((x) => x.id);
    if (invalidIds.length) {
      setItems((prev) =>
        prev.map((it) =>
          invalidIds.includes(it.id) ? { ...it, layerError: "Layers must be 1 or 2" } : it
        )
      );
      return;
    }

    // shipping once per quote
    const shipping = 150;
    const netSum = calcs.reduce((a, x) => a + x.calc.net, 0);
    const finalTotal = netSum + shipping;

    try {
      setSaving(true);

      const payload: LeadPayload = {
        calculatorType: "fabDesign",
        inputs: { items: items.map((it) => it.inputs) } as any,
        summary: {
          items: calcs.map((x, idx) => ({ itemNo: idx + 1, ...x.calc })),
          netSum,
          shipping,
          finalTotal,
        } as any,
        customer,
      };

      await saveLead(payload);

      try {
        await sendEmailSummaryAction(payload);
      } catch (e: any) {
        console.warn("Email failed:", e?.message || e);
      }

      // Detailed sectioned summary (modal + pdf)
      const sections: Section[] = calcs.map((x, idx) => {
        const it = x.inputs;
        const c = x.calc;

        return {
          title: `Item ${idx + 1} — Fabrication + Design`,
          rows: [
            // Inputs
            { label: "Height (mm)", value: it.height || 0 },
            { label: "Width (mm)", value: it.width || 0 },
            { label: "Total Components Legs", value: it.totalComponentsLegs || 0 },
            { label: "Layers", value: it.layers || 1 },
            { label: "Qty", value: c.qty },

            // Derived + Costs
            { label: "Area (mm²)", value: c.area.toFixed(2) },
            { label: "Area Cost", value: `₹${c.areaCost}` },
            { label: "PCB Cost", value: `₹${c.pcbCost.toFixed(2)}` },
            { label: "Elec/Chem", value: `₹${c.elecChem}` },
            { label: "Cutting", value: `₹${c.cutting}` },
            { label: "Assembly/Legs Cost", value: `₹${c.assemblyLike}` },

            { label: "Unit Cost", value: `₹${c.unitCost}` },
            { label: `Gross Total ×${c.qty}`, value: `₹${c.gross}` },
            { label: "Design Cost", value: `₹${c.designCost}` },
            { label: "Net (Gross + Design)", value: `₹${c.net}` },
          ],
        };
      });

      sections.push({
        title: "Totals",
        rows: [
          { label: "Net Total (All Items)", value: `₹${netSum}` },
          { label: "Shipping", value: `₹${shipping}` },
          { label: "Final Total", value: `₹${finalTotal}` },
        ],
      });

      setRows(sections);
      setOpen(true);
    } catch (err: any) {
      alert(`Save failed: ${err?.code || ""} ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Fabrication + Design Calculator</h2>

        <button
          type="button"
          onClick={addItem}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          + Add
        </button>
      </div>

      <div className="grid gap-6">
        {items.map((it, idx) => (
          <div
            key={it.id}
            className="mx-auto w-full max-w-6xl rounded-2xl border border-gray-300 bg-white p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">
                PCB + Design Details {items.length > 1 ? `• Item ${idx + 1}` : ""}
              </h3>

              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(it.id)}
                  className="text-sm text-red-600 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {([
                { key: "height", label: "Height (mm)" },
                { key: "width", label: "Width (mm)" },
                { key: "totalComponentsLegs", label: "Total Components Legs" },
                { key: "layers", label: "Layers (1 or 2)", min: 1, max: 2 },
                { key: "qty", label: "Quantity", min: 1 },
              ] as any[]).map(({ key, label, min, max }) => (
                <div key={key} className="min-w-0">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>

                  <input
                    type="number"
                    name={key}
                    value={(it.inputs as any)[key]}
                    min={min ?? 0}
                    max={max}
                    onChange={(e) => updateItemInput(it.id, e)}
                    className={`w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      key === "layers" && it.layerError ? "border-red-500" : ""
                    }`}
                  />

                  {key === "layers" && it.layerError && (
                    <p className="mt-1 text-xs text-red-600">{it.layerError}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Customer Form */}
        <div className="border-t pt-4">
          <CustomerForm onSubmit={handleQuote} submitting={saving} />
          <p className="mt-3 text-xs text-gray-500">
            We’ll save your details and this estimate to prepare a formal quote.
          </p>
        </div>
      </div>

      <SummaryModal
        open={open}
        onClose={() => setOpen(false)}
        title="Fabrication + Design — Quote Summary"
        summary={rows}
        onDownloadPdf={downloadPdf}
      />
    </div>
  );
}
