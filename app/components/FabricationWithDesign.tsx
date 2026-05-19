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

const RATE = {
  schematic: 500,
  pcbRouting: 500,
  design3d: 500,
  testing: 500,
  software: 500,
};

// Purely PCB fabrication/assembly cost based on component leg count
function calculateLegsCost(totalLegs: number) {
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

type SubQtyRow = { id: string; qty: string; rate: string };

function newItem(): Item {
  return {
    id: crypto?.randomUUID?.() ?? String(Date.now() + Math.random()),
    inputs: { height: "", width: "", totalComponentsLegs: "5", layers: "1", qty: "2" },
    layerError: null,
  };
}

function newSubQtyRow(): SubQtyRow {
  return { id: crypto?.randomUUID?.() ?? String(Date.now() + Math.random()), qty: "", rate: "" };
}

type CalcEntry = { id: string; inputs: DesignInputs; calc: ReturnType<typeof calcOne> };

function buildItemSection(x: CalcEntry, idx: number): Section {
  const it = x.inputs;
  const c = x.calc;
  return {
    title: `Item ${idx + 1} — PCB Fabrication`,
    rows: [
      { label: "Height (mm)", value: it.height || 0 },
      { label: "Width (mm)", value: it.width || 0 },
      { label: "Total Components Legs", value: it.totalComponentsLegs || 0 },
      { label: "Layers", value: it.layers || 1 },
      { label: "Qty", value: c.qty },
      { label: "Area (mm²)", value: c.area.toFixed(2) },
      { label: "Area Cost", value: `₹${c.areaCost}` },
      { label: "PCB Material Cost", value: `₹${c.pcbCost.toFixed(2)}` },
      { label: "Elec/Chem", value: `₹${c.elecChem}` },
      { label: "Cutting", value: `₹${c.cutting}` },
      { label: "Legs/Assembly Cost", value: `₹${c.legsCost}` },
      { label: "Unit Cost", value: `₹${c.unitCost}` },
      { label: `Gross ×${c.qty}`, value: `₹${c.gross}` },
    ],
  };
}

type DesignCosts = {
  needsSchematic: boolean; schematicHours: string; schematicCost: number;
  needsPcbRouting: boolean; pcbRoutingHours: string; pcbRoutingCost: number;
  needs3dCase: boolean; hours3d: string; cost3d: number;
  testingHours: string; testingCost: number;
  needsSoftware: boolean; softwareHours: string; softwareCost: number;
  designTotal: number;
};

function buildDesignSection(d: DesignCosts): Section | null {
  const rows: Row[] = [];
  if (d.needsSchematic && d.schematicCost > 0)
    rows.push({ label: `Schematic Design (${num(d.schematicHours)} hrs × ₹${RATE.schematic}/hr)`, value: `₹${d.schematicCost}` });
  if (d.needsPcbRouting && d.pcbRoutingCost > 0)
    rows.push({ label: `PCB Routing (${num(d.pcbRoutingHours)} hrs × ₹${RATE.pcbRouting}/hr)`, value: `₹${d.pcbRoutingCost}` });
  if (d.needs3dCase && d.cost3d > 0)
    rows.push({ label: `3D Box/Case Design (${num(d.hours3d)} hrs × ₹${RATE.design3d}/hr)`, value: `₹${d.cost3d}` });
  if (d.testingCost > 0)
    rows.push({ label: `Testing (${num(d.testingHours)} hrs × ₹${RATE.testing}/hr)`, value: `₹${d.testingCost}` });
  if (d.needsSoftware && d.softwareCost > 0)
    rows.push({ label: `Software Work (${num(d.softwareHours)} hrs × ₹${RATE.software}/hr)`, value: `₹${d.softwareCost}` });
  if (!rows.length) return null;
  rows.push({ label: "Design & Engineering Total", value: `₹${d.designTotal}` });
  return { title: "Design & Engineering Services", rows };
}

function buildSubQtySection(subQtyRows: SubQtyRow[], subQtyTotal: number): Section | null {
  const valid = subQtyRows.filter((r) => num(r.qty) > 0 && num(r.rate) > 0);
  if (!valid.length) return null;
  const rows: Row[] = valid.map((r) => ({
    label: `${num(r.qty)} units × ₹${num(r.rate)}/unit`,
    value: `₹${num(r.qty) * num(r.rate)}`,
  }));
  rows.push({ label: "Subsequent Qty Total", value: `₹${subQtyTotal}` });
  return { title: "Subsequent Quantity Pricing", rows };
}

function buildTotalsSection(grossSum: number, shipping: number, designTotal: number, subQtyTotal: number, finalTotal: number): Section {
  const rows: Row[] = [
    { label: "PCB Gross Total", value: `₹${grossSum}` },
    { label: "Shipping", value: `₹${shipping}` },
  ];
  if (designTotal > 0) rows.push({ label: "Design & Engineering", value: `₹${designTotal}` });
  if (subQtyTotal > 0) rows.push({ label: "Subsequent Qty Total", value: `₹${subQtyTotal}` });
  rows.push({ label: "Final Total", value: `₹${finalTotal}` });
  return { title: "Totals", rows };
}

function calcOne(inputs: DesignInputs) {
  const height = num(inputs.height);
  const width = num(inputs.width);
  const layers = num(inputs.layers);
  const legs = num(inputs.totalComponentsLegs);
  const qty = clampQty(inputs.qty);

  const area = height * width;
  const areaCost = roundup(area / 1000) * CONST.areaRatePer100;
  const legsCost = calculateLegsCost(legs); // PCB assembly cost by component count

  const pcbCost = 150 * (Math.max(1, layers - 1) + (layers - 1) * 0.5);
  const elecChem = CONST.elecChem * Math.max(1, layers);
  const cutting = CONST.cutting;

  const unitCost = areaCost + pcbCost + elecChem + cutting + legsCost;
  const gross = unitCost * qty;

  return {
    height, width, layers, legs, qty,
    area, areaCost, pcbCost, elecChem, cutting, legsCost,
    unitCost, gross,
    layersValid: layers === 1 || layers === 2,
  };
}

function HoursRow({
  id,
  label,
  hours,
  rate,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  hours: string;
  rate: number;
  onChange: (v: string) => void;
}>) {
  const cost = num(hours) * rate;
  return (
    <div className="flex items-end gap-4">
      <div>
        <label htmlFor={id} className="block text-xs font-medium text-gray-600 mb-1">
          {label}
        </label>
        <input
          id={id}
          type="number"
          min={0}
          value={hours}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="w-32 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <p className="text-sm text-gray-500 pb-2">
        @ ₹{rate}/hr
        {cost > 0 && <span className="ml-2 font-medium text-gray-700">= ₹{cost}</span>}
      </p>
    </div>
  );
}

export default function FabricationWithDesign() {
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Section[]>([]);
  const [lastCustomer, setLastCustomer] = useState<any>(null);

  // Design & engineering services
  const [needsSchematic, setNeedsSchematic] = useState(false);
  const [schematicHours, setSchematicHours] = useState("");
  const [needsPcbRouting, setNeedsPcbRouting] = useState(false);
  const [pcbRoutingHours, setPcbRoutingHours] = useState("");
  const [needs3dCase, setNeeds3dCase] = useState(false);
  const [hours3d, setHours3d] = useState("");
  const [testingHours, setTestingHours] = useState("2");
  const [needsSoftware, setNeedsSoftware] = useState(false);
  const [softwareHours, setSoftwareHours] = useState("");

  // Subsequent quantity pricing
  const [subQtyRows, setSubQtyRows] = useState<SubQtyRow[]>([]);

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

  const addSubQtyRow = () => setSubQtyRows((s) => [...s, newSubQtyRow()]);
  const removeSubQtyRow = (id: string) => setSubQtyRows((s) => s.filter((x) => x.id !== id));
  const updateSubQtyRow = (id: string, field: "qty" | "rate", value: string) =>
    setSubQtyRows((s) => s.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

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
        prev.map((it) => (invalidIds.includes(it.id) ? { ...it, layerError: "Layers must be 1 or 2" } : it))
      );
      return;
    }

    const shipping = 150;
    const grossSum = calcs.reduce((a, x) => a + x.calc.gross, 0);

    // Design & engineering costs (all separate from fabrication)
    const schematicCost = needsSchematic ? num(schematicHours) * RATE.schematic : 0;
    const pcbRoutingCost = needsPcbRouting ? num(pcbRoutingHours) * RATE.pcbRouting : 0;
    const cost3d = needs3dCase ? num(hours3d) * RATE.design3d : 0;
    const testingCost = num(testingHours) * RATE.testing;
    const softwareCost = needsSoftware ? num(softwareHours) * RATE.software : 0;
    const designTotal = schematicCost + pcbRoutingCost + cost3d + testingCost + softwareCost;

    // Subsequent quantity total
    const subQtyTotal = subQtyRows.reduce((a, r) => a + num(r.qty) * num(r.rate), 0);

    const finalTotal = grossSum + shipping + designTotal + subQtyTotal;

    try {
      setSaving(true);

      const payload: LeadPayload = {
        calculatorType: "fabDesign",
        inputs: { items: items.map((it) => it.inputs) } as any,
        summary: {
          items: calcs.map((x, idx) => ({ itemNo: idx + 1, ...x.calc })),
          grossSum,
          shipping,
          designTotal,
          subQtyTotal,
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

      // Build sectioned summary for modal + PDF
      const sections: Section[] = calcs.map((x, idx) => buildItemSection(x, idx));

      const designSection = buildDesignSection({
        needsSchematic, schematicHours, schematicCost,
        needsPcbRouting, pcbRoutingHours, pcbRoutingCost,
        needs3dCase, hours3d, cost3d,
        testingHours, testingCost,
        needsSoftware, softwareHours, softwareCost,
        designTotal,
      });
      if (designSection) sections.push(designSection);

      const subQtySection = buildSubQtySection(subQtyRows, subQtyTotal);
      if (subQtySection) sections.push(subQtySection);

      sections.push(buildTotalsSection(grossSum, shipping, designTotal, subQtyTotal, finalTotal));

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
          + Add PCB
        </button>
      </div>

      <div className="grid gap-6">
        {/* PCB Items */}
        {items.map((it, idx) => (
          <div key={it.id} className="mx-auto w-full max-w-6xl rounded-2xl border border-gray-300 bg-white p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">
                PCB Physical Parameters {items.length > 1 ? `• Item ${idx + 1}` : ""}
              </h3>
              {items.length > 1 && (
                <button type="button" onClick={() => removeItem(it.id)} className="text-sm text-red-600 hover:underline">
                  Remove
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {([
                { key: "height", label: "Height (mm)" },
                { key: "width", label: "Width (mm)" },
                { key: "totalComponentsLegs", label: "Total Component Legs" },
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

        {/* Design & Engineering Services */}
        <div className="rounded-2xl border border-gray-300 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Design &amp; Engineering Services</h3>

          <div className="space-y-4">
            {/* Schematic Design */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={needsSchematic}
                  onChange={(e) => setNeedsSchematic(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Needs Schematic Design</span>
              </label>
              {needsSchematic && (
                <div className="mt-2 ml-6">
                  <HoursRow
                    id="schematic-hours"
                    label="Schematic Design Hours"
                    hours={schematicHours}
                    rate={RATE.schematic}
                    onChange={setSchematicHours}
                  />
                </div>
              )}
            </div>

            {/* PCB Routing */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={needsPcbRouting}
                  onChange={(e) => setNeedsPcbRouting(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Needs PCB Routing</span>
              </label>
              {needsPcbRouting && (
                <div className="mt-2 ml-6">
                  <HoursRow
                    id="pcb-routing-hours"
                    label="PCB Routing Hours"
                    hours={pcbRoutingHours}
                    rate={RATE.pcbRouting}
                    onChange={setPcbRoutingHours}
                  />
                </div>
              )}
            </div>

            {/* 3D Box or Case */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={needs3dCase}
                  onChange={(e) => setNeeds3dCase(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Needs 3D Box or Case?</span>
              </label>
              {needs3dCase && (
                <div className="mt-2 ml-6">
                  <HoursRow
                    id="3d-design-hours"
                    label="3D Design Hours"
                    hours={hours3d}
                    rate={RATE.design3d}
                    onChange={setHours3d}
                  />
                </div>
              )}
            </div>

            {/* Testing Hours — always visible */}
            <div className="border-t pt-3">
              <HoursRow
                id="testing-hours"
                label="Testing Hours"
                hours={testingHours}
                rate={RATE.testing}
                onChange={setTestingHours}
              />
            </div>

            {/* Software Work */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={needsSoftware}
                  onChange={(e) => setNeedsSoftware(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Needs Software Work</span>
              </label>
              {needsSoftware && (
                <div className="mt-2 ml-6">
                  <HoursRow
                    id="software-hours"
                    label="Software Hours"
                    hours={softwareHours}
                    rate={RATE.software}
                    onChange={setSoftwareHours}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Subsequent Quantity Pricing */}
        <div className="rounded-2xl border border-gray-300 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Subsequent Quantity Pricing</h3>
            <button
              type="button"
              onClick={addSubQtyRow}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
            >
              + Add Row
            </button>
          </div>

          {subQtyRows.length === 0 ? (
            <p className="text-xs text-gray-400">Add rows to quote different quantity tiers.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 border-b border-gray-200">
                    <th className="pb-2 pr-4">Qty</th>
                    <th className="pb-2 pr-4">Rate (₹/unit)</th>
                    <th className="pb-2 pr-4">Total</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {subQtyRows.map((r) => {
                    const total = num(r.qty) * num(r.rate);
                    return (
                      <tr key={r.id} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 pr-4">
                          <input
                            type="number"
                            min={0}
                            value={r.qty}
                            onChange={(e) => updateSubQtyRow(r.id, "qty", e.target.value)}
                            placeholder="0"
                            className="w-24 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            type="number"
                            min={0}
                            value={r.rate}
                            onChange={(e) => updateSubQtyRow(r.id, "rate", e.target.value)}
                            placeholder="0"
                            className="w-28 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-2 pr-4 font-medium text-gray-700">
                          {total > 0 ? `₹${total}` : "—"}
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => removeSubQtyRow(r.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {subQtyRows.length > 1 && (
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="pt-2 text-xs text-gray-500 font-medium">Total</td>
                      <td className="pt-2 font-semibold text-gray-800">
                        ₹{subQtyRows.reduce((a, r) => a + num(r.qty) * num(r.rate), 0)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {/* Customer Form */}
        <div className="border-t pt-4">
          <CustomerForm onSubmit={handleQuote} submitting={saving} />
          <p className="mt-3 text-xs text-gray-500">
            We'll save your details and this estimate to prepare a formal quote.
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
