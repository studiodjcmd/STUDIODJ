# Studio DJ — estudo de viabilidade real, arquitetura e plano para uma experiência NS6 ultra-rápida

## Veredicto executivo

**Conclusão:** o Studio DJ é tecnicamente viável e há um caminho relativamente curto para ter uma primeira versão realmente utilizável com a **Numark NS6 original**. A abordagem mais segura, rápida e com menor risco não é criar já um fork completo do Mixxx nem colocar uma interface web por cima dele. É começar com **Mixxx 2.5.6 estável + skin nativa XML/QSS/SVG + o mapping NS6 existente cuidadosamente preservado e corrigido**, tratando o Mixxx como motor de áudio, biblioteca e estado dos decks. Em paralelo, o modo **Prepare avançado** deve ser um processo/aplicação separada, com base de dados própria e processamento offline. QML é a direção certa a médio prazo, mas em 25 de novembro de 2026 ainda está numa fase experimental no Mixxx 2.7 e não é a base que escolheria para tocar ao vivo já. A maior limitação prática do projeto não é o Mixxx nem a interface: é a **interface de áudio USB da NS6 original em sistemas operativos modernos**. A Numark continua a disponibilizar oficialmente o driver Windows 8.1/10 v2.9.64 e drivers macOS antigos, mas declara explicitamente a NS6 original como não suportada em Windows 11 e macOS Big Sur; a NS6II é hardware diferente e não deve ser usada como referência. Por isso, para obteres a versão mais depressa possível e com o menor número de variáveis, a configuração que eu usaria inicialmente seria:

| Camada | Escolha para a primeira versão | Razão |
|---|---|---|
| Sistema operativo | **Windows 10 + driver Numark 2.9.64** | Caminho oficialmente suportado pela Numark para a NS6 original. |
| Motor | **Mixxx 2.5.6 Release** | É a versão que o próprio projeto recomenda para utilização ao vivo. |
| UI Performance | **XML/QSS/SVG nativos do Mixxx** | Menor risco, sem IPC e sem segundo renderer. |
| Controlador | **Mapping que enviaste, refactor incremental** | Já contém trabalho específico e difícil de reproduzir para a NS6 original. fileciteturn5file3 fileciteturn2file0 |
| Prepare avançado | **processo separado, preferencialmente Rust/C++** | Pode consumir CPU sem comprometer o callback de áudio. |
| QML | **branch experimental paralela** | Muito promissor, mas LateNight QML só deverá surgir como skin experimental no 2.7. |
| Web UI | **não usar no Performance** | Qt WebEngine introduz Chromium e processos adicionais; é contraproducente para a meta de footprint mínimo. |

Isto não significa que XML/QSS seja o destino final. Significa que é o **melhor primeiro produto**. O Studio DJ poderá migrar para QML quando a infraestrutura QML do Mixxx — em especial Library, Preview Deck e Preferences — estiver estabilizada. Atualmente a própria equipa do Mixxx ainda mantém a biblioteca QWidget através de uma bridge no novo LateNight QML, e há trabalho aberto para scaling e Preview Deck. A classificação que uso no resto do relatório é: **Verificado** = confirmado diretamente em código ou fonte primária; **Inferência** = conclusão técnica fundamentada nessas fontes; **Hipótese/meta** = algo que ainda exige benchmark ou teste real.

## Auditoria do mapping da NS6 e riscos reais

Os dois ficheiros anexados estão acessíveis e foram efetivamente analisados. O XML identifica-se explicitamente como `Numark NS6 Original (4 decks)`, requer Mixxx 2.5.0+ e carrega `lodash.mixxx.js`, `midi-components-0.0.js` e `Numark-NS6-Original.js`. Também expõe opções para integração com Traktmixxx-RAW, comportamento dos hot cues, soft start, FX e sensibilidade de scratch. fileciteturn5file3

O JavaScript não é um mapping trivial. Contém lógica específica para problemas reais da NS6: reconstrução de controlos de 14 bits, inicialização SysEx, prevenção de resets durante bursts de reconexão, correção de mensagens Note Off malformadas, estado de scratch e backspin, takeover do pitch, gestão de LEDs, timers, shutdown defensivo, camadas 1/3 e 2/4 e routing de efeitos. fileciteturn2file0 fileciteturn3file4

### O que eu preservaria sem tocar inicialmente

**Verificado:** o código trata os jogs como posições de 14 bits e mantém MSB/LSB separados; contém diagnóstico para detetar saltos anómalos sem fazer logging de cada pacote de alta frequência; rejeita deltas considerados impossíveis; implementa timers para handed-off de scratch e backspin. Isto é precisamente o tipo de comportamento que não deve ser reescrito só para “limpar” o projeto. fileciteturn2file0

**Verificado:** existem correções explícitas para um pacote Note Off anómalo `0x8n 0x7D 0x7D`, que pode representar libertação de PLAY, CUE ou jog-touch. A função centraliza a reparação e só atua sobre estados efetivamente ativos. fileciteturn4file2

