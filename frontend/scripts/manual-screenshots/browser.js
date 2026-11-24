// Browser helpers for the User Manual screenshots: sign in, never change data, outline a
// control, and save the picture.
import { chromium } from 'playwright';

export const BASE_URL = (process.env.MANUAL_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
export const VIEWPORT = { width: 1440, height: 900 };

// The accounts `python manage.py seed_sample_data` makes (backend/troid_api/management/commands).
export const ACCOUNTS = {
  admin: { email: 'cenro@sample.troid.local', password: 'Sample123!' },
  mayorsoffice: { email: 'cityadmin@sample.troid.local', password: 'Sample123!' },
  barangay: { email: 'poro@sample.troid.local', password: 'Sample123!' },
};

export async function launch() {
  try {
    return await chromium.launch();
  } catch (err) {
    console.error('Could not start Chromium. Run `npx playwright install chromium-headless-shell` and try again.');
    throw err;
  }
}

// Taking pictures must never change anything: every API call that writes is refused,
// apart from signing in. Recipes only open forms and never press the final button anyway.
export async function blockWrites(context) {
  await context.route(/\/api\//, (route) => {
    const request = route.request();
    const method = request.method();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || /\/api\/login\/?$/.test(request.url())) {
      return route.continue();
    }
    return route.abort('blockedbyclient');
  });
}

export async function signIn(browser, role) {
  const account = ACCOUNTS[role];
  if (!account) throw new Error(`No sample account for role "${role}".`);
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await blockWrites(context);
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`);
  await page.locator('form input[type="text"]').first().fill(account.email);
  await page.locator('input[type="password"]').first().fill(account.password);
  // Without "Remember me" the session is lost when the script opens the next page.
  await page.locator('form input[type="checkbox"]').first().check();
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 });
  await settle(page);
  return { context, page };
}

// Waits for the page's data and any map tiles to come in, and for animations to finish.
export async function settle(page, extra = 600) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(extra);
}

// Draws a blue outline around the control(s) a step is about, so readers can find them.
// Several locators get one outline around all of them.
export async function outline(page, locators) {
  const targets = [].concat(locators).map((l) => l.first());
  await targets[0].waitFor({ state: 'visible', timeout: 8000 });
  await targets[0].evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => {});
  await page.waitForTimeout(250);
  const boxes = [];
  for (const target of targets) {
    const b = await target.boundingBox();
    if (!b) throw new Error('A control to outline is not on screen.');
    boxes.push(b);
  }
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const box = {
    x: left,
    y: top,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - left,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - top,
  };
  await page.evaluate(({ x, y, width, height }) => {
    const pad = 4;
    const ring = document.createElement('div');
    ring.setAttribute('data-manual-outline', '');
    Object.assign(ring.style, {
      position: 'fixed',
      left: `${x - pad}px`,
      top: `${y - pad}px`,
      width: `${width + pad * 2}px`,
      height: `${height + pad * 2}px`,
      border: '3px solid #1b4de4',
      borderRadius: '10px',
      boxShadow: '0 0 0 4px rgba(27, 77, 228, 0.25)',
      pointerEvents: 'none',
      zIndex: '2147483647',
    });
    document.body.appendChild(ring);
  }, box);
}

export async function clearOutline(page) {
  await page.evaluate(() => document.querySelectorAll('[data-manual-outline]').forEach((el) => el.remove()));
}

export async function shoot(page, file) {
  await page.screenshot({ path: file, type: 'jpeg', quality: 80 });
}
