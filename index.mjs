import core from './api/index.json' with { type: 'json' };
import community from './api/community/index.json' with { type: 'json' };

function getAuthors(entry) {
   if (!entry || !Array.isArray(entry.authors) || entry.authors.length === 0) {
      return 'N/A';
   }
   return entry.authors.join(', ');
}

function addRow(file, selector, data) {
   const dir = selector === 'core' ? '' : 'community/';
   const entry = data[file] || {};
   const url = `${window.location.origin}/api/${dir}${file}`;
   const tbody = document.querySelector(`#${selector}-tbody`);
   if (!tbody) return;

   const tr = document.createElement('tr');

   const nameCell = document.createElement('td');
   const nameLink = document.createElement('a');
   nameLink.href = url;
   nameLink.textContent = entry.full || file;
   nameCell.appendChild(nameLink);

   const versionCell = document.createElement('td');
   versionCell.textContent = entry.version || 'N/A';

   const authorsCell = document.createElement('td');
   authorsCell.textContent = getAuthors(entry);

   tr.appendChild(nameCell);
   tr.appendChild(versionCell);
   tr.appendChild(authorsCell);
   tbody.appendChild(tr);
}

Object.keys(core).forEach(file => addRow(file, 'core', core));
Object.keys(community).forEach(file => addRow(file, 'community', community));
