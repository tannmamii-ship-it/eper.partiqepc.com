require('dotenv').config();
const express = require('express');
const puppeteer = require('puppeteer');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET_URL = process.env.TARGET_URL || 'https://eper.autocore360.com';
const FIAT_FAVICON = 'https://eper.parts.fiat.com/favicon.ico';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let authCookies = '';
let rawCookies = [];
let authPromise = null;

// Fiat Favicon
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
  console.log('[BOT] Otomatik giriş işlemi başlatılıyor...');
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
    await page.setUserAgent(USER_AGENT);

    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // Birebir belirtilen HTML elemanları bekleniyor
    await page.waitForSelector('#eper-user', { timeout: 20000 });
    await page.waitForSelector('#eper-pass', { timeout: 20000 });

    // Verilen kullanıcı adı ve şifre yazılıyor
    await page.type('#eper-user', process.env.EPER_USER || 'otoford', { delay: 50 });
    await page.type('#eper-pass', process.env.EPER_PASS || '2478mertser', { delay: 50 });

    // Login butonuna tıklanıyor
    await page.click('.btn-login');

    // Yönlendirme ve oturum onayının tamamlanması bekleniyor
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 4000));

    rawCookies = await page.cookies();
    if (rawCookies.length > 0) {
      authCookies = rawCookies.map(c => `${c.name}=${c.value}`).join('; ');
      console.log('[BOT BAŞARILI] Giriş tamamlandı. Toplam çerez sayısı:', rawCookies.length);
    } else {
      console.error('[BOT HATA]: Çerez toplanamadı.');
    }
  } catch (error) {
    console.error('[BOT HATA]:', error.message);
  } finally {
    if (browser) await browser.close();
  }
}

async function ensureAuthenticated() {
  if (authCookies) return;
  if (!authPromise) {
    authPromise = loginAndGetCookies().finally(() => {
      authPromise = null;
    });
  }
  await authPromise;
}

app.use(async (req, res, next) => {
  if (req.path === '/favicon.ico') return next();
  await ensureAuthenticated();
  next();
});

app.use('/', createProxyMiddleware({
  target: TARGET_URL,
  changeOrigin: true,
  autoRewrite: true,
  followRedirects: true,
  on: {
    proxyReq: (proxyReq) => {
      if (authCookies) {
        proxyReq.setHeader('Cookie', authCookies);
      }
      proxyReq.setHeader('User-Agent', USER_AGENT);
      proxyReq.setHeader('Origin', TARGET_URL);
      proxyReq.setHeader('Referer', `${TARGET_URL}/`);
    },
    proxyRes: (proxyRes, req, res) => {
      if (rawCookies && rawCookies.length > 0) {
        const setCookieHeaders = rawCookies.map(c => `${c.name}=${c.value}; Path=/; SameSite=Lax`);
        res.setHeader('Set-Cookie', setCookieHeaders);
      }
    }
  }
}));

app.listen(PORT, () => {
  console.log(`[SUNUCU] Aktif: Port ${PORT}`);
  ensureAuthenticated();
});
