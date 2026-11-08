# Coleta e armazenamento — revisão de 8/11/2026

## Mudanças

- EMA MTF usa somente os 50 ativos Spot do Laboratório, substituindo a varredura de centenas de contratos com fallback para Spot. Tela manual e coletor usam o mesmo núcleo versionado, 240 candles fechados, consecutivos e atuais por intervalo. Preparação é contexto, não nascimento de operação.
- EMA e A/B reutilizam o cache H1 da coleta de qualidade quando disponível e atualizado. Cache ausente não impede coleta. Erros mantêm o último quadro marcado como desatualizado.
- Acompanhamento percorre todos os candles desde o checkpoint. Recuperação extraordinária tem orçamento de três páginas de mil candles por ativo; lacunas superiores encerram acompanhamento com motivo explícito e não representam perdas comprovadas.
- Cada evento experimental é arquivado por dia antes da redução do arquivo usado pelo painel: todos os abertos e os 300 encerrados mais recentes. Campos de nascimento não podem ser alterados pelo gravador. Resultados permanecem atualizáveis; o arquivo não é um armazenamento WORM.
- A avaliação A/B inclui os arquivos históricos, sem confundir os 300 registros recentes da tela com a amostra completa. Números de versões anteriores ficam separados. Entradas EMA/A/B são simulações no fechamento; não representam execução no preço seguinte.
- Acompanhamento novo marca alvo antes do stop de 3% para +3/+5/+10/+20/+50%, ambiguidade intrabar e cobertura parcial. Janelas fixas só são válidas se o candle exato e toda a cobertura existirem. MFE não equivale a lucro realizado.
- Registros antigos com regras diferentes são preservados e retirados do acompanhamento com motivo LEGACY_VERSION_ARCHIVED. Isso não significa stop nem lucro. Não se inventam candles ausentes.
- Novas cópias integrais diárias são substituídas por manifestos pequenos com hash SHA-256 e arquivos incrementais. Backups antigos permanecem. Históricos H1 existentes continuam disponíveis.
- Checkout das tarefas usa download parcial dos dados necessários. A comparação M6 identifica corretamente seu controle técnico do Laboratório, distinto do motor completo do Analítico.

## Custos e limites

Nenhum plano pago, servidor novo ou migração de banco foi contratado. Agendamentos foram mantidos; especialmente o cron e caches protegidos do Supabase não mudaram. O ganho vem de reduzir o universo EMA, reutilizar H1, evitar cópias diárias integrais e não baixar snapshots antigos para cada tarefa.

O histórico continua crescendo. Arquivos diários são atualizados enquanto há acompanhamento; GitHub não substitui um banco ilimitado. Ainda é necessário acompanhar consumo real de armazenamento, Actions e banco. Os scripts não conhecem o saldo da cota de cada conta e não garantem consumo zero ou permanência indefinida no plano gratuito.

Disponibilidade depende de GitHub Actions, Binance e serviços conectados. Atrasos e bloqueios upstream continuam explícitos. Resultados antigos com cobertura incompleta não se tornam válidos retroativamente. Estes ajustes de engenharia não comprovam vantagem estatística nem aumentam por si só a probabilidade de +50%.

## Validação

48 testes no Laboratório e oito testes no Worker/Analítico. Teste integrado com respostas sintéticas: 50 ativos analisados; 6.000 eventos EMA e 5.000 A/B preservados antes de reduzir feeds; 4.674 registros H1 arquivados. Essa simulação verifica a migração e as gravações, não rentabilidade nem disponibilidade real dos provedores.
