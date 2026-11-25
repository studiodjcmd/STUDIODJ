# Especificação visual — Apple-inspired, não imitação de marca

Design target: Logic Pro / Apple Music em dark mode, com prioridades de CDJ. A captura real inicial foi rejeitada; não é referência de qualidade. Os mockups são referência de direção, não especificação pixel-perfect nem software funcional.

## 1. Sistema de tokens
| Token | Valor proposto |
|---|---|
| canvas | #101012 |
| surface / elevated | #1D1D20 / #242428 |
| border | #36363B |
| text primary / secondary / disabled | #F5F5F7 / #A1A1AA / #777780 |
| Deck 1/2/3/4 | #0A84FF / #FF9F0A / #BF5AF2 / #64D2FF |
| success / warning / clip | #30D158 / #FF9F0A / #FF453A |
| spacing | 4/8/12/16/24/32 px |
| radii | 6/10/14 px; sem arredondar tudo |
| font | Geist Sans + tabular figures; alternativa Inter; mono apenas dados específicos |

SF Pro apenas referência estética, não redistribuir. Verificar licença exata antes de incorporar. Valores abaixo são alvos em ecrã 1366×768, não medidas validadas. Escala por DPI, não encolher toda interface com transform.

## 2. Hierarquia
Brand 22–26; títulos de track 20–24 (elide e tooltip completo); BPM 34–46; time 24–32 com números tabulares; pitch/key 16–20; status/labels 11–13; biblioteca 13–15; row 32–40. BPM/time devem ser visíveis a distância e sem tremor de dígitos. Contraste suficiente em club, avisos por ícone/texto além da cor. Sem tiny label cinza sobre cinza escuro.

## 3. Layout
Margens 16–24, gutters 12–16; header discreto 44–56; deck rail 40–56; área central dominante para waveforms. O design default é horizontal, não quatro colunas de texto. Player e Browse são workspaces separados. Evitar espaços mortos e mostrar o conteúdo relevante. Em 4 decks, reduzir metadata secundária e usar layout adaptativo, mantendo rail e número de deck. Artwork é opcional pequeno, não distrai. Não desenhar jog/fader/knob virtual quando o hardware já o tem.

## 4. Componentes e estados
- Deck header: accent só no número/estado e waveform, título/artista claros; active layer não é play/on-air.
- Waveform: fundo mais escuro, grid subtil, playhead claro, cue flags e loop region; cor por deck, opção waveform RGB nativa. Nenhum gráfico fake.
- Hotcue: labels A–H pequenas, filled quando existe, destaque banco; delete explícito; sem parecer botões se só indicadores.
- Loop/MT/Q/Slip/PFL: off/active/disabled distinguíveis; status green só quando semântica real, peak vermelho.
- Library: coluna de fonte discreta, tabela sem linhas pesadas, seleção contrastante, busca e sort; preview inspector compacto.
- Tag List: count e lista manual, empty state, confirmação de clear.
- Overlay: painel pequeno ao lado do deck, não modal gigante; fechar/back, focus visível; sem interceptar hardware transport.
- Empty track: mostrar No track / traço, não BPM ou título fictício.
- Missing/analysis/loading/error: mensagem concisa, sem bloquear Player.

## 5. Design review gate
Gerar screenshots reais com fixture de 4 tracks e estados conhecidos (empty, loaded, playing, paused, loop, PFL, 3/4 layers, Browse, Tag List, FX off/on). 1366×768 e 1920×1080, DPI 100/125/150. Verificar clipping, legibilidade, contraste, proporções, foco e coerência. Comparar com as imagens de referência e solicitar aprovação visual antes de entregar Alpha. Screenshot de janela de configuração/sem faixas não prova qualidade. Não gerar nova imagem conceptual como se fosse execução real.
