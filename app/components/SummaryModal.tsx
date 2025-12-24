"use client";
import React from "react";

type Row = { label: string; value: string | number };
type Section = { title: string; rows: Row[] };

function isSectionArray(summary: any): summary is Section[] {
  return Array.isArray(summary) && summary.length > 0 && summary[0] && "rows" in summary[0];
}

export default function SummaryModal({
  open,
  onClose,
  title,
  summary,
  onDownloadPdf,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  summary: Row[] | Section[];
  onDownloadPdf?: () => void;
}) {
  if (!open) return null;

  const sectionMode = isSectionArray(summary);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="bg-white rounded-2xl shadow-lg relative z-10 w-full max-w-3xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b gap-3">
          <div>
            <h3 className="text-lg md:text-xl font-semibold">{title}</h3>
            <p className="text-xs text-gray-500 mt-1">Detailed breakdown</p>
          </div>

          <div className="flex items-center gap-2">
            {onDownloadPdf && (
              <button
                onClick={onDownloadPdf}
                className="rounded-lg bg-gray-900 text-white px-3 py-2 text-sm font-medium hover:opacity-95"
              >
                Download PDF
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[70vh] overflow-auto">
          {!sectionMode && (
            <div className="space-y-1">
              {(summary as Row[]).map((item, i) => (
                <div key={i} className="flex justify-between text-sm border-b py-2">
                  <span className="text-gray-700">{item.label}</span>
                  <b className="text-gray-900">{item.value}</b>
                </div>
              ))}
            </div>
          )}

          {sectionMode && (
            <div className="space-y-4">
              {(summary as Section[]).map((section, si) => (
                <div key={si} className="rounded-xl border border-gray-200">
                  <div className="px-4 py-2 border-b bg-gray-50 rounded-t-xl">
                    <div className="text-sm font-semibold text-gray-800">{section.title}</div>
                  </div>

                  <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                      {section.rows.map((row, ri) => (
                        <div
                          key={ri}
                          className="flex justify-between text-sm py-2 border-b last:border-b-0"
                        >
                          <span className="text-gray-700">{row.label}</span>
                          <b className="text-gray-900">{row.value}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t bg-white rounded-b-2xl">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:opacity-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
