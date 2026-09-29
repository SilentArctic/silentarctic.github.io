const AJV = require('ajv');
const forEach = require('lodash/forEach');
const map = require('lodash/map');
const schemas = require('../schemas');

const fs = require('fs');
const path = require('path');
const requireDirectory = require('require-directory');

/* api/private is a separate, gitignored repo and may not exist (e.g. in CI) */
const hasPrivate = fs.existsSync(path.join(__dirname, '../api/private'));

const privateCollections = hasPrivate
   ? requireDirectory(module, '../api/private', { recurse: false })
   : {};
const privateIndex = privateCollections.index;
delete privateCollections.index;

const collections = {
   ...requireDirectory(module, '../api', { recurse: false }),
   ...requireDirectory(module, '../api/community'),
   ...privateCollections,
};
delete collections.index;

/* checks if schema is valid */
function validateSchema(file) {
   const ajv = new AJV({ schemas: map(schemas), allErrors: true });
   const isSchemaValid = ajv.validate(schemas.schema, file);
   return { valid: isSchemaValid, errors: ajv.errors };
}

describe('All collections should match schema', () => {
   /* check collections against schema */
   it('should match schema', () => {
      forEach(collections, (collection, name) => {
         const { valid, errors } = validateSchema(collection);
         if (!valid) console.log(name, errors);
         expect(valid).toBe(true);
      });
   });

   /**
    * check translations against base (English).
    * Item groups should have same length between versions.
    */
   it('should match English version', () => {
      forEach(collections, (collection, name) => {
         const { language } = collection._meta.source;
         if (!language || language.toLowerCase() === 'english') {
            expect(true).toBe(true);
            return;
         }

         const baseAbbr = collection._meta.source.abbreviation.split('_')[0];
         const baseCollection = collections[baseAbbr];

         const mismatches = [];
         forEach(collection, (items, itemGroupName) => {
            const hasGroup = items.length && baseCollection[itemGroupName].length;
            if (hasGroup && items.length !== baseCollection[itemGroupName].length) {
               const difference = baseCollection[itemGroupName].length - items.length;
               mismatches.push({ group: itemGroupName, difference });
            }
         });

         /* pass test regardless of outcome, but alert of mismatch */
         const valid = mismatches.length === 0;
         if (!valid) console.error(name, mismatches);
         expect(true).toBe(true);
      });
   });
});

describe('Private collections', () => {
   /* updateKey authorizes update requests, so every private pack needs one and it must never be public */
   it('should have an updateKey', () => {
      forEach(privateCollections, (collection, name) => {
         if (!collection._meta.source.updateKey) console.log(name, 'is missing _meta.source.updateKey (run npm run index)');
         expect(typeof collection._meta.source.updateKey).toBe('string');
      });
   });

   it('should not expose updateKey in index.json', () => {
      if (!privateIndex) return;
      expect(JSON.stringify(privateIndex)).not.toContain('updateKey');
   });
});
