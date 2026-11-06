#!/usr/bin/env node
// Documentation-only static inventory. TypeScript AST; no network, credentials or runtime I/O.
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep, dirname } from 'node:path';

function flag(name) {
  const pos = process.argv.indexOf(name);
  const value = process.argv[pos + 1];
  if (pos < 0 || !value || value.startsWith('--')) throw Error('Missing argument: ' + name);
  return value;
}
const backendRoot = resolve(flag('--backend'));
const frontendRoot = resolve(flag('--frontend'));
const outputRoot = resolve(flag('--out'));
const backendSha = flag('--backend-sha');
const frontendSha = flag('--frontend-sha');
const SHA = /^[0-9a-f]{40}$/;
if (!SHA.test(backendSha) || !SHA.test(frontendSha)) throw Error('Full pinned source SHAs required');
if (backendRoot === frontendRoot) throw Error('Distinct roots required');
if (!existsSync(join(backendRoot, 'apps/orbe-node/src/application/chat.ts')) ||
    !existsSync(join(frontendRoot, 'src/App.tsx'))) throw Error('Missing source repo');
if (!outputRoot.startsWith(resolve(backendRoot, 'docs/wiki/referencia') + sep) &&
    outputRoot !== resolve(backendRoot, 'docs/wiki/referencia')) throw Error('Unsafe output directory');
const back = { key:'backend', repo:'phasscode-platform', root:backendRoot, rev:backendSha, scopes:['apps','packages','scripts','tests','evaluation'] };
const front = { key:'frontend', repo:'web-portfolio-v2', root:frontendRoot, rev:frontendSha, scopes:['src','scripts','tests'] };
const repos = [back, front];
const excluded = new Set(['.git','node_modules','dist','build','coverage','test-results','playwright-report','_wiki_frontend']);
const suffixes = new Set(['.ts','.tsx','.mts','.cts','.js','.jsx','.mjs','.cjs']);
const q = String.fromCharCode(96);
const safe = str => String(str).replaceAll('|','/').replace(/[\r\n]+/g,' ').trim().slice(0,200);
const qualify = (repo,file,line) => 'https://github.com/SladeSouzaSantos/' + repo.repo + '/blob/' + repo.rev + '/' + file + (line ? '#L' + line : '');
function enumerate(repo) {
  const files = [];
  function scan(directory) {
    for(const ent of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const full = join(directory,ent.name);
      if(ent.isSymbolicLink()) continue;
      if(ent.isDirectory()) {
        if(!excluded.has(ent.name)) scan(full);
      } else if(ent.isFile() && suffixes.has(extname(ent.name)) && !ent.name.endsWith('.d.ts')) {
        files.push(relative(repo.root,full).split(sep).join('/'));
      }
    }
  }
  for(const root of repo.scopes) if(existsSync(join(repo.root,root)))scan(join(repo.root,root));
  return files.sort();
}
function parse(repo, file) {
  const sourceText = readFileSync(join(repo.root,file),'utf8');
  const source = ts.createSourceFile(file,sourceText,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  if(source.parseDiagnostics.length)throw Error('TypeScript syntax diagnostics at '+repo.key+':'+file);
  const symbols=[], imports=[];
  const line = node => source.getLineAndCharacterOfPosition(node.getStart(source)).line+1;
  const exported = node => Boolean(node.modifiers?.some(x=>x.kind===ts.SyntaxKind.ExportKeyword || x.kind===ts.SyntaxKind.DefaultKeyword));
  const append = (node,kind,name,parent=[],isExport=exported(node)) => {
    if(!name)return;
    symbols.push({name:[...parent,name].join('.'),kind,line:line(node),exported:Boolean(isExport)});
  };
  for(const node of source.statements){
    if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))
      imports.push(node.moduleSpecifier.text);
  }
  function visit(node,context=[]) {
    if(ts.isClassDeclaration(node)||ts.isClassExpression(node)){
      const name=node.name?.text||'default-class';
      append(node,'class',name,context);
      for(const member of node.members)visit(member,[...context,name]);return;
    }
    if(ts.isInterfaceDeclaration(node)){append(node,'interface',node.name.text,context);return;}
    if(ts.isTypeAliasDeclaration(node)){append(node,'type',node.name.text,context);return;}
    if(ts.isEnumDeclaration(node)){append(node,'enum',node.name.text,context);return;}
    if(ts.isFunctionDeclaration(node)){append(node,'function',node.name?.text||'default-function',context);return;}
    if(ts.isMethodDeclaration(node)||ts.isGetAccessor(node)||ts.isSetAccessor(node)){
      append(node,'method',node.name?.getText(source),context);return;
    }
    if(ts.isConstructorDeclaration(node)){append(node,'constructor','constructor',context);return;}
    if(ts.isPropertyDeclaration(node)&&node.initializer&&(ts.isArrowFunction(node.initializer)||ts.isFunctionExpression(node.initializer))){
      append(node,'property-function',node.name?.getText(source),context);return;
    }
    if(ts.isVariableStatement(node)){
      for(const dec of node.declarationList.declarations){
        if(!ts.isIdentifier(dec.name))continue;
        const init=dec.initializer;
        const callable=init&&(ts.isArrowFunction(init)||ts.isFunctionExpression(init));
        if(callable||exported(node))append(dec,callable?'arrow-function':'exported-variable',dec.name.text,context,exported(node));
      }
      return;
    }
    if(ts.isModuleDeclaration(node)){
      const name=node.name?.text;
      append(node,'namespace',name,context);
      if(node.body)visit(node.body,[...context,name]);return;
    }
    if(ts.isModuleBlock(node))for(const child of node.statements)visit(child,context);
  }
  for(const stmt of source.statements)visit(stmt);
  return {file,sha256:createHash('sha256').update(sourceText).digest('hex'),symbols,imports:[...new Set(imports)].sort()};
}
const manifest = {schemaVersion:1,method:'TypeScript Compiler API (AST, named declarations)',sources:repos.map(x=>({repository:x.repo,sha:x.rev})),files:[],statistics:{}};
for(const repo of repos){
  const items=enumerate(repo).map(file=>parse(repo,file));
  manifest.files.push(...items.map(entry=>({repository:repo.key,...entry})));
  manifest.statistics[repo.key]={files:items.length,symbols:items.reduce((v,x)=>v+x.symbols.length,0)};
}
mkdirSync(outputRoot,{recursive:true});
const write=(name,value)=>writeFileSync(join(outputRoot,name),value.endsWith('\n')?value:value+'\n','utf8');
for(const repo of repos){
  const items=manifest.files.filter(x=>x.repository===repo.key);
  let out='# Inventário AST de símbolos — '+repo.key+'\n\n';
  out+='**Fonte fixada:** '+q+repo.repo+'@'+repo.rev+q+'. **Método:** compilador TypeScript, coleta de classes, métodos, funções nomeadas, arrow functions declaradas, tipos, interfaces, enums e variáveis exportadas. Inclui arquivos de testes; não resolve chamadas dinâmicas nem callbacks anônimos.\n\n';
  out+='**Total:** '+items.length+' arquivos TypeScript/JavaScript, '+manifest.statistics[repo.key].symbols+' declarações identificadas.\n\n';
  for(const item of items){
    out+='## ['+item.file+']('+qualify(repo,item.file)+')\n\n';
    out+='SHA-256: '+q+item.sha256+q+' · Imports e reexports declarados: '+item.imports.length+'.\n\n';
    if(!item.symbols.length){out+='*Nenhum símbolo das categorias enumeradas.*\n\n';continue;}
    out+='| Linha | Nome | Tipo | Exportado |\n| ---: | --- | --- | --- |\n';
    for(const sym of item.symbols)out+='| [L'+sym.line+']('+qualify(repo,item.file,sym.line)+') | '+q+safe(sym.name)+q+' | '+sym.kind+' | '+(sym.exported?'Sim':'Não')+' |\n';
    out+='\n';
  }
  write('simbolos-'+repo.key+'.md',out);
}
write('manifesto-simbolos.json',JSON.stringify(manifest,null,2));

