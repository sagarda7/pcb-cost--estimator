"use client";
import React, { useState, ChangeEvent } from "react";
import type { BaseInputs, CalcBreakdown, FabricationInputs } from "./types";
import { num, clampQty, roundup, discountRow } from "./utils";

const FAB_ONLY_CONST = {
  elecChem: 50,
  cutting: 50,
  areaRatePer100: 200,
  thPadMultiplier: 4,
  smdPadMultiplier: 4,
  viaMultiplier: 8,
};

export default function FabricationOnly() {
  const [inputs, setInputs] = useState<FabricationInputs>({
    height: "",
    width: "",
    thPads: "",
    smdPads: "",
    vias: "",
    layers: "1", // default 1 layer
    qty: "2",
  });

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInputs((s) => ({ ...s, [name]: value }));
  };

  const height = num(inputs.height);
  const width = num(inputs.width);
  const thPads = num(inputs.thPads);
  const layers = num(inputs.layers);
  const qty = clampQty(inputs.qty);

  const area = height * width;
  const areaCost = roundup(area / 100) * FAB_ONLY_CONST.areaRatePer100;
  const thCost = thPads * FAB_ONLY_CONST.thPadMultiplier;
  const smdCost = num(inputs.smdPads) * FAB_ONLY_CONST.smdPadMultiplier;
  const viaCost = num(inputs.vias) * FAB_ONLY_CONST.viaMultiplier;

  // Updated PCB cost formula
  const pcbCost = 150 * (Math.max(1, layers - 1) + (layers - 1) * 0.5);

  const elecChem = FAB_ONLY_CONST.elecChem * Math.max(1, layers);
  const cutting = FAB_ONLY_CONST.cutting;
  const unitCost = areaCost + thCost + pcbCost + elecChem + cutting+ smdCost + viaCost;
  const gross = unitCost * qty;
  const { discount, total } = discountRow(gross, qty);

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-5xl">
      <h2 className="text-xl font-semibold mb-4">Fabrication Only Calculator</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Form */}
        <div>
          {[
            { key: "height", label: "Height (cm)" },
            { key: "width", label: "Width (cm)" },
            { key: "thPads", label: "Number of TH Pads" },
            { key: "smdPads", label: "Number of SMD Pads" },
            { key: "vias", label: "Number of Vias" },
            { key: "layers", label: "Number of Layers", min: 1 },
            { key: "qty", label: "Total Quantity (min 2)", min: 2 },
          ].map(({ key, label, min }) => (
            <div key={key} className="mb-3">
              <label className="block font-medium">{label}</label>
              <input
                type="number"
                name={key}
                value={(inputs as any)[key]}
                min={min ?? 0}
                onChange={onChange}
                className="border w-full p-2 rounded-lg"
              />
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="border-l pl-6">
          <h3 className="text-lg font-semibold mb-3">Cost Summary</h3>
          <div className="space-y-1 text-sm">
            <p>Area: <b>{area.toFixed(2)}</b> cm²</p>
            <p>Area Cost: <b>₹{areaCost}</b></p>
            <p>TH Pads Cost: <b>₹{thCost}</b></p>
            <p>SMD Pads Cost: <b>₹{smdCost}</b></p>
            <p>Vias Cost: <b>₹{viaCost}</b></p>
            <p>PCB Cost: <b>₹{pcbCost.toFixed(2)}</b></p>
            <p>Electricity & Chemical: <b>₹{elecChem}</b></p>
            <p>Cutting: <b>₹{cutting}</b></p>
            <p className="font-semibold mt-2">Unit Cost: <b>₹{unitCost}</b></p>
            <p>Gross Total (×{qty}): <b>₹{gross}</b></p>
            <p>Discount: <b>₹{discount.toFixed(2)}</b></p><br/>
            <p className="text-lg font-bold text-red-600">Final Total With Shipping (Rs. 150): <b>₹{(total + 150).toFixed(2)}</b></p>
          </div>
        </div>
      </div>
    </div>
  );
}
