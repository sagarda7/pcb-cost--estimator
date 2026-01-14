"use client";

import React, { ChangeEvent, useState } from "react";
import CustomerForm from "./CustomerForm";
import SummaryModal from "./SummaryModal";
import QuotePdf from "./QuotePdf";
import StlViewer from "./StlViewer";
import { pdf } from "@react-pdf/renderer";

import { saveLead } from "../lib/db";
import { sendEmailSummaryAction } from "@/actions";

import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import * as THREE from "three";

type Row = { label: string; value: string | number };
type Section = { title: string; rows: Row[] };

const INFILL_PATTERNS = ["Rectilinear", "Grid", "Gyroid", "Honeycomb", "Triangles", "Cubic"] as const;
type InfillPattern = (typeof INFILL_PATTERNS)[number];

const SUPPORT_TYPES = ["Tree", "Normal"] as const;
type SupportType = (typeof SUPPORT_TYPES)[number];

const MATERIALS = ["PLA", "PETG"] as const;
type Material = (typeof MATERIALS)[number];

const DEFAULTS = {
  material: "PLA" as Material,
  layerHeight: "0.20" as const,
  infillPercent: "10",
  wallLoops: "2",
  bottomLayers: "3",
  infillPattern: "Rectilinear" as InfillPattern,

  supportEnabled: true,
  supportType: "Tree" as SupportType,
  supportAngleDeg: "30",

  copies: "1",
  rotationX: "0",
  rotationY: "0",
  rotationZ: "0",
};

// Material densities can vary by brand. You can tune these slightly if needed.
const MATERIAL_PROPS: Record<Material, { density: number; flowMult: number }> = {
  PLA: { density: 1.24, flowMult: 1.0 },
  PETG: { density: 1.27, flowMult: 0.92 },
};

const CONST = {
  heatAndPrimeMinutes: 15,
  primeWasteGrams: 4,

  ratePerGram: 7,
  ratePerHour: 100,

  // ✅ Calibrated a bit higher to match Ender-3 V3 “fast-ish” real time vs pure volume math
  // (Your earlier 4.4 made time too high once extrusion volume is corrected.)
  effFlowByLayer: {
    "0.20": 5.0,
    "0.25": 5.8,
    "0.28": 6.2,
  } as const,

  patternTimeMult: {
    Rectilinear: 1.0,
    Grid: 1.05,
    Gyroid: 1.15,
    Honeycomb: 1.2,
    Triangles: 1.1,
    Cubic: 1.12,
  } as const satisfies Record<InfillPattern, number>,

  // ✅ Support density factors were too high before (tree supports are sparse).
  // This reduces support volume to match slicer reality.
  supportDensityFactor: {
    Tree: 0.035,
    Normal: 0.06,
  } as const satisfies Record<SupportType, number>,

  // Geometry → extrusion approximation
  lineWidthMm: 0.42,

  // ✅ Increased so perimeters/top/bottom are not undercounted
  // (Your 0.60 underestimates extrusion for many prints.)
  shellSurfaceFactor: 0.85,

  // Thin parts (lithophanes/plates)
  thinMinDimMm: 2.2,

  // ✅ Support cap reduced (was 0.35 -> too big)
  supportVolCapRatio: 0.15,

  // Support gating
  supportMinOverhangAreaMm2: 80,
  supportMinAvgHeightMm: 2,

  // Height caps
  thinTreeSupportHeightCapMm: 6,
  treeSupportHeightCapMm: 15,
  normalSupportHeightCapMm: 25,

  // ✅ Key fix: slicers don’t build supports up to full centroid height.
  // Using only ~25% of avg height gets closer to Creality.
  supportHeightScale: 0.25,

  // Pricing uplift when supports are required
  supportFeeRate: 0.2,

  // Small fudge for overlap/seams/flow reality
  flowFudge: 1.04,
};

type ItemInputs = {
  material: Material;
  layerHeight: "0.20" | "0.25" | "0.28";
  infillPercent: string;
  wallLoops: string;
  bottomLayers: string;
  infillPattern: InfillPattern;

  supportEnabled: boolean;
  supportType: SupportType;
  supportAngleDeg: string;

  copies: string;

  rotationX: string;
  rotationY: string;
  rotationZ: string;
};

type Item = {
  id: string;
  file: File | null;
  filename: string;
  inputs: ItemInputs;

  geometry: THREE.BufferGeometry | null;

  volumeMm3: number;
  surfaceAreaMm2: number;

  error: string | null;
};

