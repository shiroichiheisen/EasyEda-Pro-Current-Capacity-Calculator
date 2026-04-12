# PCB Trace Current Capacity Calculator

Extensão para **EasyEDA Pro** que calcula a capacidade máxima de corrente de cada trilha do PCB com base no padrão **IPC-2221B**, incluindo visualização em canvas 2D.

## Funcionalidades

- **Cálculo IPC-2221B** — `I = k × ΔT^0.44 × A^0.725` (k=0.048 externo, k=0.024 interno)
- **Filtragem por camadas copper** — somente camadas de cobre são processadas (Top, Bottom, Inner), excluindo silkscreen, soldermask, paste, etc.
- **Presets JLCPCB** — espessuras de cobre pré-configuradas (2L 1oz, 2L 2oz, 4L 1oz, 4L 2oz, 6L 1oz)
- **Tabela ordenável** — Net, Layer, Width, Length, Segmentos, Área (mil²), I max, Resistência, Queda de tensão, Posição
- **Cards de resumo** — Grupos, Nets, Min/Max/Avg I max, Comprimento total
- **Sidebar de bottlenecks** — nets ordenados pela menor corrente máxima
- **Filtro por layer e busca** — filtre trilhas por camada ou pesquise por nome de net
- **Filtro Min/Max I** — limite a visualização por faixa de corrente
- **Exportação CSV** — exporte a tabela completa
- **Visualização em Canvas** — mapa de calor 2D com escala dinâmica de corrente
  - Pan/zoom com mouse
  - Hover com detalhes da trilha (corrente, net, layer, largura)
  - Seleção de net (clique no bottleneck ou na trilha)
  - Escala de cores dinâmica baseada na corrente máxima real do PCB
  - Filtros: ΔT, Min I, Max I, Layer, Vias
  - Legenda adaptativa

## Fórmulas

| Cálculo | Fórmula |
|---|---|
| Corrente máxima | `I = k × ΔT^0.44 × (W × T)^0.725` |
| Resistência | `R = ρ × L / (W × T)` com ρ ajustado pela temperatura |
| Queda de tensão | `V = I × R` |
| Elevação de temperatura | Invertida da fórmula IPC-2221B |

Onde:
- `k` = 0.048 (camada externa), 0.024 (camada interna)
- `W` = largura da trilha (mil)
- `T` = espessura do cobre (mil)
- `ΔT` = elevação de temperatura acima da ambiente (°C)
- `ρ` = resistividade do cobre: 1.724×10⁻⁵ Ω·mm a 20°C, α = 3.93×10⁻³/°C

## Estrutura

```
easyeda-current-capacity/
├── extension.json          # Manifesto da extensão
├── dist/
│   └── index.js            # Entry point — extração de dados PCB
├── iframe/
│   ├── index.html          # UI principal — tabela, cards, settings
│   ├── current-calc.js     # Motor de cálculo IPC-2221B
│   └── current-viz.html    # Visualização canvas 2D
└── README.md
```

## Instalação

1. Gere o arquivo `.eext` (ZIP com caminhos usando `/`)
2. No EasyEDA Pro: **Extensions → Extension Manager → Load from local**
3. Selecione o arquivo `.eext`

## Uso

1. Abra um PCB no EasyEDA Pro
2. Menu: **Current Capacity → Calculate Current Capacity...**
3. Configure o ΔT e espessura do cobre no painel de Settings
4. Clique em **Visualize** para abrir o mapa de calor

## Changelog
### v1.9.0
- **Board outline clipping para Fills** — `pcb_PrimitiveFill` agora é clipado ao board outline (Sutherland-Hodgman), igual aos Pours. Fills que se estendiam além da placa (coordenadas raw da API) agora aparecem no tamanho correto.
- **Correção de largura de arcos** — a API `pcb_PrimitiveArc.lineWidth` retorna um valor default (10 mil) para todos os arcos. Implementada herança de largura: arcos herdam a width do line segment conectado (mesmo net/layer, endpoint com snap de 5µm). Segunda passada propaga para arcos encadeados (arc→arc→line).
- **Checkbox "Zones"** — adicionado na página principal (tabela) e na visualização canvas, ambos desmarcados por padrão. Ao desmarcar, zonas são excluídas da tabela, cards, sidebar, legenda, statistics e bottleneck list. A escala de cores e `globalMaxI` são recalculados dinamicamente.
- **Debug expandido** — `arcSamples` (10 arcos com width/iMax/segs), `lineSamples` (5 lines), `widthDistribution` (widths únicos com contagem), `arcWidthFix` (stats da correção), `rawSamples` com ALL properties da API para Arc/Line/Pad/Pour/Fill, `_rawPoly`/`_rawBounds` para Fills.
### v1.5.0
- **Heatmap 2D em grid** — substituída a análise por faixas (strips H/V + dropdown) por um grid 30×30 que calcula automaticamente `min(largura↔, altura↕)` em cada célula. Cada célula da zona recebe a corrente IPC-2221B baseada na menor dimensão (gargalo), sem necessidade de trocar direção.
- **Visualização automática** — removido o dropdown de direção de fluxo (↕/↔/Min). A visualização agora mostra o pior caso em cada ponto automaticamente.
- **Hover com dimensões** — ao passar o mouse sobre a zona, mostra a corrente da célula + largura horizontal (↔) + altura vertical (↕) + corrente mínima da zona.

