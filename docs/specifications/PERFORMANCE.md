# Performance UX — especificação funcional

Estado: proposta consolidada, não implementação. Referência: fluxo de CDJ, controladora física original e conceitos visuais. As decisões adicionais deste documento são propostas de design para aprovação.

## 1. Modelo de navegação
Estados de página: PLAYER, BROWSE, TAG_LIST, UTILITY. PREPARE é workspace de preparação e pode ser companion separado, não tarefa pesada em palco. Overlay opcional: HOT_CUE, MEMORY, LOOP, BEAT_JUMP, KEY, FX. Overlay nunca substitui informação crítica nem inicia áudio. Não bloquear áudio ao navegar; fechar overlay com BACK, regressar à página anterior. Um gesto é contextual; sem mudanças automáticas de layer. Guardar foco e posição da biblioteca enquanto o utilizador alterna páginas.

| Evento | Resultado proposto | Observação |
|---|---|---|
| VIEW em Player | Alternar par ativo / 4 decks | Manter deck físico escolhido |
| VIEW em Browse/Tag List | Regressar Player | Não muda o áudio |
| CRATES | Browse, foco árvore | Shift preserva ordenação se aprovada |
| FILES | Browse, foco fontes/faixas | Confirmar semântica final |
| Encoder rodar | Mover seleção | Não carregar música |
| Encoder pressionar | Entrar/ativar item | Pré-escuta apenas em atalho explícito |
| BACK/FWD | Subir/descer níveis ou foco | Não alterar faixa |
| PREPARE | Abrir Tag List | Atualmente alterna biblioteca no mapping original |
| LOAD PREPARE | Adicionar seleção à Tag List | Atualmente Auto DJ, tem de mudar |
| LOAD A/B | Carregar na layer física selecionada | Bloquear deck ocupado; confirmação explícita se exceção |
| Load bem-sucedido | Player opcional + conservar seleção | Não ocultar erros ou iniciar playback |
| Load falhado | Ficar em Browse com erro | Não apagar faixa existente |

## 2. PLAYER (dois decks)
```text
┌──────────────────────────────────────────────────────────────────┐
│ Studio DJ      Player  Browse  Tag List            MASTER ▂▅▆    │
│ D1 [playing]  D2 [cue]  D3 [playing]  D4 [empty]                 │
├──────────────────────────────────────────────────────────────────┤
│ 01 • ACTIVE     TITLE / ARTIST       02 • ACTIVE   TITLE/ARTIST   │
│ 152.00 BPM  +1.2%  8A  02:14        150.00 BPM  -0.5%  9A  01:11 │
├──────────────────────────────────────────────────────────────────┤
│ 01     scrolling waveform      │playhead│                       │
│ 02     scrolling waveform      │playhead│                       │
├──────────────────────────────────────────────────────────────────┤
│ D1 overview · cues · loop         D2 overview · cues · loop      │
│ PFL / MT / Q / SLIP / FX          PFL / MT / Q / SLIP / FX        │
└──────────────────────────────────────────────────────────────────┘
```
Wireframe conceptual, não screenshot. O par mostrado segue exclusivamente os botões físicos: esquerda 1 ou 3; direita 2 ou 4. As quatro combinações são válidas. Outros decks podem tocar, por isso a faixa compacta deve mostrar sempre número, título, estado play/on-air e aviso de fim. O estado on-air é derivado de mixer/routing real, não confundido com play nem PFL. Nenhuma ação sobre um deck escondido por engano.

### Campos e comportamento
| Componente | Dados/ação | Estado vazio/erro |
|---|---|---|
| TrackHeader | título, artista, artwork opcional, duração, deck, layer | No track; sem valores inventados |
| BPM | visual BPM atual, BPM original opcional, pitch % com sinal | — sem análise |
| Tempo | elapsed / remaining alternável; tempo restante legível | — sem faixa |
| Key | tonalidade / Camelot opcional, mudança de semitons | — sem análise |
| Scroll waveform | renderer nativo, beatgrid, playhead, zoom, cues/loop | indicar análise pendente |
| Overview | faixa toda, progresso e cue markers, região de loop | não fingir waveform |
| Cue strip | A–H, presença/cor/estado e banco físico atual | vazio/inativo distinguível |
| TransportStatus | play, cue, master tempo, sync/quantize, slip | não confundir hold com toggle |
| LoopStatus | enabled, tamanho, manual/auto quando disponível | OFF |
| Meter | deck e master, indicador de peak real | silêncio = zero |
| FXCompact | unidade, efeito selecionado, ON, deck route, wet | ocultável; sem knobs de mixer |
| PFL | pré-escuta real por canal | indicador distinto de on-air |