**Verificado:** existe proteção contra uma sequência de zeros durante reconexão USB, com atraso e filtragem de estado para evitar que faders e knobs físicos sejam interpretados como tendo saltado todos para zero. fileciteturn2file0

**Verificado:** o mapping utiliza valores completos de 14 bits para volume, crossfader, pitch e vários controlos analógicos. Isto está alinhado com a especificação oficial da NS6, que indica MIDI de 14 bits e 3600 pontos por rotação dos jogs. **Verificado:** o código distingue explicitamente a NS6 original da NS6II nos LEDs de takeover de pitch, usando CC `0x3C/0x3D`. Isto é importante porque diversos mappings encontrados online misturam protocolos das duas gerações. fileciteturn2file0

**Verificado:** a troca física de layer seleciona 1↔3 no lado esquerdo e 2↔4 no lado direito, exatamente como documentado pela Numark; antes de mudar layer, o mapping liberta gestos ativos e coloca o pitch em pickup. fileciteturn3file4 fileciteturn4file9

**Verificado:** `SHIFT + GAIN` já está implementado para controlar `[QuickEffectRack1_[ChannelN]],super1`, regressando a `pregain` quando SHIFT é libertado e ativando soft takeover em ambas as direções. Portanto a solução que discutimos para ter um filtro por canal já existe efetivamente no teu mapping. fileciteturn5file0turn5file1

**Verificado:** os dois FX units têm routing para Channel1–4 e Master e o mapping mantém feedback de LED desse routing. Isto permite manter FX muito discretos no ecrã sem perder capacidade. fileciteturn5file4turn5file5

### Um bug/comportamento que eu corrigiria antes de qualquer UI

Há um conflito concreto entre o mapping e o comportamento original da NS6.

O manual diz que um PFL premido isoladamente desativa os outros, mas que é possível **monitorizar vários canais simultaneamente premindo os PFL ao mesmo tempo**. fileciteturn4file8

O código atual, porém, ao ativar um PFL, percorre todos os quatro decks e força todos os restantes para zero:

```text
for deck 1..4:
    pfl = (deck == selected)
```

Isto significa que, no estado atual, a seleção múltipla de PFL não pode sobreviver. fileciteturn4file0

**Inferência:** deve ser tratado como bug/regressão funcional, a menos que tenha sido uma decisão consciente do autor. Eu colocaria isto na primeira bateria de testes de hardware.

### Timers e trabalho desnecessário

**Verificado:** existe um timer de 500 ms que atualiza LEDs de PLAY/CUE/SYNC em quatro decks e outro de 100 ms que consulta `playposition` dos quatro decks para atualizar o Strip Search, apesar de já existirem várias `engine.makeConnection()` event-driven para `playposition`, `play`, `sync_enabled`, `loop_enabled`, `rate` e outros estados. fileciteturn3file6 fileciteturn4file3

**Inferência:** isto não é uma ameaça direta ao callback de áudio — o script MIDI não corre no callback de processamento DSP — mas é trabalho periódico evitável no thread de scripting/UI e deve ser medido. Eu tentaria substituir polling por ligações event-driven sempre que possível e limitar atualizações visuais a mudanças efetivas de valor. O próprio mapping já segue esse padrão no BPM meter, que só envia MIDI quando o LED realmente muda. fileciteturn5file9

Existe também uma sequência de arranque/“Vegas mode” protegida por timers, seguida de um `parachuteTimer` de aproximadamente 1,6 s e um wake-up adicional de 300 ms. fileciteturn3file9

**Inferência:** para um Studio DJ focado em arranque instantâneo, eu criaria uma opção `fastBoot=true` que omite a animação e faz apenas a inicialização obrigatória do hardware. Só removeria esses atrasos depois de confirmar numa NS6 real que não são necessários para estabilização do firmware/USB.

### UI bridge já preparada

O código contém uma abstração muito útil:

```text
skinKeys()
  library -> [Skin], show_maximized_library
  decks   -> [Skin], show_4decks
  effects -> [Skin], show_effectrack
```

Quando `[NS6Surface],installed` está ativo, também publica `left_alt` e `right_alt`, permitindo que uma skin saiba imediatamente se os lados físicos estão nos decks 1/3 e 2/4. fileciteturn3file0turn3file4

**Veredicto:** não criaria uma bridge IPC separada para o Performance UI. Já tens uma bridge nativa através dos Control Objects do Mixxx. A arquitetura mais simples é expandir este conceito para:

```text
[NS6Surface],screen
[NS6Surface],browse_open
[NS6Surface],taglist_open
[NS6Surface],left_deck
[NS6Surface],right_deck
[NS6Surface],shift_left
[NS6Surface],shift_right
[NS6Surface],filter_overlay_1..4
```

