/* PDF de texto paginado, generado localmente. No abre documentos ni usa un visor PDF. */
const WIDTHS = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const EXTRA = new Map([[0x20ac,128],[0x201a,130],[0x0192,131],[0x201e,132],[0x2026,133],[0x2020,134],[0x2021,135],[0x02c6,136],[0x2030,137],[0x0160,138],[0x2039,139],[0x0152,140],[0x017d,142],[0x2018,145],[0x2019,146],[0x201c,147],[0x201d,148],[0x2022,149],[0x2013,150],[0x2014,151],[0x02dc,152],[0x2122,153],[0x0161,154],[0x203a,155],[0x0153,156],[0x017e,158],[0x0178,159]]);
const ALTERNATIVES = new Map([['≥','>='],['≤','<='],['≠','!='],['→',' -> '],['←',' <- '],['↑',' aumento '],['↓',' disminución '],['▪','•'],['➢','•'],['❖','•'],['✓','[x]'],['✔','[x]'],['☑','[x]'],['☐','[ ]'],['□','[ ]'],['−','-'],['α','alfa'],['β','beta'],['γ','gamma'],['δ','delta'],['Δ','delta'],['×',' x ']]);
const byteFor = char => { const code=char.codePointAt(0); return EXTRA.get(code) ?? (code>=32&&code<=255?code:32); };

export function normalizePdfText(value) {
  return Array.from(String(value??'').normalize('NFC').replace(/\r\n?/g,'\n').replace(/\t/g,'    ').replace(/[^\S\n]/g,' ').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b\ufeff]/g,'')).map(char=>{
    if(char==='\n'||(char.codePointAt(0)>=32&&char.codePointAt(0)<=255)||EXTRA.has(char.codePointAt(0)))return char;
    return ALTERNATIVES.get(char) ?? ` [U+${char.codePointAt(0).toString(16).toUpperCase()}] `;
  }).join('').replace(/ +\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}

const width = char => (WIDTHS[byteFor(char)-32]||556)*10.5/1000;
export function pdfTextLines(value, availableWidth=499.28) {
  const lines=[];
  for(const paragraph of normalizePdfText(value).split('\n')){
    const words=paragraph.trim().split(/ +/);let line='',used=0;
    if(!paragraph.trim()){lines.push('');continue;}
    for(const word of words){
      const wordWidth=[...word].reduce((sum,char)=>sum+width(char),0),gap=line?width(' '):0;
      if(used+gap+wordWidth<=availableWidth){line+=(line?' ':'')+word;used+=gap+wordWidth;continue;}
      if(line){lines.push(line);line='';used=0;}
      for(const char of word){const size=width(char);if(used+size>availableWidth&&line){lines.push(line);line='';used=0;}line+=char;used+=size;}
    }
    if(line)lines.push(line);
  }
  return lines;
}

function pdfString(value) {
  return '('+[...value].map(char=>{const code=byteFor(char);return code<32||code>126?'\\'+code.toString(8).padStart(3,'0'):/[()\\]/.test(char)?'\\'+char:char;}).join('')+')';
}

export function createTextPdf(value) {
  const text=normalizePdfText(value);if(!text)throw new Error('La ficha está vacía.');
  const lines=pdfTextLines(text),perPage=52,pages=[];
  for(let index=0;index<lines.length;index+=perPage)pages.push(lines.slice(index,index+perPage));
  const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
  const pageIds=[];
  for(const [index,pageLines] of pages.entries()){
    const pageId=objects.length,streamId=pageId+1;pageIds.push(pageId);
    const stream=['BT /F1 10 Tf 0.14 0.33 0.47 rg 48 805 Td '+pdfString('Criterios de referencia · DRIPSSHA')+' Tj ET',
      'BT /F1 10.5 Tf 0.08 0.12 0.16 rg 13.5 TL 48 771 Td',...pageLines.map((line,i)=>(i?'T* ':'')+pdfString(line)+' Tj'),'ET',
      'BT /F1 9 Tf 0.30 0.38 0.44 rg 48 31 Td '+pdfString(`Página ${index+1} de ${pages.length}`)+' Tj ET'].join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects[2]=`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id=>id+' 0 R').join(' ')}] >>`;
  let pdf='%PDF-1.4\n',offsets=[0];
  for(let index=1;index<objects.length;index++){offsets.push(pdf.length);pdf+=`${index} 0 obj\n${objects[index]}\nendobj\n`;}
  const start=pdf.length;pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('');
  pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