function newItem(): Item {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? (crypto as any).randomUUID()
        : String(Date.now() + Math.random()),
    file: null,
    filename: "",
    inputs: {
      material: DEFAULTS.material,
      layerHeight: DEFAULTS.layerHeight,
      infillPercent: DEFAULTS.infillPercent,
      wallLoops: DEFAULTS.wallLoops,
      bottomLayers: DEFAULTS.bottomLayers,
      infillPattern: DEFAULTS.infillPattern,

      supportEnabled: DEFAULTS.supportEnabled,
      supportType: DEFAULTS.supportType,
      supportAngleDeg: DEFAULTS.supportAngleDeg,

      copies: DEFAULTS.copies,
      rotationX: DEFAULTS.rotationX,
      rotationY: DEFAULTS.rotationY,
      rotationZ: DEFAULTS.rotationZ,
    },
    geometry: null,
    volumeMm3: 0,
    surfaceAreaMm2: 0,
    error: null,
  };
}

function withTimeout<T>(p: Promise<T>, ms = 15000, label = "Request"): Promise<T> {
  let t: any;
  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function clampNum(v: any, min: number, max: number, fallback: number) {
  const n = num(v, fallback);
  return Math.max(min, Math.min(max, n));
}
function clampInt(v: any, min: number, max: number, fallback: number) {
  const n = Math.floor(num(v, fallback));
  return Math.max(min, Math.min(max, n));
}

/** Robust volume + surface area from indexed/non-indexed buffer geometry */
function analyzeVolumeAndArea(geo: THREE.BufferGeometry) {
  const g = geo;
  const pos = g.getAttribute("position");
  if (!pos) return { volumeMm3: 0, surfaceAreaMm2: 0 };

  let volume6 = 0;
  let surfaceArea = 0;

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();

  const idx = g.index;
  const readV = (i: number, out: THREE.Vector3) => out.set(pos.getX(i), pos.getY(i), pos.getZ(i));
  const triCount = idx ? idx.count / 3 : pos.count / 3;

  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;

    readV(i0, v0);
    readV(i1, v1);
    readV(i2, v2);

    volume6 += v0.dot(v1.clone().cross(v2));

    e1.subVectors(v1, v0);
    e2.subVectors(v2, v0);
    n.crossVectors(e1, e2);
    surfaceArea += n.length() * 0.5;
  }

  return { volumeMm3: Math.abs(volume6) / 6.0, surfaceAreaMm2: surfaceArea };
}

/** Clone geometry & apply rotation (degrees) */
function rotateGeometry(geo: THREE.BufferGeometry, rx: number, ry: number, rz: number) {
  const g = geo.clone();
  const m = new THREE.Matrix4();
  m.makeRotationFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(rx),
      THREE.MathUtils.degToRad(ry),
      THREE.MathUtils.degToRad(rz),
      "XYZ"
    )
  );
  g.applyMatrix4(m);
  g.computeBoundingBox();
  return g;
}

/** Bottom-contact-ish area: triangles facing down (normal.z < -0.5) */
function computeBottomAreaMm2(geo: THREE.BufferGeometry) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute("position");
  if (!pos) return 0;

  let bottomArea = 0;

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i += 3) {
    v0.fromBufferAttribute(pos as any, i);
    v1.fromBufferAttribute(pos as any, i + 1);
    v2.fromBufferAttribute(pos as any, i + 2);

    e1.subVectors(v1, v0);
    e2.subVectors(v2, v0);
    n.crossVectors(e1, e2);

    const area = n.length() * 0.5;
    if (area <= 0) continue;

    const normalUnit = n.clone().normalize();
    if (normalUnit.z < -0.5) bottomArea += area;
  }

  return bottomArea;
}

/**
 * Overhang stats: area and average centroid height above bed.
 */
