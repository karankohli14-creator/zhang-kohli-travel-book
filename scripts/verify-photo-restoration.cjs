/* Run: node scripts/verify-photo-restoration.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/recovered/manifest.json')));
const elements = new Map();
function element() { return {style:{setProperty(k,v){this[k]=v;}},children:[],textContent:'',innerHTML:'',src:'',value:'2000',append(child){this.children.push(child);},replaceChildren(){this.children=[];},addEventListener(){}}; }
const context = vm.createContext({document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element},window:{addEventListener(){}},location:{href:'https://example.test/'},URL,Image:class {},setTimeout(){return 1;},clearTimeout(){}});
vm.runInContext(fs.readFileSync(path.join(root,'photo-restoration.js'),'utf8'),context);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
vm.runInContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n'),context);
assert.equal(vm.runInContext('total',context),98);
let photoCount=0;
for(let n=1;n<=98;n++){
 vm.runInContext(`page=${n-1};render();`,context);
 assert.equal(elements.get('status').textContent,`Page ${n} / 98`);
 const photos=manifest.photos.filter(p=>p.page===n);
 const children=elements.get('photoRestoration').children;
 assert.equal(children.length,photos.length,`page ${n}`);
 for(let i=0;i<photos.length;i++){
  const photo=photos[i],img=children[i];assert.equal(img.src,photo.src);
  const bytes=fs.readFileSync(path.join(root,photo.src));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),photo.sha256);
  const [x,y,w,h]=photo.frame;assert.ok(x>=0&&y>=0&&x+w<=720&&y+h<=960);photoCount++;
 }
 const position=vm.runInContext('locate(page)',context);assert.ok(position.offset>=0&&position.offset<position.count);
}
vm.runInContext('page=97;go(1);',context);assert.equal(elements.get('status').textContent,'Page 1 / 98');
vm.runInContext('go(-1);',context);assert.equal(elements.get('status').textContent,'Page 98 / 98');
for(const [id,n] of [['sierra',1],['boston',41],['forestville',83]]){elements.get(id).onclick();assert.equal(elements.get('status').textContent,`Page ${n} / 98`);}
assert.match(html,/\.restored-photo\{[^}]*object-fit:contain/);
console.log(`PASS: 98 pages, ${photoCount} full-photo placements, source hashes, frame bounds, clearing, wraparound and trip navigation.`);
