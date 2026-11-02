/**
 * Renders a Markdown-ish contract file to a PDF with @react-pdf/renderer.
 *
 * Conventions in seed/contracts/*.md:
 *   "# Title"            document title
 *   "## Heading"         article heading
 *   "| a | b | c |"      table row (first row is the header)
 *   blank line           paragraph break
 * Hyphenation is disabled so every sentence stays contiguous for quote verification.
 */
import React from "react";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

Font.registerHyphenationCallback((word) => [word]);

export type Block =
  | { type: "title"; text: string }
  | { type: "h2"; text: string }
  | { type: "p"; text: string }
  | { type: "table"; rows: string[][] };

export function parseContractMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let table: string[][] | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  const flushTable = () => {
    if (table) blocks.push({ type: "table", rows: table });
    table = null;
  };
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith("|")) {
      flushPara();
      table ??= [];
      table.push(
        line
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim()),
      );
      continue;
    }
    flushTable();
    if (line.startsWith("# ")) {
      flushPara();
      blocks.push({ type: "title", text: line.slice(2).trim() });
    } else if (line.startsWith("## ")) {
      flushPara();
      blocks.push({ type: "h2", text: line.slice(3).trim() });
    } else if (line.trim() === "") {
      flushPara();
    } else {
      para.push(line.trim());
    }
  }
  flushPara();
  flushTable();
  return blocks;
}

const s = StyleSheet.create({
  page: { paddingTop: 64, paddingBottom: 64, paddingHorizontal: 72, fontFamily: "Times-Roman", fontSize: 10.5, lineHeight: 1.42 },
  title: { fontFamily: "Times-Bold", fontSize: 14, textAlign: "center", marginBottom: 10, letterSpacing: 0.5 },
  h2: { fontFamily: "Times-Bold", fontSize: 10.5, marginTop: 12, marginBottom: 4 },
  p: { marginBottom: 7, textAlign: "justify" },
  table: { marginTop: 6, marginBottom: 10, borderTopWidth: 0.5, borderColor: "#444" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#444" },
  cell: { paddingVertical: 3, paddingHorizontal: 4 },
  header: { position: "absolute", top: 32, left: 72, right: 72, fontSize: 8, color: "#555", flexDirection: "row", justifyContent: "space-between" },
  footer: { position: "absolute", bottom: 32, left: 72, right: 72, fontSize: 8, color: "#555", textAlign: "center" },
});

export function ContractDocument({ blocks, runningTitle }: { blocks: Block[]; runningTitle: string }) {
  return (
    <Document title={runningTitle} author="Synthetic demo contract" subject="Groundwork seed contract (fictional)">
      <Page size="LETTER" style={s.page}>
        <View style={s.header} fixed>
          <Text>{runningTitle}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
        {blocks.map((b, i) => {
          switch (b.type) {
            case "title":
              return (
                <Text key={i} style={s.title}>
                  {b.text}
                </Text>
              );
            case "h2":
              return (
                <Text key={i} style={s.h2} minPresenceAhead={40}>
                  {b.text}
                </Text>
              );
            case "p":
              return (
                <Text key={i} style={s.p}>
                  {b.text}
                </Text>
              );
            case "table": {
              const widths = ["12%", "58%", "30%"];
              return (
                <View key={i} style={s.table}>
                  {b.rows.map((r, ri) => (
                    <View key={ri} style={s.row}>
                      {r.map((c, ci) => (
                        <Text
                          key={ci}
                          style={[
                            s.cell,
                            { width: widths[ci] ?? "30%", textAlign: ci === 2 ? "right" : "left" },
                            ri === 0 || ri === b.rows.length - 1 ? { fontFamily: "Times-Bold" } : {},
                          ]}
                        >
                          {c}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              );
            }
          }
        })}
        <Text style={s.footer} fixed>
          Fictional contract generated for the Groundwork demo. Not legal advice. No real parties.
        </Text>
      </Page>
    </Document>
  );
}