Waveforms stacked e alinhadas no tempo são uma opção; orientação independente por deck é alternativa de preferência. Não forçar beat alignment quando tracks têm grids diferentes. Zoom manual ligado ao deck ou conjunto, sem seek involuntário. Não criar waveform duplicada para cada página; reusar recursos nativos quando possível. Nunca recalcular a análise só por abrir o Player.

## 3. PLAYER (quatro decks)
Grelha 2×2 ou lanes 1/2/3/4 conforme preferência, manter mesma identidade cromática e numeração física. Cada canal mostra ao menos metadata, BPM, pitch, time, play/PFL/on-air/loop e overview; os quatro scrolling waveforms só se render budget e espaço permitirem. Diferenciar layer ativa de deck que está a tocar. Em 1366×768 não cortar controlos críticos; reduzir decoração e campos secundários antes da tipografia crítica.

## 4. BROWSE
```text
[compact deck rail: 1 / 2 / 3 / 4]      [Player] [Tag List]
┌─────────────┬──────────────────────────────────┬──────────────┐
│ Collection  │ Search     sort/filter            │ Track info   │
│ Playlists   │ #  Title/Artist   BPM Key Time    │ Artwork      │
│ Crates      │ ▶  selected track                 │ Preview      │
│ USB         │    other tracks                   │ Cues/Grid    │
│ History     │                                    │ Add to Tag   │
└─────────────┴──────────────────────────────────┴──────────────┘
```
Fonte, pesquisa, seleção e sort independentes. Enter/encoder não é LOAD. Ordem estável durante scroll; preservar seleção mesmo após refresh; se removida, selecionar vizinho sem carregar. Colunas configuráveis (título/artista, BPM/key/duração, rating/tags, prep status). Row height legível; lista virtualizada; sem artwork decode em massa. Track inspector opcional não rouba largura em 1366×768. Preview usa deck separado, só auscultadores conforme routing; selecionar outra faixa não a toca automaticamente. Stop explícito e comportamento ao sair da página configurável. USB removido: invalidar paths, parar preview dessa fonte e notificar; reprodução em decks não deve ser interrompida pela UI.

## 5. TAG LIST
Fila de trabalho persistente ou sessão (decisão futura), não playlist Auto DJ. Adicionar uma faixa selecionada, confirmar visualmente, evitar duplicados acidentais por ID; permitir remover/reordenar/limpar com confirmação. Sem auto-load, auto-play ou auto-mix. LOAD atua sobre seleção manual. A lista deve sobreviver a mudanças de página; remoção de USB mostra indisponível. Exportar para playlist com nome explícito; não modificar a coleção original sem ação.

## 6. UTILITY
Perfis de áudio/driver/buffer (nunca mudar durante live sem confirmação), configuração de outputs Master/Headphones, layout 2/4, waveforms e contraste, fontes/colunas, hotcue banks, quantize, feedback, mapping e diagnósticos. Mostrar versão Mixxx, controlador, sample rate, buffer, xruns; separar diagnóstico de UI live. Não esconder incompatibilidades. Botão de voltar a skin/mapping stock.

## 7. Painéis contextuais
Hot cues A–H: estado, banco e delete explícito; Memory: anterior/seguinte e guardar/delete, manter semântica distinta; Loop: IN/OUT/RELOOP, tamanho, ativa/desativa; Beat Jump: tamanho e direção; Key: atual/shift/sync/lock; FX: unidade, slot, route, parâmetro/dry-wet. Abrir manualmente e não por timers agressivos. Um filtro por canal via SHIFT+GAIN conserva soft takeover original.

## 8. Casos de aceitação
- P01: 4 decks carregados e duas layers físicas a mudar, nenhuma reprodução interrompida.
- P02: Browse/Tag List abertos durante quatro decks a tocar, rail mantém estado de todos.
- P03: LOAD na layer errada nunca ocorre; LOAD em deck ocupado bloqueado; falha mantém faixa existente.
- P04: navegar, procurar, preview, adicionar Tag e carregar sem rato em percurso normal.
- P05: hot cues e memory claramente distintos; mudar banco não dispara cue.
- P06: ecrã pequeno, 1366×768, 1920×1080 e DPI 125/150%; sem clipping de BPM/tempo/título crítico.
- P07: dispositivo removido, áudio interrompido, grid ausente e track missing têm estados honestos.
- P08: UI sem track, uma faixa, duas, quatro, loop/FX/peak; screenshots reais revistos antes de aprovação.
