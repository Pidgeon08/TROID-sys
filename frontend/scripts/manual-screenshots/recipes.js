// How each User Manual screenshot is taken: { [role]: { [topic id]: { [shot]: recipe } } }.
// Shots are listed in the order of the topic's steps; the step's `shot` (src/data/userManual.js)
// names the recipe.
//
// A recipe is { path?, run?(page), outline?(page) }:
//   path     the page to open (default: the topic's path)
//   run      clicks and typing that bring the page to what the step describes
//   outline  the control(s) the step is about; they get a blue outline in the picture
//
// Recipes only open things. They never press a final Save, Confirm, Approve or Proceed, and the
// browser refuses every API call that writes (browser.js). Where a step's screen only appears
// after a write, `fake()` answers that one call inside the browser, so nothing reaches the server.

// The innermost card (a rounded, bordered box) holding a heading with exactly this text.
const card = (page, text) => page.locator(
  `xpath=//*[normalize-space(text())=${JSON.stringify(text)}]/ancestor::*[self::div or self::section][contains(@class,"rounded") and contains(@class,"border")][1]`
).first();
const button = (page, name, exact = false) => page.getByRole('button', { name, exact }).first();
const text = (page, value, exact = true) => page.getByText(value, { exact }).first();

// Answers one API call inside the browser, without it reaching the server.
export async function fake(page, method, pathPattern, body) {
  await page.route((url) => pathPattern.test(new URL(url).pathname), (route) => {
    if (route.request().method() !== method) return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

// Opens the first request in a list filtered by the given URL query, e.g. "status=Approved".
const openFirstRequest = (listPath, query, buttonName = /^(View|Review)$/) => async (page) => {
  await page.goto(`${page.url().split('/').slice(0, 3).join('/')}${listPath}?${query}`);
  await settle(page);
  await page.getByRole('button', { name: buttonName }).first().click();
  await page.waitForURL(/\/requests\/[^/?]+/);
  await settle(page);
};

async function settle(page, extra = 700) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(extra);
}

const now = new Date();
const minutesAgo = (m) => new Date(now.getTime() - m * 60000).toLocaleString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

// The audit log holds real people's activity, so its pictures show these sample entries.
const SAMPLE_AUDIT_LOGS = [
  ['Sample CENRO Admin', 'Admin', 'Backup completed', 'Backed up accounts, requests and schedules', 'Backup & Restore'],
  ['Sample CENRO Admin', 'Admin', 'System paused', 'Paused for a backup', 'Backup & Restore'],
  ['Sample CENRO Admin', 'Admin', 'Schedule edited', 'Non-TROID cleanup REQ-0512 scheduled for Poro on 2026-11-28 at 08:00', 'Collection Schedule'],
  ['Sample City Admin', 'City Admin', 'Request approved', 'REQ-0529 sent on to CENRO', 'Requests'],
  ['Brgy. Poro Office', 'Barangay', 'Request submitted', 'REQ-0530 for Poro Point Shoreline', 'Requests'],
  ['Sample CENRO Admin', 'Admin', 'Area approved', 'Poro Cleanup Zone approved', 'Collection Areas'],
  ['Brgy. Poro Office', 'Barangay', 'Login successful', 'Signed in as poro@sample.troid.local', 'Authentication'],
  ['Sample CENRO Admin', 'Admin', 'Login successful', 'Signed in as cenro@sample.troid.local', 'Authentication'],
].map(([user, role, action, details, module], i) => ({
  id: i + 1, time: minutesAgo(i * 37 + 5), user, role, action, details, module, ip: '127.0.0.1', status: 'success',
}));

const fakeAuditLogs = (page) => fake(page, 'GET', /\/api\/audit-logs\/?$/, SAMPLE_AUDIT_LOGS);

const openUtilitiesTab = (name) => async (page) => {
  await button(page, name).click();
  await settle(page);
};

// The backup flow: pausing the system and listing what can be backed up are answered in the
// browser, so the system is never really paused.
async function startBackupFlow(page) {
  await fake(page, 'POST', /\/api\/maintenance\/start\/?$/, { active: true, kind: 'backup', started_by: 'Sample CENRO Admin', started_at: now.toISOString() });
  await fake(page, 'POST', /\/api\/maintenance\/(heartbeat|end)\/?$/, { active: false });
  await openUtilitiesTab('Backup & Restore')(page);
  await button(page, /^Back up$/).click();
  await settle(page, 300);
}

// User and operator lists also hold real people, so their pictures show the sample ones only.
async function sampleAccounts(page, select) {
  await page.getByPlaceholder(/Search by name or email/).fill('sample.troid.local');
  await settle(page, 300);
  await page.locator('tbody').getByText(select, { exact: true }).first().click();
  await settle(page, 300);
}

async function sampleOperators(page) {
  await page.getByPlaceholder(/Search by name or operator ID/).fill('SMP-');
  await settle(page, 300);
  await page.locator('tbody tr').first().click();
  await settle(page, 300);
}

// The "Waiting for the City Admin" card on a pending request, where Resend Request appears.
const waitingCard = (page) => page.getByText(/^Waiting for the/).first()
  .locator('xpath=ancestor::div[contains(@class,"rounded") and contains(@class,"border")][1]');

// The heat map's layer list and its "Compare with" collection area list.
const layerSelect = (page) => page.locator('select', { has: page.locator('option', { hasText: 'Bot Pathing' }) }).first();
const compareSelect = (page) => page.locator('select', { has: page.locator('option', { hasText: 'No collection area' }) }).first();

const cleanupTypeOptions = (page) => [
  page.locator('button, label', { hasText: 'TROID Supported' }).first(),
  page.locator('button, label', { hasText: 'Unsupported' }).first(),
];

// Selects a collection area in CENRO's list, which opens its card over the map.
async function selectArea(page, name) {
  await page.locator('li[data-area-row] button', { hasText: name }).first().click();
  await settle(page, 1200);
}

async function openScheduleModal(page) {
  await button(page, 'Create Schedule').click();
  await settle(page, 300);
}

// What the robot counted on a drive, per data card item, for the trash report picture.
const SAMPLE_TROID_COUNT = {
  'Bags (paper or plastic)': 14, 'Beverage bottles (plastic)': 26, 'Beverage bottles (glass)': 3, 'Beverage cans': 7,
  'Caps, lids': 11, 'Cups, plates, forks, knives, spoons': 9, 'Food wrappers, containers': 38, 'Straws, stirrers': 6,
  'Other items': 6,
};

// Opens the map preview of the request's collection area, and waits for the map.
async function showAreaPreview(page) {
  await page.getByTitle(/^Show where/).first().click();
  await page.locator('[role=dialog] .leaflet-container').waitFor({ timeout: 10000 });
  await settle(page, 1500);
}

// The request IDs listed on the page, in order.
async function requestIdsOnPage(page) {
  const found = (await page.locator('main').innerText()).match(/REQ-\d+/g) || [];
  return [...new Set(found)];
}

// The sample accounts have no notifications, so these pictures show sample ones about requests
// on the page, answered in the browser.
const NOTIFICATION_TEXT = {
  staff: [
    ['New request awaiting your approval', (id) => `${id} is waiting for your review.`],
    ['New request awaiting your approval', (id) => `${id} is waiting for your review.`],
    ['Trash collection report filed', (id) => `The trash collection report for ${id} was filed.`],
  ],
  barangay: [
    ['Your cleanup request has been approved', (id) => `${id} was approved and sent on to CENRO.`],
    ['Your cleanup request has been rescheduled', (id) => `${id} was moved to a new date.`],
    ['Your cleanup request record is finalized', (id) => `The trash collection report for ${id} was filed.`],
  ],
};

async function fakeNotifications(page, kind, ids) {
  const list = NOTIFICATION_TEXT[kind].slice(0, ids.length).map(([title, message], i) => ({
    id: 90000 - i,
    recipient: null,
    request: null,
    request_id: ids[i],
    notif_type: 'approved',
    title,
    message: message(ids[i]),
    is_read: i === 2,
    created_at: new Date(now.getTime() - (i * 95 + 4) * 60000).toISOString(),
  }));
  await fake(page, 'GET', /\/api\/notifications\/?$/, list);
}

const unreadRow = (page) => page.locator('tbody tr', { has: page.getByRole('img', { name: 'Unread notification' }) });

// Task status updates come from the operators' mobile app (Supabase), so their pictures show these
// sample ones, from the sample operators.
const SAMPLE_TASK_UPDATES = [
  ['completed', 'Cleanup finished at Poro Point Shoreline. 14 bags collected, robot returned to dock.', 'operator1@sample.troid.local', 12],
  ['in_progress', 'Robot launched along the shoreline; heavy plastic near the breakwater.', 'operator1@sample.troid.local', 95],
  ['to_be_continued', 'Stopped because of rain. Will continue tomorrow morning at the river mouth.', 'operator2@sample.troid.local', 26 * 60],
  ['in_progress', 'Started cleanup at Catbangen River Mouth with two workers.', 'operator2@sample.troid.local', 27 * 60],
  ['completed', 'Lingsat drainage outlet cleared. 6 bags, mostly sachets and bottles.', 'operator3@sample.troid.local', 3 * 24 * 60],
].map(([status, notes, email, mins], i) => {
  const sent = new Date(now.getTime() - mins * 60000);
  return { id: i + 1, status, notes, operator_email: email, created_at: sent.toISOString(), received_at: new Date(sent.getTime() + 40000).toISOString() };
});

async function showSampleTaskUpdates(page) {
  await fake(page, 'GET', /\/api\/task-status-updates\/?$/, { count: SAMPLE_TASK_UPDATES.length, results: SAMPLE_TASK_UPDATES });
  await page.reload();
  await settle(page, 800);
}

// Notifications & Live Updates, for each role's request list.
function notificationRecipes(listPath, kind) {
  const openBell = async (p) => {
    const ids = await requestIdsOnPage(p);
    await fakeNotifications(p, kind, ids.slice(1, 4));
    await p.reload();
    await settle(p, 1000);
    await p.getByRole('button', { name: 'Notifications' }).first().click();
    await settle(p, 500);
  };
  return {
    'unread-dots': {
      run: async (p) => {
        const ids = await requestIdsOnPage(p);
        await fakeNotifications(p, kind, ids.slice(0, 2));
        await p.reload();
        await settle(p, 1200);
      },
      outline: unreadRow,
    },
    bell: { run: openBell, outline: (p) => card(p, 'Notifications') },
    sound: { run: openBell, outline: (p) => button(p, /^Sound (on|off)$/) },
  };
}

// Account & Settings, under Utilities.
// The form beside the Profile / Security tabs, found by its heading.
const settingsForm = (page, heading) => page.locator('main h2', { hasText: heading }).first().locator('xpath=..');

const ACCOUNT_RECIPES = {
  profile: { outline: (p) => settingsForm(p, /^Profile$/) },
  security: {
    run: async (p) => { await button(p, 'Security', true).click(); await settle(p, 300); },
    outline: (p) => settingsForm(p, /^Change password$/),
  },
  logout: { outline: (p) => p.locator('aside').getByRole('button', { name: 'Logout' }) },
};

export const RECIPES = {
  admin: {
    dashboard: {
      'stat-cards': { outline: (p) => [card(p, 'Trash Collected'), card(p, 'Cleanup Drives Done')] },
      'hotspots-map': { outline: (p) => card(p, 'Collective Hotspots') },
      'priority-areas': { outline: (p) => card(p, 'Priority Areas') },
      'most-trash': { outline: (p) => card(p, 'Most Trash Collected') },
    },

    'manage-bots': {
      'search-filter': { outline: (p) => [p.getByPlaceholder(/Search by bot ID/), p.locator('select').first()] },
      'select-bot': {
        run: async (p) => { await text(p, 'TRD-002').click(); await settle(p, 300); },
        outline: (p) => card(p, 'Selected bot information'),
      },
      'bot-status': { outline: (p) => [card(p, 'Paired'), card(p, 'Unpaired')] },
      'quick-action': { outline: (p) => card(p, 'Quick action') },
      'add-bot': { run: async (p) => { await button(p, 'Add bot').click(); await settle(p, 300); } },
      archived: { outline: (p) => button(p, /^Archived/) },
    },

    'user-management': {
      search: {
        run: (p) => sampleAccounts(p, 'Sample CENRO Admin'),
        outline: (p) => [p.getByPlaceholder(/Search by name or email/), p.locator('select').last()],
      },
      'add-user': {
        run: async (p) => { await sampleAccounts(p, 'Sample CENRO Admin'); await button(p, 'Add user').click(); await settle(p, 300); },
      },
      'select-user': {
        run: (p) => sampleAccounts(p, 'Sample City Admin'),
        outline: (p) => card(p, 'Selected account information'),
      },
    },

    'operator-management': {
      counters: { run: sampleOperators, outline: (p) => [card(p, 'Total operators'), card(p, 'Archived')] },
      'select-operator': {
        run: async (p) => { await sampleOperators(p); await p.locator('tbody tr').nth(1).click(); await settle(p, 300); },
        outline: (p) => card(p, 'Selected operator information'),
      },
      'add-operator': {
        run: async (p) => { await sampleOperators(p); await button(p, 'Add operator').click(); await settle(p, 300); },
      },
    },

    requests: {
      'send-request': {
        path: '/admin/request/send-request',
        outline: cleanupTypeOptions,
      },
      filters: {
        run: async (p) => { await button(p, 'All statuses').click(); await settle(p, 300); },
        outline: (p) => [p.getByPlaceholder(/Search ID, requester/), button(p, 'All statuses')],
      },
      letter: {
        run: openFirstRequest('/admin/requests', 'status=Approved&type=troid_supported'),
        outline: (p) => card(p, 'Letter of Request'),
      },
      'change-area': {
        run: openFirstRequest('/admin/requests', 'status=Approved&type=troid_supported'),
        outline: (p) => button(p, 'Change Area'),
      },
      merge: {
        run: openFirstRequest('/admin/requests', 'status=Approved&type=troid_supported'),
        outline: (p) => button(p, /^Merge/),
      },
      unmerge: {
        run: openFirstRequest('/admin/requests', 'status=Merged'),
        outline: (p) => button(p, /^Unmerge/),
      },
      review: {
        run: openFirstRequest('/admin/requests', 'status=Pending Admin Approval'),
        outline: (p) => card(p, 'Decision'),
      },
      'area-preview': {
        run: async (p) => { await openFirstRequest('/admin/requests', 'status=Approved&type=troid_supported')(p); await showAreaPreview(p); },
        outline: (p) => p.getByRole('dialog'),
      },
      'troid-counted': {
        run: async (p) => {
          // A drive that has just started has no counts yet, so the picture shows sample ones.
          await fake(p, 'GET', /\/troid_count\/?$/, { troid_assisted: true, categories: SAMPLE_TROID_COUNT, total: 120 });
          await openFirstRequest('/admin/requests', 'status=Ongoing&type=troid_supported')(p);
          await button(p, /Mark Session Completed/).click();
          await settle(p);
          await p.locator('form .overflow-y-auto').first().evaluate((el) => el.scrollBy(0, 330));
          await settle(p, 300);
        },
        outline: (p) => text(p, 'TROID counted', false),
      },
      'priority-feed': { path: '/admin/dashboard', outline: (p) => card(p, 'Priority Areas') },
    },

    'task-status-updates': {
      list: { run: showSampleTaskUpdates, outline: (p) => p.locator('main table').first() },
      filters: {
        run: showSampleTaskUpdates,
        outline: (p) => [p.getByPlaceholder(/Search notes or operator email/), p.getByLabel('Filter by status')],
      },
    },

    'collection-areas': {
      'add-area': { run: async (p) => { await button(p, 'Add Area').click(); await settle(p); } },
      details: {
        run: async (p) => { await button(p, 'Add Area').click(); await settle(p); },
        outline: (p) => [p.getByText(/^Details/).first(), p.getByPlaceholder(/Strong current/)],
      },
      'status-tabs': { outline: (p) => [p.getByRole('tab', { name: /^All/ }), p.getByRole('tab', { name: /^Archived/ })] },
      'search-filters': {
        run: async (p) => { await button(p, /^Filters/).click(); await settle(p, 300); },
        outline: (p) => [p.getByPlaceholder(/Search name, ID/), button(p, /^Filters/)],
      },
      priority: { outline: (p) => text(p, 'Priority') },
      'zoom-shown': {
        run: async (p) => { await p.getByRole('tab', { name: /^Pending/ }).click(); await settle(p); },
        outline: (p) => button(p, /Zoom to/),
      },
      'select-area': {
        run: (p) => selectArea(p, 'Poro Point Shoreline'),
        outline: (p) => p.getByRole('button', { name: 'Close details' }).locator('xpath=ancestor::div[contains(@class,"shadow-xl")][1]'),
      },
      'area-requests': {
        run: async (p) => { await selectArea(p, 'Poro Point Shoreline'); await button(p, /^Requests\s*[1-9]/).click(); await settle(p); },
      },
      heatmap: {
        run: async (p) => {
          await selectArea(p, 'Poro Point Shoreline');
          await p.getByRole('switch', { name: /Trash heatmap/ }).click();
          await p.getByRole('button', { name: 'All time' }).click();
          await p.getByText(/\d+ detections?/).first().waitFor();
          await settle(p, 1500);
        },
        outline: (p) => p.getByRole('switch', { name: /Trash heatmap/ }).locator('xpath=..'),
      },
      edit: { run: async (p) => { await selectArea(p, 'Poro Point Shoreline'); await button(p, /^Edit$/).click(); await settle(p); } },
      'approve-archive': {
        run: async (p) => {
          await p.getByRole('tab', { name: /^Pending/ }).click();
          await settle(p, 300);
          await p.locator('li[data-area-row] button').first().click();
          await settle(p);
        },
        outline: (p) => [button(p, /^Archive$/), button(p, /^Approve$/)],
      },
    },

    'deployment-schedule': {
      'create-toggle': {
        run: openScheduleModal,
        outline: (p) => p.getByRole('radiogroup', { name: 'Cleanup type' }),
      },
      'pick-request': {
        run: async (p) => { await openScheduleModal(p); await button(p, /Select Approved TROID Request/).click(); await settle(p, 300); },
        outline: (p) => button(p, /Select Approved TROID Request/),
      },
      'troid-fields': {
        run: async (p) => {
          await openScheduleModal(p);
          await button(p, /Select Approved TROID Request/).click();
          await p.locator('button:not([disabled])', { hasText: /^REQ-/ }).first().click();
          await settle(p, 300);
        },
        outline: (p) => [text(p, 'Date'), text(p, 'Operators')],
      },
      'non-troid': {
        run: async (p) => { await openScheduleModal(p); await p.getByRole('radio', { name: /Non-TROID cleanup/ }).click(); await settle(p, 300); },
        outline: (p) => p.getByRole('radiogroup', { name: 'Cleanup type' }),
      },
      'existing-entry': { outline: (p) => p.locator('button.bg-emerald-50').first() },
    },

    heatmap: {
      'live-filters': {
        run: async (p) => { await button(p, '30 days', true).click(); await settle(p); },
        outline: (p) => [button(p, 'Today', true), p.locator('select').first()],
      },
      'bot-pathing': {
        run: async (p) => {
          await button(p, '30 days', true).click();
          await p.locator('select', { has: p.locator('option', { hasText: 'Bot Pathing' }) }).first().selectOption({ label: 'Bot Pathing' });
          await settle(p, 1200);
        },
        outline: (p) => p.locator('select', { has: p.locator('option', { hasText: 'Bot Pathing' }) }).first(),
      },
      'compare-with': {
        run: async (p) => {
          await button(p, '30 days', true).click();
          await p.locator('select', { has: p.locator('option', { hasText: 'No collection area' }) }).first().selectOption({ index: 1 });
          await settle(p, 1200);
        },
        outline: (p) => card(p, 'Area covered'),
      },
      'bot-trail': {
        run: async (p) => { await button(p, '30 days', true).click(); await settle(p, 1200); },
        outline: (p) => card(p, 'Bot trail'),
      },
      'post-cleanup': {
        run: async (p) => {
          await button(p, /Post-Cleanup Comparison/).click();
          await settle(p);
          await button(p, 'Select request').click();
          await settle(p, 500);
        },
      },
    },

    reports: {
      'filter-bar': {
        run: async (p) => { await button(p, /Last 30 days/).click(); await settle(p, 300); },
        outline: (p) => button(p, 'Generate Report'),
      },
      counted: { outline: (p) => card(p, 'Total Bags Collected') },
      compare: {
        run: async (p) => { await button(p, /vs previous period/).click(); await settle(p, 300); },
        outline: (p) => button(p, /vs previous period/),
      },
      'priority-card': { outline: (p) => card(p, 'Priority Collection Areas') },
      'period-table': { outline: (p) => card(p, 'Period Comparison') },
      history: { outline: (p) => card(p, 'Collection History') },
      export: { outline: (p) => card(p, 'Report Overview') },
    },

    'audit-logs': {
      tab: {
        run: async (p) => { await fakeAuditLogs(p); await openUtilitiesTab('Audit Logs')(p); },
        outline: (p) => button(p, 'Audit Logs'),
      },
      search: {
        run: async (p) => { await fakeAuditLogs(p); await openUtilitiesTab('Audit Logs')(p); },
        outline: (p) => p.getByPlaceholder(/Search/).first(),
      },
      'backup-entries': {
        run: async (p) => {
          await fakeAuditLogs(p);
          await openUtilitiesTab('Audit Logs')(p);
          await p.getByPlaceholder(/Search/).first().fill('Backup');
          await settle(p, 300);
        },
        outline: (p) => text(p, 'Backup completed'),
      },
    },

    'backup-restore': {
      'back-up': {
        run: openUtilitiesTab('Backup & Restore'),
        outline: (p) => button(p, /^Back up$/),
      },
      paused: {
        path: '/admin/dashboard',
        run: async (p) => {
          await fake(p, 'GET', /\/api\/maintenance\/?$/, { active: true, kind: 'backup', started_by: 'Sample CENRO Admin', started_at: now.toISOString(), user_id: -1 });
          await p.reload();
          await settle(p, 1500);
        },
      },
      choose: {
        run: async (p) => { await startBackupFlow(p); await button(p, 'Proceed').click(); await settle(p); },
      },
      overview: {
        run: async (p) => {
          await startBackupFlow(p);
          await button(p, 'Proceed').click();
          await settle(p);
          await p.getByRole('button', { name: 'Review', exact: true }).last().click();
          await settle(p, 300);
        },
        outline: (p) => button(p, 'Create backup'),
      },
      restore: {
        run: openUtilitiesTab('Backup & Restore'),
        outline: (p) => text(p, 'Restore', false),
      },
      'restored-parts': {
        run: openUtilitiesTab('Backup & Restore'),
        outline: (p) => card(p, 'Restore'),
      },
      'audit-trail': {
        run: async (p) => {
          await fakeAuditLogs(p);
          await openUtilitiesTab('Audit Logs')(p);
          await p.getByPlaceholder(/Search/).first().fill('Backup');
          await settle(p, 300);
        },
        outline: (p) => text(p, 'System paused'),
      },
    },

    notifications: notificationRecipes('/admin/requests', 'staff'),
    account: ACCOUNT_RECIPES,
  },

  mayorsoffice: {
    dashboard: {
      'stat-cards': { outline: (p) => [card(p, 'Total Requests'), card(p, 'Parked')] },
      'view-all': { outline: (p) => button(p, 'View all requests') },
    },
    requests: {
      filters: {
        run: async (p) => { await button(p, 'All statuses').click(); await settle(p, 300); },
        outline: (p) => [p.getByPlaceholder(/Search ID, requester/), button(p, 'All statuses')],
      },
      review: {
        run: openFirstRequest('/mayorsoffice/requests', 'status=Pending City Admin Approval'),
        outline: (p) => card(p, 'Decision'),
      },
      view: {
        path: '/mayorsoffice/requests?status=Approved',
        outline: (p) => button(p, /^View$/),
      },
    },
    notifications: notificationRecipes('/mayorsoffice/requests', 'staff'),
    account: ACCOUNT_RECIPES,
  },

  barangay: {
    dashboard: {
      'own-barangay': { outline: (p) => text(p, 'Barangay Poro', false) },
      'stat-cards': { outline: (p) => [card(p, 'Trash Collected'), card(p, 'Cleanup Drives Done')] },
      'hotspots-map': { outline: (p) => card(p, 'Waste Hotspots') },
      'priority-areas': { outline: (p) => [card(p, 'Priority Areas'), card(p, 'Most Trash Collected')] },
      recent: { outline: (p) => card(p, 'Recent Activities') },
    },
    'collection-areas': {
      draw: {
        run: async (p) => { await button(p, 'Draw Area').click(); await settle(p); },
      },
      status: { outline: (p) => [text(p, 'Pending Approval'), text(p, 'Approved')] },
      approved: { outline: (p) => text(p, 'Poro Point Shoreline') },
    },
    requests: {
      filters: {
        run: async (p) => { await button(p, 'All statuses').click(); await settle(p, 300); },
        outline: (p) => button(p, 'All statuses'),
      },
      view: { outline: (p) => button(p, /^View$/) },
      'submit-button': { outline: (p) => [p.getByRole('button', { name: 'Notifications' }), button(p, 'Submit Request')] },
      'area-preview': {
        run: async (p) => { await openFirstRequest('/barangay/requests', 'status=Approved&type=troid_supported')(p); await showAreaPreview(p); },
        outline: (p) => p.getByRole('dialog'),
      },
      finish: {
        run: openFirstRequest('/barangay/requests', 'status=Approved'),
        outline: (p) => button(p, /Mark as Finished/),
      },
      merged: {
        run: openFirstRequest('/barangay/requests', 'status=Merged'),
        outline: (p) => p.getByText(/^Merged into/).first(),
      },
      resend: {
        run: openFirstRequest('/barangay/requests', 'status=Pending City Admin Approval,Pending Admin Approval'),
        outline: waitingCard,
      },
    },
    'submit-request': {
      'cleanup-type': { outline: cleanupTypeOptions },
      timetable: {
        run: async (p) => { await button(p, /Select a date from the bot timetable/).click(); await settle(p); },
      },
      preview: { outline: (p) => text(p, 'Letter of Request') },
      submit: {
        run: async (p) => { await p.mouse.wheel(0, 3000); await settle(p, 300); },
        outline: (p) => button(p, /^(Submit|Review)/),
      },
      resend: {
        run: openFirstRequest('/barangay/requests', 'status=Pending City Admin Approval,Pending Admin Approval'),
        outline: waitingCard,
      },
      track: { outline: (p) => p.locator('aside').getByRole('link', { name: 'Requests' }) },
    },
    heatmap: {
      filters: {
        run: async (p) => { await button(p, '30 days', true).click(); await settle(p, 1200); },
        outline: (p) => [button(p, 'Today', true), layerSelect(p)],
      },
      pathing: {
        run: async (p) => {
          await button(p, '30 days', true).click();
          await layerSelect(p).selectOption({ label: 'Bot Pathing' });
          await settle(p, 1200);
        },
        outline: layerSelect,
      },
      'compare-with': {
        run: async (p) => {
          await button(p, '30 days', true).click();
          await compareSelect(p).selectOption({ label: 'Poro Point Shoreline' });
          await settle(p, 1200);
        },
        outline: (p) => card(p, 'Area covered'),
      },
      'bot-trail': {
        run: async (p) => { await button(p, '30 days', true).click(); await settle(p, 1200); },
        outline: (p) => card(p, 'Bot trail'),
      },
      'post-cleanup': {
        run: async (p) => {
          await button(p, /Post-Cleanup Comparison/).click();
          await settle(p);
          await button(p, 'Select request').click();
          await settle(p, 500);
        },
      },
    },
    notifications: notificationRecipes('/barangay/requests', 'barangay'),
    account: ACCOUNT_RECIPES,
  },
};
