// Mock cheerio for Jest — cheerio 1.0 uses ESM + undici which can't load in jsdom
const load = (html) => {
  const find = () => ({ text: () => '', each: () => {}, length: 0 });
  return (selector) => ({ find, text: () => '', each: () => {}, length: 0 });
};

module.exports = { load };