function computeOverhangStatsMm2Mm(
  geo: THREE.BufferGeometry,
  thresholdDeg: number,
  isThinPart: boolean
): { areaMm2: number; avgHeightMm: number } {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute("position");
  if (!pos) return { areaMm2: 0, avgHeightMm: 0 };

  g.computeBoundingBox();
  const bb = g.boundingBox;
  const minZ = bb ? bb.min.z : 0;
  const maxZ = bb ? bb.max.z : 0;
  const height = Math.max(0, maxZ - minZ);

  const cosThresh = Math.cos(THREE.MathUtils.degToRad(thresholdDeg));

  let area = 0;
  let heightSum = 0;
  let count = 0;

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();

  const downZCutoff = isThinPart ? -0.45 : -0.15;

  for (let i = 0; i < pos.count; i += 3) {
    v0.fromBufferAttribute(pos as any, i);
    v1.fromBufferAttribute(pos as any, i + 1);
    v2.fromBufferAttribute(pos as any, i + 2);

    e1.subVectors(v1, v0);
    e2.subVectors(v2, v0);
    n.crossVectors(e1, e2);

    const triArea = n.length() * 0.5;
    if (triArea <= 0) continue;

    const normalUnit = n.clone().normalize();
    if (normalUnit.z > downZCutoff) continue;

    const downDot = -normalUnit.z;
    if (downDot >= cosThresh) continue;

    const cz = (v0.z + v1.z + v2.z) / 3;
    const h = Math.max(0, cz - minZ);

    area += triArea;
    heightSum += h;
    count++;
  }

  const avgHeightMm = count > 0 ? heightSum / count : 0;
  return { areaMm2: area, avgHeightMm: Math.min(avgHeightMm, height) };
}

type CalcResult = {
  material: Material;
  layerH: string;
  infillPct: number;
  wallLoops: number;
  bottomLayers: number;
  pattern: InfillPattern;

  supportEnabled: boolean;
  supportType: SupportType | "None";
  supportAngleDeg: number;
  supportRequired: boolean;

  copies: number;
  rotation: { x: number; y: number; z: number };

  isThinPart: boolean;
  minDimMm: number;

  volumeMm3One: number;
  printVolOne: number;

  // Support details
  supportVolOne: number;
  overhangAreaMm2: number;
  avgOverhangHeightMm: number;

  // Display estimates (include support extrusion)
  displayTotalGrams: number;
  displayTimeSec: number;

  // Quote estimates (exclude support extrusion; overheads)
  quotedTotalGrams: number;
  quotedTimeSec: number;

  materialCost: number;
  timeCost: number;

  supportFeeRate: number;
  supportFee: number;
  subtotal: number;
  total: number;
};

