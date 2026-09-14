import {PDFDocument, StandardFonts, rgb} from 'pdf-lib';
import type {PDFFont} from 'pdf-lib';
import type {Occupation, Release, Role} from '../domain/types';
import {rolePage} from '../domain/sources';

const ink = rgb(0.15, 0.16, 0.14), blue = rgb(0.19, 0.36, 0.45);
const paper = rgb(0.94, 0.95, 0.92), rule = rgb(0.78, 0.80, 0.76);
const clean = (text: string) => text.replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s+/g, ' ').trim();

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of clean(text).split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
    if (line) lines.push(line);
    line = '';
    for (const character of word) {
      if (font.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = ''; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Uses only the explicitly supplied public records, never DOM or search text.
export async function occupationPdf(occupations: Occupation[], release: Release, role?: Role): Promise<Uint8Array> {
  if (!occupations.length || occupations.length > 3) throw new Error('Choose one to three occupations.');
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const titleFont = await doc.embedFont(StandardFonts.TimesRoman);
  doc.setTitle(occupations.length > 1 ? 'Work & AI - occupation comparison' : `Work & AI - ${occupations[0].title}`);
  doc.setAuthor('Work & AI');
  const width = 841.89, height = 595.28, margin = 42, contentWidth = width - margin * 2;
  let page = doc.addPage([width, height]), y = height - margin;
  const newPage = () => { page = doc.addPage([width, height]); y = height - margin; };
  const ensure = (space: number) => { if (y - space < margin + 22) newPage(); };
  const paragraph = (text: string, size = 10, font = regular, color = ink) => {
    const lines = wrap(text, font, size, contentWidth);
    for (const line of lines) {
      ensure(size * 1.45);
      page.drawText(line, {x: margin, y: y - size, font, size, color});
      y -= size * 1.45;
    }
    y -= 6;
  };
  paragraph('Work & AI', 25, titleFont, blue);
  paragraph(occupations.length > 1 ? 'Occupation comparison' : 'Occupational summary', 17, bold);
  paragraph(`${release.bls} | ${release.onet}`, 9);
  paragraph(`U.S. occupational data | Retrieved ${release.retrieved.slice(0, 10)}`, 9);
  const labelWidth = 170, valueWidth = (contentWidth - labelWidth) / occupations.length;
  const rows = [
    ['Published measure', ...occupations.map(o => `${o.title} (BLS ${o.code})`)],
    ['Relative AI exposure', ...occupations.map(o => o.exposure ?? 'Unavailable')],
    ['Projected employment change', ...occupations.map(o => `${o.growth === null ? 'Unavailable' : `${o.growth > 0 ? '+' : ''}${o.growth.toFixed(1)}%`} (${o.startYear}-${o.endYear})`)],
    ['Annual average openings', ...occupations.map(o => `${o.annualOpenings === null ? 'Unavailable' : o.annualOpenings.toLocaleString('en-US')} (${o.startYear}-${o.endYear}); includes replacement needs`)],
    ['Statistical scope', ...occupations.map(o => `Whole BLS occupation ${o.code}. Specialist roles may differ.`)],
  ];
  rows.forEach((row, index) => {
    const cells = row.map((text, column) => wrap(text, index === 0 || column === 0 ? bold : regular, 10, (column === 0 ? labelWidth : valueWidth) - 20));
    const rowHeight = Math.max(...cells.map(lines => lines.length)) * 14 + 16;
    ensure(rowHeight);
    if (index === 0) page.drawRectangle({x: margin, y: y - rowHeight, width: contentWidth, height: rowHeight, color: paper});
    cells.forEach((lines, column) => lines.forEach((line, i) => page.drawText(line, {
      x: margin + (column === 0 ? 0 : labelWidth + (column - 1) * valueWidth) + 10,
      y: y - 18 - i * 14, size: 10, font: index === 0 || column === 0 ? bold : regular, color: index === 0 ? blue : ink,
    })));
    y -= rowHeight;
    page.drawLine({start: {x: margin, y}, end: {x: width - margin, y}, thickness: 0.5, color: rule});
  });
  y -= 18;
  ensure(65);
  paragraph('How to read these figures', 12, bold, blue);
  paragraph('AI exposure is a relative occupational category, not a probability of job loss or an individual assessment. It does not distinguish automation from assistance. Employment projections reflect many factors, not only AI. Annual openings include replacement needs as well as growth. Missing values are unavailable, not zero.', 10);
  paragraph('Theoretical exposure sources reflect capabilities from 2020 and 2023; observed-use evidence is mainly from 2024-2025. These figures do not measure today\'s AI capabilities.', 9);
  if (occupations.length === 1 && role) {
    ensure(60);
    paragraph(`Selected role: ${role.title}`, 12, bold, blue);
    paragraph(role.description);
    if (role.broader) paragraph(`The description refers to the selected O*NET role; statistics cover the broader BLS occupation, ${occupations[0].title}.`, 9);
    paragraph(`Role description: ${rolePage(role.code)}`, 9);
  }
  ensure(125);
  paragraph('Sources and release', 12, bold, blue);
  for (const source of new Set(occupations.map(o => o.source))) paragraph(`Statistics: ${source}`, 8);
  paragraph('Exposure method: https://www.bls.gov/emp/publications/ai-exposure-categories.htm', 8);
  paragraph('Methodology: https://github.com/lstehlik2809/work-and-ai/blob/main/METHODOLOGY.md', 8);
  paragraph(`Release: ${release.id}`, 8);
  paragraph('Includes information from the O*NET 31.0 Database, USDOL/ETA, under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Work & AI has selected and combined the information; USDOL/ETA has not approved, endorsed or tested these modifications.', 8);
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`Work & AI | U.S. occupational reference | ${i + 1} / ${pages.length}`, {x: margin, y: 25, font: regular, size: 8, color: blue}));
  return doc.save();
}
