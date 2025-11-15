"use client";
import React from "react";

export default function SummaryModal({ open, onClose, title, summary }: {
    open: boolean;
    onClose: () => void;
    title: string;
    summary: Array<{ label: string; value: string | number }>;
}) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="bg-white rounded-lg shadow-lg p-6 relative z-10 w-full max-w-md">
                <h3 className="text-xl font-semibold mb-4">{title}</h3>
                {summary.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm border-b py-1">
                        <span>{item.label}</span>
                        <b>{item.value}</b>
                    </div>
                ))}
                <button onClick={onClose} className="mt-4 bg-gray-200 px-3 py-1 rounded">Close</button>
            </div>
        </div>
    );
}