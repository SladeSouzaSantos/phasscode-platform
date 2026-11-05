> **Resultado final do experimento e decisão (04/11/2026):** a comparação real foi concluída em [#41952853665](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/41952853665): Laya 15/47 papéis, 18/47 relações, 7/47 pares corretos brutos, 47/47 abstenções e **14 falsas promoções positivas nas saídas brutas**; consumo ~2,25 GiB e p95 ~505 ms no runner. **Laya não será integrada** nesta fase. Ver o [ADR SemanticPlanner sem Laya](semantic-planner-no-laya-f37.md). Os marcos de preparação abaixo permanecem para auditoria histórica.

# F3.7/#41/#43/#45 — Comparação tipada offline com corpus congelado

**Estado:** diagnóstico **offline**, branch dev, não integrado à API/GraphRAG/PPKS nem ao runtime Laya. Nenhum modelo foi baixado ou executado nesta entrega. Não é autorização para shadow/active.

## Desenho

- `evaluation/semantic-typed-holdout-v1.json`: 32 cenários sintéticos PT/EN, **47 spans** com offsets literais e rótulos provisórios, elaborados antes da primeira execução do novo avaliador de regras. Inclui alternativas, negações, atribuição de projetos, stack existente, stack futura, contexto acadêmico e requisitos mistos.
- `evaluation/semantic-typed-holdout-v1.manifest.json`: SHA-256 imutável do arquivo, contagens, estado de revisão e política experimental. O avaliador rejeita alterações do fixture sem atualização **explícita** do manifesto.
- `scripts/compare_semantic_typed_lab.py`: avalia regras de `scripts/semantic_typed_rules_lab.py` no corpus congelado. Opcionalmente aceita **um relatório novo da Laya sobre os MESMOS 47 spans**, com mesmo checksum e mesmas anotações. Relatórios de amostras, modelos ou datasets diferentes são rejeitados.
- `evaluation/semantic-typed-holdout-v1-baseline.json`: captura inicial **antes de qualquer ajuste motivado por seus erros**, com apenas IDs e métricas, nunca texto completo da vaga. A Laya está marcada como `not_executed_on_this_cohort`.
- `tests/test_compare_semantic_typed_lab.py`: cobertura de integridade, denominador, reprodutibilidade, riscos, rejeição de relatórios incompatíveis e proteção contra vazamento de texto.

**Limitação fundamental:** embora congelado antes da primeira avaliação das regras, este conjunto não é independente de todos os conhecimentos de quem o escreveu, nem foi revisado por humanos. Portanto não autoriza estimar desempenho real, nem conta como gold set homologado de #41. As regras anteriores foram examinadas durante a preparação; evitamos ajustá-las com base neste resultado inicial. Novas melhorias demandam outra coorte de validação.

## Diagnóstico inicial: regras sobre 47 spans

| Medida                                                 |          Valor |
| ------------------------------------------------------ | -------------: |
| Spans avaliados (PT/EN)                                |             47 |
| Resolvidos                                             |             21 |
| Abstidos                                               |             26 |
| Cobertura seletiva                                     |         44,68% |
| Acerto conjunto role+relation entre resolvidos         | 17/21 = 80,95% |
| Recall efetivo no conjunto, considerando abstenções    | 17/47 = 36,17% |
| Erros conjuntos entre resolvidos                       |              4 |
| Promoções positivas indevidas de requisito             |          **3** |
| Promoções positivas quando a referência indica negação |          **2** |

**Erro grave:** o gate ainda é inseguro para responder sobre vagas. Em exemplos de negação e insuficiência, uma tecnologia foi tratada como obrigatória. O sistema público permaneceu inalterado. A métrica é calculada **condicionalmente a spans pré-definidos**; não mede extração da vaga inteira. A regra de abstinência não pode ser contabilizada como predição correta.

## Correção conservadora pós-diagnóstico (não cega)

Após registrar o baseline inicial, corrigimos três modalidades inseguras em [c39c4cc](https://github.com/SladeSouzaSantos/phasscode-platform/commit/c39c4cc7f1ef8ebf2c31cace7af27ace315df456): (a) "não é obrigatório", (b) "no prior experience ... is required" e (c) ressalva negativa no fim da mesma frase. Com sinais mistos ou escopo da negação não resolvido, o gate agora se abstém. Testes adversariais separados cobrem essas regras.

Na **reavaliação pós-ajuste do mesmo corpus já conhecido**: **21/47 resolvidos**, **26/47 abstenções**, **21/21 acertos conjuntos entre decididos e zero falsas promoções**. Isso é uma melhoria de segurança **in-sample**, obtida após examinar os erros e portanto **NÃO** constitui prova de generalização, validação cega ou aptidão para produção. O relatório inicial de 3 falsas promoções permanece preservado e nunca deve ser sobrescrito. É necessário um novo conjunto de validação independente.

## Comparação honesta com Laya

O histórico de Laya **2/16 role** e **7/16 relation** é de um outro subconjunto e outra métrica; não devemos apresentá-lo como comparação pareada com os 47 casos. O comparador só aceita um novo relatório com:

- `fixtureSha256` igual ao SHA-256 do corpus congelado;
- os mesmos 47 IDs, nenhuma duplicidade, nenhum span faltante;
- rótulos de referência idênticos e previsões válidas;
- `diagnosticAbstention` booleano, não probabilidades tratadas como verdade;
- status de experimento e revisão de modelo pinados.

O laboratório Laya ganha somente o campo de rastreabilidade `fixtureSha256` no relatório de benchmark, sem modificar prompts, pesos, confiança ou execução. Repetir o laboratório **apenas em runner descartável** (não no Mac Mini), com modelos verificados e contêiner de inferência `--network none --read-only`, usando `--fixture evaluation/semantic-typed-holdout-v1.json --max-spans 47` e guardando o JSON de saída. Depois:

```bash
python3 scripts/compare_semantic_typed_lab.py
python3 scripts/compare_semantic_typed_lab.py --laya-report /path/to/laya-report.json
python3 -m unittest discover -s tests -p test_compare_semantic_typed_lab.py -v
```

Se a Laya obtiver melhores resultados em classificações específicas, isso **não** prova calibração nem aptidão para integrar a API. O próximo gate é construir coorte realmente independente, revisar manualmente o gabarito e medir p95/RAM no hardware relevante antes de decidir sobre #44.

## Controle de alterações

A baseline inicial deve permanecer auditável. Mudanças no classificador, manifesto, coorte ou questionário exigem revisão de versões e novas comparações; **não sobrescrever números históricos nem treinar/ajustar sobre o mesmo conjunto alegando generalização**. O workflow focado é somente de testes de biblioteca padrão, sem modelos, banco ou chamadas externas.