Os Control Objects são precisamente o mecanismo thread-safe que o Mixxx utiliza para comunicar entre GUI, mappings, engine e restantes subsistemas. ## Mixxx, UI e workflow de CDJ: o que é realmente possível

À data de 25 de novembro de 2026, **Mixxx 2.5.6 continua a ser a versão estável indicada para utilização ao vivo**. A série 2.6 está em beta e o próprio site avisa que não deve ser usada ao vivo; a 2.7 é development/alpha e recebe a mesma advertência. O changelog de desenvolvimento ainda marca 2.6.0 e 2.7.0 como unreleased. ### O que a skin tradicional consegue fazer

Uma skin XML/QSS/SVG consegue criar praticamente toda a experiência visual que definimos: Player 2/4 decks, waveform/overview, metadados, BPM, key, tempo, hot cues, loops, biblioteca, áreas contextuais e layouts alternativos. O sistema tradicional possui `WidgetStack`, capaz de criar e alternar ecrãs inteiros, e mecanismos responsivos como `SizeAwareStack`. Isto significa que o primeiro Studio DJ pode ter:

```text
Performance
  ├─ 2 Deck
  └─ 4 Deck

Browse
  ├─ Sources / Playlists
  ├─ Track list
  └─ Preview

Tag List
Prepare
Utility
```

sem abrir uma segunda aplicação nem criar uma bridge de rede.

O Mixxx 2.5 já disponibiliza Slip, Quantize, Keylock, Beatjump, loops, hot cues, Cue e modos de Cue semelhantes a Pioneer. Suporta até 36 hot cues por deck na UI/control mappings, apesar de a NS6 ter apenas cinco botões físicos. Os Preview Decks expõem praticamente os mesmos controlos que os decks normais e podem ser usados para pré-escutar faixas sem ocupar um dos quatro decks de performance. ### Matriz CDJ/XDJ → Studio DJ

A referência adequada não é “copiar um CDJ” visualmente, mas reproduzir a lógica de operação documentada pela AlphaTheta. O CDJ-3000X, por exemplo, possui Hot Cues A–H, Memory Cue/Loop, Slip, Quantize, Beat Jump, Key Sync, Beat Sync, Master Tempo, Browse, Tag List, Touch Preview e Load Lock. | Workflow CDJ | Mixxx 2.5 / NS6 | Estado Studio DJ |
|---|---|---|
| Play / Cue | Nativo | **Já existe** |
| Vinyl/Jog/Pitch Bend | Nativo + mapping NS6 | **Já existe** |
| Tempo/Range | Nativo; mapping ±8/16/50 | **Já existe** fileciteturn4file3 |
| Master Tempo | `keylock` | **Já existe** |
| Beat Sync | Nativo | **Já existe** |
| Quantize | Nativo | **Mapear melhor** |
| Slip | Nativo | **Mapear claramente** |
| Beat Jump | Nativo | **Já existe / refinar controlos** |
| Manual/Beat Loop | Nativo | **Já existe** |
| Hot Cue A–H | Mixxx suporta >8; NS6 tem 5 pads | **2 bancos físicos** |
| Memory Cue/Loop estilo CDJ | Modelo de dados diferente | **UI de compatibilidade necessária** |
| Browse | Biblioteca nativa | **Recriar visualmente** |
| Tag List | Prepare/playlist temporária | **Criar semantics tipo Tag List** |
| Touch Preview | Preview Deck permite pré-escuta | **UI/mapping próprio** |
| Load Lock | Não é exatamente o mesmo fluxo CDJ | **Implementar no mapping** |
| Search/Alphabet jump | Biblioteca | **UI própria** |
| Key Sync | capacidades de key/controls existem, mas workflow não é igual | **Mapping/UI adicional** |
| Waveform Zoom | Motor waveform Mixxx | **UI/mapping** |
| Deck layers | NS6 1/3 e 2/4 | **Já existe** |
| FX routing | 2 units → 4 decks/master | **Já existe** |

A diferença mais importante está em **Memory Cues**. Quando lê USBs Rekordbox, o Mixxx converte os dados para o seu próprio modelo: o primeiro Memory Cue cronológico torna-se o main cue, o primeiro loop torna-se o loop principal e os restantes Memory Cues/loops são representados através de hot cues adicionais. Logo, uma UI “MEMORY ← / →” idêntica a CDJ não pode ser apenas cosmética: é necessária uma camada lógica que mantenha tipos de cue mais ricos no Studio DJ e os traduza para o modelo atual do Mixxx quando necessário.

### O QML é o futuro, não o MVP