// Real import relations; this is an import map, NOT a line/branch coverage result.
let coverage='# Relações diretas entre testes e módulos (AST)\n\n';
coverage+='Esta página usa apenas imports estáticos explícitos dos arquivos de teste. Um import **não prova execução nem cobertura de uma assertion**; testes de integração podem exercitar módulos indiretamente e aparecer como sem vínculo.\n\n';
function importedTargets(repo, tester) {
  const base=dirname(tester.file);
  return tester.imports.filter(x=>x.startsWith('.')).map(x=>{
    const normalized=join(base,x).split(sep).join('/').replace(/\.(?:js|mjs|cjs)$/,'');
    return normalized;
  });
}
for(const repo of repos){
  const items=manifest.files.filter(x=>x.repository===repo.key);
  const tests=items.filter(x=>x.file.startsWith('tests/')&&/(\.test\.|\.spec\.)/.test(x.file));
  const code=items.filter(x=>!x.file.startsWith('tests/')&&x.symbols.length);
  coverage+='## '+repo.key+' — '+code.length+' módulos com símbolos, '+tests.length+' arquivos de teste\n\n';
  coverage+='| Arquivo | Testes que o importam diretamente (máx. 12) |\n| --- | --- |\n';
  let direct=0;
  for(const src of code){
    const stem=src.file.replace(/\.[cm]?[jt]sx?$/,'');
    const matches=tests.filter(t=>importedTargets(repo,t).includes(stem)).slice(0,12);
    if(matches.length)direct++;
    coverage+='| ['+src.file+']('+qualify(repo,src.file)+') | '+(matches.length?matches.map(t=>'['+t.file.split('/').at(-1)+']('+qualify(repo,t.file)+')').join(', '):'—')+' |\n';
  }
  coverage+='\n**Imports diretos de testes encontrados:** '+direct+'/'+code.length+' módulos. A falta de import direto **não indica ausência de teste indireto**.\n\n';
}
write('imports-diretos-de-testes.md',coverage);
write('resumo-ast.json',JSON.stringify({schemaVersion:1,sources:manifest.sources,statistics:manifest.statistics},null,2));
console.log('PHASSCODE_WIKI_AST_RESULT '+JSON.stringify(manifest.statistics));
