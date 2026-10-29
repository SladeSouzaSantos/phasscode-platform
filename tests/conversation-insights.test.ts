import { describe, expect, it } from 'vitest';
import { summarizeConversation } from '../apps/orbe-node/src/application/insights.js';

describe('Orbe: classificação privada de interesses', () => {
  it('classifica reunião e preserva assuntos, sem guardar texto livre', () => {
    const result = summarizeConversation([], 'Quero agendar uma reunião para falar dos projetos React');
    expect(result.intent).toBe('meeting');
    expect(result.topics).toContain('Agendamento');
    expect(result.topics).toContain('Projetos');
    expect(result.topics).toContain('Tecnologias');
    expect(result.summary).not.toContain('Quero agendar');
  });
  it('considera perguntas anteriores como parte da mesma conversa', () => {
    const result = summarizeConversation([
      { role: 'user', content: 'Você tem experiência com Flutter?' },
      { role: 'assistant', content: 'Sim.' },
    ], 'Há uma vaga para desenvolvedor?');
    expect(result.intent).toBe('opportunity');
    expect(result.topics).toContain('Tecnologias');
    expect(result.topics).toContain('Oportunidades');
  });
  it('não reproduz emails, telefones ou dados pessoais injetados', () => {
    const privateInput = 'Meu email é contato-privado@exemplo.com, telefone 11988887777; quero uma entrevista';
    const result = summarizeConversation([], privateInput);
    expect(result.intent).toBe('opportunity');
    expect(JSON.stringify(result)).not.toContain('contato-privado');
    expect(JSON.stringify(result)).not.toContain('11988887777');
  });
  it('não inventa intenção em mensagem vaga', () => {
    const result = summarizeConversation([], 'Oi!');
    expect(result.intent).toBe('unknown');
    expect(result.summary).toContain('não identificada');
  });
});
