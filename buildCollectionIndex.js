const fs = require('fs');

try {
   const index = {};

   /* filter out index.json and create index data */
   fs.readdirSync('./api')
      .filter(file => file !== 'index.json')
      .forEach(file => {
         let data = fs.readFileSync(`./api/${file}`);
         data = JSON.parse(data);

         index[file] = data._meta.source;
      });

   /* overwrite index.js with new data */
   const data = JSON.stringify(index, null, 3);
   fs.writeFileSync('./api/index.json', data);
} catch (error) {
   console.error(error);
}
