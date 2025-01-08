import core from './api/index.json' with { type: 'json' };
import community from './api/community/index.json' with { type: 'json' };

function createLink(file, selector) {
   const dir = selector === 'core' ? '' : 'community/';
   const url = `${window.location.origin}/api/${dir}${file}`
   const ul = document.querySelector(`#${selector}-links`);
   const li = document.createElement('li');
   const anchor = document.createElement('a');
   anchor.setAttribute('href', url);
   anchor.innerText = file;
   li.appendChild(anchor);
   ul.appendChild(li);
}

Object.keys(core).forEach(file => createLink(file, 'core'));
Object.keys(community).forEach(file => createLink(file, 'community'));