function calcOne(item: Item): CalcResult | null {
  const geo = item.geometry;
  if (!geo || item.volumeMm3 <= 0) return null;

  const material = (item.inputs.material ?? DEFAULTS.material) as Material;
  const mat = MATERIAL_PROPS[material] ?? MATERIAL_PROPS.PLA;

  const layerH = (item.inputs.layerHeight ?? DEFAULTS.layerHeight) as ItemInputs["layerHeight"];
  const infillPct = clampNum(item.inputs.infillPercent ?? DEFAULTS.infillPercent, 0, 100, 10);
  const wallLoops = clampInt(item.inputs.wallLoops ?? DEFAULTS.wallLoops, 1, 10, 2);
  const bottomLayers = clampInt(item.inputs.bottomLayers ?? DEFAULTS.bottomLayers, 0, 20, 3);
  const pattern = (item.inputs.infillPattern ?? DEFAULTS.infillPattern) as InfillPattern;

  const supportEnabled = !!item.inputs.supportEnabled;
  const supportType = (item.inputs.supportType ?? DEFAULTS.supportType) as SupportType;
  const supportAngleDeg = clampNum(item.inputs.supportAngleDeg ?? DEFAULTS.supportAngleDeg, 0, 89, 30);

  const copies = clampInt(item.inputs.copies ?? DEFAULTS.copies, 1, 999, 1);

  const rx = clampNum(item.inputs.rotationX ?? DEFAULTS.rotationX, -360, 360, 0);
  const ry = clampNum(item.inputs.rotationY ?? DEFAULTS.rotationY, -360, 360, 0);
  const rz = clampNum(item.inputs.rotationZ ?? DEFAULTS.rotationZ, -360, 360, 0);

  const volumeMm3One = Math.max(0, num(item.volumeMm3, 0));
  const surfaceAreaMm2 = Math.max(0, num(item.surfaceAreaMm2, 0));

  // Rotation affects support & bottom contact
  const gRot = rotateGeometry(geo, rx, ry, rz);
  gRot.computeBoundingBox();
  const bbRot = gRot.boundingBox!;
  const size = new THREE.Vector3();
  bbRot.getSize(size);

  const minDimMm = Math.min(size.x, size.y, size.z);
  const isThinPart = minDimMm <= CONST.thinMinDimMm;

  const bottomAreaRot = computeBottomAreaMm2(gRot);

  const overhang = computeOverhangStatsMm2Mm(gRot, supportAngleDeg, isThinPart);
  const overhangAreaMm2 = overhang.areaMm2;
  const avgOverhangHeightMmRaw = overhang.avgHeightMm;

  // ---- Print extrusion volume estimate ----
  const wallThicknessMm = wallLoops * CONST.lineWidthMm;
  const bottomThicknessMm = bottomLayers * num(layerH, 0.2);

  let shellVolOne = surfaceAreaMm2 * wallThicknessMm * CONST.shellSurfaceFactor;
  let bottomVolOne = bottomAreaRot * bottomThicknessMm;

  if (!Number.isFinite(shellVolOne) || shellVolOne < 0) shellVolOne = 0;
  if (!Number.isFinite(bottomVolOne) || bottomVolOne < 0) bottomVolOne = 0;

  const interiorOne = Math.max(0, volumeMm3One - shellVolOne - bottomVolOne);
  const infillVolOne = interiorOne * (infillPct / 100);

  let printVolOne = shellVolOne + bottomVolOne + infillVolOne;

  // Thin part: print volume ~= model volume
  if (isThinPart) {
    printVolOne = volumeMm3One;
  }

  // safety fallback
  if (!Number.isFinite(printVolOne) || printVolOne <= 0) {
    const ratio = 0.5 + 0.5 * (infillPct / 100);
    printVolOne = volumeMm3One * ratio;
  }

  // ---- Support required gating ----
  const supportRequired =
    supportEnabled &&
    overhangAreaMm2 >= CONST.supportMinOverhangAreaMm2 &&
    avgOverhangHeightMmRaw >= CONST.supportMinAvgHeightMm;

  // ---- Support volume estimate (calibrated) ----
  let supportVolOne = 0;

  // ✅ Key fix: scale down height (slicer does not build supports up to centroid height)
  let effectiveSupportHeight = avgOverhangHeightMmRaw * CONST.supportHeightScale;

  if (supportRequired) {
    // caps by type
    const cap =
      isThinPart && supportType === "Tree"
        ? CONST.thinTreeSupportHeightCapMm
        : supportType === "Tree"
        ? CONST.treeSupportHeightCapMm
        : CONST.normalSupportHeightCapMm;

    effectiveSupportHeight = Math.min(effectiveSupportHeight, cap);

    const densityFactor = CONST.supportDensityFactor[supportType] ?? 0;
    const treeSparseness = supportType === "Tree" ? 0.5 : 1.0;

    supportVolOne = overhangAreaMm2 * effectiveSupportHeight * densityFactor * treeSparseness;
    supportVolOne = Math.min(supportVolOne, volumeMm3One * CONST.supportVolCapRatio);
  } else {
    effectiveSupportHeight = Math.min(effectiveSupportHeight, 0);
  }

  const printVolTotal = printVolOne * copies;
  const supportVolTotal = supportVolOne * copies;

  // ---- Time ----
  const effFlowBase = CONST.effFlowByLayer[layerH] ?? CONST.effFlowByLayer["0.20"];
  const effFlow = effFlowBase * (mat.flowMult ?? 1.0);
  const patternMult = CONST.patternTimeMult[pattern] ?? 1.0;

  // DISPLAY includes supports (to look like slicer)
  let displayTimeSec = effFlow > 0 ? ((printVolTotal + supportVolTotal) / effFlow) * patternMult : 0;
  if (!Number.isFinite(displayTimeSec) || displayTimeSec < 0) displayTimeSec = 0;

  // DISPLAY grams includes supports
  const displayTotalGrams =
    ((printVolTotal + supportVolTotal) / 1000) * mat.density * CONST.flowFudge;

  // QUOTED excludes support extrusion (simple business logic)
  let baseChargeTimeSec = effFlow > 0 ? (printVolTotal / effFlow) * patternMult : 0;
  if (!Number.isFinite(baseChargeTimeSec) || baseChargeTimeSec < 0) baseChargeTimeSec = 0;

  const baseChargeGrams = (printVolTotal / 1000) * mat.density * CONST.flowFudge;

  const quotedTotalGrams = baseChargeGrams + CONST.primeWasteGrams;
  const quotedTimeSec = baseChargeTimeSec + CONST.heatAndPrimeMinutes * 60;

  const materialCost = quotedTotalGrams * CONST.ratePerGram;
  const timeCost = (quotedTimeSec / 3600) * CONST.ratePerHour;
  const subtotal = materialCost + timeCost;

  const supportFeeRate = CONST.supportFeeRate;
  const supportFee = supportRequired ? subtotal * supportFeeRate : 0;

  const total = subtotal + supportFee;

  return {
    material,
    layerH,
    infillPct,
    wallLoops,
    bottomLayers,
    pattern,

    supportEnabled,
    supportType: supportEnabled ? supportType : "None",
    supportAngleDeg,
    supportRequired,

    copies,
    rotation: { x: rx, y: ry, z: rz },

    isThinPart,
    minDimMm,

    volumeMm3One,
    printVolOne,

    supportVolOne,
    overhangAreaMm2,
    avgOverhangHeightMm: supportRequired ? effectiveSupportHeight : 0,

    displayTotalGrams,
    displayTimeSec,

    quotedTotalGrams,
    quotedTimeSec,

    materialCost,
    timeCost,

    supportFeeRate,
    supportFee,
    subtotal,
    total,
  };
}

