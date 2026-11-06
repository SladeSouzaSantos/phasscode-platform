#!/usr/bin/env node
// Static documentation-only wiki check: local Markdown links, pinned manifests,
// generated outputs and expected cross-repository inventory coverage.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';
const root = resolve('docs/wiki');
if (!existsSync(join(root,'README.md'))) throw Error('Missing docs/wiki/README.md');
const docs=[];
function walk(dir){
  for(const item of readdirSync(dir,{withFileTypes:true})){
    if(item.isSymbolicLink()) continue;
    const path=join(dir,item.name);
    if(item.isDirectory())walk(path);
    else if(item.isFile() && item.name.endsWith('.md'))docs.push(path);
  }
}
walk(root);
const broken=[];
let links=0;
for(const file of docs){
  const content=readFileSync(file,'utf8');
  for(const found of content.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)){
    const uri=found[1].trim();
    links++;
    if(/^(?:https?:|mailto:|data:|#)/i.test(uri))continue;
    const path=uri.split('#')[0].split('?')[0];
    if(!path)continue;
    const dest=resolve(dirname(file),decodeURIComponent(path));
    if(!existsSync(dest))broken.push({file:relative(root,file),link:uri});
  }
}
if(broken.length)throw Error('Broken local wiki links: '+JSON.stringify(broken.slice(0,25)));
const expected=[
 'referencia/main/manifesto-simbolos.json','referencia/dev/manifesto-simbolos.json',
 'referencia/main/simbolos-backend.md','referencia/main/simbolos-frontend.md',
 'referencia/dev/simbolos-backend.md','referencia/dev/simbolos-frontend.md',
 'referencia/main/imports-diretos-de-testes.md','referencia/dev/imports-diretos-de-testes.md',
 'referencia/diferencas-dev-main.md'
];
for(const file of expected)if(!existsSync(join(root,file)))throw Error('Missing generated inventory: '+file);
const totals={};
for(const mode of ['main','dev']){
  const manifest=JSON.parse(readFileSync(join(root,'referencia',mode,'manifesto-simbolos.json'),'utf8'));
  if(manifest.schemaVersion!==1||manifest.sources.length!==2)throw Error('Invalid AST manifest schema '+mode);
  if(manifest.sources.some(x=>!/^[0-9a-f]{40}$/.test(x.sha)))throw Error('Unpinned source '+mode);
  const stats=manifest.statistics;
  if(stats.backend.files<100||stats.frontend.files<50||stats.backend.symbols<500||stats.frontend.symbols<150)
    throw Error('Unexpectedly low AST inventory '+mode);
  const names=new Set(manifest.files.map(x=>x.repository+'|'+x.file));
  if(names.size!==manifest.files.length)throw Error('Duplicate inventory file in '+mode);
  totals[mode]=stats;
}
console.log('PHASSCODE_WIKI_VALIDATED '+JSON.stringify({pages:docs.length,links,broken:0,totals}));
