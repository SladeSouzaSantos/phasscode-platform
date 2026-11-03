import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { matrixSchema } from '../evaluation/schema.js';

const load = async (path: string) => matrixSchema.parse(JSON.parse(await readFile(path, 'utf8')));

describe('F3.4 new natural-language recruiter evaluation matrix', () => {
  it('has 13 diverse bounded cases, including 2/3-turn follow-ups', async () => {
    const matrix = await load('evaluation/orbe-natural-language-v1.json');
    expect(matrix.cases).toHaveLength(13);
    expect(new Set(matrix.cases.map((scenario) => scenario.id)).size).toBe(13);
    expect(matrix.cases.reduce((count, scenario) => count + scenario.turns.length, 0)).toBe(23);
    expect(matrix.cases.some((scenario) => scenario.turns.length === 3)).toBe(true);
    expect(matrix.cases.filter((scenario) => scenario.turns.length === 2).length).toBeGreaterThan(
      6,
    );
    for (const scenario of matrix.cases) {
      expect(scenario.humanReview.length).toBeGreaterThan(0);
      for (const turn of scenario.turns) {
        expect(turn.message.length).toBeLessThanOrEqual(2000);
        expect(turn.expect.sourcePolicy).toMatch(/^(required|optional|none)$/);
      }
    }
  });

  it('includes the two live-reproduced regressions and does not repeat previous technology in follow-ups', async () => {
    const matrix = await load('evaluation/orbe-natural-language-v1.json');
    const map = new Map(matrix.cases.map((item) => [item.id, item]));
    expect(map.get('natural-pedro-programa')?.turns[0]?.message).toBe('Pedro programa?');
    expect(map.get('contexto-java-go')?.turns.map((item) => item.message)).toEqual([
      'Pedro tem experiência profissional com Java?',
      'E com Go?',
    ]);
    expect(map.get('contexto-pergunta-react-completa')?.turns[1]?.message).toBe(
      'E quais projetos React?',
    );
    expect(map.get('contexto-tres-turnos')?.turns.map((item) => item.message)).toEqual([
      'Pedro tem experiência profissional com Java?',
      'E com Go?',
      'E com Flutter?',
    ]);
    for (const scenario of matrix.cases.filter((item) => item.category === 'continuity')) {
      expect(scenario.turns.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps original user-supplied six-vacancy + three-academic baseline intact', async () => {
    const original = await load('evaluation/vacancies-ppks-v12.json');
    expect(original.cases).toHaveLength(9);
    expect(original.cases.reduce((count, item) => count + item.turns.length, 0)).toBe(9);
    const expanded = await load('evaluation/orbe-natural-language-v1.json');
    expect(expanded.cases.some((item) => item.id === original.cases[0]?.id)).toBe(false);
  });

  it('rejects spurious claims of a completed degree and preserves explicit source checks', async () => {
    const matrix = await load('evaluation/orbe-natural-language-v1.json');
    const academic = matrix.cases.find((item) => item.id === 'contexto-academico');
    expect(academic?.humanReview.join(' ')).toMatch(/pendente|concluída/i);
    const scope = matrix.cases.find((item) => item.id === 'fora-escopo-continuidade');
    expect(scope?.turns[1]?.expect.sourcePolicy).toBe('none');
    const requirements = matrix.cases.find((item) => item.id === 'matriz-requisitos-completa');
    expect(requirements?.humanReview.join(' ')).toContain('29 itens');
  });
});
