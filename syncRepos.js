const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/* the public repo and the nested private repo in api/private (gitignored by the public repo) */
const repos = [
   { name: 'public', dir: __dirname },
   { name: 'private', dir: path.join(__dirname, 'api', 'private') },
];

function git(dir, args, options = {}) {
   return spawnSync('git', args, { cwd: dir, stdio: 'inherit', ...options });
}

function isDirty(dir) {
   const result = git(dir, ['status', '--porcelain'], { stdio: 'pipe', encoding: 'utf8' });
   return result.stdout.trim().length > 0;
}

function run(action) {
   let failed = false;

   repos.forEach(({ name, dir }) => {
      if (!fs.existsSync(path.join(dir, '.git'))) {
         console.log(`\n[${name}] not a git repository, skipping (${dir})`);
         return;
      }

      console.log(`\n[${name}] git ${action}`);
      if (isDirty(dir)) {
         console.log(`[${name}] note: uncommitted changes will not be ${action === 'push' ? 'pushed' : 'touched'}`);
      }

      const result = git(dir, [action]);
      if (result.status !== 0) {
         console.error(`[${name}] git ${action} failed`);
         failed = true;
      }
   });

   if (failed) process.exitCode = 1;
}

const action = process.argv[2];
if (action !== 'pull' && action !== 'push') {
   console.error('Usage: node syncRepos.js <pull|push>');
   process.exitCode = 1;
} else {
   run(action);
}
