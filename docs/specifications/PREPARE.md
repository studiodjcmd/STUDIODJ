# Studio Prepare — biblioteca e análise

Objetivo: preparação local avançada sem afetar áudio. A maior diferenciação pretendida é música eletrónica pesada (hard techno, industrial, hardcore, rawstyle), não um classificador pop genérico. Tudo a seguir é proposto, salvo ferramentas/fontes documentadas na pesquisa.

## 1. Workspaces
**Track editor:** fila de faixas por preparar à esquerda, waveform zoom/overview com beatgrid e seções ao centro, inspector de metadados/cues/loops/detecções à direita. Undo/redo para ações manuais. Marcar Ready ou Needs review. Next/Previous preserva alterações confirmadas e pede confirmação de descartes. Sem modificar áudio original.

**Track DNA:** BPM e confiança, tempo variável, downbeats, beatgrid, tonalidade e confiança, loudness, espectro, energia, densidade de percussão/kick, probabilidade vocal; seções intro/build/break/drop/outro com limites, confidence e origem. Expor sinais que suportam sugestão; aceitar ajuste humano. Não prometer precisão sem corpus.

**Smart Cue Studio:** perfil de utilizador (género, posição musical, quantidade, nomes/cores), mostrar candidatos e razão, aceitar todos/individualmente, rejeitar/editar. Nunca sobrescrever manual silenciosamente. Exemplo de perfil hard techno: A Mix In, B Kick In, C Drop 1, D Breakdown, E Drop 2, F Mix Out, G Outro, H Rescue Loop; regras propostas em beats/barras, não inferir que toda faixa tem duas drops. Rescue Loop deve ser ouvido e confirmado. Se confiança insuficiente, não sugerir. Respeitar grid manual.

**Transition Studio:** selecionar duas faixas, alinhar manualmente downbeats e zonas de mix, visualizar sobreposição, ouvir com EQ/filter/crossfader, notas e marcações. Guardar associação de pares e offsets; não alterar originais, não executar transição automaticamente ao vivo. Evitar autoplay sobre decks reais.

## 2. Pipeline offline
1. Ingest paths e metadata; detetar missing/duplicados por fingerprint sem apagar.
2. Decode uma vez para features/cache; análise de beat/downbeat/key; segmentação/energia; candidates cues.
3. Guardar resultado versionado numa DB própria, atomicamente.
4. Review manual → alterações independentes de sugestões.
5. Export explícito para formatos compatíveis; relatório de perdas/conflitos.
6. Invalidar cache só quando fingerprint/analyzer/model/settings mudar.
Worker com prioridade baixa, quota CPU, cancelamento seguro e suspensão em Performance. Estado queued/running/failed/canceled/ready/reviewed; retomar sem reprocessar tudo. Sem rede obrigatória.

## 3. Modelo de dados proposto (não schema implementado)
- tracks(id, content_hash, location, size, modified, duration, availability)
- metadata(track_id, title, artist, album, genre, bpm, key, tags, revision)
- analysis_runs(id, track_id, analyzer_version, model_version, settings_hash, state, timestamps)
- beatgrid(track_id, revision, timebase, anchors[], bpm, confidence, user_edited)
- sections(id, track_id, type, start_sample, end_sample, confidence, source, revision)
- cues(id, track_id, type hot/memory/loop, start_sample, end_sample?, slot?, label, color, source, confidence?, locked, revision)
- features(track_id, run_id, series_type, sample_rate, cache_ref)
- profiles(id, name, rule_set_version, rules)
- transitions(id, from_track, to_track, from_anchor, to_anchor, notes, revision)
- tags / playlist_items / preparation_status / fingerprints / embeddings.
Tempos em samples ou timebase explícita, nunca float aproximado usado como identidade de cue. Relacionar cache por fingerprint+versão+settings. Não usar track path como único ID.

## 4. Biblioteca
Smart Collections por regras explícitas (BPM range, key, rating, tags, preparação, last played, duration), pesquisa FTS5, tags múltiplos, ordenação estável. Duplicados exatos e possíveis versões distinguidos; recuperação de ficheiros movidos por fingerprint; inspeção clipping, silêncio, suspeita de transcode sem garantir qualidade. Similaridade só com features/embeddings validados; resultado explica critérios e não decide playlist ao vivo. Track history e associações manuais. Pré-escuta dedicada.

## 5. Motores candidatos
| Ferramenta | Uso | Risco/validação |
|---|---|---|
| Beat This! | beat/downbeat | validar heavy electronic e licenças dos pesos |
| All-In-One | estrutura/features | labels pop podem falhar; adaptar |
| Demucs | stems offline | CPU/GPU pesado, versões/pesos |
| Essentia | DSP/features/similarity | AGPL/modelos NC, rever uso comercial |
| CueIt | referência cues, Rust e export | alpha, não assumir API ou precisão |
| pyrekordbox/rbox | formatos | compatibilidade por hardware e licenças |
Não escolher por popularidade; testar precisão, latência, memória, licenças e reprodutibilidade. Referências no relatório.

## 6. Avaliação
Corpus com faixas representativas autorizadas, separar treino/teste, BPM variados, intros/breaks/sem drop, transições e variações. Ground truth manual por DJs; medir beat/downbeat F-score e erro temporal, segmentos com tolerância declarada, precisão/recall de cues, percentagem aceite/ajustada/rejeitada, tempo de preparação por faixa. Comparar Mixxx stock, Rekordbox e baseline regras simples quando possível. Sem números inventados.

## 7. Interoperabilidade
Mixxx DB é gerida pelo próprio Mixxx. Nunca escrever diretamente na mixxxdb.sqlite ativa. Companion mantém studio.db; usar import/export controlado, API interna num fork ou snapshot fechado com backup se suportado. Export intermediário (playlist/metadata/cue representation documentada) e Rekordbox produz USB inicialmente. OneLibrary/Device Library/ANLZ, leitura/escrita, cues/loops/beatgrid, histórico e waveform testados por modelo real antes de release. Não confundir leitura com escrita. Nenhuma promessa de export USB completo.

## 8. Critérios
Pr-01: editar e reabrir sem perder cues/grid; undo/restauração. Pr-02: reanálise não destrói edição manual. Pr-03: cache evita análise duplicada. Pr-04: cancelar worker sem corromper DB. Pr-05: resultados difíceis mostram incerteza. Pr-06: nenhuma tarefa pesada afeta performance. Pr-07: export mostra perdas e nunca substitui biblioteca sem confirmação.
