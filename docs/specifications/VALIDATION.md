# Plano de validação e desempenho

Nada aqui é benchmark obtido. Baseline histórico: CI estático (6 mapping + 7 overlay mocked, XML/JS/package) e smoke em Xvfb Mixxx 2.5.6. Não prova áudio, NS6 física, desempenho ou UX aprovada.

## 1. Protocolo
Registar versão/commit, OS, driver/API, CPU/RAM/GPU, resolução/DPI, disco, sample rate, buffer, outputs, mapeamento, settings. Comparar stock Mixxx e candidato na mesma máquina, dataset e condições. Warm/cold separados; pelo menos 30 arranques e 100 loads; reportar median/p95/p99/max, não só melhor caso. Teste de biblioteca sintética 10k/100k/1M sem música privada. Real tracks autorizadas para áudio/beatgrid. Sem afirmar resultados sem CSV/logs. Usar profiler não intrusivo e controlar impacto de instrumentação.

## 2. Metas (propostas)
| Métrica | Meta inicial | Stretch |
|---|---:|---:|
| frame time p95 60Hz | ≤16.7 ms | manter p99 estável |
| cold startup | <8 s | <5 s |
| abrir Browse | <100 ms | <50 ms |
| pesquisa 10k | <50 ms | <20 ms |
| pesquisa 100k | <150 ms | <60 ms |
| pesquisa 1M | <500 ms | <200 ms |
| load SSD p95 | <500 ms | <250 ms |
| RAM performance | <1 GB | <600 MB |
| UI idle | <5% de 1 core | <2% |
| quatro decks 4h | 0 xruns | 8h soak |
| crash 8h | 0 | regressão repetida |

Áudio: 44.1/48k conforme driver; 64/128/256/512 frames, medir round-trip real com loopback, reported latency, callback p95/p99/max, xruns; 4 tracks+scratch+keylock+FX+pesquisa+USB. FPS ≠ latência áudio. Menor buffer estável é critério, não menor número que abre.

## 3. Suites
- Integrity: SHA256 originais e 383 bindings únicos, nomes/autor/deps.
- Controller: MIDI press/release, 14-bit, layers, takeover, scratch/backspin, malformed release, USB burst, PFL multi, FX/loops/grid, LEDs, shutdown; golden traces.
- UI smoke: perfil isolado, Mixxx real, sem modal inesperado; identificar skin exata nos logs, screenshots; verificar widgets e control IDs, carregamento e page switches.
- UI visual: estados e resoluções listados em VISUAL; aprovação humana.
- Workflow: CRATES/FILES/encoder/BACK/FWD, Tag List, Preview, LOAD safe, no AutoDJ, sem rato.
- Audio: master/headphone independente, ganho/peak, xrun monitor, USB reconnection em bancada; 1000 load/eject e repetição layer swaps durante playback.
- Prepare: offline jobs, cache, edição manual, cancel/recovery, export/import com backup, corpus e métricas.
- Compatibility: hardware original, driver versões, OS; USB CDJ por modelo; performance test por classe PC.
- Soak: 8h quatro decks com browsing, FX, scratch, load, cache e stress disco; sem crash e 0 xruns.

## 4. Artefactos a guardar
benchmarks/environment.json (CPU/GPU/OS/version/settings), startup.csv, frame-times.csv, library.csv, load.csv, audio.csv, midi-events.csv, test-report.md, logs redigidos e screenshots. Não guardar faixas/paths privados. Campos comuns run_id, baseline/candidate, scenario, repetition, timestamp, metric, unit, value, result. Falha em audio safety/load/rollback é no-go. Design rejeitado também é no-go mesmo com CI verde.

## 5. Gate futuro
G0 hardware/driver comprovado; G1 mapping frozen e testes; G2 design aprovado em runtime; G3 Browse/Tag/Preview/load completos; G4 estabilidade/performance stock vs candidato; G5 Prepare e interop. Não considerar artefacto installable como release certificada.
