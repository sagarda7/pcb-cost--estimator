export type BaseInputs = {
  height: string;   // cm
  width: string;    // cm
  layers: string;
  qty: string;      // keep as string for controlled <input>, parse for math
};

export type FabricationInputs = BaseInputs & {
  thPads: string;
  smdPads: string;
  vias: string;
};

export type DesignInputs = BaseInputs & {
  totalComponentsLegs: string;
};

export type CalcBreakdown = {
  area: number;           // cm^2
  areaCost: number;
  thCost: number;
  pcbCost: number;
  elecChem: number;
  cutting: number;
  designExtra?: number;   // only for design tab
  unitCost: number;
  qty: number;            // clamped >= 2
  gross: number;
  discount: number;       // gross - gross * effectiveRate
  total: number;          // gross - discount
};
