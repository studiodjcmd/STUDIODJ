# Numark NS6 original — hardware, MIDI e integração

Fonte de verdade: [XML original](../../assets/controller/Numark%20NS6%20Original.midi.xml), [JS original](../../assets/controller/Numark-NS6-Original.js), manuais ITCH e QSG no pacote, [pesquisa](../../research/feasibility-report.md). **Não confundir NS6II.** O mapping é do autor maurojuniorr e não foi certificado neste projeto em hardware. O inventário CSV é extraído do XML, não uma interpretação do protocolo.

## 1. Grupos e superfície
Dois lados físicos com layers 1/3 e 2/4; mixer quatro canais. Jog, touch strip, fader de pitch, pitch bend, scratch/vinyl, transport, hot cues, loops, grid, sync, shift; centro com EQ/gain/faders/PFL/crossfader, browsing e FX. Áudio e MIDI são questões diferentes: o dispositivo pode enviar MIDI sem que o driver áudio esteja funcional. Manuais e 3D são referência, não prova elétrica/mecânica.

## 2. Contrato do mapping
| Controlos | Existente no código | Intenção Studio DJ / cautela |
|---|---|---|
| PLAY / CUE | transport, release irregular reparado | conservar sem alterações |
| Jog/touch | MSB+LSB 14-bit, scratch/backspin, hand-off e scrub | conservar; medir, não simplificar |
| Strip Search | touchStripInput, posição/LED | validar seek/feedback e proteção |
| Pitch | 14-bit, ranges ±8/16/50, takeover | conservar; setas CC 0x3C/0x3D original |
| Pitch bend ± | momentâneo | conservar |
| Scratch | modo vinyl/transport | preservar gestos |
| Shift | botão e estado por deck | sem sticky shift acidental |
| Sync / Keylock / Tap | handlers originais | quantize em novo atalho só após resolver conflito |
| Grid SET / ADJUST | gridSetClearInput/gridSlipAdjustInput | validar manual e shifted |
| Loop / halve/double / mode | handlers originais | mapear manual/beat loop/roll/reloop sem remover |
| Reverse / skip | handlers originais | confirmar slip e beatjump |
| Hot cue 1–5 | cinco físicos, delete opcional | 2 bancos A–E/F–H, sem overwrites |
| Deck Change L/R | layers e LEDs | publicar estado UI sem enviar feedback em loop |
| Gain | 14-bit pregain | SHIFT+GAIN já usa QuickEffect filter |
| EQ low/mid/high | MSB+LSB, equalizer rack | manter resposta física |
| Volume/crossfader | MSB+LSB, curve/assign | não duplicar mixer na UI |
| PFL | seleção exclusiva no JS | validar multi-PFL simultâneo descrito no manual |
| Master/head gain/mix | handlers do mixer | validar master/headphone independente |
| Input switch / split cue / fader start | handlers originais | testar efeitos reais antes de alterar |
| FX 1/2 select/param/mix/toggle/assign | dois units e routing 4 canais/master | UI compacta; sem remover capacidade |
| VIEW | toggle layout por skinKeys | em Browse, regressar Player primeiro |
| CRATES / FILES | foco 2/3; SHIFT title/BPM sort | abrir Browse + foco |
| PREPARE | toggle library; SHIFT artist sort | Tag List futura; conflito deliberado |
| LOAD PREPARE | AutoDjAddBottom | Tag List futura, nunca AutoDJ |
| Encoder | MoveVertical / GoToItem, SHIFT AutoDJ | manter navegação, retirar AutoDJ por escolha explícita |
| BACK/FWD | foco / ordenação | manter navegação contextual |
| LOAD A/B | LoadSelectedTrack, SHIFT eject | guardar layer e bloquear deck ocupado |

## 3. Configuração original
XML mixxxVersion 2.5.0+; scripts lodash.mixxx.js, midi-components-0.0.js, Numark-NS6-Original.js; init NumarkNS6.init, shutdown NumarkNS6.shutdown.
| Opção | Default | Significado |
|---|---|---|
| traktmixxxRaw | true | atalhos Traktmixxx-RAW |
| deleteHotcues | false | não apagar cues por SHIFT por omissão |
| playStartFactor | 0 | arranque imediato, range 0–6 |
| performanceFX | true | MIX dry/wet, PARAM efeito principal |
| singleEffect | false | alternativa de slots quando performanceFX desativado |
| scratchSensitivity | 50 | range 25–100, passo 5 |

## 4. Bridge real e proposta
Existente: skinKeys escolhe [Master]/[DeckRow2]/[EffectRack1] legacy ou [Skin],show_maximized_library/show_4decks/show_effectrack. Quando [NS6Surface],installed=1, syncLayerLEDs publica left_alt/right_alt. Esses flags são extensão de skin; não assumir existência em stock. Proposto: screen, browse_open, taglist_open, left_deck/right_deck, shift_left/right, filter_overlay_1..4; implementar/validar declaração e ciclo de vida antes de utilizar. Não enviar eventos repetidos de alta frequência sem mudança.

## 5. Riscos específicos
- Note Off malformado 0x8n 0x7D 0x7D: reparar apenas gesto ativo, preservar estado de intenção.
- Burst de zeros de reconexão: não mover faders virtuais para zero.
- Pickup do pitch por layer: não saltar rate ao mudar hardware/software.
- PFL exclusivo: comportamento atual incompatível com multi-PFL simultâneo do manual; decidir após teste.
- Timers 100/500 ms e arranque Vegas: otimizar só com medição. fastBoot é proposta, não alterar delays antes de confirmar estabilidade.
- Hotcue bank: cinco físicos, oito desejados; definir F–H e restantes botões sem colisão. Não assumir Delete ao SHIFT default.
- FX routing: preservar units/assign/master. Não equiparar QuickEffect a Sound Color FX proprietário.

## 6. Validação física
Tabela de captura para cada gesto: data, OS, driver, versão, layer, status/midino/value, estado anterior/posterior, LED esperado/observado, audio drop, resultado. Capturar 14-bit MSB/LSB e ordem; evitar logging de cada pacote em operação normal. Testar pressão/libertação, hold, gesto duplo, SHIFT, mudança layer durante gesto, reconexão, shutdown, scratch/seek/load ocupado. Testes mockados não substituem este protocolo.
