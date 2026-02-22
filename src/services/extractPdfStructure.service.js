const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

async function extractPdfStructure(pdfPath) {
  const form = new FormData();
  form.append("file", fs.createReadStream(pdfPath));

  const res = await axios.post(
    process.env.DIAGRAM_SERVICE_URL + "/extract",
    form,
    { 
        headers: form.getHeaders(),
        timeout: 120000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
     }
  );

  return res.data;
}

module.exports = { extractPdfStructure };