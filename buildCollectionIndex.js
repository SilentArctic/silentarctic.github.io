const fs = require('fs');
const crypto = require('crypto');

function createIndex(path, originType) {
   const index = {};

   /* only index collection json files (skips index.json and subfolders like community, private, .git) */
   fs.readdirSync(path)
      .filter(file => file.endsWith('.json') && file !== 'index.json')
      .sort()
      .forEach(file => {
         let data = fs.readFileSync(`${path}/${file}`);
         data = JSON.parse(data);

         /* private packs carry a secret updateKey, used to verify update requests; generate once, never index it */
         if (originType === 'private' && !data._meta.source.updateKey) {
            data._meta.source.updateKey = crypto.randomBytes(24).toString('base64url');
            fs.writeFileSync(`${path}/${file}`, JSON.stringify(data, null, 3));
         }

         const { updateKey, ...source } = data._meta.source;
         index[file] = { ...source, originType };
      });

   /* overwrite index.json with new data */
   const data = JSON.stringify(index, null, 3);
   fs.writeFileSync(`${path}/index.json`, data);
}

try {
   createIndex('./api', 'core');
   createIndex('./api/community', 'community');

   /* api/private is a separate, gitignored repo and may not exist (e.g. in CI) */
   if (fs.existsSync('./api/private')) createIndex('./api/private', 'private');
} catch (error) {
   console.error(error);
   process.exitCode = 1;
}
