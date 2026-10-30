# EP Laboratório — Caixote, Bandeira e OBV

Laboratório experimental **totalmente independente** para validar padrões e indicadores com candles OHLCV.

## Isolamento

- Não consulta, importa ou altera o `ep-whale-analytics`.
- As centrais e os motores permanecem independentes; a leitura de ciclo é experimental e não envia sinais aos cinco motores nem ao Reversal Gate.
- O módulo de ciclo pode gravar seus snapshots em `public.ep_market_cycle_history`, tabela isolada na Gestão Farmacêutica, por meio da Edge Function autenticada `ep-market-cycle-history`.
- Essa tabela não se relaciona com pacientes, medicamentos, estoque ou dispensações. O histórico local continua disponível no navegador e pode ser exportado em JSON.
- Os demais módulos e históricos do laboratório não são enviados a esse banco.

## Lógica implementada

### OBV verdadeiro
OBV acumulado candle a candle:
- fechamento maior que o anterior: soma o volume;
- fechamento menor: subtrai o volume;
- fechamento igual: mantém o OBV.
Também mede inclinação em 10 candles e divergência simples entre preço e OBV.

### Caixote verdadeiro
Usa janela configurável (padrão 20 candles), suporte e resistência objetivos, amplitude máxima de 8%, no mínimo dois toques em cada extremo e confirmação de rompimento por:
- fechamento além do limite + 0,15 ATR;
- volume atual ≥ 1,20 × média recente.

### Bandeira
Valida impulso mínimo de 6%, consolidação/retração máxima de 50% e rompimento com volume ≥ 1,20 × média.

### Classificação
- `SINAL_COMPRA` / `SINAL_VENDA`: rompimento confirmado, OBV concordante e score ≥ 80.
- `EM_OBSERVACAO`: padrão neutro, caixote dentro do range ou bandeira aguardando rompimento.
- `INCONCLUSIVO`: houve rompimento sem todas as confirmações.
- `DESCARTADO`: estrutura inválida.
Somente classes iniciadas por `SINAL_` entram na contagem de sinais.

## Uso
Abra `index.html`, carregue o exemplo ou importe JSON/CSV com as colunas:
`time, open, high, low, close, volume`.

> Pesquisa experimental. Não constitui recomendação de investimento.

## M6 Paralelo — Estrutura Confirmada v1

Experimento prospectivo isolado, somente de compra. O Motor 6 atual é o controle;
nenhuma regra de seu score, do Motor 5 ou dos motores oficiais foi alterada.
O candidato usa os detectores existentes de Three Rising Valleys e Bull Pennant,
exigindo rompimento, RSI ≥50 e <74, CCI >0, histograma MACD >0, volume ≥1,2×,
OBV subindo em 10 velas e avanço nas últimas 6 velas <5%. Score ≥80 é uma
pontuação experimental, nunca probabilidade. Caixote e futuros não entram nesta versão.

O coletor `automation/scan-live.mjs` reaproveita os candles já solicitados em M5,
M15 e H1, sem novos endpoints, consultas Supabase ou agendamentos. O candidato
recebe 50 pontos de base, 20 por flâmula ou 16 por três vales, 10 por momentum,
4/8/12 por volume ≥1,2/1,5/2×, 8 por OBV e 4 por reteste. Uma condição ausente
limita o score a 79. Detectores são avaliados somente com velas fechadas.

Cada episódio começa no primeiro sinal de uma das versões. Cada versão pode
registrar uma única entrada nas primeiras 24 velas, sempre na abertura seguinte
ao próprio sinal, e recebe 96 velas de acompanhamento. Um novo episódio exige
conclusão do anterior e 3 velas sem sinal das duas versões. Não há ordens reais.
O controle é avaliado apenas no lado comprador; vendas ficam fora do experimento.

Política congelada de simulação: alvo +5%, stop −3%, custo hipotético total 0,20%.
Gaps executam na abertura. Alvo e stop dentro da mesma vela, sem ordem conhecida,
ficam ambíguos e fora da média líquida. Lacunas ficam fora das métricas válidas.
Excursões máxima favorável/adversa e retorno ao final medem todas as 96 velas,
independentemente da saída simulada. Sem taxa de acerto inventada no início.

`data/m6-parallel.json` mantém estados, os 100 episódios concluídos mais recentes
e estatísticas cumulativas separadas por período. Os episódios concluídos são
preservados em `data/m6-parallel-history/YYYY-MM-DD.json`. O botão JSON exporta
o estado e essa amostra recente, com o total cumulativo; o arquivo completo de
episódios concluídos fica no diretório histórico. Reprocessamentos atrasados são
identificados como reconstruídos, sem usar candles futuros para gerar o sinal.
Falhas do paralelo não mudam sinais do controle. A hipótese precisa de validação
prospectiva; M5/M15 ainda não herdam a eficácia dos testes históricos H1.

Validação: `node --test tests/lab-live.test.mjs tests/m6-parallel.test.mjs`.
