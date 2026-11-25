# Matriz CDJ/XDJ — requisitos

Referência de fluxo: CDJ-3000X, manuais AlphaTheta; não atribuir a todos os modelos as mesmas funções. P0 = essencial para tocar; P1 = completar experiência CDJ; P2 = preparação avançada/interoperabilidade. Estado descreve o Mixxx/mapping observado ou o requisito, não aprovação física.
| ID | Funcionalidade | Base / lacuna | Prioridade | Aceitação |
|---|---|---|---|---|
| C01 | Play / Cue | nativo + mapping | P0 | play/cue instantâneo, releases corretos |
| C02 | Vinyl/jog/scratch | mapping específico | P0 | sem saltos após release/reconnect |
| C03 | Tempo/Pitch bend | mapping 14-bit | P0 | pickup correto em 4 layers |
| C04 | Master Tempo | keylock nativo | P0 | pitch altera BPM sem mudar key quando ligado |
| C05 | Beat Sync | nativo | P0 | status e master claros |
| C06 | Quantize | nativo, atalho por decidir | P0 | cue/loop alinhado, desligar manual |
| C07 | Manual loop IN/OUT/reloop | nativo/mapping | P0 | criar/editar/reentrar sem drift inesperado |
| C08 | Beat loop/roll | nativo/mapping | P0 | tamanho e modo corretos |
| C09 | Hot cues A–H | Mixxx >8, 5 físicos | P1 | banks sem disparo involuntário |
| C10 | Memory cue/loop | modelo diferente | P1 | navegação cronológica e tipos separados |
| C11 | Slip | nativo | P1 | estado/retoma coerentes |
| C12 | Beat jump | nativo/refinar | P1 | tamanho e direção explícitos |
| C13 | Key shift/sync | capacidades nativas, UX | P1 | alteração manual e display |
| C14 | Needle search | strip físico | P0 | seek controlado, proteção de reprodução |
| C15 | Waveform zoom | renderer nativo | P0 | zoom sem mudar posição |
| C16 | Beatgrid | ferramentas nativas | P1 | editar anchor/offset e rever downbeat |
| C17 | Browse | biblioteca nativa | P0 | navegar sem rato |
| C18 | Search/filter/ABC | pesquisa nativa, UX | P1 | resultado/seleção previsíveis |
| C19 | Tag List | requer semântica nova | P1 | fila manual; nunca AutoDJ |
| C20 | Touch Preview | Preview Deck | P1 | headphone only, stop explícito |
| C21 | Touch Cue | adaptação waveform | P1 | preview sem mexer deck em palco |
| C22 | Load Lock | nativo/overlay parcial | P0 | todas as entradas de load/eject protegidas |
| C23 | Track history | biblioteca | P1 | registo confiável, export |
| C24 | Sound Color FX | QuickEffect aproximação | P1 | filtro/soft takeover corretos |
| C25 | Beat FX | units Mixxx | P1 | route, tempo, parâmetros; não prometer algoritmos proprietários |
| C26 | Layers | 1/3,2/4 | P0 | todos os estados visíveis |
| C27 | Artwork / metadata | biblioteca | P0 | fallback sem arte |
| C28 | USB export | formatos/protocolo distintos | P2 | validar por modelo real; primeiro intermediário |
| C29 | Track preparation | Mixxx + companion | P2 | cues/grid não destrutivos |
| C30 | Stems | investigação versão 2.6 | P2 | offline, sem competir áudio |

Memory cue não é simplesmente hot cue colorido. Preservar tipo, posição, loop, nome, cor e ordenação; converter explicitamente para Mixxx e reportar perdas. CDJ-3000X OneLibrary versus Device Library anterior: não alegar export universal. Ver fontes originais.
