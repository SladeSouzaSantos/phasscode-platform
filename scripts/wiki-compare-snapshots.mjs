#!/usr/bin/env node
// Documentation only: compare two AST manifests from pinned public GitHub snapshots.
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const base=resolve('docs/wiki/referencia');
const load=name=>JSON.parse(readFileSync(resolve(base,name,'manifesto-simbolos.json'),'utf8'));
const main=load('main'),dev=load('dev');
if(main.schemaVersion!==1||dev.schemaVersion!==1)throw Error('Unexpected AST schema');
const q=String.fromCharCode(96);
let md='# Diferenças verificadas entre DEV e MAIN — inventário AST\n\n';
md+='Gerado automaticamente a partir de **quatro SHAs GitHub imutáveis**. Compara hashes do conteúdo e símbolos nomeados, não imagens/container em execução. Um arquivo ausente no inventário não implica exclusão da árvore completa: apenas caminhos/linguagens definidos no coletor foram incluídos.\n\n';
const brief=[];
for(const repository of ['backend','frontend']){
 const a=new Map(main.files.filter(x=>x.repository===repository).map(x=>[x.file,x]));
 const b=new Map(dev.files.filter(x=>x.repository===repository).map(x=>[x.file,x]));
 const onlyMain=[...a.keys()].filter(x=>!b.has(x)).sort();
 const onlyDev=[...b.keys()].filter(x=>!a.has(x)).sort();
 const modified=[...a.keys()].filter(x=>b.has(x)&&a.get(x).sha256!==b.get(x).sha256).sort();
 const unchanged=[...a.keys()].filter(x=>b.has(x)&&a.get(x).sha256===b.get(x).sha256);
 const sourceMain=main.sources.find(x=>x.repository===(repository==='backend'?'phasscode-platform':'web-portfolio-v2'));
 const sourceDev=dev.sources.find(x=>x.repository===(repository==='backend'?'phasscode-platform':'web-portfolio-v2'));
 md+='## '+repository+'\n\n';
 md+='- MAIN: '+q+sourceMain.sha+q+'\n- DEV: '+q+sourceDev.sha+q+'\n';
 md+='- Arquivos nos dois snapshots sem alteração: **'+unchanged.length+'**; modificados: **'+modified.length+'**; exclusivos MAIN: **'+onlyMain.length+'**; exclusivos DEV: **'+onlyDev.length+'**.\n\n';
 md+='| Status | Arquivo TypeScript/JavaScript | Diferença de símbolos nomeados |\n| --- | --- | --- |\n';
 for(const file of [...onlyMain.map(x=>({file:x,status:'Só MAIN'})),...onlyDev.map(x=>({file:x,status:'Só DEV'})),...modified.map(x=>({file:x,status:'Modificado'}))].sort((x,y)=>x.file.localeCompare(y.file))){
  const x=a.get(file),y=b.get(file);
  const m=new Set(x?.symbols.map(z=>z.name+' ('+z.kind+')')??[]);
  const d=new Set(y?.symbols.map(z=>z.name+' ('+z.kind+')')??[]);
  const added=[...d].filter(z=>!m.has(z)).length,removed=[...m].filter(z=>!d.has(z)).length;
  md+='| '+file.status+' | '+q+file.file+q+' | +'+added+' / −'+removed+' |\n';
 }
 md+='\n**Cuidado:** +0/−0 não significa arquivo idêntico; corpo, imports, lógica, CSS, dados ou testes podem ter mudado sem renomear símbolos.\n\n';
 brief.push({repository,mainFiles:a.size,devFiles:b.size,unchanged:unchanged.length,modified:modified.length,onlyMain:onlyMain.length,onlyDev:onlyDev.length});
}
md+='## Critérios de interpretação\n\n- HEADs Git são versões **de código**, não o digest de imagem implantada no MiniMac.\n- Esta comparação AST não inclui CSS, SQL, JSON, dados PPKS nem arquivos não fonte; eles exigem revisão separada.\n- Uma divergência DEV/MAIN não é autorização para merge ou deploy.\n- Os catálogos de símbolos e relações de import direto dos testes estão em [MAIN](main/simbolos-backend.md) e [DEV](dev/simbolos-backend.md), mais os índices do frontend nas mesmas pastas.\n';
writeFileSync(resolve(base,'diferencas-dev-main.md'),md,'utf8');
console.log('PHASSCODE_WIKI_DIFF_RESULT '+JSON.stringify(brief));
