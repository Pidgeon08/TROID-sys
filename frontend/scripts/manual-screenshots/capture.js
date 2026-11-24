// Takes the User Manual's step-by-step screenshots from the running app.
//
//   1. backend:  python manage.py seed_sample_data   (on a local SQLite database), then runserver
//   2. frontend: npm run dev
//   3. npm run manual:screenshots                     (or: -- --only admin/deployment-schedule)
//
// Pictures go to src/assets/manual/<role>/<topic id>/<shot>.jpg, where the User Manual finds them.
// It signs in with the sample accounts and never changes any data (see browser.js).
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { USER_MANUALS, stepShot } from '../../src/data/userManual.js';
import { BASE_URL, clearOutline, launch, outline, settle, shoot, signIn } from './browser.js';
import { RECIPES } from './recipes.js';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../src/assets/manual');
const ROLES = ['admin', 'mayorsoffice', 'barangay']; // ngo accounts share the barangay manual

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg >= 0 ? process.argv[onlyArg + 1] : null; // "role" or "role/topic"
const wanted = (role, topicId) => !only || only === role || only === `${role}/${topicId}`;

const problems = [];
let taken = 0;

// Every shot named in the manual needs a recipe, and every recipe a step.
for (const role of ROLES) {
  for (const topic of USER_MANUALS[role]) {
    const recipes = RECIPES[role]?.[topic.id] || {};
    const shots = topic.steps.map(stepShot).filter(Boolean);
    shots.filter((s) => !recipes[s]).forEach((s) => problems.push(`${role}/${topic.id}/${s}: no recipe`));
    Object.keys(recipes).filter((s) => !shots.includes(s)).forEach((s) => problems.push(`${role}/${topic.id}/${s}: recipe with no step`));
  }
}

const browser = await launch();
try {
  for (const role of ROLES) {
    const topics = USER_MANUALS[role].filter((t) => wanted(role, t.id));
    if (!topics.length) continue;
    const { context, page } = await signIn(browser, role);
    for (const topic of topics) {
      for (const step of topic.steps) {
        const shot = stepShot(step);
        const recipe = shot && RECIPES[role]?.[topic.id]?.[shot];
        if (!recipe) continue;
        const name = `${role}/${topic.id}/${shot}`;
        try {
          await page.goto(`${BASE_URL}${recipe.path || topic.path}`);
          await settle(page, 1200);
          if (recipe.run) await recipe.run(page);
          if (recipe.outline) {
            const targets = [].concat(recipe.outline(page));
            await outline(page, targets);
          }
          const file = join(OUT_DIR, role, topic.id, `${shot}.jpg`);
          await mkdir(dirname(file), { recursive: true });
          await shoot(page, file);
          await clearOutline(page);
          await page.unrouteAll({ behavior: 'ignoreErrors' }); // drop this recipe's fake() answers
          taken += 1;
          console.log(`  ok    ${name}`);
        } catch (err) {
          problems.push(`${name}: ${err.message.split('\n')[0]}`);
          console.log(`  FAIL  ${name}`);
          await page.unrouteAll({ behavior: 'ignoreErrors' });
        }
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${taken} screenshot${taken === 1 ? '' : 's'} saved to src/assets/manual.`);
if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  problems.forEach((p) => console.log(`  - ${p}`));
  process.exitCode = 1;
}
