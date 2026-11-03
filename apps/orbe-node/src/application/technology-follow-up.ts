import { knowledgePhrase, mentionedTechnologies } from '../knowledge-matching.js';

/**
 * Syntax-only recognition of a short, technical ellipsis. The caller must
 * additionally have eligible recruiter conversation history to use it.
 * Unknown capitalized identifiers (Go, Rust, C#) are allowed as questions,
 * NOT interpreted as evidence of experience.
 *
 * Deliberately reject natural-language phrases, URLs, instructions, and
 * nontechnical continuations such as "E com a receita?".
 */
export function ellipticalTechnology(text: string): string | undefined {
  const clean = text.trim().replace(/[?!.,;:]+$/g, '').trim();
  const match = /^e\s+(?:com\s+)?(.{1,42})$/i.exec(clean);
  if (!match) return undefined;
  const candidate = match[1]!.trim();
  if (!/^[\p{L}\p{N}+#.\-/ ]+$/u.test(candidate)) return undefined;
  if (candidate.split(/\s+/).length > 3) return undefined;
  if (/\b(?:senha|token|segredo|receita|clima|sistema|prompt|instrucoes|passaporte)\b/i.test(knowledgePhrase(candidate)))
    return undefined;
  const knownTechnology = mentionedTechnologies(candidate).size > 0;
  // A capitalized technology-style name may not be part of our fixed
  // scanner (e.g., Go); do not infer expertise merely from the spelling.
  const technicalIdentifier =
    /^(?:[A-Z][a-zA-Z0-9+#.-]{1,32}|[A-Z][a-zA-Z0-9+#.-]{1,22}(?:\s+[A-Z][a-zA-Z0-9+#.-]{1,22}){1,2})$/.test(
      candidate,
    );
  if (!knownTechnology && !technicalIdentifier) return undefined;
  return candidate;
}

/**
 * Reconstructs only the previous *intent*, not previous technology names.
 * This prevents "Java? ... E com Go?" from mixing Java evidence with the
 * requested Go skill. The original visitor turn remains unchanged in storage.
 */
export function rewriteEllipticalTechnologyQuestion(
  previousQuestion: string,
  technology: string,
): string {
  const previous = knowledgePhrase(previousQuestion);
  if (/\b(?:projetos?|repositorios?|codigo fonte|exemplos? de projeto|aplicativos?)\b/.test(previous))
    return `Quais projetos de Pedro utilizam ${technology}?`;
  if (/\b(?:experienc\w*|profission\w*|trabalh\w*|empreg\w*|atuac\w*|atuou|domina|dominio|conhece|conhecimento|sabe)\b/.test(previous))
    return `Pedro tem experiência profissional com ${technology}?`;
  if (/\b(?:cursos?|graduac\w*|formac\w*|pos graduac\w*|certific\w*|estud\w*)\b/.test(previous))
    return `Quais formações ou cursos documentados Pedro possui sobre ${technology}?`;
  return `Quais experiências ou projetos documentados de Pedro demonstram uso de ${technology}?`;
}
