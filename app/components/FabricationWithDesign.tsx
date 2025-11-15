"use client";
import React, { useState, ChangeEvent } from "react";
import { num, clampQty, roundup } from "./utils";
import { LeadPayload, saveLead } from "../lib/db"; // change to "@/lib/db" if alias works
import CustomerForm from "./CustomerForm";
import SummaryModal from "./SummaryModal";
import { sendEmailSummaryAction } from "@/actions";

type DesignInputs = { height: string; width: string; totalComponentsLegs: string; layers: string; qty: string };

const CONST = { elecChem: 60, cutting: 50, areaRatePer100: 220 };

function calculateDesignCost(totalLegs: number) {
  let remaining = totalLegs, cost = 0;
  const tiers = [{ limit: 10, multiplier: 40 }, { limit: 10, multiplier: 35 }, { limit: 10, multiplier: 25 }, { limit: 10, multiplier: 20 }];
  for (const t of tiers) { if (remaining <= 0) break; const used = Math.min(remaining, t.limit); cost += used * t.multiplier; remaining -= used; }
  if (remaining > 0) cost += remaining * 15; return cost;
}

export default function FabricationWithDesign() {
  const [inputs, setInputs] = useState<DesignInputs>({ height: "", width: "", totalComponentsLegs: "5", layers: "1", qty: "2" });
  const [saving, setSaving] = useState(false); const [open, setOpen] = useState(false); const [rows, setRows] = useState<any[]>([]);
  const [layerError, setLayerError] = useState<string | null>(null);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "layers") {
      const v = Number(value);
      const clamped = v <= 1 ? 1 : v >= 2 ? 2 : 1;
      setInputs(s => ({ ...s, layers: String(clamped) }));
      setLayerError(null);
      return;
    }
    setInputs(s => ({ ...s, [name]: value }));
  };

  const height = num(inputs.height), width = num(inputs.width), layers = num(inputs.layers), legs = num(inputs.totalComponentsLegs), qty = clampQty(inputs.qty);
  const area = height * width, areaCost = roundup(area / 100) * CONST.areaRatePer100, designCost = calculateDesignCost(legs);
  const pcbCost = 150 * (Math.max(1, layers - 1) + (layers - 1) * 0.5), elecChem = CONST.elecChem * Math.max(1, layers), cutting = CONST.cutting;
  const unitCost = areaCost + pcbCost + elecChem + cutting + Math.max(100, 5 * legs), gross = unitCost * qty, net = gross + designCost, shipping = 150, finalTotal = net + shipping;

  const layersValid = layers === 1 || layers === 2;

  async function handleQuote(customer: any) {
    if (!layersValid) { setLayerError("Layers must be 1 or 2"); return; }
    try {
      const payload: LeadPayload = {
        calculatorType: "fabDesign",
        inputs: { ...inputs, layers: String(layers) },
        summary: { area, areaCost, pcbCost, designCost, elecChem, cutting, unitCost, qty, gross, net, shipping, finalTotal },
        customer
      };

      setSaving(true);
      //await saveLead(payload);

      // 2) Then email summary
      try {
        await sendEmailSummaryAction(payload);
      } catch (e:any) {
        console.warn("Email failed:", e?.message || e);
        // optional: toast.warn("We saved your request, but email notification failed.");
      }

      setRows([
        { label: "Area (cm²)", value: area.toFixed(2) },
        { label: "Area Cost", value: `₹${areaCost}` },
        { label: "PCB Cost", value: `₹${pcbCost.toFixed(2)}` },
        { label: "Unit Cost", value: `₹${unitCost}` },
        { label: `Gross Total ×${qty}`, value: `₹${gross}` },
        { label: "Design Cost", value: `₹${designCost}` },
        { label: "Shipping", value: "₹150" },
        { label: "Final Total", value: `₹${finalTotal}` }
      ]);
      setOpen(true); setSaving(false);
    } catch (err: any) {
      alert(`Save failed: ${err?.code || ''} ${err?.message || err}`);
    } finally {
      setSaving(false);
    }

  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-5xl">
      <h2 className="text-xl font-semibold mb-4">Fabrication + Design Calculator</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          {([{ key: "height", label: "Height (cm)" },
          { key: "width", label: "Width (cm)" },
          { key: "totalComponentsLegs", label: "Total Components Legs as per Schematic" },
          { key: "layers", label: "Number of Layers (1 or 2)", min: 1, max: 2 },
          { key: "qty", label: "Total Quantity (min 2)", min: 2 }] as any[])
            .map(({ key, label, min, max }) => (
              <div key={key} className="mb-3">
                <label className="block font-medium">{label}</label>
                <input
                  type="number"
                  name={key}
                  value={(inputs as any)[key]}
                  min={min ?? 0}
                  max={max ?? undefined}
                  onChange={onChange}
                  className={`border w-full p-2 rounded-lg ${key === "layers" && layerError ? "border-red-500" : ""}`}
                />
                {key === "layers" && layerError && <p className="text-xs text-red-600 mt-1">{layerError}</p>}
              </div>
            ))}
        </div>
        <div className="border-l pl-6">
          <h3 className="text-lg font-semibold mb-3">Your details</h3>
          <CustomerForm onSubmit={handleQuote} submitting={saving} />
          <p className="mt-3 text-xs text-gray-500">We’ll save your details and this estimate to prepare a formal quote.</p>
        </div>
      </div>
      <SummaryModal open={open} onClose={() => setOpen(false)} title="Fabrication + Design — Quote Summary" summary={rows} />
    </div>
  );
}
