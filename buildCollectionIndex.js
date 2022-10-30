const fs = require('fs');

function createIndex(path) {
   const index = {};

   /* filter out index.json and create index data */
   fs.readdirSync(path)
      .filter(file => file !== 'index.json' && file !== 'community')
      .forEach(file => {
         let data = fs.readFileSync(`${path}/${file}`);
         data = JSON.parse(data);

         const originType = path.includes('community') ? 'community' : 'core';
         index[file] = { ...data._meta.source, originType };
      });

   /* overwrite index.js with new data */
   const data = JSON.stringify(index, null, 3);
   fs.writeFileSync(`${path}/index.json`, data);
}

try {
   createIndex('./api');
   createIndex('./api/community');
} catch (error) {
   console.error(error);
}
