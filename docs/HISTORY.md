# Histórico

- 25/11/2026: NS6 Lab v0.1, HTML WebGL interativo offline com controlos simulados, sem áudio/MIDI, não dimensionalmente exato.
- Conceitos gráficos Apple × CDJ, hardware-first; refinamento para menos FX e menos automação.
- Investigação aprofundada concluída (ver research/).
- Importação original NS6: 383 bindings MIDI e JS, baseline com hashes; 6 testes originais e 7 overlay mockados passaram.
- Branch experimental bootstrap/v0.0.1: XML/QSS e overlay JS, perfil isolado, testes CI. Run 45556700442 passou arranque em Mixxx 2.5.6/Xvfb e gerou pacote. A captura real foi visualmente rejeitada; isto não certifica UI, hardware nem áudio.
- Revisões 0.0.3/0.0.4: novas tentativas de layout, não aprovadas. Não afirmar benchmark ou paridade CDJ.
- Decisão do utilizador: suspender implementação e deixar o repositório como arquivo de assets e documentação. Preservar histórico sem fazer merge das skins.