### v1.4.0
- **Análise de corrente por faixa (strip analysis)** — zonas/pours são fatiadas em 40 faixas horizontais e verticais. Cada faixa mede a largura real do cobre naquela posição usando scan-line no polígono, calculando a corrente IPC-2221B individualmente. Identifica gargalos em formas como "C", "L", "T" etc.
- **Seletor de direção de fluxo** — dropdown na visualização: ↕ Vertical flow (faixas horizontais), ↔ Horizontal flow (faixas verticais), ou Min (bottleneck) que mostra o pior caso de ambas as direções.
- **Heatmap por faixa** — cada faixa da zona é colorida independentemente pela sua corrente, revelando visualmente onde o pour é estreito (vermelho) vs largo (verde).
- **Hover com corrente local** — ao passar o mouse sobre uma zona, mostra a corrente da faixa específica + largura efetiva + corrente mínima (bottleneck) da zona inteira.
- **Point-in-polygon** — detecção de hover agora usa ray-casting em vez de bounding box, preciso para polígonos não-retangulares.
- **Checkbox de seleção na tabela** — cada linha da tabela tem checkbox para selecionar trilhas individualmente, com Select All no header.
- **Card de seleção (⚡)** — ao selecionar trilhas, exibe corrente total somada (para trilhas em paralelo em múltiplas camadas), resistência equivalente em paralelo, e lista detalhada.
- **PCBs sem traces** — extensão agora abre normalmente em PCBs que só possuem copper pours/fills (sem trilhas).

### v1.3.0
- **Parser de `complexPolygon`** — pours e fills do EasyEDA Pro usam `complexPolygon.polygon` (array de coordenadas + comandos "L"/"R") em vez de `bounds`. Novo parser extrai os pontos do polígono, calcula bounding box e área via fórmula de Shoelace. Suporta polígonos genéricos e retângulos ("R").
- **Copper Fill support** — extração dedicada de `pcb_PrimitiveFill` com parsing de `complexPolygon`, agora processados como zonas com cálculo de corrente.
- **Detecção de copper layers corrigida** — substituída a detecção por keywords (que incluía Hole, 3D Shell, Ratline, Stiffener como copper) por whitelist fixa: IDs 1 (Top), 2 (Bottom), 15-46 (Inner1-32). Validada contra layers reais da API.
- **Botão Debug (🐛)** — exibe todos os dados brutos extraídos em JSON (amostras, APIs testadas, zonas), com botão Copy.
- **Probing de APIs extras** — testa automaticamente `pcb_PrimitiveSolidRegion`, `pcb_PrimitiveRegion`, `pcb_PrimitivePolygon`, `pcb_PrimitiveCopper`, `pcb_PrimitiveCopperArea`, `pcb_PrimitiveCircle`, `pcb_PrimitiveRect`, `pcb_PrimitiveTrack`, `pcb_PrimitiveShape`. APIs com `complexPolygon` ou bounds+copper são adicionadas como zonas.
- **Raw samples** — cada primitiva (Line, Arc, Via, Pad, Pour, Fill + extras) guarda amostra completa das propriedades da API, visíveis no Debug.
- **Zonas no canvas e tabela** — copper pours/fills agora aparecem com polígono correto (não mais retângulo vazio), incluindo cálculo de corrente, hover, e visualização.

### v1.2.0
- **Detecção de camadas copper aprimorada** — adicionado `'pin'` e `'float'` à lista de keywords não-cobre, corrigindo a inclusão indevida da camada "Pin Floating Layer"
- **Canvas corrigido (180°)** — eixo Y invertido em `worldToScreen`/`screenToWorld` para orientação top-down correta (igual ao EasyEDA)
- **Drag vertical corrigido** — sentido do arraste vertical ajustado para corresponder à inversão do eixo Y
- **Max I no textbox** — o campo Max I agora exibe a corrente máxima real como placeholder quando vazio
- **Stackup simplificado** — removido dropdown de presets JLCPCB; espessura de cobre agora é inserida diretamente em **oz** (outer e inner), com conversão automática para mm (1 oz = 0.035 mm)
- **Compatibilidade de stackup** — carrega configurações salvas no formato antigo (mm) e converte para oz

### v1.1.0
- Filtragem de camadas copper aprimorada — exclui silkscreen, soldermask, paste e outras camadas não-cobre por keywords
- Visualização canvas: escala de corrente dinâmica baseada na corrente máxima real (em vez de 10A/15A fixos)
- Visualização canvas: legenda com valores adaptativos
- Visualização canvas: filtro copper-only em todas as funções (draw, fitView, recalculate, findTraceAt, populateFilters)
- Adicionado filtro **Max I** na toolbar da visualização
- Gradiente da barra de legenda usa quartis da corrente máxima real

### v1.0.0
- Release inicial
- Cálculo IPC-2221B completo (corrente max, resistência, queda de tensão, elevação de temperatura)
- Presets JLCPCB (2L/4L/6L, 1oz/2oz)
- Tabela ordenável com sidebar de bottlenecks
- Visualização canvas 2D com pan/zoom e hover
- Exportação CSV

## Licença

MIT
