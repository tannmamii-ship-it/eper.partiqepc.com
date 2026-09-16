require('dotenv').config();
const express = require('express');
const puppeteer = require('puppeteer');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET_URL = process.env.TARGET_URL || 'https://eper.autocore360.com';
const FIAT_FAVICON = 'https://eper.parts.fiat.com/favicon.ico';

let authCookies = '';
let isAuthenticating = false;

// Özel Fiat Favicon Yönlendirmesi
app.get('/favicon.ico', async (req, res) => {
  try {
    const response = await fetch(FIAT_FAVICON);
    const arrayBuffer = await response.arrayBuffer();
    res.set('Content-Type', 'image/x-icon');
    res.send(Buffer.from(arrayBuffer));
  } catch (e) {
    res.redirect(FIAT_FAVICON);
  }
});

async function loginAndGetCookies() {
  if (isAuthenticating) return;
  isAuthenticating = true;
  console.log('[BOT] Otomatik giriş deneniyor...');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const userInput = await page.waitForSelector('input[name="username"], #eper-user', { timeout: 20000 });
    const passInput = await page.waitForSelector('input[name="password"], #eper-pass', { timeout: 20000 });

    await userInput.type(process.env.EPER_USER || 'mtan0', { delay: 30 });
    await passInput.type(process.env.EPER_PASS || '0326Aoyp', { delay: 30 });

    const loginBtn = await page.$('.btn-login, button[type="submit"], input[type="submit"]');
    if (loginBtn) {
      await Promise.all([
        loginBtn.click(),
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
      ]);
    } else {
      await page.keyboard.press('Enter');
    }

    const cookies = await page.cookies();
    if (cookies.length > 0) {
      authCookies = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      console.log('[BOT BAŞARILI] Oturum çerezleri alındı!');
    }
  } catch (error) {
    console.error('[BOT HATA]:', error.message);
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
  console.log(`[SUNUCU] Aktif: Port ${PORT}`);
  loginAndGetCookies();
});
