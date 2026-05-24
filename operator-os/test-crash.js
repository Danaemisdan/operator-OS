const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  await page.goto('http://localhost:5173/');
  // Wait a bit
  await new Promise(r => setTimeout(r, 2000));
  // If it requires clicking Studio, wait for that
  try {
    const studioBtn = await page.$('text=Studio');
    if (studioBtn) {
      await studioBtn.click();
      await new Promise(r => setTimeout(r, 2000));
    } else {
      console.log('Studio button not found');
    }
  } catch(e) {
    console.log(e);
  }
  await browser.close();
})();