A migração oficial do Mixxx de QWidget para QML é real. O trabalho do GSoC 2026 já implementou no LateNight QML decks, 2/4 decks, waveform, pitch, key, hot cues, intro/outro, loops, beatjump, mixer, FX, samplers e layouts responsivos. Contudo, a Library ainda passa por uma bridge QWidget e existem trabalhos em aberto de DPI/scaling e Preview Deck; a skin QML está prevista como **experimental em Mixxx 2.7**. **Decisão:** fazer o Studio DJ visualmente numa skin 2.5.6 agora, mas escrever todos os componentes como conceitos independentes — `DeckHeader`, `Waveform`, `TransportStatus`, `Browser`, `TagList` — para uma futura implementação QML.

QML trará vantagens reais quando a stack amadurecer. O Qt suporta compilação ahead-of-time de QML/JS, reutilização de delegates em `ListView` e rendering do scene graph num thread dedicado em muitas plataformas. ## Sistema operativo, áudio e estabilidade

A NS6 original é hardware de 2011, com interface de áudio de 24 bits / 44,1 kHz, MIDI de 14 bits e quatro canais de mixer. O facto de os controlos MIDI funcionarem não garante que a interface de áudio seja utilizável num determinado sistema operativo. Isto é a decisão de arquitetura com maior impacto no projeto.

### Windows

**Verificado:** a página atual da NS6 disponibiliza o driver Windows 8.1/10 v2.9.64. A página oficial de compatibilidade do Windows 11 diz explicitamente `NS6 — Not Supported`. Para um sistema dedicado, Windows 10 + driver ASIO Numark é, portanto, o ponto de partida mais previsível. O próprio Mixxx recomenda ASIO como a API preferível em Windows para baixa latência. ### macOS

**Verificado:** a Numark disponibiliza drivers antigos até macOS 10.12–10.14, enquanto a página Big Sur declara a NS6 original como não suportada. Isto torna um Mac moderno — sobretudo Apple Silicon — um alvo inadequado para o primeiro release, apesar de o Mixxx em si suportar macOS moderno. ### Linux

Há agora uma alternativa muito interessante, mas ainda experimental. O projeto comunitário `numark-ns6-linux` implementa um daemon userspace em C usando libusb, ALSA Sequencer para MIDI e PipeWire para áudio 4 canais 44,1 kHz S24_3LE. O autor documenta testes de MIDI, LEDs, áudio e recuperação USB. A 5 de novembro de 2026 foi documentado um teste em hardware no qual duas interrupções USB foram recuperadas sem reiniciar o Mixxx, mantendo o mesmo endpoint ALSA/PipeWire. Também foi observado um FIFO overrun MIDI durante reconexão, e o próprio projeto deixa claro que o teste foi realizado num único portátil Ubuntu e necessita de validação mais ampla. **Inferência:** Linux pode acabar por ser o melhor “appliance OS” para o Studio DJ — boot direto, serviços mínimos, controlo total do scheduler e ausência de atualizações disruptivas — mas **não é ainda a opção de menor risco**. Eu criaria uma segunda matriz de testes para ele depois de o MVP Windows estar funcional.

### Isolamento real-time

O motor do Mixxx foi desenhado com uma separação clara: o callback de áudio é um thread sensível a deadlines e qualquer I/O ou lock bloqueante pode provocar xruns; a própria documentação de arquitetura diz explicitamente “no allocations, no locks” no engine thread. A leitura de faixas já é feita com `CachingReader`, que mantém decoding/I/O num worker e entrega dados ao callback por mecanismos adequados a real-time. Portanto, o Studio DJ não deve “otimizar” o motor substituindo esta infraestrutura. O que devemos fazer é **não introduzir trabalho novo no caminho real-time**.

O modelo deve ser:

```text
                           THREADS NÃO REAL-TIME
┌───────────────┐        ┌─────────────────────┐
│ NS6 MIDI      │───────▶│ Controller / UI     │
└───────────────┘        └──────────┬──────────┘
                                    │ ControlObjects
                                    ▼
                         ┌─────────────────────┐
                         │ Estado Mixxx        │
                         └──────────┬──────────┘
                                    │ atomics / queues
                                    ▼
┌────────────────────────────────────────────────────────┐
│              AUDIO CALLBACK — REAL TIME                │
│  decode cache → rate/scratch → EQ/FX → mixer → output │
│  ZERO disk IO / ZERO blocking locks / ZERO ML         │
└────────────────────────────────────────────────────────┘

       PROCESSO OFFLINE / LOW PRIORITY
┌──────────────────────────────────────────────┐
│ Prepare: waveform / ML / stems / similarity │
│ pausa automaticamente em Performance Mode   │
└──────────────────────────────────────────────┘
```

## Prepare, biblioteca e possibilidade de superar o Rekordbox

É nesta área que o Studio DJ tem maior potencial de diferenciação. Em performance, a AlphaTheta já tem um workflow amadurecido; não há grande vantagem em reinventá-lo. No Prepare, podemos ser mais abertos, mais rápidos e mais personalizáveis.

O Rekordbox 7 já possui Intelligent Cue Creation, análise de BPM/grid, key/phrase, deteção de vocais, Intelligent Playlists e Collection Radar. Portanto “auto-cues” ou “detetar vocais” isoladamente não são diferenciais. ### Track DNA

