/**
 * LAB-ONLY: seven explicitly allowlisted PUBLIC PPKS repository records.
 * Never uses projectPpksEvidenceGraph(), which includes private academics.
 * Select the first two declared skills from each record to reproduce the
 * public Gate 3 scope, and apply Orbe's source-specific verification rules.
 */
import { readFile } from 'node:fs/promises';
import {
  evidenceGraphSnapshotSchema,
  type EvidenceGraphSnapshot,
  type EvidenceClaim,
  type EvidenceSource,
  type VacancyRequirement,
} from '../apps/orbe-node/src/domain/evidence-graph.js';

const PUBLIC_RECORDS = [
  'experiencia-greencity',
  'experiencia-sig',
  'greencity-os',
  'hsp-simulator',
  'phasscode-platform',
  'web-portfolio-v2',
  'webservice-springboot-jpa',
] as const;
type PublicRecord = {
  id: string;
  kind: 'project'|'experience';
  identity?: {name:string,nature:string,visibility:string};
  organization?:string;role?:string;start?:string;end?:string|null;
  areas?: string[];
  stack: Array<{name:string,evidenceIds:string[]}>;
  evidence: Array<{id:string,type:string,url:string|null}>;
  sync: {verificationStatus:string,sourceCommit:string|null,
    lastModifiedAt:string|null,reviewedAt:string|null};
};
function safe(condition:unknown,code:string):asserts condition {
  if(!condition) throw new Error(code);
}
function slug(name:string):string {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
function sourceFor(record:PublicRecord,evidence:{id:string,type:string,url:string|null}):EvidenceSource {
  const code=record.sync.verificationStatus==='code_reviewed' &&
    ['source_code','test','documentation'].includes(evidence.type);
  return {
    kind:'source',
    id:'source-'+record.id+'-'+evidence.id,
    label:record.id+': '+evidence.id,
    origin:code?'github':'ppks_catalog',
    visibility:'public',
    verificationStatus:code?'code_reviewed':'catalog_only',
    ...(evidence.url?{sourceUrl:evidence.url}:{}),
    ...(code&&record.sync.sourceCommit?{sourceCommit:record.sync.sourceCommit}:{}),
    ...(code&&record.sync.lastModifiedAt?{lastModified:record.sync.lastModifiedAt}:{}),
    ...(code&&record.sync.reviewedAt?{verifiedAt:record.sync.reviewedAt}:{}),
  };
}
export async function loadGate12PublicPpksFixture() {
  const nodes:EvidenceGraphSnapshot['nodes'][number][]=[
    {kind:'candidate',id:'candidate',label:'Public PPKS candidate'},
  ];
  const relations:EvidenceGraphSnapshot['relations'][number][]=[];
  const skills=new Map<string,string>();
  const companies=new Set<string>();
  const claims:EvidenceClaim[]=[];
  const sourcesById=new Map<string,EvidenceSource>();
  for(const id of PUBLIC_RECORDS) {
    const directory=id.startsWith('experiencia-')?'experiences':'projects';
    const path='knowledge/ppks/'+directory+'/'+id+'.json';
    const data=JSON.parse(await readFile(path,'utf8')) as PublicRecord;
    safe(data.id===id && data.kind===(directory==='experiences'?'experience':'project')
      && Array.isArray(data.stack) && data.stack.length>=2 &&
      Array.isArray(data.evidence) && data.evidence.length>0,
      'GATE12_PUBLIC_RECORD_DRIFT');
    if(data.kind==='project') {
      safe(data.identity?.visibility==='public' && typeof data.identity.name==='string',
        'GATE12_NONPUBLIC_PROJECT');
      const category: 'professional'|'personal'|'study'|'unknown'=(
        data.identity.nature==='professional' ||
        data.identity.nature==='personal' ||
        data.identity.nature==='study'
      )?data.identity.nature:'unknown';
      nodes.push({kind:'project',id,label:data.identity.name,category});
    } else {
      safe(typeof data.organization==='string' &&
        typeof data.role==='string' &&
        typeof data.start==='string' &&
        data.areas?.includes('software-development'),
        'GATE12_PRIVATE_OR_INVALID_EXPERIENCE');
      const companyId='company-'+slug(data.organization);
      if(!companies.has(companyId)){
        companies.add(companyId);
        nodes.push({kind:'company',id:companyId,label:data.organization});
      }
      nodes.push({
        kind:'engagement',id,label:data.role,candidateId:'candidate',
        companyId,type:/estagi[aá]ri/i.test(data.role)?'intern':'not_documented',
        softwareWorkScope:data.areas.includes('engineering')?'mixed':'exclusive',
        areas:data.areas as ('software-development'|'engineering')[],
        startedAt:data.start,
        ...(data.end?{endedAt:data.end}:{}),
      });
    }
    const used=new Map<string,typeof data.evidence[number]>();
    for(const stack of data.stack.slice(0,2)){
      safe(typeof stack.name==='string' &&
        Array.isArray(stack.evidenceIds) &&
        stack.evidenceIds.length>0 &&
        new Set(stack.evidenceIds).size===stack.evidenceIds.length,
        'GATE12_CLAIM_WITHOUT_EVIDENCE');
      const skillId='skill-'+slug(stack.name);
      const prior=skills.get(skillId);
      safe(!prior || prior===stack.name,'GATE12_SKILL_COLLISION');
      skills.set(skillId,stack.name);
      const sourceIds:string[]=[];
      for(const evidenceId of stack.evidenceIds) {
        const evidence=data.evidence.find(e=>e.id===evidenceId);
        safe(evidence!==undefined,'GATE12_UNKNOWN_EVIDENCE_REF');
        used.set(evidence.id,evidence);
        const src=sourceFor(data,evidence);
        sourcesById.set(src.id,src);
        sourceIds.push(src.id);
      }
      const nature=data.identity?.nature;
      const scope: EvidenceClaim['scope']=data.kind==='experience'
        ? (data.areas!.includes('engineering')?'mixed_role':'professional')
        : (nature==='professional'?'professional_project'
        :nature==='personal'?'personal_project'
        :nature==='study'?'study':'unknown');
      const claim:EvidenceClaim={
        kind:'claim',
        id:'claim-'+id+'-'+skillId,label:id+': '+stack.name,
        subjectId:id,predicate:'USES_TECHNOLOGY',
        objectId:skillId,scope,sourceIds,
      };
      claims.push(claim);
      nodes.push(claim);
      relations.push({
        from:id,to:skillId,type:'USES_TECHNOLOGY',sourceIds,
      });
      for(const sourceId of sourceIds) {
        relations.push({
          from:claim.id,to:sourceId,type:'SUPPORTED_BY',sourceIds:[sourceId],
        });
      }
    }
  }
  for(const [id,label] of skills) nodes.push({kind:'skill',id,label});
  for(const source of sourcesById.values())nodes.push(source);
  const snapshot=evidenceGraphSnapshotSchema.parse({schemaVersion:'1.0',nodes,relations});
  const requirements:VacancyRequirement[]=[
    ...[...skills.values()].sort().map((label,i)=>({
      kind:'vacancy_requirement' as const,id:'req-public-'+i,label,mandatory:true,
    })),
    {kind:'vacancy_requirement',id:'req-public-go',label:'Go',mandatory:false},
  ];
  safe(PUBLIC_RECORDS.length===7 && claims.length===14 &&
    skills.size===10 && sourcesById.size===16 &&
    relations.length===46,
    'GATE12_PUBLIC_FIXTURE_DRIFT');
  return {
    snapshot,
    requirements,
    claims,
    sources:[...sourcesById.values()],
    metadata:{
      sample:'seven_explicit_public_ppks_records_two_skills_each',
      recordCount:PUBLIC_RECORDS.length,skillCount:skills.size,
      claimCount:claims.length,sourceCount:sourcesById.size,
      graphNodes:snapshot.nodes.length,graphRelations:snapshot.relations.length,
      privateAcademicRecordsLoaded:false,
    },
  };
}
