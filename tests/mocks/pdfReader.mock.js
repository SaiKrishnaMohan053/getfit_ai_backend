// mocks/pdfReader.mock.js
const parsePdf = jest.fn(async () => "dummy pdf text");

module.exports = { parsePdf };