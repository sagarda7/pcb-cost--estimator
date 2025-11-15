"use client";
import React, { useState, ChangeEvent } from "react";
import { num, clampQty, roundup } from "./utils";
import { saveLead } from "../lib/db"; // change to "@/lib/db" if alias works
import CustomerForm from "./CustomerForm";
import SummaryModal from "./SummaryModal";

const CONST = { elecChem: 50, cutting: 50, areaRatePer100: 200, thPadMultiplier: 4, smdPadMultiplier: 4, viaMultiplier: 8 };

type FabricationInputs = { height: string; width: string; thPads: string; smdPads: string; vias: string; layers: string; qty: string };

export default function FabricationOnly() {
  const [inputs, setInputs] = useState<FabricationInputs>({ height: "", width: "", thPads: "", smdPads: "", vias: "", layers: "1", qty: "2" });
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [layerError, setLayerError] = useState<string | null>(null);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "layers") {
      // accept only 1 or 2
      const v = Number(value);
      const clamped = v <= 1 ? 1 : v >= 2 ? 2 : 1;
      setInputs((s) => ({ ...s, layers: String(clamped) }));
      setLayerError(null);
      return;
    }
    setInputs((s) => ({ ...s, [name]: value }));
  };

  const height = num(inputs.height), width = num(inputs.width), thPads = num(inputs.thPads), smdPads = num(inputs.smdPads), vias = num(inputs.vias), layers = num(inputs.layers), qty = clampQty(inputs.qty);

  const area = height * width, areaCost = roundup(area / 100) * CONST.areaRatePer100, thCost = thPads * CONST.thPadMultiplier, smdCost = smdPads * CONST.smdPadMultiplier, viaCost = vias * CONST.viaMultiplier;
  const pcbCost = 150 * (Math.max(1, layers - 1) + (layers - 1) * 0.5), elecChem = CONST.elecChem * Math.max(1, layers), cutting = CONST.cutting;
  const unitCost = areaCost + thCost + smdCost + viaCost + pcbCost + elecChem + cutting, gross = unitCost * qty, total = gross + 150;

  const layersValid = layers === 1 || layers === 2;


  // in FabricationOnly / FabricationWithDesign
  async function handleQuote(customer: any) {
    if (!layersValid) { setLayerError("Layers must be 1 or 2"); return; }
    try {
      setSaving(true);
      await saveLead({
        calculatorType: "fabrication",
        inputs: { ...inputs, layers: String(layers) },
        summary: { area, areaCost, thCost, smdCost, viaCost, pcbCost, elecChem, cutting, unitCost, qty, gross, shipping: 150, finalTotal: total },
        customer
      });
      setRows([
        { label: "Area (cm²)", value: area.toFixed(2) },
        { label: "Area Cost", value: `₹${areaCost}` },
        { label: "PCB Cost", value: `₹${pcbCost.toFixed(2)}` },
        { label: "Unit Cost", value: `₹${unitCost}` },
        { label: `Gross Total ×${qty}`, value: `₹${gross}` },
        { label: "Shipping", value: "₹150" },
        { label: "Final Total", value: `₹${total}` }
      ]);
      setOpen(true); setSaving(false);
    } catch (err: any) {
      alert(`Save failed: ${err?.code || ''} ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  }


  return (
    <div className="p-6 bg-white shadow rounded w-full max-w-5xl">
      <h2 className="text-xl font-semibold mb-4">Fabrication Only</h2>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          {([{ key: "height", label: "Height (cm)" },
          { key: "width", label: "Width (cm)" },
          { key: "thPads", label: "TH Pads" },
          { key: "smdPads", label: "SMD Pads" },
          { key: "vias", label: "Vias" },
          { key: "layers", label: "Layers (1 or 2)", min: 1, max: 2 },
          { key: "qty", label: "Quantity (min 2)", min: 2 }] as any[])
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
        <div className="border-l pl-4">
          <CustomerForm onSubmit={handleQuote} submitting={saving} />
        </div>
      </div>
      <SummaryModal open={open} onClose={() => setOpen(false)} title="Quote Summary" summary={rows} />
    </div>
  );
}
