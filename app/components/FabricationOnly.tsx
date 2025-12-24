"use client";
import React, { useState, ChangeEvent } from "react";
import { num, clampQty, roundup } from "./utils";
import { LeadPayload, saveLead } from "../lib/db";
import CustomerForm from "./CustomerForm";
import SummaryModal from "./SummaryModal";
import { sendEmailSummaryAction } from "@/actions";

import { pdf } from "@react-pdf/renderer";
import QuotePdf from "./QuotePdf";

const CONST = {
  elecChem: 50,
  cutting: 50,
  areaRatePer100: 220,
  thPadMultiplier: 4,
  smdPadMultiplier: 4,
  viaMultiplier: 8,
};

type FabricationInputs = {
  height: string;
  width: string;
  thPads: string;
  smdPads: string;
  vias: string;
  layers: string;
  qty: string;
};

type Row = { label: string; value: string | number };
type Section = { title: string; rows: Row[] };

type Item = {
  id: string;
  inputs: FabricationInputs;
  layerError: string | null;
};

function newItem(): Item {
  return {
    id: crypto?.randomUUID?.() ?? String(Date.now() + Math.random()),
    inputs: {
      height: "",
      width: "",
      thPads: "",
      smdPads: "",
      vias: "",
      layers: "1",
      qty: "2",
    },
    layerError: null,
  };
}

function calcOne(inputs: FabricationInputs) {
  const height = num(inputs.height);
  const width = num(inputs.width);
  const thPads = num(inputs.thPads);
  const smdPads = num(inputs.smdPads);
  const vias = num(inputs.vias);
  const layers = num(inputs.layers);
  const qty = clampQty(inputs.qty);

  const area = height * width; // mm²
  const areaCost = roundup(area / 10000) * CONST.areaRatePer100;
  const thCost = thPads * CONST.thPadMultiplier;
  const smdCost = smdPads * CONST.smdPadMultiplier;
  const viaCost = vias * CONST.viaMultiplier;

  const pcbCost = 150 * (Math.max(1, layers - 1) + (layers - 1) * 0.5);
  const elecChem = CONST.elecChem * Math.max(1, layers);
  const cutting = CONST.cutting;

  const unitCost = areaCost + thCost + smdCost + viaCost + pcbCost + elecChem + cutting;
  const gross = unitCost * qty;

  const layersValid = layers === 1 || layers === 2;

  return {
    height,
    width,
    thPads,
    smdPads,
    vias,
    layers,
    qty,

    area,
    areaCost,
    thCost,
    smdCost,
    viaCost,
    pcbCost,
    elecChem,
    cutting,
    unitCost,
    gross,

    layersValid,
  };
}

export default function FabricationOnly() {
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Section[]>([]);
  const [saving, setSaving] = useState(false);

  // customer for PDF
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

        return { ...it, inputs: { ...it.inputs, [name]: value } as FabricationInputs };
      })
    );
  };

  const addItem = () => setItems((s) => [...s, newItem()]);
  const removeItem = (id: string) => setItems((s) => (s.length <= 1 ? s : s.filter((x) => x.id !== id)));

  async function downloadPdf() {
    if (!rows?.length) return;

    const blob = await pdf(
      <QuotePdf
        title="Fabrication Only — Quote Summary"
        sections={rows}
        customer={lastCustomer}
        meta={{ dateText: new Date().toLocaleString() }}
      />
    ).toBlob();

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fabrication-quote-${Date.now()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleQuote(customer: any) {
    setLastCustomer(customer);

    // 1) Calculate + validate all items
    const calcs = items.map((it) => ({ id: it.id, inputs: it.inputs, calc: calcOne(it.inputs) }));

    const invalidIds = calcs.filter((x) => !x.calc.layersValid).map((x) => x.id);
    if (invalidIds.length) {
      setItems((prev) =>
        prev.map((it) => (invalidIds.includes(it.id) ? { ...it, layerError: "Layers must be 1 or 2" } : it))
      );
      return;
    }

    // 2) Totals (shipping once per quote)
    const shipping = 150;
    const grossSum = calcs.reduce((a, x) => a + x.calc.gross, 0);
    const finalTotal = grossSum + shipping;

    try {
      setSaving(true);

      const payload: LeadPayload = {
        calculatorType: "fabrication",
        inputs: { items: items.map((it) => it.inputs) } as any,
        summary: {
          items: calcs.map((x, idx) => ({ itemNo: idx + 1, ...x.calc })),
          grossSum,
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

      // 3) Detailed modal sections
      const sections: Section[] = calcs.map((x, idx) => {
        const it = x.inputs;
        const c = x.calc;

        return {
          title: `Item ${idx + 1} — PCB Details`,
          rows: [
            // Inputs
            { label: "Height (mm)", value: it.height || 0 },
            { label: "Width (mm)", value: it.width || 0 },
            { label: "TH Pads", value: it.thPads || 0 },
            { label: "SMD Pads", value: it.smdPads || 0 },
            { label: "Vias", value: it.vias || 0 },
            { label: "Layers", value: it.layers || 1 },
            { label: "Qty", value: c.qty },

            // Derived + Costs
            { label: "Area (mm²)", value: c.area.toFixed(2) },
            { label: "Area Cost", value: `₹${c.areaCost}` },
            { label: "TH Cost", value: `₹${c.thCost}` },
            { label: "SMD Cost", value: `₹${c.smdCost}` },
            { label: "Via Cost", value: `₹${c.viaCost}` },
            { label: "PCB Cost", value: `₹${c.pcbCost.toFixed(2)}` },
            { label: "Elec/Chem", value: `₹${c.elecChem}` },
            { label: "Cutting", value: `₹${c.cutting}` },
            { label: "Unit Cost", value: `₹${c.unitCost}` },
            { label: `Gross Total ×${c.qty}`, value: `₹${c.gross}` },
          ],
        };
      });

      sections.push({
        title: "Totals",
        rows: [
          { label: "Gross Total (All Items)", value: `₹${grossSum}` },
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
    <div className="p-6 bg-white shadow rounded w-full max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Fabrication Only</h2>

        <button
          type="button"
          onClick={addItem}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          + Add
        </button>
      </div>

      <div className="grid gap-6">
        {/* Items */}
        {items.map((it, idx) => (
          <div key={it.id} className="w-full">
            <div className="mx-auto w-full max-w-6xl rounded-2xl border border-gray-300 bg-white p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">
                  PCB Details {items.length > 1 ? `• Item ${idx + 1}` : ""}
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

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
                {([
                  { key: "height", label: "Height (mm)" },
                  { key: "width", label: "Width (mm)" },
                  { key: "thPads", label: "TH Pads" },
                  { key: "smdPads", label: "SMD Pads" },
                  { key: "vias", label: "Vias" },
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
          </div>
        ))}

        {/* Customer Form */}
        <div className="border-t pt-4">
          <CustomerForm onSubmit={handleQuote} submitting={saving} />
        </div>
      </div>

      <SummaryModal
        open={open}
        onClose={() => setOpen(false)}
        title="Fabrication Only — Quote Summary"
        summary={rows}
        onDownloadPdf={downloadPdf}
      />
    </div>
  );
}
