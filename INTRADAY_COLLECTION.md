# Histórico M15 e M5 — 8/11/2026

M15 passa a ser transportado para TiDB para todos os ativos disponíveis do universo de 50 moedas. M5 é selecionado nas janelas das estratégias de qualidade TRV_CONFIRMED, BULL_FLAG_BREAKOUT e MIN30_FLOW em acompanhamento, excluindo controles BASELINE. São experimentos em observação, sem envio de ordens. Os detectores H1 e seus resultados não são alterados.

O coletor reaproveita os mesmos candles fechados usados na leitura M5/M15/H1; não abre uma segunda coleta. A primeira captura aproveita a janela disponível na resposta existente, sem prometer histórico M5 desde o nascimento de sinais antigos. Lacunas além da janela de recuperação continuam explícitas. Bloqueios de fonte, atrasos de Actions e TON indisponível continuam possíveis. Agendamentos e Supabase não foram alterados.

Uma fila GitHub de transporte guarda os candles recentes, com retenção local de 48 horas para os já confirmados. Candles não confirmados são preservados mesmo após esse prazo; um teto de 250 mil registros gera erro e exige conferir o envio, sem descartar a fila silenciosamente. O banco mantém o histórico recebido. Não há exclusão automática das tabelas.

Envio autenticado em páginas de até 500 registros e orçamento de 800 kB. Checkpoints só avançam após confirmação do lote inteiro. Banco deduplica pela chave ativo + intervalo + horário. O buffer e os checkpoints têm gravadores distintos. O diagnóstico agrega a nova tabela ep_intraday_candles. HTTP /analytics/candles aceita symbol, interval=5m|15m|30m, limit até 500 e cursor before (ISO). M5 identifica cobertura seletiva e não representa cobertura contínua.

M30 é calculado sob consulta com dois M15 completos, alinhados em UTC. Sem pares completos não se inventam candles. Não há requisição adicional à Binance nem duplicação de M30 no armazenamento. Em uso normal, o M15 acrescenta no máximo 4.800 candles/dia para 50 ativos, além do M5 selecionado. Espaço físico, índices e processamento diferem do tamanho JSON; a cota real ainda requer acompanhamento.

Esses dados permitem auditorias mais detalhadas de entrada e alvo/stop, mas não alteram automaticamente a avaliação H1 nem comprovam maior probabilidade de +50%. Mesmo M5 pode ter alvo e stop no mesmo candle e exige tratamento de ambiguidade.
