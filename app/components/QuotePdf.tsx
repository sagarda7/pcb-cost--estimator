"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

type Row = { label: string; value: string | number };
type Section = { title: string; rows: Row[] };

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 10, fontFamily: "Helvetica" },

  title: { fontSize: 16, marginBottom: 6, fontWeight: 700 },
  meta: { fontSize: 10, marginBottom: 10, color: "#444" },

  customerBox: {
    marginBottom: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
  },
  customerHeader: { fontSize: 11, fontWeight: 700, marginBottom: 6 },
  customerLine: { marginBottom: 2 },

  section: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
  },
  sectionHeader: {
    padding: 8,
    backgroundColor: "#f6f6f6",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  sectionTitle: { fontSize: 11, fontWeight: 700 },

  rowsWrap: { padding: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  rowLast: { borderBottomWidth: 0 },

  label: { color: "#333" },
  value: { fontWeight: 700 },
});

export default function QuotePdf({
  title,
  sections,
  customer,
  meta,
}: {
  title: string;
  sections: Section[];
  customer?: any;
  meta?: { quoteId?: string; dateText?: string };
}) {
  const dateText = meta?.dateText ?? new Date().toLocaleString();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>
          Generated: {dateText}
          {meta?.quoteId ? ` • Quote ID: ${meta.quoteId}` : ""}
        </Text>

        {customer ? (
          <View style={styles.customerBox}>
            <Text style={styles.customerHeader}>Customer Details</Text>
            <Text style={styles.customerLine}>Name: {customer?.name || "-"}</Text>
            <Text style={styles.customerLine}>Phone: {customer?.phone || "-"}</Text>
            <Text style={styles.customerLine}>Email: {customer?.email || "-"}</Text>
            {customer?.company ? (
              <Text style={styles.customerLine}>Company: {customer?.company}</Text>
            ) : null}
            {customer?.address ? (
              <Text style={styles.customerLine}>Address: {customer?.address}</Text>
            ) : null}
          </View>
        ) : null}

        {sections.map((section, si) => (
          <View key={si} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>

            <View style={styles.rowsWrap}>
              {section.rows.map((r, i) => (
                <View
                  key={i}
                  style={[styles.row, i === section.rows.length - 1 ? styles.rowLast : null]}
                >
                  <Text style={styles.label}>{r.label}</Text>
                  <Text style={styles.value}>{String(r.value)}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
}