A nossa vantagem pode ser uma representação aberta e inspecionável da faixa:

```text
TrackDNA
  bpm + confidence
  downbeats
  beat grid
  key + confidence
  loudness
  sections[]
      intro
      build
      breakdown
      drop
      outro
  energy_curve[]
  vocal_probability[]
  spectral_features[]
  suggested_cues[]
      reason
      confidence
      profile
```

**Hipótese:** para hard techno, hardcore e rawstyle, o maior ganho não virá de um classificador genérico `verse/chorus`; virá de downbeats robustos, mudança de densidade, kick onset/energy, breakdown/drop boundaries e regras ajustáveis pelo DJ. Isto precisa de um corpus próprio de validação; não encontrei benchmarks dos modelos pesquisados especificamente nestes subgéneros que permitam prometer precisão.

### Motores que fazem sentido

| Projeto | Utilização potencial | Estado/licença |
|---|---|---|
| Beat This! | Beats/downbeats | MIT; PyTorch ≥2; modelos ~8,1 ou ~78 MB; CPU ou GPU. |
| All-In-One | Estrutura + métrica | MIT; PyTorch + NATTEN + madmom + FFmpeg; instalação particularmente pesada em Windows. |
| Demucs | Stems | MIT; GPU recomendada; repo original arquivado em 2025; CPU possível mas pesado. |
| Essentia | Features, similarity, classificação | AGPLv3 para uso não comercial; modelos CC BY-NC-SA ou licença comercial. |
| CueIt | Referência para cues/estrutura/export | Alpha 2, MIT, DSP Rust; Beat This está atualmente desativado no próprio projeto enquanto é afinado. |
| pyrekordbox | Interoperabilidade Rekordbox | MIT; 0.5.0 de 14-10-2026 adicionou OneLibrary read/write. |
| rbox | Implementação Rust de formatos Rekordbox | GPLv3; trabalho ativo/experimental em formatos de export. |

Para o MVP, **não usaria nenhum modelo pesado durante performance**. Beat This e All-In-One só deveriam correr num worker externo quando o utilizador manda analisar faixas, e o worker deve poder ser suspenso imediatamente quando o Mixxx entra em Performance.

Demucs é ainda mais claro: o próprio projeto indica necessidade típica de vários GB de VRAM para GPU e, em CPU, tempos de processamento da ordem da duração da faixa ou superiores. ### Stems

O Mixxx 2.6 já está a desenvolver reprodução e controlo de ficheiros STEM, incluindo waveforms, analyzer, quick effect e control objects dedicados. No entanto, 2.6 ainda é beta/unreleased para live use. **Decisão:** stems não entram no MVP. Quando entrarem, serão **pré-processados**. Não quero Demucs a competir por CPU/GPU com quatro decks em palco.

### Base de dados: regra crítica

Mixxx guarda a biblioteca interna em `mixxxdb.sqlite`, mantém cache de tracks em memória e utiliza um pool de conexões para workers internos. Mais importante: `TrackCollectionManager` é a gateway autoritativa para operações mutáveis e as DAOs têm afinidade de thread. Logo, o companion Prepare **não deve abrir a base de dados ativa do Mixxx e escrever diretamente nela**.

Mesmo que ferramentas como CueIt já possuam exportador “Mixxx direct SQLite”, isso não torna escrita concorrente numa instância aberta uma API suportada. A fonte de verdade que recomendo é:

```text
Studio Library
  studio.db
  │
  ├─ fingerprints
  ├─ TrackDNA
  ├─ advanced cues
  ├─ sections
  ├─ similarity embeddings
  ├─ transition notes
  └─ analysis cache

             ↓ explicit sync/import

Mixxx Library
  mixxxdb.sqlite
  managed only by Mixxx APIs / internal code
```

Num fork futuro, podemos integrar a biblioteca Studio diretamente através de `TrackCollectionManager` ou implementar uma `ExternalTrackCollection`; fora do processo, usamos export/import controlado. ### Interoperabilidade Rekordbox e USB

Aqui é preciso ser conservador.

Desde 2026, a AlphaTheta tem duas famílias de bibliotecas USB. O CDJ-3000X utiliza OneLibrary; CDJ-3000, XDJ-XZ, RX3 e modelos anteriores relevantes continuam a usar Device Library. O rekordbox 7.2.11 escreve ambos os formatos numa exportação compatível. O Mixxx lê USBs Rekordbox e importa playlists, beatgrids, hot cues, memory cues e loops, mas isso não equivale a poder gerar um USB universalmente válido. pyrekordbox já consegue ler/escrever OneLibrary, ANLZ e XML; ferramentas mais recentes como rbox estão a avançar no suporte aos formatos, mas os próprios projetos avisam que as rotinas de export devem ser testadas em hardware real. **Decisão:** o primeiro Studio DJ exporta para um formato intermediário verificável e deixa o Rekordbox produzir o USB. “Exportar diretamente para CDJ” fica experimental até existir uma matriz física de CDJ-2000NXS2, CDJ-3000, CDJ-3000X, XDJ-XZ/RX3/AZ, com testes de playlists, waveform, grid, cues, loops e histórico.

