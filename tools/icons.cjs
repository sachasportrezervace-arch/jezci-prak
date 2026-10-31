// Vyrenderuje PNG ikony z icons/icon.svg: node tools/icons.cjs
const path = require("path"), fs = require("fs");
const { chromium } = require(path.join(process.env.APPDATA, "npm/node_modules/playwright"));
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, "../icons/icon.svg"), "utf8");
  const b = await chromium.launch(), p = await b.newPage();
  for (const n of [180, 192, 512]) {
    await p.setViewportSize({ width: n, height: n });
    await p.setContent(`<style>html,body{margin:0}svg{width:${n}px;height:${n}px;display:block}</style>${svg}`);
    await p.screenshot({ path: path.join(__dirname, `../icons/icon-${n}.png`) });
  }
  await b.close();
})();
