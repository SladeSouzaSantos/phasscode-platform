import { describe, expect, it } from 'vitest';
import { openApiDocument } from '../packages/contracts/src/index.js';

type Operation = {
  security?: Array<Record<string, unknown[]>>;
  parameters?: Array<{ in: string; name: string; required?: boolean }>;
};
const paths = openApiDocument.paths as Record<string, Record<string, Operation>>;

describe('contrato de segurança das reuniões', () => {
  it.each(['approve', 'reject', 'cancel'])(
    '%s exige cookie e headers obrigatórios, sem alternativa Bearer',
    (action) => {
      const command = paths[`/api/v1/admin/meetings/{id}/${action}`]!.post!;
      expect(command.security).toEqual([{ sessionCookie: [] }]);
      for (const name of ['Origin', 'X-CSRF-Token']) {
        expect(command.parameters).toContainEqual(
          expect.objectContaining({ in: 'header', name, required: true }),
        );
      }
      // Origin e CSRF são requisitos do servidor, não alternativas de autenticação.
      expect(openApiDocument.components.securitySchemes).toEqual({
        sessionCookie: expect.objectContaining({ type: 'apiKey', in: 'cookie' }),
        accessJwt: expect.objectContaining({ type: 'http', scheme: 'bearer' }),
      });
    },
  );

  it('preserva cookie ou JWT nas leituras protegidas, sem exigir CSRF ou Origin', () => {
    for (const path of ['/api/v1/admin/meetings', '/api/v1/me']) {
      const operation = paths[path]!.get!;
      expect(operation.security).toEqual([{ sessionCookie: [] }, { accessJwt: [] }]);
      expect(operation.parameters ?? []).not.toContainEqual(
        expect.objectContaining({ in: 'header', name: 'X-CSRF-Token', required: true }),
      );
      expect(operation.parameters ?? []).not.toContainEqual(
        expect.objectContaining({ in: 'header', name: 'Origin', required: true }),
      );
    }
  });

  it('preserva operações públicas sem sessão/CSRF e o token privado do status', () => {
    for (const [path, method] of [
      ['/api/v1/meetings/availability', 'get'],
      ['/api/v1/meetings/proposals', 'post'],
      ['/api/v1/meetings/requests', 'post'],
      ['/api/v1/meetings/requests/{id}/status', 'get'],
    ] as const) {
      const operation = paths[path]![method]!;
      expect(operation.security).toBeUndefined();
      expect(operation.parameters ?? []).not.toContainEqual(
        expect.objectContaining({ name: 'X-CSRF-Token' }),
      );
    }
    expect(paths['/api/v1/meetings/requests/{id}/status']!.get!.parameters).toContainEqual(
      expect.objectContaining({ in: 'header', name: 'X-Meeting-Token', required: true }),
    );
  });
});
