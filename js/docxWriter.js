// Builds a minimal but valid .docx (OOXML WordprocessingML packaged as a ZIP via
// ZipWriter) from the shared block format produced by ManuscriptExport.parseRichHtml:
//   { type: 'heading', level, runs } | { type: 'paragraph', runs } |
//   { type: 'blockquote', runs } | { type: 'listItem', ordered, index, runs } |
//   { type: 'hr' }
//   run: { text, bold, italic, underline, strike }
// Tables aren't supported in this v1 — parseRichHtml flattens them to plain text.
const DocxWriter = {
  _escapeXml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  },

  _runXml(run, extraProps = '') {
    const props = [];
    if (run.bold) props.push('<w:b/>');
    if (run.italic) props.push('<w:i/>');
    if (run.underline) props.push('<w:u w:val="single"/>');
    if (run.strike) props.push('<w:strike/>');
    const rPr = props.length || extraProps ? `<w:rPr>${extraProps}${props.join('')}</w:rPr>` : '';
    const lines = String(run.text || '').split('\n');
    return lines
      .map((line, i) => {
        const text = `<w:t xml:space="preserve">${DocxWriter._escapeXml(line)}</w:t>`;
        const br = i < lines.length - 1 ? `<w:r>${rPr}<w:br/></w:r>` : '';
        return `<w:r>${rPr}${text}</w:r>${br}`;
      })
      .join('');
  },

  _paragraphXml(block) {
    if (block.type === 'hr') {
      return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>';
    }
    let pPr = '';
    let prefixXml = '';
    if (block.type === 'heading') {
      pPr = `<w:pPr><w:pStyle w:val="Heading${Math.min(3, Math.max(1, block.level || 1))}"/></w:pPr>`;
    } else if (block.type === 'blockquote') {
      pPr = '<w:pPr><w:pStyle w:val="Quote"/></w:pPr>';
    } else if (block.type === 'listItem') {
      pPr = '<w:pPr><w:ind w:left="360"/></w:pPr>';
      const prefix = block.ordered ? `${block.index}. ` : '• ';
      prefixXml = `<w:r><w:t xml:space="preserve">${prefix}</w:t></w:r>`;
    }
    const runs = (block.runs || []).map((r) => DocxWriter._runXml(r)).join('');
    return `<w:p>${pPr}${prefixXml}${runs}</w:p>`;
  },

  build(title, blocks) {
    const bodyXml = blocks.map((b) => DocxWriter._paragraphXml(b)).join('');

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

    const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const coreProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>${DocxWriter._escapeXml(title)}</dc:title>
  <dc:creator>Storyweaver</dc:creator>
</cp:coreProperties>`;

    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="200" w:line="360" w:lineRule="auto"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="360" w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="280" w:after="140"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
</w:styles>`;

    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    return ZipWriter.build([
      { name: '[Content_Types].xml', content: contentTypes },
      { name: '_rels/.rels', content: rootRels },
      { name: 'docProps/core.xml', content: coreProps },
      { name: 'word/_rels/document.xml.rels', content: docRels },
      { name: 'word/styles.xml', content: styles },
      { name: 'word/document.xml', content: document },
    ]);
  },
};
