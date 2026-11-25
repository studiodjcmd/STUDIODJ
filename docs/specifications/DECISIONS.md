# Registo de decisões e questões abertas

| ADR | Decisão | Estado | Razão |
|---|---|---|---|
| 001 | NS6 original, quatro decks, hardware-first | definido pelo utilizador | aproveitar equipamento existente |
| 002 | Apple-inspired + ergonomia CDJ, FX discreto | definido | aparência e legibilidade |
| 003 | Sem aprendizagem/auto-mix na performance | definido | fluxo manual |
| 004 | Mixxx como base de motor | direção | reutilizar áudio/controlos |
| 005 | XML/QSS como primeiro spike | histórico | menor risco técnico; design rejeitado |
| 006 | QML como possível próximo spike | aberto | liberdade visual, verificar upstream |
| 007 | Mapping original imutável | definido | preservar correções hardware |
| 008 | Tag List nunca AutoDJ | definido | fila manual |
| 009 | Prepare offline/DB própria | proposto | isolamento áudio |
| 010 | USB via intermediário primeiro | proposto | risco formatos/hardware |
| 011 | Suspender implementação, main arquivo | definido | pedido do utilizador |

Questões a decidir: SO/driver real e áudio; layout waveform stacked/independente default; densidade 4 decks; estratégia hotcue banks/SHIFT conflitos; multi-PFL; semântica Memory vs Hot; Tag List persistência; modo preview e routing; QML versão/build/licenças; orçamento DIY; modelo e formato USB alvo; corpus e direitos de áudio; temas/artework. Não resolver por adivinhação.

## Roadmap reativável (sem trabalho agendado)
| Fase | Entregável | Dependências / gate |
|---|---|---|
| R0 | baseline físico documentado | hardware, driver, audio master/headphone |
| R1 | mapping testado e golden traces | R0, PFL e layers |
| R2 | design system + mockup aprovado + runtime spike | R1, stack e screenshots reais |
| R3 | Player 2/4, Browse/Tag/Preview e load lock | R2, workflow sem rato |
| R4 | validação performance/soak | R3, stock comparison |
| R5 | Prepare v1 edit/cache/import | R4, DB contract/licenças |
| R6 | Track DNA/Smart Cues/Transition | R5, corpus e métricas |
| R7 | stems offline e USB interoperability | R5, versões e hardware |

Nenhum prazo ou percentagem arbitrária; release só quando critérios passam.
