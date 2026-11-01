import { describe, expect, it } from 'vitest';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import {
  completeRecruiterEvidence,
  reconcileDocumentedClaims,
  selectSources,
} from '../apps/orbe-node/src/application/sources.js';

describe('PPKS v1.3: cobertura de vaga Java e privacidade do código de empregadores', () => {
  const vacancy =
    'Sou recrutador para Analista Backend Java Júnior. Exigimos Java/C++ ou C#, POO, algoritmos, MySQL, REST APIs, Spring Boot, formação em computação e inglês para leitura. Quais experiências profissionais e projetos de Pedro comprovam aderência? Diferencie o Java profissional do Spring Boot de estudo e diga lacunas reais.';

  it('retém Java, MySQL profissional, diploma, idioma e projeto de Spring Boot', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const docs = knowledge.search(vacancy);
    expect(docs.map(({ id }) => id)).toEqual([
      'experiencia-sig',
      'experiencia-geowellex',
      'formacao-gestao-ti',
      'idiomas-declarados',
      'webservice-springboot-jpa',
    ]);
  });

  it('corrige a negação indireta de MySQL sem transformar a ausência de C++ em experiência', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const docs = knowledge.search(vacancy);
    const text =
      'Não há evidência de atuação com C++ ou C#, nem de uso de MySQL; o banco relacional comprovado é PostgreSQL.';
    const result = reconcileDocumentedClaims(text, docs);
    expect(result).toContain('Geowellex');
    expect(result).toContain('C++ ou C#');
    expect(result).toContain('PostgreSQL no SIGAA');
    expect(result).not.toContain('nem de uso de MySQL');
  });

  it('completa apenas fatos requisitados e presentes nos documentos efetivamente enviados', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const docs = knowledge.search(vacancy);
    const answer = 'No SIGAA houve atuação corporativa com Java, Hibernate e PostgreSQL.';
    const result = completeRecruiterEvidence(answer, vacancy, docs);
    expect(result).toContain('Geowellex');
    expect(result).toContain('Centro Universitário ETEP');
    expect(result).toContain('inglês básico');
    const sourceIds = selectSources({
      query: vacancy,
      answer: result,
      documents: docs,
    }).map(({ id }) => id);
    expect(sourceIds).toContain('experiencia-sig');
    expect(sourceIds).toContain('experiencia-geowellex');
    expect(sourceIds).toContain('formacao-gestao-ti');
    expect(sourceIds).toContain('idiomas-declarados');
  });

  it('não acrescenta diploma, idioma ou experiência sem registros disponíveis', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const docs = [knowledge.getDocument('experiencia-sig')!];
    const answer = 'Java profissional no SIGAA.';
    expect(completeRecruiterEvidence(answer, vacancy, docs)).toBe(answer);
    expect(reconcileDocumentedClaims('Não há evidência de uso de MySQL.', docs)).toBe(
      'Não há evidência de uso de MySQL.',
    );
  });

  it('nunca transforma o código privado da Geowellex em repositório público', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const geowellex = knowledge.getDocument('experiencia-geowellex')!;
    const answer =
      'Geowellex – sistema de estoque com PHP/MySQL. O código está disponível publicamente no repositório citado acima.';
    const fixed = reconcileDocumentedClaims(answer, [geowellex]);
    expect(fixed).toContain('Não há repositório público desse sistema documentado.');
    expect(fixed).not.toContain('disponível publicamente');
    expect(
      selectSources({ query: 'MySQL profissional', answer: fixed, documents: [geowellex] }),
    ).toEqual([expect.objectContaining({ id: 'experiencia-geowellex' })]);
  });

  it('preserva afirmações corretas sobre códigos públicos de outros projetos', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const geowellex = knowledge.getDocument('experiencia-geowellex')!;
    const answer =
      'PHASSCODE Platform – código está disponível publicamente no repositório GitHub.';
    expect(reconcileDocumentedClaims(answer, [geowellex])).toBe(answer);
  });
});
