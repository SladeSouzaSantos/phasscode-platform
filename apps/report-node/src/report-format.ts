export interface ConversationReportSummary {
  windowIndex: number;
  windowStart: Date;
  dueAt: Date;
  turns: number;
  topics: string[];
  projects: string[];
  intent: string;
}
const timezone = 'America/Fortaleza';
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: timezone,
  dateStyle: 'short',
  timeStyle: 'short',
});
const safeList = (items: string[], max = 8) =>
  items
    .filter((item) => /^[a-z0-9_-]{1,70}$/.test(item))
    .slice(0, max)
    .join(', ') || 'não identificados';

export function formatConversationReport(report: ConversationReportSummary): string {
  return [
    'PHASSCODE · Relatório de interação (opt-in)',
    `Janela: ${dateTime.format(report.windowStart)} até ${dateTime.format(report.dueAt)}`,
    `Período: ${report.windowIndex + 1}º intervalo de 24h`,
    `Perguntas respondidas: ${report.turns}`,
    `Intenção provável: ${report.intent}`,
    `Assuntos: ${safeList(report.topics)}`,
    `Projetos citados: ${safeList(report.projects)}`,
    'Visitante anônimo · Sem transcrição ou dados pessoais.',
  ].join('\n');
}
export function formatDailyReport(
  day: string,
  conversations: number,
  turns: number,
  recruiting: number,
  topics: string[],
): string {
  return [
    'PHASSCODE · Consolidado diário (opt-in)',
    `Dia: ${day} · Fuso: ${timezone}`,
    `Conversas com autorização: ${conversations}`,
    `Perguntas respondidas: ${turns}`,
    `Conversas com possível interesse em recrutamento: ${recruiting}`,
    `Assuntos identificados: ${safeList(topics)}`,
    'Dados agregados. Não inclui visitantes sem autorização.',
  ].join('\n');
}