### Licenciamento

O Mixxx é GPLv2 ou posterior. Um fork distribuído terá de cumprir essa licença. Essentia é especialmente problemática se pretenderes eventualmente distribuir uma versão comercial: a biblioteca é AGPLv3 para uso não comercial e os modelos são CC BY-NC-SA para uso não comercial, salvo acordo proprietário. Beat This!, All-In-One, Demucs e CueIt têm licenças MIT nas respetivas implementações analisadas, o que os torna mais simples do ponto de vista de integração, embora seja sempre necessário rever também as dependências e pesos/modelos específicos distribuídos. ## Arquitetura para ser realmente “super mega rápido”

A arquitetura que escolheria é deliberadamente pouco exótica.

```text
Studio DJ
│
├── mixxx/
│   └── Mixxx 2.5.6 upstream
│
├── skin/
│   ├── StudioDJ/
│   │   ├── skin.xml
│   │   ├── style.qss
│   │   ├── screens/
│   │   │   ├── Player2.xml
│   │   │   ├── Player4.xml
│   │   │   ├── Browse.xml
│   │   │   ├── TagList.xml
│   │   │   └── Utility.xml
│   │   ├── components/
│   │   │   ├── Deck.xml
│   │   │   ├── Waveform.xml
│   │   │   ├── TrackHeader.xml
│   │   │   ├── LoopStatus.xml
│   │   │   └── FxCompact.xml
│   │   └── assets/
│
├── controller/
│   ├── Numark NS6 Original.midi.xml
│   ├── ns6-hardware.js
│   ├── ns6-transport.js
│   ├── ns6-ui.js
│   └── ns6-tests/
│
├── prepare/
│   ├── studiod-analysis-worker
│   ├── studio.db
│   ├── cache/
│   └── models/
│
└── benchmarks/
    ├── startup/
    ├── library/
    ├── ui/
    ├── midi/
    └── audio/
```

### Performance UI

A biblioteca não deve instanciar 100 000 componentes gráficos só porque existem 100 000 músicas. No QML futuro, Qt recomenda usar modelos C++ apropriados para grandes quantidades de dados, delegates mínimos, criação lazy e item recycling; `ListView.reuseItems` existe precisamente para isso. Na skin 2.5.6, a biblioteca continuará a usar o modelo nativo do Mixxx. Isso é uma vantagem: evitamos reimplementar pesquisa e virtualização antes de ser necessário.

### Indexação

Para a biblioteca Studio, usaria SQLite próprio com:

```text
tracks
track_metadata
analysis_version
beatgrid
sections
cues
features
embeddings
transitions
```

e índices B-tree para título, artista, BPM, key, rating e tags. Para pesquisa textual livre, usaria SQLite FTS5 ou equivalente. Embeddings de similarity devem ficar num índice especializado opcional e carregado apenas no Prepare/Browse, nunca no engine de áudio.

A análise deve ser **incremental e content-addressed**:

```text
fingerprint(file)
+ analyzer_version
+ model_version
+ settings_hash
       ↓
analysis_cache_key
```

Assim uma faixa já analisada não volta a passar por Beat This/Demucs apenas porque a biblioteca foi reaberta.

### Waveforms

Em Performance, a waveform em movimento deve continuar a ser a waveform nativa do Mixxx. A nova UI só decide como a apresenta. Não colocaria um canvas web ou um segundo decoder de áudio a redesenhar a waveform.

No Prepare, podemos guardar uma pyramid multiresolução:

```text
waveform/
   64 samples/pixel
   256 samples/pixel
   1024 samples/pixel
   overview
```

para zoom instantâneo sem reler/decodificar a faixa inteira.

### Web frontend

Eu descartaria uma frontend React/Electron/Qt WebEngine para o Performance. Qt WebEngine executa rendering/JavaScript em processos Chromium separados e requer componentes adicionais no deployment. Isso é excelente para isolamento web, mas é exatamente o oposto do nosso objetivo de footprint mínimo e integração simples. Uma web UI continua a fazer sentido para **Studio Prepare remoto**, por exemplo abrir a biblioteca num tablet ou browser, mas nunca deve ser necessária para o áudio continuar a tocar.

### Comparação arquitetural

| Arquitetura | Latência/overhead | Velocidade para chegar ao MVP | Liberdade UI | Manutenção | Decisão |
|---|---:|---:|---:|---:|---|
| XML/QSS Mixxx 2.5.6 | **mínimo** | **muito alta** | média/alta | baixa | **MVP** |
| QML dentro do Mixxx | baixo | média/baixa hoje | **muito alta** | média | **futuro principal** |
| Fork C++/QML | baixo | baixa | total | **alta** | só depois de validar produto |
| Web frontend + bridge | médio/alto | média | total | alta | não para live |
| Companion Prepare | zero no audio path quando parado | alta | total | média | **sim** |

