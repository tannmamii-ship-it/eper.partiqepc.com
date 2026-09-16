require('dotenv').config();
const express = require('express');
const puppeteer = require('puppeteer');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET_URL = process.env.TARGET_URL || 'https://eper.autocore360.com';

let authCookies = '';
let isAuthenticating = false;

async function loginAndGetCookies() {
  if (isAuthenticating) return;
  isAuthenticating = true;
  console.log('[BOT] ePER sitesine otomatik giriş deneniyor...');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // Alternatif seçicileri dene (id veya name bazlı)
    const userInput = await page.waitForSelector('input[name="username"], #eper-user', { timeout: 15000 });
    const passInput = await page.waitForSelector('input[name="password"], #eper-pass', { timeout: 15000 });

    await userInput.type(process.env.EPER_USER || 'mtan0', { delay: 50 });
    await passInput.type(process.env.EPER_PASS || '0326Aoyp', { delay: 50 });

    // Giriş butonuna tıkla
    const loginBtn = await page.$('.btn-login, button[name="submit"], button[type="submit"], input[type="submit"]');
    if (loginBtn) {
      await Promise.all([
        loginBtn.click(),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
      ]);
    } else {
      await page.keyboard.press('Enter');
    }

    const cookies = await page.cookies();
    if (cookies.length > 0) {
      authCookies = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      console.log('[BOT BAŞARILI] Oturum çerezleri alındı!');
    } else {
      console.log('[BOT UYARI] Giriş yapıldı ancak çerez oluşmadı.');
    }
  } catch (error) {
    console.error('[BOT HATA DETAYI]:', error.message);
  } finally {
    if (browser) await browser.close();
    isAuthenticating = false;
  }
}

app.use('/', async (req, res, next) => {
  if (!authCookies && !isAuthenticating) {
    await loginAndGetCookies();
  }
  next();
}, createProxyMiddleware({
  target: TARGET_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq) => {
      if (authCookies) {
        proxyReq.setHeader('Cookie', authCookies);
      }
      proxyReq.setHeader('Host', new URL(TARGET_URL).host);
    }
  }
}));

app.listen(PORT, () => {
  console.log(`[SUNUCU] Proxy http://localhost:${PORT} üzerinde çalışıyor.`);
  loginAndGetCookies();
});