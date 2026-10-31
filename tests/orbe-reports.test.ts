import { describe, expect, it } from 'vitest';
import { classifyInteraction } from '../apps/orbe-node/src/application/report-classification.js';
import {
  formatConversationReport,
  formatDailyReport,
} from '../apps/report-node/src/report-format.js';

describe('relatórios anônimos de interação', () => {
  it('produz somente etiquetas permitidas e nunca guarda perguntas completas', () => {
    const visitor = 'Sou recrutadora Java da empresa Exemplo. Meu email pessoal é teste@example.org e preciso falar sobre Spring Boot e a vaga.';
    const result = classifyInteraction(visitor);
    expect(result.intent).toBe('recrutamento');
    expect(result.topics).toContain('java');
    expect(JSON.stringify(result)).not.toContain('teste@example.org');
    expect(JSON.stringify(result)).not.toContain('empresa Exemplo');
  });
  it('distingue intenção de contato de pergunta geral', () => {
    expect(classifyInteraction('Como entrar em contato pelo email?').intent).toBe('contato');
    expect(classifyInteraction('Fale sobre o HSP Simulator com pvlib').topics).toContain('python');
    expect(classifyInteraction('Qual o clima amanhã?').intent).toBe('geral');
  });
  it('formata janela de 24 horas no horário de Fortaleza sem informações pessoais', () => {
    const text = formatConversationReport({
      windowIndex: 0,
      windowStart: new Date('2026-10-31T12:00:00Z'),
      dueAt: new Date('2026-11-01T12:00:00Z'),
      turns: 7,
      topics: ['java', 'ia'],
      projects: ['phasscode-platform'],
      intent: 'recrutamento',
    });
    expect(text).toContain('31/10/2026');
    expect(text).toContain('01/11/2026');
    expect(text).toContain('7');
    expect(text).toContain('recrutamento');
    expect(text).not.toContain('conversation_id');
  });
  it('consolidado diário inclui apenas métricas anônimas', () => {
    const text = formatDailyReport('2026-10-31', 4, 21, 2, ['java', 'ia']);
    expect(text).toContain('4');
    expect(text).toContain('21');
    expect(text).toContain('2026-10-31');
    expect(text).not.toContain('Pedro Santos');
  });
});
