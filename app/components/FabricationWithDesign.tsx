"use client";
import React, { useState, ChangeEvent } from "react";
import type { DesignInputs, CalcBreakdown } from "./types";
import { num, clampQty, roundup, discountRow } from "./utils";

const FAB_DESIGN_CONST = {
  elecChem: 60,
  cutting: 50,
  areaRatePer100: 220,
  componentLegsMultiplier: 40,
};

function calculateDesignCost(totalLegs: any) {
  let remaining = totalLegs;
  let cost = 0;

  // Define tiers
  const tiers = [
    { limit: 10, multiplier: 40 },
    { limit: 10, multiplier: 35 },
    { limit: 10, multiplier: 25 },
    { limit: 10, multiplier: 20 },
  ];

  // Apply tiered pricing
  for (const tier of tiers) {
    if (remaining <= 0) break;

    const used = Math.min(remaining, tier.limit);
    cost += used * tier.multiplier;
    remaining -= used;
  }

  // Remaining legs use multiplier 10
  if (remaining > 0) {
    cost += remaining * 15;
  }

  return cost;
}


export default function FabricationWithDesign() {
  const [inputs, setInputs] = useState<DesignInputs>({
    height: "",
    width: "",
    totalComponentsLegs: "5",
    layers: "1", // default 1 layer
    qty: "2"
  });

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInputs((s) => ({ ...s, [name]: value }));
  };

  const height = num(inputs.height);
  const width = num(inputs.width);
  const layers = num(inputs.layers);
  const totalComponentsLegs = num(inputs.totalComponentsLegs);
  const qty = clampQty(inputs.qty);

  const area = height * width;
  const areaCost = roundup(area / 100) * FAB_DESIGN_CONST.areaRatePer100;
  const designCostWithFab = calculateDesignCost(totalComponentsLegs);
  for(let i=0; i < totalComponentsLegs; i+=10){

  }

  // Updated PCB cost formula
  const pcbCost = 150 * (Math.max(1, layers - 1) + (layers - 1) * 0.5);

  const elecChem = FAB_DESIGN_CONST.elecChem * Math.max(1, layers);
  const cutting = FAB_DESIGN_CONST.cutting;
  const unitCost = areaCost +  pcbCost + elecChem + cutting + Math.max(100,5*totalComponentsLegs);
  const gross = (unitCost * qty);
  const netCost = gross + designCostWithFab;
  const netCostWithShipping = netCost + 150;
  // const { discount, total } = discountRow(gross, qty);

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-5xl">
      <h2 className="text-xl font-semibold mb-4">Fabrication + Design Calculator</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Form */}
        <div>
          {[
            { key: "height", label: "Height (cm)" },
            { key: "width", label: "Width (cm)" },
            { key: "totalComponentsLegs", label: "Total Components Legs as per as Schematic" },
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
            <p>PCB Cost: <b>₹{pcbCost.toFixed(2)}</b></p>
            <p>Electricity & Chemical: <b>₹{elecChem}</b></p>
            <p>Cutting: <b>₹{cutting}</b></p>
            <p className="font-semibold mt-2">Unit Cost: <b>₹{unitCost}</b></p><br/>
            <p>Gross Total (×{qty} Pieces): <b>₹{gross}</b></p>

            <p>Design Cost: <b>₹{designCostWithFab}</b></p>
            <p>Net Total: <b>₹{(netCost).toFixed(2)}</b></p>
             <p>Shipping: <b>₹{150}</b></p>
             <p className="text-lg font-bold text-red-600">Final Total: <b>₹{(netCostWithShipping).toFixed(2)}</b></p>

             
             <p className="text-sm italic">* Design cost is calculated based on total component legs as per schematic.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
