import { createServer } from 'vite';

async function crawlModules() {
  const server = await createServer({
    root: process.cwd(),
    server: { port: 5173 },
    logLevel: 'silent',
  });

  const visited = new Set();
  const queue = [
    '/index.html',
    '/src/main.jsx',
    '/src/App.jsx',
    '/src/pages/Bookings.jsx',
    '/src/pages/Rooms.jsx',
    '/src/pages/Guests.jsx',
    '/src/pages/GuestDetails.jsx',
    '/src/pages/TodayCheckouts.jsx',
    '/src/pages/AllReferrals.jsx',
    '/src/pages/Bills.jsx',
    '/src/pages/Reports.jsx',
    '/src/pages/RoomMaster.jsx',
    '/src/pages/Users.jsx',
    '/src/pages/Settings.jsx',
    '/src/pages/Login.jsx',
    '/src/pages/InvoicePrint.jsx'
  ];

  const errors = [];
  const importRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;

  while (queue.length > 0) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    if (url.startsWith('/@') || url.startsWith('http') || !url.startsWith('/src')) {
      // External or vite internal
      continue;
    }

    try {
      const res = await server.transformRequest(url);
      if (!res) {
        console.warn(`[WARN - NULL RES] ${url}`);
        continue;
      }

      // Find relative imports in the code or use moduleGraph
      const mod = server.moduleGraph.getModuleById(url) || await server.moduleGraph.getModuleByUrl(url);
      if (mod && mod.importedModules) {
        for (const imported of mod.importedModules) {
          if (imported.url && !visited.has(imported.url)) {
            queue.push(imported.url);
          }
        }
      }
    } catch (err) {
      console.error(`[ERROR] ${url}:`, err.message);
      errors.push({ url, error: err.message });
    }
  }

  console.log(`Visited ${visited.size} modules. Errors found: ${errors.length}`);
  for (const e of errors) {
    console.log(`  - ${e.url}: ${e.error}`);
  }

  await server.close();
}

crawlModules().catch(console.error);