## Metas de desempenho e plano de validação

Nenhum dos números seguintes é um benchmark já obtido. São **critérios de aceitação propostos**. Até executarmos estes testes em hardware real, devem ser tratados como metas.

A Qt recomenda projetar interfaces 60 FPS com um budget aproximado de 16 ms por frame e medir com profiler em vez de otimizar por intuição. ### Metas

| Métrica | MVP aceitável | Objetivo Studio DJ | Como medir |
|---|---:|---:|---|
| UI FPS Performance | ≥ 55 FPS p95 | 60 FPS estáveis | PresentMon / Qt profiler / frame timestamps |
| Frame time p95 | < 18 ms | < 16,7 ms | 10 min com 4 waveforms |
| Frame time p99 | < 25 ms | < 20 ms | idem |
| MIDI → UI p95 | < 25 ms | < 12 ms | timestamp MIDI vs mudança renderizada |
| MIDI → áudio | não pior que Mixxx base | diferença < 1 ms vs baseline | loop MIDI/audio externo |
| Startup warm | < 4 s | < 2,5 s | 30 arranques |
| Startup cold | < 8 s | < 5 s | cache limpo, 30 testes |
| Abrir Browse | < 100 ms | < 50 ms | instrumentação |
| Pesquisa 10k tracks | < 50 ms | < 20 ms | queries fixas |
| Pesquisa 100k tracks | < 150 ms | < 60 ms | queries fixas |
| Pesquisa 1M tracks | < 500 ms | < 200 ms | dataset sintético + real |
| Load track local SSD p95 | < 500 ms | < 250 ms | 100 loads WAV/FLAC/MP3 |
| Scroll biblioteca | sem frames >50 ms | p99 <20 ms | stress scroll |
| Xruns 4 decks / 4 h | 0 desejado | **0 obrigatório** no hardware certificado | logs Mixxx/driver |
| Crash 8 h set | 0 | 0 | soak test repetido |
| RAM Performance | < 1 GB | < 600 MB sem Prepare | RSS/working set |
| CPU UI idle | < 5% de 1 core | < 2% | profiler por máquina |
| Prepare CPU | configurável | ≤ N−2 cores em live-capable PC | worker quota |
| Disk cache | previsível/configurável | < 10 GB base sem stems | medir library fixtures |

As metas de pesquisa em 1 milhão de faixas não significam que o Mixxx atual tenha ou não estes números. Servem para evitar que uma nova biblioteca seja desenhada apenas para a coleção atual.

### Áudio

Não confundiria nunca FPS com latência áudio.

Para cada máquina testaríamos 64/128/256/512 frames e registaríamos:

```text
buffer
reported latency
measured loopback RTT
xruns
CPU callback p50/p95/p99/max
4 deck load
scratch load
keylock load
FX load
disk contention
```

O objetivo não deve ser “o menor buffer que abre”. É o menor buffer que sobrevive a quatro decks, scratch, keylock, waveforms, pesquisa e USB durante horas sem um único xrun.

Mixxx recomenda ASIO em Windows e ALSA/JACK em Linux para baixa latência e avisa que as escolhas de API afetam fortemente a latência. ### Matriz mínima de hardware

Eu certificaria pelo menos estas classes, não assumindo nada sobre o teu computador:

| Classe | CPU | RAM | GPU | Disco | Propósito |
|---|---|---:|---|---|---|
| Low | Intel 4c/8t 2017–2019 ou equivalente | 8 GB | iGPU | SATA SSD | piso mínimo |
| Mid | 6c/12t 2020–2022 | 16 GB | iGPU | NVMe | alvo principal |
| Modern | Ryzen 5/7 ou Core Ultra / Apple-equivalent para UI tests | 16–32 GB | iGPU | NVMe | margem |
| Stress | CPU limitada artificialmente | 8 GB | iGPU | SSD lento | regressões |

OS certificados inicialmente:

```text
Windows 10 + Numark 2.9.64 + ASIO  ← PRIMARY

Linux Ubuntu/PipeWire + ns6d       ← EXPERIMENTAL

macOS moderno                       ← NO-GO para NS6 audio,
                                      salvo driver próprio validado
Windows 11                          ← NO-GO oficial para NS6 original
```

Esta classificação é baseada no suporte oficial atual da Numark e no estado experimental do driver Linux comunitário. ### Testes que têm de passar antes de tocar em público

