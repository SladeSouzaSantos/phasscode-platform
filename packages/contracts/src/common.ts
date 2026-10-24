import { z } from 'zod';

export const errorResponseSchema = z.strictObject({
  error: z.strictObject({ code: z.string(), message: z.string(), correlationId: z.string() }),
});
export const json = (value: z.ZodType) => ({
  'application/json': { schema: z.toJSONSchema(value, { target: 'draft-2020-12' }) },
});
export const standardErrors = Object.fromEntries(
  [400, 401, 403, 404, 409, 413, 415, 429, 500, 502, 503, 504].map((status) => [
    status,
    {
      description: 'Erro padronizado; nenhuma mensagem ou credencial interna.',
      content: json(errorResponseSchema),
    },
  ]),
);
