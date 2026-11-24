// Per-role User Manual content for the Utilities page. Each entry describes one feature the
// role actually has access to (matching Sidebar.jsx's nav items) so the manual only ever shows
// what that user type can do — no cross-role leakage. `path` is where "Go to page" redirects.
//
// A step is either its text, or { text, shot } when it has a screenshot. `shot` names the picture
// src/assets/manual/<role>/<topic id>/<shot>.jpg, made by `npm run manual:screenshots`
// (scripts/manual-screenshots/recipes.js says how each one is taken).

export const stepText = (step) => (typeof step === 'string' ? step : step.text);
export const stepShot = (step) => (typeof step === 'string' ? null : step.shot || null);

export const USER_MANUALS = {
  admin: [
    {
      id: 'dashboard',
      title: 'Dashboard',
      path: '/admin/dashboard',
      description: 'Your at-a-glance view of fleet activity, collection totals, and hotspots.',
      keywords: ['overview', 'home', 'stats', 'priority areas', 'hotspots'],
      steps: [
        { text: 'Check the "Trash Collected" and "Cleanup Drives Done" cards for the current month across all barangays. Hover over a graph to see the figure for each day.', shot: 'stat-cards' },
        { text: 'The Collective Hotspots map shows where TROID detected trash — switch between Today/Weekly/Monthly or pick a custom date range, and switch the layer to Waste Density, Trash Collected, or Bot Pathing.', shot: 'hotspots-map' },
        { text: 'The Priority Areas panel lists the collection areas collecting more per cleanup than last month, with their average bags per cleanup now and before. A collection area is a priority when its cleanups over the last 30 days brought in more bags on average than its cleanups in the 30 days before; the same or fewer is fine. It is worked out again every time, so an area stops being a priority once its average drops. Click "View areas" to see them on the Collection Areas page.', shot: 'priority-areas' },
        { text: 'Most Trash Collected and Recent Activities give quick links into Reports and Requests for more detail.', shot: 'most-trash' },
      ],
    },
    {
      id: 'manage-bots',
      title: 'Bot Management',
      path: '/admin/manage-bots',
      description: 'Monitor the TROID fleet, add new bots, and schedule maintenance or archival.',
      keywords: ['boats', 'fleet', 'troid bot', 'maintenance', 'archive bot', 'restore bot', 'battery'],
      steps: [
        { text: 'Use the search bar and status filter to find a specific bot by ID, operator, or location.', shot: 'search-filter' },
        { text: 'Click a row to select a bot and see its connection, battery, assigned location, and total trash collected in the sidebar.', shot: 'select-bot' },
        { text: 'A bot shows Paired while it is reporting to the system, Unpaired when it is not, and Under maintenance on a date it has maintenance scheduled. Creating a new device key with Connect robot sets it back to Unpaired until the robot reports in with that key.', shot: 'bot-status' },
        { text: 'Use Quick Action to schedule or cancel maintenance, jump to its deployment schedule, or archive it if it is being retired.', shot: 'quick-action' },
        { text: 'Click "Add bot" to register a new unit to the fleet.', shot: 'add-bot' },
        { text: 'Click "Archived" to see archived bots. Select one and click "Restore bot" to return it to the active fleet.', shot: 'archived' },
      ],
    },
    {
      id: 'user-management',
      title: 'User Management',
      path: '/admin/users',
      description: 'Create and manage CENRO, City Admin, Barangay, and NGO accounts.',
      keywords: ['accounts', 'roles', 'add user', 'password', 'access'],
      steps: [
        { text: 'Search or filter by role/status to find an existing account.', shot: 'search' },
        { text: 'Click "Add user" to create a new account — a temporary password is emailed to the user, who must change it on first login.', shot: 'add-user' },
        { text: 'Select a user to view their details, or archive an account that no longer needs access.', shot: 'select-user' },
      ],
    },
    {
      id: 'operator-management',
      title: 'Operator Management',
      path: '/admin/operators',
      description: 'Track which operators are available and which bot each is assigned to.',
      keywords: ['staff', 'available', 'assigned'],
      steps: [
        { text: 'The Available/Assigned/Archived counters summarize your operator pool at a glance.', shot: 'counters' },
        { text: 'Select an operator to see their current bot assignment and availability.', shot: 'select-operator' },
        { text: 'Add a new operator, or archive one who is no longer active.', shot: 'add-operator' },
      ],
    },
    {
      id: 'requests',
      title: 'Requests',
      path: '/admin/requests',
      description: 'Review barangay cleanup requests, send your own, and file trash reports.',
      keywords: ['cleanup request', 'approve', 'verify', 'trash report', 'pending', 'send request', 'merge', 'unmerge', 'change area', 'redirect', 'letter preview'],
      steps: [
        { text: 'Click "Send Request" to request a cleanup yourself. It is the same form barangays use: choose TROID Supported (pick the barangay and one of its approved collection areas) or Unsupported (pick the barangay and type the location), pick a date from the bot timetable (at least 7 days ahead) and a time, and attach the letter of request.', shot: 'send-request' },
        { text: 'Use the filter bar above the list: search by ID, requester, barangay or area; pick one or more statuses (each shows how many requests it has); filter by date submitted or preferred cleanup date (Today, Last/Next 7 or 30 days, This month, or a custom range); and narrow by cleanup type, barangay, collection area, requester, or whether an approved request is scheduled yet. Sort by submitted or preferred date. Remove a filter by clicking its chip, or click Clear all. Filters stay when you open a request and come back.', shot: 'filters' },
        { text: 'The letter of request is shown on the request page. PDF and Word (.docx) letters can be read there; older .doc files must be downloaded.', shot: 'letter' },
        { text: 'Before a TROID-supported cleanup starts, click "Change Area" to send it to another approved collection area, for example where the trash has drifted. A reason is required, and the requester is told where and why.', shot: 'change-area' },
        { text: 'Click "Merge" to fold other requests into the one you are viewing, so one cleanup covers them all. Only TROID-supported requests for the same collection area that have not started can be merged. If you change the main request\'s area, the merged requests move with it. Merged requests keep their own pages, show this request\'s status, schedule, history and trash report, and their requesters are told about every update. Their own deployment schedules are removed.', shot: 'merge' },
        { text: 'Click "Unmerge" on a merged request (or beside it in Merged Requests) to put it back where it was. Archiving the main request unmerges the rest.', shot: 'unmerge' },
        { text: 'Open a request to review it: approve/decline, and once the cleanup is done, with or without a robot, click "Mark Session Completed" and fill in the required Trash Collection Report (per-category counts, bags, and weights).', shot: 'review' },
        { text: 'For TROID-supported cleanups, the Trash by category fields are filled in with what the robot counted. Each shows "TROID counted" beside its label, and the numbers can be edited before filing.', shot: 'troid-counted' },
        { text: 'Each filed report feeds the Priority Areas on the Dashboard: an area whose last 30 days of cleanups average more bags than the 30 days before becomes a priority.', shot: 'priority-feed' },
      ],
    },
    {
      id: 'collection-areas',
      title: 'Collection Areas',
      path: '/admin/collection-areas',
      description: 'Add and edit cleanup zones for any barangay, and approve or archive the ones barangays submit.',
      keywords: ['zones', 'polygon', 'add area', 'edit area', 'redraw', 'hazards', 'water body', 'approve area', 'archive area', 'decline area', 'map', 'boundary', 'filter', 'search', 'sort'],
      steps: [
        { text: 'Click "Add Area", choose the barangay, and click points on the map to outline the zone. Points must be inside the barangay\'s dashed boundary, or on the water within 1 km of it; points elsewhere are refused with the reason. Areas CENRO adds are approved straight away.', shot: 'add-area' },
        { text: 'Fill in the optional details for the operator and workers: a description, the water body and its name, and any hazards.', shot: 'details' },
        { text: 'Use the status tabs (All, Pending, Approved, Archived) to review submissions; each tab shows how many areas it holds with your other filters applied.', shot: 'status-tabs' },
        { text: 'Search by name, ID, barangay, water body, hazards or who made it. Open "Filters" to narrow by barangay, water body type, shape (polygon or line), whether requests were sent to it, and whether its details are filled in, and use the date button to show areas added in a period. Choose the order in the sort list.', shot: 'search-filters' },
        { text: 'Areas collecting more bags per cleanup over the last 30 days than the 30 before are marked Priority; select one to see its averages, or choose Priority in "Filters" to list only those.', shot: 'priority' },
        { text: 'Active filters show as chips you can click to remove, or click "Clear all". The map shows only the areas in the list; click "Zoom to shown areas" to fit them on the map. Filters stay in the page address, so they survive a refresh.', shot: 'zoom-shown' },
        { text: 'Select an area to preview it on the map and see its details, size, how many requests were sent to it, and who last edited it.', shot: 'select-area' },
        { text: 'Click "Requests" on an area to list the cleanup requests sent to it, with their status, date, requester, and what was collected. Filter by status, and click a request to open it.', shot: 'area-requests' },
        { text: 'Click "Edit" on any area to change its name, colour, or details. Click "Redraw shape" to draw it again (the current shape stays on the map, dashed, for reference), or choose another barangay to move it there and draw it again. Edits keep the area\'s status.', shot: 'edit' },
        { text: 'Approve it to make it available for barangays to attach to future requests, or archive it with a reason so the barangay can resubmit.', shot: 'approve-archive' },
      ],
    },
    {
      id: 'deployment-schedule',
      title: 'Deployment Schedule',
      path: '/admin/deployment',
      description: 'Schedule TROID and non-TROID cleanups for approved requests on a calendar.',
      keywords: ['schedule', 'calendar', 'assign bot', 'time slot', 'priority area', 'non-troid', 'manual cleanup'],
      steps: [
        { text: 'Click "Create Schedule" and choose TROID cleanup or Non-TROID cleanup at the top. Only approved requests made as that type are listed (TROID Supported requests for a TROID cleanup, Unsupported ones for a non-TROID cleanup).', shot: 'create-toggle' },
        { text: 'Pick an approved request. Requests for a priority collection area (more bags per cleanup lately than the month before) are marked with an amber warning icon and shown first.', shot: 'pick-request' },
        { text: 'TROID cleanup: choose a date, time slot, bot(s), and operator(s); the system blocks bots that are already booked that day. Its filed report is treated as bot-detected data.', shot: 'troid-fields' },
        { text: 'Non-TROID cleanup: choose only a date and time slot, no bot or operator. It shows in the "Non-TROID" row at the bottom of the calendar and never blocks a bot.', shot: 'non-troid' },
        { text: 'Existing entries can be reopened to reschedule or reassign. A cell\'s robot or people icon tells you which type of cleanup it is.', shot: 'existing-entry' },
      ],
    },
    {
      id: 'heatmap',
      title: 'Heatmap',
      path: '/admin/heatmap',
      description: 'See where TROID found trash, how much of a collection area it covered, and compare TROID vs. reported totals per drive.',
      keywords: ['coverage', 'area covered', 'post-cleanup comparison', 'collection area', 'map', 'distance'],
      steps: [
        { text: 'Live Heat Map shows waste density or trash collected as heat. Filter it by time (today, 7 days, 30 days, or a custom range) and by category.', shot: 'live-filters' },
        { text: 'Switch the layer to Bot Pathing to see the robot\'s route as points joined in order, one colour per robot. Each run starts at a green point and ends at a larger point; hover a point to see when it was reported and how many items were detected there.', shot: 'bot-pathing' },
        { text: 'Choose a collection area under "Compare with" to see how much of it TROID covered. Each point the robot reported counts as covering the chosen reach (5–30 m) around it; points outside the area are marked in amber.', shot: 'compare-with' },
        { text: 'Bot trail shows the distance and active time between the robot\'s points, and when the first and last points came in.', shot: 'bot-trail' },
        { text: 'Switch to Post-Cleanup Comparison and use "Select request" to pick a completed drive. The map shows where TROID went against that request\'s collection area, next to TROID-detected vs. reported totals per category.', shot: 'post-cleanup' },
      ],
    },
    {
      id: 'reports',
      title: 'Report Generation',
      path: '/admin/reports',
      description: 'Generate and export collection reports as PDF, Excel, or print.',
      keywords: ['export', 'pdf', 'excel', 'print', 'preview', 'download', 'kpi', 'trend', 'compare', 'comparison', 'previous period', 'last month', 'last week', 'history', 'monthly', 'weekly'],
      steps: [
        { text: 'Use the filter bar at the top: click the period button (the last 30 days by default) to pick a quick range such as Last month or This year, or set your own From and To dates; choose a barangay; and choose what to compare with. Then click "Generate Report" to apply them. Until you do, the bar says the changes are not applied yet, and "Undo changes" puts them back.', shot: 'filter-bar' },
        { text: 'The report counts every cleanup with a filed trash report, dated by when the cleanup finished. Merged and archived requests are left out so no bag is counted twice.', shot: 'counted' },
        { text: 'Choose what to compare with under "Compare With": the previous period (the same number of days just before), the same dates last week, last month or last year, or another date range (for example the dates of an earlier report). The KPI cards show the change and the compared value, the trend chart draws the compared period as a dashed line, and the waste types show their change too. Choose "No comparison" to hide the changes. A note warns when the two periods share days.', shot: 'compare' },
        { text: 'The Priority Collection Areas card counts the areas that were a priority at the end of the period (more bags per cleanup in its last 30 days than the 30 before), against the end of the compared period.', shot: 'priority-card' },
        { text: 'The Period Comparison table lists bags, weight, drives, robot deployments, zones, barangays and priority areas side by side. "Bags by Barangay" compares each barangay; with one barangay chosen it compares its collection areas instead.', shot: 'period-table' },
        { text: 'Collection History lists the last 3, 6 or 12 calendar months, or the last 4, 8 or 12 weeks (Monday to Sunday), up to the end of the report: cleanups, bags, weight and bags per cleanup, each with its change from the month or week before. Rows inside the report period are highlighted; the current month or week is marked "so far".', shot: 'history' },
        { text: 'Use Preview PDF or Preview Excel in the Report Overview panel: the report opens in a new tab to check first (the PDF as it will print, the Excel file one sheet per tab), and nothing is saved until you click Download there; Close leaves without saving. If no tab opens, allow pop-ups for the site. Print Report opens the print dialog. The PDF and Excel files include the comparison, the per-barangay figures, the waste types and the collection history.', shot: 'export' },
      ],
    },
    {
      id: 'audit-logs',
      title: 'Audit Logs',
      path: '/admin/utilities',
      description: 'Review a timestamped history of actions taken across the system.',
      keywords: ['history', 'activity log', 'who did what'],
      steps: [
        { text: 'Open Utilities and switch to the Audit Logs tab.', shot: 'tab' },
        { text: 'Search or filter by module/status to find a specific action.', shot: 'search' },
        { text: 'Every backup and restore is listed under the Backup & Restore module: when it started, what was backed up or restored, and when the system resumed. Backups and restores never change the audit log.', shot: 'backup-entries' },
      ],
    },
    {
      id: 'backup-restore',
      title: 'Backup & Restore',
      path: '/admin/utilities',
      description: 'Back up chosen parts of the system to a file, and restore them from one.',
      keywords: ['backup', 'restore', 'export data', 'pause', 'maintenance'],
      steps: [
        { text: 'Open Utilities and switch to the Backup & Restore tab. Click "Back up" and confirm with "Proceed".', shot: 'back-up' },
        { text: 'From then on the system is paused for everyone else: they see a "System paused" screen, nobody can change anything, sign in or use the Companion app, and the robots\' reports wait until it resumes. Your own navigation is locked until you finish or cancel.', shot: 'paused' },
        { text: 'Tick the parts of the system to back up: accounts, robots & operators, collection areas, requests, schedules, detections, notifications, and disposal records. Parts that another part needs are ticked for you (for example, requests need the robots and collection areas they point at).', shot: 'choose' },
        { text: 'Review the overview of what is and isn\'t included, then click "Create backup". The audit log is never included. The system resumes straight away; click "Download backup" to save the file and keep it private.', shot: 'overview' },
        { text: 'To restore, choose a backup file and click "Restore from this backup", then "Proceed". Tick the parts to restore (only the parts in the file can be chosen), review what will be put back, added and removed, type RESTORE and click "Restore".', shot: 'restore' },
        { text: 'Restored parts become exactly as they were in the backup; other parts and the audit log are left as they are. Restoring accounts signs everyone else out.', shot: 'restored-parts' },
        { text: 'Each start, backup, restore, cancellation and resume is written to the audit log. If your page closes mid-way, the system resumes by itself after a minute; if you reload, click "Cancel it and resume the system".', shot: 'audit-trail' },
      ],
    },
  ],

  mayorsoffice: [
    {
      id: 'dashboard',
      title: 'Dashboard',
      path: '/mayorsoffice/dashboard',
      description: 'A summary of cleanup activity across all barangays awaiting your review.',
      keywords: ['overview', 'home', 'stats'],
      steps: [
        { text: 'Check the stat cards for a running total of requests and their status.', shot: 'stat-cards' },
        { text: 'Use "View all" to jump straight into the Requests list.', shot: 'view-all' },
      ],
    },
    {
      id: 'requests',
      title: 'Requests',
      path: '/mayorsoffice/requests',
      description: 'Approve or decline barangay cleanup requests before CENRO schedules a bot.',
      keywords: ['approve', 'decline', 'pending approval', 'review'],
      steps: [
        { text: 'Use the filter bar above the list: search by ID, requester, barangay or area; pick one or more statuses (each shows how many requests it has); filter by date submitted or preferred cleanup date (Today, Last/Next 7 or 30 days, This month, or a custom range); and narrow by cleanup type, barangay, collection area or requester. Sort by submitted or preferred date, and remove a filter by clicking its chip.', shot: 'filters' },
        { text: 'Click "Review" on a pending request to read its details, then approve it (sending it on to CENRO) or decline it with a reason.', shot: 'review' },
        { text: 'Requests you\'ve already decided on can still be opened with "View" for reference.', shot: 'view' },
      ],
    },
  ],

  barangay: [
    {
      id: 'dashboard',
      title: 'Dashboard',
      path: '/barangay/dashboard',
      description: 'Cleanup activity in the barangay your account is assigned to.',
      keywords: ['overview', 'home', 'stats', 'hotspots', 'priority area', 'trash collected'],
      steps: [
        { text: 'Everything on the dashboard is for the barangay your account is assigned to; NGO accounts see the barangay they are assigned to. If none is set, ask CENRO to set it in User Management.', shot: 'own-barangay' },
        { text: 'Check the "Trash Collected" and "Cleanup Drives Done" cards for the current month. Hover over a graph to see the figure for each day.', shot: 'stat-cards' },
        { text: 'The Waste Hotspots map shows where TROID detected trash in your barangay — switch between Today/Weekly/Monthly or pick a custom date range, and switch the layer to Waste Density, Trash Collected, or Bot Pathing.', shot: 'hotspots-map' },
        { text: 'The Priority Areas panel lists your collection areas that are collecting more per cleanup than last month. A collection area is a priority when its cleanups over the last 30 days brought in more bags on average than its cleanups in the 30 days before; the same or fewer is fine. It is worked out again every time, so an area stops being a priority once its average drops. Most Trash Collected ranks your collection areas by bags collected.', shot: 'priority-areas' },
        { text: 'Recent Activities and Recent Requests list the latest requests for your barangay; click a request to open it, or "View all" to go to My Requests.', shot: 'recent' },
      ],
    },
    {
      id: 'collection-areas',
      title: 'Collection Areas',
      path: '/barangay/areas',
      description: 'Draw and submit the cleanup zones CENRO can later attach to your requests.',
      keywords: ['draw area', 'polygon', 'map', 'submit zone'],
      steps: [
        { text: 'Click "Draw Area" and tap points on the map to outline a zone; tap the first point again to close the polygon. Points must be inside your barangay\'s dashed boundary, or on the water within 1 km of it.', shot: 'draw' },
        { text: 'Name the area and submit it for CENRO\'s approval — you\'ll see its status change from Pending to Approved (or Declined with a reason).', shot: 'status' },
        { text: 'Approved areas become available to link when CENRO schedules a cleanup for your barangay.', shot: 'approved' },
      ],
    },
    {
      id: 'requests',
      title: 'My Requests',
      path: '/barangay/requests',
      description: 'Track every cleanup request you\'ve submitted, from approval through completion.',
      keywords: ['status', 'track', 'pending', 'completed', 'verified'],
      steps: [
        { text: 'Use the filter bar to search your requests, pick one or more statuses, filter by date submitted or preferred cleanup date, and narrow by cleanup type or collection area. Sort by submitted or preferred date, and remove a filter by clicking its chip.', shot: 'filters' },
        { text: 'Click "View" on any request to see its full timeline, including the trash collection report once CENRO files it.', shot: 'view' },
        { text: 'When an approved cleanup is done, click "Mark as Finished" and fill in the required Trash Collection Report. The cleanup stays open until the report is filed.', shot: 'finish' },
        { text: 'If CENRO merges your request into another, it shows "Merged". Its page then shows the other request\'s status, schedule and trash report, and you are notified of its updates.', shot: 'merged' },
        { text: 'A request still waiting for approval after 20 days can be resent from its page to remind the City Admin or CENRO.', shot: 'resend' },
      ],
    },
    {
      id: 'submit-request',
      title: 'Submit Request',
      path: '/barangay/request',
      description: 'File a new cleanup request for the City Admin and CENRO to review.',
      keywords: ['new request', 'submit', 'send request', 'cleanup'],
      steps: [
        { text: 'Choose the Cleanup Type. TROID Supported sends a TROID bot to one of your approved collection areas (the landmark is optional). Unsupported is a manual cleanup with no bot: type its location instead.', shot: 'cleanup-type' },
        { text: 'Pick a preferred date from the bot timetable and a time, and attach the letter of request.', shot: 'timetable' },
        { text: 'In the Review Request Overview, click "Preview" beside the letter to check it is the right file (PDF and .docx only).', shot: 'preview' },
        { text: 'Submit it; it first goes to the City Admin for approval, then to CENRO for scheduling.', shot: 'submit' },
        { text: 'If 20 days pass with no decision, open the request and click "Resend Request" to remind whoever it is waiting on. You can resend again 20 days later.', shot: 'resend' },
        { text: 'Track its progress afterward in My Requests.', shot: 'track' },
      ],
    },
    {
      id: 'heatmap',
      title: 'Bot Tracking',
      path: '/barangay/heatmap',
      description: 'See where TROID bots are actively working in your barangay.',
      keywords: ['map', 'live tracking', 'coverage'],
      steps: [
        { text: 'The map shows live waste-density coverage for your area.', shot: 'map' },
        { text: 'Filter by category or time range to narrow what you\'re looking at.', shot: 'filters' },
      ],
    },
  ],
};

// NGO accounts use the barangay flow (same routes, same permissions), so they share its manual.
USER_MANUALS.ngo = USER_MANUALS.barangay;