A suite deve incluir uma sessão de oito horas a quatro decks; 1000 load/eject cycles; troca 1↔3 / 2↔4 durante playback; pitch takeover nos quatro decks; scratch/backspin repetido; PFL simples e múltiplo; todos os loops e hot cues; reconexão USB; retirar e voltar a inserir dispositivo de música; abrir/fechar Browse milhares de vezes; pesquisa contínua enquanto quatro decks tocam; shutdown/restart inesperado; crash recovery; e comparação byte/MIDI dos LEDs antes/depois do refactor.

Isto é uma **proposta de teste**, não um resultado já obtido.

## Roadmap, decisões go/no-go e recomendação final

O roadmap que maximiza velocidade de entrega é diferente do roadmap que maximiza novidade tecnológica.

| Fase | Resultado | Esforço condicional* | Go/no-go |
|---|---|---:|---|
| Hardware baseline | NS6 + Mixxx 2.5.6 + áudio estável | 2–5 dias | 4 decks, 0 xruns em soak inicial |
| Mapping freeze | testes do mapping atual + PFL fix + fast boot | 4–8 dias | nenhuma regressão transport/jog |
| UI MVP | Player 2/4 + Browse + Tag List | 1–3 semanas | set completo sem rato |
| CDJ parity | Slip/Quantize/BeatJump/hotcue banks/load lock/preview | 1–3 semanas | matriz de equivalência funcional |
| Prepare v1 | beatgrid/cues/waveform/metadata | 2–4 semanas | nunca interfere no live engine |
| Track DNA | beat/downbeat/structure/energy | 3–8 semanas | validação em corpus próprio |
| Rekordbox interop | XML/OneLibrary experimental | 2–6 semanas | testes físicos por player |
| QML migration | nova frontend nativa | 4–12+ semanas | só quando upstream estiver suficientemente estável |

\*Estas são **estimativas de engenharia**, não prazos garantidos. Pressupõem uma pessoa experiente em Qt/Mixxx/JS/C++ a trabalhar focada; hardware quirks ou bugs de driver podem aumentar significativamente o esforço.

O primeiro **go/no-go verdadeiro** deve acontecer antes de desenhar mais UI: a NS6 tem de tocar quatro decks durante várias horas na máquina-alvo com o áudio que pretendes usar. Se isso falhar, trocar de frontend não resolve nada.

O segundo go/no-go é o mapping. Os comportamentos especiais de jog, mensagens malformadas, reconexão, takeover e LEDs devem sobreviver intactos ao refactor. O mapping que enviaste já contém demasiado conhecimento específico do hardware para ser descartado. fileciteturn2file0

O terceiro é o UI. Se a skin XML/QSS conseguir o Player/Browse/TagList que queremos a 60 FPS com o motor estável, **não há razão técnica para fazer um fork antes do Prepare v1 estar pronto**.

A recomendação concreta é:

**Studio DJ Performance v0.1 = Mixxx 2.5.6 inalterado no motor + NS6 mapping corrigido + nova skin nativa minimalista.**

**Studio Prepare v0.1 = processo separado + `studio.db` + análise incremental + integração explícita com Mixxx.**

**Studio DJ Next = QML, acompanhando a nova arquitetura upstream do Mixxx, sem carregar um fork enorme antes de a migração QML do próprio projeto amadurecer.** O trabalho do LateNight QML mostra que decks, waveforms, mixer, FX e layouts responsivos já são possíveis, mas também confirma que Library/Preview ainda estão em transição. **Não usaria WebEngine no ecrã live. Não colocaria ML no processo de áudio. Não escreveria concorrentemente no `mixxxdb.sqlite`. Não começaria por stems. Não prometeria USBs CDJ diretos antes de testes físicos. Não abandonaria o mapping que já tens.**

Pode realmente superar o Rekordbox? **Na experiência específica da tua NS6, sim, realisticamente.** Podemos eliminar o mixer virtual redundante, dar acesso direto a toda a informação relevante, tornar o Browse/TagList físico e criar uma experiência coerente 1/3–2/4 que o Rekordbox não foi desenhado especificamente para esta controladora antiga. Esta conclusão é uma inferência de produto, não um benchmark. A NS6 já dispõe fisicamente de navegação sem rato, layers, strip search, hot cues, loops e FX routing adequados a essa abordagem. Pode superar globalmente o Rekordbox em tudo? **Não é uma meta realista no curto prazo.** O Rekordbox tem integração proprietária direta com toda a família AlphaTheta, Cloud Analysis, phrase/vocal analysis e formatos oficiais de export USB. Onde o Studio DJ pode realisticamente tornar-se superior é na combinação de **interface muito mais limpa + hardware legacy de alta qualidade + workflow CDJ + preparação aberta/personalizável + funcionamento local + liberdade de mappings + ferramentas de análise transparentes**.

E, sobretudo, existe uma versão útil desse produto que não exige anos de desenvolvimento: **o core já existe no Mixxx, o teu mapping já contém grande parte do trabalho difícil da NS6 e a primeira UI pode ser inteiramente nativa e muito leve.**
