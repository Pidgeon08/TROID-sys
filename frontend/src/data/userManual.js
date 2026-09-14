// Per-role User Manual content for the Utilities page. Each entry describes one feature the
// role actually has access to (matching Sidebar.jsx's nav items) so the manual only ever shows
// what that user type can do — no cross-role leakage. `path` is where "Go to page" redirects.

export const USER_MANUALS = {
  admin: [
    {
      id: 'dashboard',
      title: 'Dashboard',
      path: '/admin/dashboard',
      description: 'Your at-a-glance view of fleet activity, collection totals, and hotspots.',
      keywords: ['overview', 'home', 'stats', 'priority areas', 'hotspots'],
      steps: [
        'Check the "Trash Collected" and "Deployed Cleaning" cards for a running total across all barangays.',
        'The Collective Hotspots map shows where waste is concentrated — switch between Today/Weekly/Monthly or pick a custom date range.',
        'The Priority Areas panel lists barangays TROID has automatically flagged for a follow-up drive based on recent collection volume, along with which bot was booked.',
        'Most Trash Collected and Recent Activities give quick links into Reports and Requests for more detail.',
      ],
    },
    {
      id: 'manage-bots',
      title: 'Bot Management',
      path: '/admin/manage-bots',
      description: 'Monitor the TROID fleet, add new bots, and schedule maintenance or archival.',
      keywords: ['boats', 'fleet', 'troid bot', 'maintenance', 'archive bot', 'battery'],
      steps: [
        'Use the search bar and status filter to find a specific bot by ID, operator, or location.',
        'Click a row to select a bot and see its connection, battery, assigned location, and total trash collected in the sidebar.',
        'Use Quick Action to schedule maintenance (which takes the bot offline), jump to its deployment schedule, or archive it if it is being retired.',
        'Click "Add bot" to register a new unit to the fleet.',
      ],
    },
    {
      id: 'user-management',
      title: 'User Management',
      path: '/admin/users',
      description: 'Create and manage CENRO, Mayor\'s Office, Barangay, and NGO accounts.',
      keywords: ['accounts', 'roles', 'add user', 'password', 'access'],
      steps: [
        'Search or filter by role/status to find an existing account.',
        'Click "Add user" to create a new account — a temporary password is emailed to the user, who must change it on first login.',
        'Select a user to view their details, or archive an account that no longer needs access.',
      ],
    },
    {
      id: 'operator-management',
      title: 'Operator Management',
      path: '/admin/operators',
      description: 'Track which operators are available and which bot each is assigned to.',
      keywords: ['staff', 'available', 'assigned'],
      steps: [
        'The Available/Assigned/Archived counters summarize your operator pool at a glance.',
        'Select an operator to see their current bot assignment and availability.',
        'Add a new operator, or archive one who is no longer active.',
      ],
    },
    {
      id: 'requests',
      title: 'Requests',
      path: '/admin/requests',
      description: 'Review barangay cleanup requests, verify TROID detections, and file trash reports.',
      keywords: ['cleanup request', 'approve', 'verify', 'trash report', 'pending'],
      steps: [
        'Use the tabs to filter by status — Pending Admin, Approved, Unscheduled, Pending Verification, Verified, Parked.',
        'Open a request to review it: approve/decline, and once a bot has run its session, file the Trash Collection Report with per-category counts.',
        'For TROID-supported cleanups, the filed report doubles as TROID\'s detected output until CENRO verifies it in the Verify Bot Detection step.',
        'Filing enough reports for one barangay may automatically flag it as a Priority Area — check the Dashboard.',
      ],
    },
    {
      id: 'collection-areas',
      title: 'Collection Areas',
      path: '/admin/collection-areas',
      description: 'Approve or decline the cleanup-zone polygons barangays submit.',
      keywords: ['zones', 'polygon', 'approve area', 'decline area', 'map'],
      steps: [
        'Switch between Pending, Approved, and Declined tabs to review submissions.',
        'Select an area to preview its polygon on the map before deciding.',
        'Approve it to make it available for barangays to attach to future requests, or decline with a reason so the barangay can resubmit.',
      ],
    },
    {
      id: 'deployment-schedule',
      title: 'Deployment Schedule',
      path: '/admin/deployment',
      description: 'Assign bots and operators to approved requests on a weekly calendar.',
      keywords: ['schedule', 'calendar', 'assign bot', 'time slot', 'priority follow-up'],
      steps: [
        'Click "Create Schedule" and pick an approved request — requests from a barangay flagged as a Priority Area are marked with an amber warning icon and shown first.',
        'Choose a date, time slot, bot(s), and operator(s); the system blocks bots that are already booked that day.',
        'Set the Cleanup Type: TROID Supported cleanups get a filed report treated as bot-detected data; Unsupported ones do not.',
        'Existing entries can be reopened to reschedule or reassign.',
      ],
    },
    {
      id: 'heatmap',
      title: 'Heatmap',
      path: '/admin/heatmap',
      description: 'View live waste-density coverage, and compare TROID vs. CENRO-reported totals per drive.',
      keywords: ['coverage', 'post-cleanup comparison', 'collection area', 'map'],
      steps: [
        'Live Heat Map shows waste density, bot pathing, or trash collected, filterable by category and time range.',
        'Switch to Post-Cleanup Comparison to see TROID-detected vs. user-reported totals per completed drive.',
        'Use "Select request" to open a searchable list of drives — picking one focuses the map on that request\'s collection-area polygon.',
      ],
    },
    {
      id: 'reports',
      title: 'Report Generation',
      path: '/admin/reports',
      description: 'Generate and export collection reports as PDF, Excel, or print.',
      keywords: ['export', 'pdf', 'excel', 'print', 'kpi', 'trend'],
      steps: [
        'Filter by date range and barangay, then review the KPI cards, the bags-collected trend chart (Daily/Weekly/Monthly), and the waste-type breakdown.',
        'The KPI deltas compare the selected period against an equal-length prior period automatically.',
        'Use Export PDF, Export Excel, or Print Report in the Report Overview panel to download a formatted copy.',
      ],
    },
    {
      id: 'audit-logs',
      title: 'Audit Logs',
      path: '/admin/utilities',
      description: 'Review a timestamped history of actions taken across the system.',
      keywords: ['history', 'activity log', 'who did what'],
      steps: [
        'Open Utilities and switch to the Audit Logs tab.',
        'Search or filter by module/status to find a specific action.',
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
        'Check the stat cards for a running total of requests and their status.',
        'Use "View all" to jump straight into the Requests list.',
      ],
    },
    {
      id: 'requests',
      title: 'Requests',
      path: '/mayorsoffice/requests',
      description: 'Approve or decline barangay cleanup requests before CENRO schedules a bot.',
      keywords: ['approve', 'decline', 'pending approval', 'review'],
      steps: [
        'Use the tabs — All Requests, Pending Approval, Approved, Declined — to filter the list.',
        'Click "Review" on a pending request to read its details, then approve it (sending it on to CENRO) or decline it with a reason.',
        'Requests you\'ve already decided on can still be opened with "View" for reference.',
      ],
    },
  ],

  barangay: [
    {
      id: 'dashboard',
      title: 'Dashboard',
      path: '/barangay/dashboard',
      description: 'An overview of your barangay\'s submitted requests and their progress.',
      keywords: ['overview', 'home', 'stats'],
      steps: [
        'Check the stat cards for how many of your requests are pending, approved, or completed.',
        'Use "View all" to jump into My Requests or Collection Areas for more detail.',
      ],
    },
    {
      id: 'collection-areas',
      title: 'Collection Areas',
      path: '/barangay/areas',
      description: 'Draw and submit the cleanup zones CENRO can later attach to your requests.',
      keywords: ['draw area', 'polygon', 'map', 'submit zone'],
      steps: [
        'Click "Draw Area" and tap points on the map to outline a zone; tap the first point again to close the polygon.',
        'Name the area and submit it for CENRO\'s approval — you\'ll see its status change from Pending to Approved (or Declined with a reason).',
        'Approved areas become available to link when CENRO schedules a cleanup for your barangay.',
      ],
    },
    {
      id: 'requests',
      title: 'My Requests',
      path: '/barangay/requests',
      description: 'Track every cleanup request you\'ve submitted, from approval through completion.',
      keywords: ['status', 'track', 'pending', 'completed', 'verified'],
      steps: [
        'Use the tabs to filter by status — Pending, Approved, Deployed, Completed.',
        'Click "View" on any request to see its full timeline, including the trash collection report once CENRO files it.',
      ],
    },
    {
      id: 'submit-request',
      title: 'Submit Request',
      path: '/barangay/request',
      description: 'File a new cleanup request for the Mayor\'s Office and CENRO to review.',
      keywords: ['new request', 'submit', 'send request', 'cleanup'],
      steps: [
        'Fill in the request details — location, preferred date/time, and notes — and attach a collection area if you\'ve already had one approved.',
        'Submit it; it first goes to the Mayor\'s Office for approval, then to CENRO for scheduling.',
        'Track its progress afterward in My Requests.',
      ],
    },
    {
      id: 'heatmap',
      title: 'Bot Tracking',
      path: '/barangay/heatmap',
      description: 'See where TROID bots are actively working in your barangay.',
      keywords: ['map', 'live tracking', 'coverage'],
      steps: [
        'The map shows live waste-density coverage for your area.',
        'Filter by category or time range to narrow what you\'re looking at.',
      ],
    },
  ],
};

// NGO accounts use the barangay flow (same routes, same permissions), so they share its manual.
USER_MANUALS.ngo = USER_MANUALS.barangay;
