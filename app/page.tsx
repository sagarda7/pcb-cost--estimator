"use client";
import React, { useState } from "react";
import FabricationOnly from "./components/FabricationOnly";
import FabricationWithDesign from "./components/FabricationWithDesign";
import ThreeDPrinting from "./components/ThreeDPrinting";

export default function Page() {
  const [activeTab, setActiveTab] = useState<"fabrication" | "fabDesign" | "printing3d">("fabrication");

  return (
    <main className="min-h-screen bg-gray-100 flex flex-col items-center p-6">
      <h1 className="text-3xl font-bold mb-4 text-center">Techasdy Solutions.</h1>
      <p className="text-lg mb-6 text-center">Prototype Fabrication, PCB Design, and 3D Printing Cost Estimator</p>
      <p className="text-md text-center text-red-600">
        This cost is not production cost but prototyping cost. For production with large quantities unit cost will get
        lower.
      </p>
      <br />

      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => setActiveTab("fabrication")}
          className={`px-4 py-2 rounded-lg ${
            activeTab === "fabrication" ? "bg-blue-600 text-white" : "bg-white border"
          }`}
        >
          Fabrication Only
        </button>

        <button
          onClick={() => setActiveTab("fabDesign")}
          className={`px-4 py-2 rounded-lg ${
            activeTab === "fabDesign" ? "bg-blue-600 text-white" : "bg-white border"
          }`}
        >
          Fabrication with Design
        </button>

        <button
          onClick={() => setActiveTab("printing3d")}
          className={`px-4 py-2 rounded-lg ${
            activeTab === "printing3d" ? "bg-blue-600 text-white" : "bg-white border"
          }`}
        >
          3D Printing
        </button>
      </div>

      {activeTab === "fabrication" ? (
        <FabricationOnly />
      ) : activeTab === "fabDesign" ? (
        <FabricationWithDesign />
      ) : (
        <ThreeDPrinting />
      )}
    </main>
  );
}
