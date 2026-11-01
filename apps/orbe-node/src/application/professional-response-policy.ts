import { knowledgePhrase } from '../knowledge-matching.js';

/**
 * Presentation guidance is authored by the server, never copied from a source
 * or delegated to untrusted README/job text. It changes framing, not facts.
 */
export function professionalResponsePolicy(question: string): string {
  const phrase = knowledgePhrase(question);
  const vacancy = /\b(?:vaga|requisitos?|aderencia|compatibilidade|lacunas?|gap|comparar|compare|contratar|contratacao|perfil para|avaliar candidatura)\b/.test(phrase);
  if (vacancy) {
    return 'APRESENTAÇÃO PARA VAGA: Comece pelas correspondências documentadas e sua origem (emprego, projeto ou curso). Informe com objetividade as lacunas RELEVANTES aos requisitos efetivamente pedidos, inclusive obrigatórios; evidência transferível não substitui experiência direta. Nunca maquie incompatibilidades ou invente percentual. Não liste ausências de tecnologias que não constam da vaga.';
  }
  const directAssessment = /\b(?:fluente|fluencia|avancad[oa]|nivel de|certificad[oa]|domina|sabe|conhece|experiencia com|experiencia em|ja trabalhou com|tem experiencia)\b/.test(phrase);
  if (directAssessment) {
    return 'RESPOSTA DIRETA: Responda à competência ou nível PERGUNTADO primeiro. Se comprovado, afirme e cite as evidências relevantes; não acrescente uma lista de outras lacunas. Se o nível pedido não corresponde ao registro ou a competência não está documentada, diga isso claramente, sem presumir desconhecimento absoluto. Quando útil, cite uma ou duas habilidades transferíveis comprovadas, sem tratá-las como experiência direta nem equiparar linguagens/paradigmas diferentes.';
  }
  return 'APRESENTAÇÃO PROFISSIONAL: Priorize competências demonstradas, realizações, vínculos e projetos relacionados à pergunta, com fontes disponíveis. Evite ressalvas sobre ferramentas, funcionalidades, cursos ou certificações não perguntadas; só mencione limites indispensáveis para não criar uma afirmação falsa. Respostas curtas e úteis, não uma auditoria de ausências.';
}