export default function ThreeDPrinting() {
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastCustomer, setLastCustomer] = useState<any>(null);

  const addItem = () => setItems((s) => [...s, newItem()]);
  const removeItem = (id: string) => setItems((s) => (s.length <= 1 ? s : s.filter((x) => x.id !== id)));

  async function handleFile(itemId: string, file: File | null) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".stl")) {
      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, error: "Please upload an STL (.stl) file." } : it))
      );
      return;
    }

    try {
      const buf = await file.arrayBuffer();
      const loader = new STLLoader();
      const geo = loader.parse(buf);
      geo.computeVertexNormals();

      const info = analyzeVolumeAndArea(geo);
      if (!info.volumeMm3 || info.volumeMm3 <= 0) {
        setItems((prev) =>
          prev.map((it) => (it.id === itemId ? { ...it, error: "Could not read volume from STL." } : it))
        );
        return;
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? {
                ...it,
                file,
                filename: file.name,
                geometry: geo,
                volumeMm3: info.volumeMm3,
                surfaceAreaMm2: info.surfaceAreaMm2,
                error: null,
              }
            : it
        )
      );
    } catch (e: any) {
      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, error: e?.message || "Failed to parse STL." } : it))
      );
    }
  }

  const updateItemInput = (itemId: string, e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name } = e.target as any;

    const value =
      (e.target as HTMLInputElement).type === "checkbox"
        ? (e.target as HTMLInputElement).checked
        : (e.target as HTMLInputElement | HTMLSelectElement).value;

    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        return { ...it, inputs: { ...it.inputs, [name]: value } as any };
      })
    );
  };

  const bumpRotation = (itemId: string, axis: "rotationX" | "rotationY" | "rotationZ", delta: number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const v = num((it.inputs as any)[axis], 0);
        return { ...it, inputs: { ...it.inputs, [axis]: String(v + delta) } as any };
      })
    );
  };

  const resetRotation = (itemId: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? { ...it, inputs: { ...it.inputs, rotationX: "0", rotationY: "0", rotationZ: "0" } }
          : it
      )
    );
  };

  async function downloadPdf() {
    if (!sections?.length) return;

    const blob = await pdf(
      <QuotePdf
        title="3D Printing — Quote Summary"
        sections={sections}
        customer={lastCustomer}
        meta={{ dateText: new Date().toLocaleString() }}
      />
    ).toBlob();

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `3d-printing-quote-${Date.now()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleQuote(customer: any) {
    setLastCustomer(customer);

    const missing = items.filter((it) => !it.geometry || !it.volumeMm3 || it.volumeMm3 <= 0);
    if (missing.length) {
      setItems((prev) => prev.map((it) => (!it.geometry ? { ...it, error: "Upload STL first." } : it)));
      return;
    }

    const calcs = items
      .map((it) => ({ it, c: calcOne(it) }))
      .filter((x): x is { it: Item; c: CalcResult } => !!x.c);

    const totalSum = calcs.reduce((a, x) => a + x.c.total, 0);

    const nextSections: Section[] = calcs.map((x, idx) => {
      const it = x.it;
      const c = x.c;

      return {
        title: `Item ${idx + 1} — ${it.filename}`,
        rows: [
          { label: "Material", value: c.material },
          { label: "Layer height (mm)", value: c.layerH },
          { label: "Infill (%)", value: c.infillPct },
          { label: "Wall loops", value: c.wallLoops },
          { label: "Bottom layers", value: c.bottomLayers },
          { label: "Infill pattern", value: c.pattern },

          { label: "Support enabled", value: c.supportEnabled ? "Yes" : "No" },
          { label: "Support type", value: c.supportType },
          { label: "Support threshold angle", value: `${c.supportAngleDeg}°` },
          { label: "Support required (detected)", value: c.supportRequired ? "Yes" : "No" },

          { label: "Copies", value: c.copies },
          { label: "Rotation (deg)", value: `X ${c.rotation.x} / Y ${c.rotation.y} / Z ${c.rotation.z}` },

          {
            label: "Thin part mode",
            value: c.isThinPart
              ? `Yes (minDim ${c.minDimMm.toFixed(2)}mm)`
              : `No (minDim ${c.minDimMm.toFixed(2)}mm)`,
          },

          { label: "Model volume (one) (mm³)", value: c.volumeMm3One.toFixed(2) },
          { label: "Est. print vol (one) (mm³)", value: c.printVolOne.toFixed(2) },

          { label: "Est. support vol (one) (mm³)", value: c.supportVolOne.toFixed(2) },
          { label: "Overhang area (mm²)", value: c.overhangAreaMm2.toFixed(2) },
          { label: "Avg support height used (mm)", value: c.avgOverhangHeightMm.toFixed(2) },

          { label: "Estimated weight (g)", value: c.displayTotalGrams.toFixed(2) },
          { label: "Estimated time (min)", value: (c.displayTimeSec / 60).toFixed(1) },

          { label: "Quoted weight (g) (+4g)", value: c.quotedTotalGrams.toFixed(2) },
          { label: "Quoted time (min) (+15m)", value: (c.quotedTimeSec / 60).toFixed(1) },

          { label: "Material cost (Rs)", value: `Rs ${c.materialCost.toFixed(0)}` },
          { label: "Time cost (Rs)", value: `Rs ${c.timeCost.toFixed(0)}` },

          { label: "Subtotal (Rs)", value: `Rs ${c.subtotal.toFixed(0)}` },
          {
            label: `Support fee (${Math.round(c.supportFeeRate * 100)}%) (Rs)`,
            value: `Rs ${c.supportFee.toFixed(0)}`,
          },
          { label: "Item total (Rs)", value: `Rs ${c.total.toFixed(0)}` },
        ],
      };
    });

    nextSections.push({ title: "Totals", rows: [{ label: "Final Total", value: `Rs ${totalSum.toFixed(0)}` }] });

    setSections(nextSections);
    setOpen(true);

    setSaving(true);
    try {
      const payload = {
        calculatorType: "3dPrinting",
        inputs: { items: items.map((it) => ({ filename: it.filename, ...it.inputs })) },
        summary: { totalSum, items: calcs.map((x, i) => ({ itemNo: i + 1, ...x.c })) },
        customer,
      };

      await withTimeout(saveLead(payload as any), 15000, "Save lead");
      await withTimeout(sendEmailSummaryAction(payload as any), 15000, "Send email");
    } catch (err: any) {
      console.error("[3D] Save/email failed:", err);
      alert(err?.message || "Quote generated, but server save/email failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 bg-white shadow rounded w-full max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">3D Printing (Orientation + Support Detection)</h2>
        <button
          type="button"
          onClick={addItem}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          + Add
        </button>
      </div>

      <div className="grid gap-6">
        {items.map((it, idx) => {
          const rx = num(it.inputs.rotationX, 0);
          const ry = num(it.inputs.rotationY, 0);
          const rz = num(it.inputs.rotationZ, 0);

          return (
            <div key={it.id} className="mx-auto w-full rounded-2xl border border-gray-300 bg-white p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">
                  3D Print Item {items.length > 1 ? `• Item ${idx + 1}` : ""}
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

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">STL file</label>
                    <input
                      type="file"
                      accept=".stl"
                      onChange={(e) => handleFile(it.id, e.target.files?.[0] ?? null)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                    {it.filename ? <p className="text-xs text-gray-600 mt-1">{it.filename}</p> : null}
                    {it.volumeMm3 ? (
                      <p className="text-xs text-gray-600 mt-1">Model volume: {it.volumeMm3.toFixed(2)} mm³</p>
                    ) : null}
                    {it.error ? <p className="text-xs text-red-600 mt-1">{it.error}</p> : null}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Material</label>
                    <select
                      name="material"
                      value={it.inputs.material}
                      onChange={(e) => updateItemInput(it.id, e)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      {MATERIALS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Layer height (mm)</label>
                    <select
                      name="layerHeight"
                      value={it.inputs.layerHeight}
                      onChange={(e) => updateItemInput(it.id, e)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="0.20">0.20</option>
                      <option value="0.25">0.25</option>
                      <option value="0.28">0.28</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Copies</label>
                    <input
                      name="copies"
                      type="number"
                      min={1}
                      value={it.inputs.copies}
                      onChange={(e) => updateItemInput(it.id, e)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Infill (%)</label>
                    <input
                      name="infillPercent"
                      type="number"
                      min={0}
                      max={100}
                      value={it.inputs.infillPercent}
                      onChange={(e) => updateItemInput(it.id, e)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Wall loops</label>
                    <input
                      name="wallLoops"
                      type="number"
                      min={1}
                      max={10}
                      value={it.inputs.wallLoops}
                      onChange={(e) => updateItemInput(it.id, e)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Bottom layers</label>
                    <input
                      name="bottomLayers"
                      type="number"
                      min={0}
                      max={20}
                      value={it.inputs.bottomLayers}
                      onChange={(e) => updateItemInput(it.id, e)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Infill pattern</label>
                    <select
                      name="infillPattern"
                      value={it.inputs.infillPattern}
                      onChange={(e) => updateItemInput(it.id, e)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      {INFILL_PATTERNS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-3 flex items-center gap-2">
                    <input
                      id={`supportEnabled-${it.id}`}
                      name="supportEnabled"
                      type="checkbox"
                      checked={!!it.inputs.supportEnabled}
                      onChange={(e) => updateItemInput(it.id, e)}
                    />
                    <label htmlFor={`supportEnabled-${it.id}`} className="text-sm text-gray-700">
                      Enable support (auto-detected)
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Support type</label>
                    <select
                      name="supportType"
                      value={it.inputs.supportType}
                      onChange={(e) => updateItemInput(it.id, e)}
                      disabled={!it.inputs.supportEnabled}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
                    >
                      {SUPPORT_TYPES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Support angle (°)</label>
                    <input
                      name="supportAngleDeg"
                      type="number"
                      min={0}
                      max={89}
                      value={it.inputs.supportAngleDeg}
                      onChange={(e) => updateItemInput(it.id, e)}
                      disabled={!it.inputs.supportEnabled}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-sm font-semibold text-gray-700">Orientation (affects supports)</p>
                      <button
                        type="button"
                        onClick={() => resetRotation(it.id)}
                        className="text-xs text-gray-700 underline"
                      >
                        Reset
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                      {(["rotationX", "rotationY", "rotationZ"] as const).map((axis) => {
                        const label =
                          axis === "rotationX"
                            ? "Rotate X (deg)"
                            : axis === "rotationY"
                            ? "Rotate Y (deg)"
                            : "Rotate Z (deg)";
                        return (
                          <div key={axis}>
                            <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                            <input
                              name={axis}
                              type="number"
                              value={(it.inputs as any)[axis]}
                              onChange={(e) => updateItemInput(it.id, e)}
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                            />
                            <div className="flex gap-2 mt-1">
                              <button
                                type="button"
                                onClick={() => bumpRotation(it.id, axis, 90)}
                                className="text-xs border rounded px-2 py-1"
                              >
                                +90
                              </button>
                              <button
                                type="button"
                                onClick={() => bumpRotation(it.id, axis, -90)}
                                className="text-xs border rounded px-2 py-1"
                              >
                                -90
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Viewer */}
                <div>
                  {it.geometry ? (
                    <StlViewer geometry={it.geometry} rotationDeg={{ x: rx, y: ry, z: rz }} />
                  ) : (
                    <div className="border rounded-lg p-6 text-sm text-gray-500 bg-gray-50">
                      Upload an STL to preview and rotate it.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div className="border-t pt-4">
          <CustomerForm onSubmit={handleQuote} submitting={saving} />
        </div>
      </div>

      <SummaryModal
        open={open}
        onClose={() => setOpen(false)}
        title="3D Printing — Quote Summary"
        summary={sections}
        onDownloadPdf={downloadPdf}
      />
    </div>
  );
}
