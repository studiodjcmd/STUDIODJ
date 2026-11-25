# Studio DJ — Product & Engineering Archive

**Status:** investigação e design arquivados. Implementação suspensa; nenhuma versão aprovada para tocar. **Hardware alvo:** Numark NS6 original (não NS6II). O conceito é transformar o computador no equivalente aos ecrãs de CDJ, mantendo a controladora como superfície física. Sem mixer virtual redundante, automação de mistura ou aprendizagem obrigatória.

## Documentação
| Documento | Conteúdo |
|---|---|
| [Product brief](docs/PRODUCT.md) | Objetivo, posicionamento, requisitos |
| [Performance UX](docs/specifications/PERFORMANCE.md) | Player, Browse, Tag List, Utility, estados, wireframes e aceitação |
| [Hardware e mapping](docs/specifications/NS6.md) | Controlos físicos, funcionamento atual e proposto, conflitos e testes |
| [Inventário MIDI completo](assets/controller/midi-bindings.csv) | Os 383 bindings extraídos diretamente do XML, sem inferência |
| [Matriz CDJ](docs/specifications/CDJ-PARITY.md) | Equivalências, lacunas e prioridades |
| [Prepare e biblioteca](docs/specifications/PREPARE.md) | Track DNA, Smart Cues, Transition, metadata e interoperabilidade |
| [Arquitetura](docs/specifications/ARCHITECTURE.md) | Contratos, boundaries, modelo de dados, cache e opções de stack |
| [Design system](docs/DESIGN.md) · [Especificação visual](docs/specifications/VISUAL.md) | Tipografia, grids, componentes, estados e critérios de revisão |
| [Testes e benchmarks](docs/specifications/VALIDATION.md) | Protocolo comparativo e critérios de aprovação |
| [DIY standalone](docs/specifications/STANDALONE.md) | Computador/ecrã/áudio, critérios de hardware e riscos |
| [Decisões e roadmap](docs/specifications/DECISIONS.md) | ADRs, milestones, dependências e questões abertas |
| [Pesquisa aprofundada original](research/feasibility-report.md) · [Fontes](research/SOURCES.md) | Relatório de 25/11/2026; dados históricos a rever |
| [Catálogo de assets](assets/README.md) · [Galeria](assets/images/GALLERY.md) | Imagens, manuais, screenshots e estado da transferência |
| [NS6 Lab interativo](assets/3d/ns6-studio.html) · [Notas 3D](assets/3d/README.md) | HTML WebGL procedural original; sem ligação real MIDI/áudio |
| [Histórico](docs/HISTORY.md) | Evidência das tentativas e decisões do utilizador |

## Regras de leitura
**Existente** significa observado no código/mapping, não certificado na NS6. **Proposto** significa especificação futura. **Hipótese** precisa de investigação. **Meta** é um valor a medir, não um benchmark obtido. O repositório é privado; não redistribuir manuais/mapping sem autorização/licença.

A main não contém o produto experimental. A branch [bootstrap/v0.0.1](../../tree/bootstrap/v0.0.1) e a [PR encerrada](../../pull/1) preservam as tentativas. O ZIP de arquivo da conversa contém os binários originais; o inventário indica quais ainda precisam ser adicionados ao GitHub.
