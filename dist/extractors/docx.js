import mammoth from 'mammoth';
export async function extractDocx(path) {
    const res = await mammoth.extractRawText({ path });
    return res.value;
}
//# sourceMappingURL=docx.js.map