# EP Laboratório — Caixote, Bandeira e OBV

Laboratório experimental **totalmente independente** para validar padrões e indicadores com candles OHLCV.

## Isolamento

- Não consulta, importa ou altera o `ep-whale-analytics`.
- Não usa Supabase, Railway, banco remoto, Reversal Gate ou os cinco motores oficiais.
- Não possui ligação com a Gestão Farmacêutica.
- Funciona como site estático gratuito; arquivos importados e histórico ficam somente no navegador.

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
