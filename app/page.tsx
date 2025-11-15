"use client";
import React, { useState } from "react";
import FabricationOnly from "./components/FabricationOnly";
import FabricationWithDesign from "./components/FabricationWithDesign";

export default function Page() {
  const [activeTab, setActiveTab] = useState<"fabrication" | "fabDesign">("fabrication");

  return (
    <main className="min-h-screen bg-gray-100 flex flex-col items-center p-6">
      <h1 className="text-3xl font-bold mb-4 text-center">Techasdy Solutions.</h1>
      <p className="text-lg mb-6 text-center">Prototype Fabrication and PCB Design Cost Estimator</p>
      <p className="text-md text-center text-red-600">This cost is not production cost but prototyping cost. For production with large quantities unit cost will get lower.</p><br/>

      <div className="flex space-x-4 mb-6">
        <button
          onClick={() => setActiveTab("fabrication")}
          className={`px-4 py-2 rounded-lg ${activeTab === "fabrication" ? "bg-blue-600 text-white" : "bg-white border"}`}
        >
          Fabrication Only
        </button>
        <button
          onClick={() => setActiveTab("fabDesign")}
          className={`px-4 py-2 rounded-lg ${activeTab === "fabDesign" ? "bg-blue-600 text-white" : "bg-white border"}`}
        >
          Fabrication with Design
        </button>
      </div>

      {activeTab === "fabrication" ? <FabricationOnly /> : <FabricationWithDesign />}
    </main>
  );
}
