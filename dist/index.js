"use strict";
var edaEsbuildExportName = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  var src_exports = {};
  __export(src_exports, {
    about: () => about,
    activate: () => activate,
    runCurrentCalc: () => runCurrentCalc
  });

  var version = "1.3.0";

  function activate(_status, _arg) {}

  function about() {
    eda.sys_Dialog.showInformationMessage(
      "PCB Trace Current Capacity Calculator v" + version +
      "\n\nCalculates maximum current capacity per IPC-2221B standard for each PCB trace.",
      "About"
    );
  }

  var STORAGE_KEY = "current-capacity-data";
  var STACKUP_STORAGE_KEY = "current-capacity-stackup";

  function toast(msg, type, timer) {
    if (type === void 0) type = "info";
    if (timer === void 0) timer = 3;
    try {
      eda.sys_Message.showToastMessage(msg, type, timer);
    } catch (e) {}
  }

  var MIL_TO_MM = 0.0254;

  async function runCurrentCalc() {
    try {
      toast("Extracting PCB data...", "info", 5);
      var pcbData = await extractPCBData();

      var totalTraces = pcbData.lines.length + pcbData.arcs.length;
      var totalZones = (pcbData.zones || []).length;
      if (totalTraces === 0 && totalZones === 0) {
        toast("No traces or copper regions found", "warn");
        eda.sys_Dialog.showInformationMessage(
          "No traces or copper regions found. Please open a PCB project before using this extension.",
          "Warning"
        );
        return;
      }

      toast("Found " + pcbData.lines.length + " traces, " + pcbData.arcs.length + " arcs, " + pcbData.vias.length + " vias, " + (pcbData.zones || []).length + " zones", "success");

      var ok = await eda.sys_Storage.setExtensionUserConfig(STORAGE_KEY, pcbData);
      if (!ok) {
        toast("Failed to store data", "error");
        return;
      }

      toast("Opening current capacity calculator...", "info", 2);
      await eda.sys_IFrame.openIFrame(
        "/iframe/index.html",
        1200,
        800,
        "trace-current-capacity",
        {
          maximizeButton: true,
          minimizeButton: true,
          title: "PCB Trace Current Capacity"
        }
      );
    } catch (err) {
      toast("Error: " + (err && err.message ? err.message : err), "error", 5);
    }
  }

  async function extractPCBData() {
    var result = {
      unit: "mm",
      lines: [],
      arcs: [],
      vias: [],
      pads: [],
      zones: [],
      copperLayerCount: null,
      apiLayerNames: {},
      copperLayerIds: {},
      _rawSamples: {},
      _debugApis: {}
    };

    try {
      var apiLayerCount = await eda.pcb_Layer.getTheNumberOfCopperLayers();
      if (typeof apiLayerCount === 'number' && apiLayerCount > 0) {
        result.copperLayerCount = apiLayerCount;
      }
    } catch(e) {}

    try {
      var apiAllLayers = await eda.pcb_Layer.getAllLayers();
      if (Array.isArray(apiAllLayers)) {
        for (var ali = 0; ali < apiAllLayers.length; ali++) {
          var al = apiAllLayers[ali];
          if (al && al.id && al.name) {
            result.apiLayerNames[al.id] = al.name;
          }
        }
      }
    } catch(e) {}

    // Determine copper layer IDs — whitelist approach
    // EasyEDA Pro: 1=TopLayer, 2=BottomLayer, 15-46=Inner1-Inner32
    // All other IDs are non-copper (silk, mask, paste, hole, 3D, ratline, stiffener, etc.)
    var copperIds = {};
    // Always include standard copper layer IDs: 1 (Top), 2 (Bottom), 15-46 (Inner1-32)
    copperIds['1'] = true;
    copperIds['2'] = true;
    for (var ci = 15; ci <= 46; ci++) {
      copperIds[String(ci)] = true;
    }
    // Only keep IDs that actually exist in the layer list
    var validCopperIds = {};
    for (var cid in copperIds) {
      if (result.apiLayerNames[cid]) {
        validCopperIds[cid] = true;
      }
    }
    // If we have API layer names, use only validated ones; otherwise use full whitelist
    if (Object.keys(result.apiLayerNames).length > 0 && Object.keys(validCopperIds).length > 0) {
      copperIds = validCopperIds;
    }
    result.copperLayerIds = copperIds;

    function isCopperLayer(layerId) {
      return copperIds[String(layerId)] === true;
    }

    function captureSample(name, arr) {
      if (arr && arr.length > 0) {
        try {
          var s = arr[0];
          var props = {};
          for (var k in s) {
            try { props[k] = typeof s[k] === 'function' ? '[function]' : (typeof s[k] === 'object' && s[k] !== null ? JSON.parse(JSON.stringify(s[k])) : s[k]); } catch(e2) { props[k] = '[error]'; }
          }
          result._rawSamples[name] = { count: arr.length, sample: props };
        } catch(e) {}
      }
    }

    // Straight traces
    try {
      var lines = await eda.pcb_PrimitiveLine.getAll();
      captureSample('Line', lines);
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i];
        try {
          if (!isCopperLayer(l.layer)) continue;
          result.lines.push({
            type: "WIRE",
            id: l.primitiveId,
            startX: l.startX * MIL_TO_MM,
            startY: l.startY * MIL_TO_MM,
            endX: l.endX * MIL_TO_MM,
            endY: l.endY * MIL_TO_MM,
            width: l.lineWidth * MIL_TO_MM,
            layer: l.layer,
            net: l.net
          });
        } catch (e) {}
      }
    } catch (e) {}

    // Arcs
    try {
      var arcs = await eda.pcb_PrimitiveArc.getAll();
      captureSample('Arc', arcs);
      for (var i = 0; i < arcs.length; i++) {
        var a = arcs[i];
        try {
          if (!isCopperLayer(a.layer)) continue;
          var sx = a.startX * MIL_TO_MM, sy = a.startY * MIL_TO_MM;
          var ex = a.endX * MIL_TO_MM, ey = a.endY * MIL_TO_MM;
          var arcAngleDeg = a.arcAngle || 0;
          var arcObj = {
            type: "ARC",
            id: a.primitiveId,
            startX: sx, startY: sy,
            endX: ex, endY: ey,
            arcAngle: arcAngleDeg,
            width: a.lineWidth * MIL_TO_MM,
            layer: a.layer,
            net: a.net,
            arcSegments: null
          };
          // Subdivide arc into short line segments for precision
          if (Math.abs(arcAngleDeg) > 0.1) {
            var segs = subdivideArc(sx, sy, ex, ey, arcAngleDeg);
            if (segs && segs.length > 0) arcObj.arcSegments = segs;
          }
          result.arcs.push(arcObj);
        } catch (e) {}
      }
    } catch (e) {}

    // Arc subdivision: compute center from endpoints + arc angle, sample at ~5° intervals
    function subdivideArc(sx, sy, ex, ey, angleDeg) {
      var angleRad = angleDeg * Math.PI / 180;
      if (Math.abs(angleRad) < 1e-6) return null;
      // Midpoint of chord
      var mx = (sx + ex) / 2, my = (sy + ey) / 2;
      // Half chord length
      var dx = ex - sx, dy = ey - sy;
      var halfChord = Math.sqrt(dx * dx + dy * dy) / 2;
      if (halfChord < 1e-6) return null;
      // Distance from midpoint to center
      var halfAngle = angleRad / 2;
      var d = halfChord / Math.tan(halfAngle);
      // Unit normal to chord (perpendicular, pointing toward center)
      var nx = -dy / (2 * halfChord), ny = dx / (2 * halfChord);
      // Center
      var cx = mx + d * nx, cy = my + d * ny;
      // Radius
      var r = halfChord / Math.sin(Math.abs(halfAngle));
      // Start and end angles from center
      var startAngle = Math.atan2(sy - cy, sx - cx);
      var endAngle = Math.atan2(ey - cy, ex - cx);
      // Number of segments: ~5° each
      var nSegs = Math.max(2, Math.ceil(Math.abs(angleDeg) / 5));
      var stepAngle = angleRad / nSegs;
      var pts = [];
      for (var k = 0; k <= nSegs; k++) {
        var a = startAngle + k * stepAngle;
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
      }
      var segs = [];
      for (var k = 0; k < pts.length - 1; k++) {
        segs.push({ x1: pts[k].x, y1: pts[k].y, x2: pts[k + 1].x, y2: pts[k + 1].y });
      }
      return segs;
    }

    // ── Arc width fix: inherit width from connected line segments ──
    // The pcb_PrimitiveArc API often returns a default lineWidth (10 mil)
    // instead of the actual trace width. Fix by finding connected lines.
    try {
      var SNAP = 0.005; // 5µm snap tolerance
      // Build endpoint lookup: "net|layer|x|y" → width
      var epWidths = {};
      function snapKey(net, layer, x, y) {
        return net + '|' + layer + '|' + (Math.round(x / SNAP) * SNAP).toFixed(4) + '|' + (Math.round(y / SNAP) * SNAP).toFixed(4);
      }
      for (var li = 0; li < result.lines.length; li++) {
        var ll = result.lines[li];
        var k1 = snapKey(ll.net, ll.layer, ll.startX, ll.startY);
        var k2 = snapKey(ll.net, ll.layer, ll.endX, ll.endY);
        epWidths[k1] = ll.width;
        epWidths[k2] = ll.width;
      }
      // Also index arc endpoints for chained arcs
      // First pass: fix arcs connected to lines
      var arcFixed = 0;
      for (var ai = 0; ai < result.arcs.length; ai++) {
        var arc = result.arcs[ai];
        var ks = snapKey(arc.net, arc.layer, arc.startX, arc.startY);
        var ke = snapKey(arc.net, arc.layer, arc.endX, arc.endY);
        var lineW = epWidths[ks] || epWidths[ke];
        if (lineW && lineW !== arc.width) {
          arc._origWidth = arc.width;
          arc.width = lineW;
          arcFixed++;
        }
      }
      // Second pass: fix chained arcs (arc → arc → line)
      if (arcFixed > 0) {
        for (var ai2 = 0; ai2 < result.arcs.length; ai2++) {
          var arc2 = result.arcs[ai2];
          if (arc2._origWidth === undefined) continue; // already fixed
          // Register fixed arc endpoints
          var fk1 = snapKey(arc2.net, arc2.layer, arc2.startX, arc2.startY);
          var fk2 = snapKey(arc2.net, arc2.layer, arc2.endX, arc2.endY);
          epWidths[fk1] = arc2.width;
          epWidths[fk2] = arc2.width;
        }
        for (var ai3 = 0; ai3 < result.arcs.length; ai3++) {
          var arc3 = result.arcs[ai3];
          if (arc3._origWidth !== undefined) continue; // already fixed
          var ks3 = snapKey(arc3.net, arc3.layer, arc3.startX, arc3.startY);
          var ke3 = snapKey(arc3.net, arc3.layer, arc3.endX, arc3.endY);
          var chainW = epWidths[ks3] || epWidths[ke3];
          if (chainW && chainW !== arc3.width) {
            arc3._origWidth = arc3.width;
            arc3.width = chainW;
          }
        }
      }
      result._arcWidthFix = { total: result.arcs.length, fixed: arcFixed };
    } catch(e) {
      result._arcWidthFix = { error: String(e) };
    }

    // Vias
    try {
      var vias = await eda.pcb_PrimitiveVia.getAll();
      captureSample('Via', vias);
      for (var i = 0; i < vias.length; i++) {
        var v = vias[i];
        try {
          result.vias.push({
            type: "VIA",
            id: v.primitiveId,
            x: v.x * MIL_TO_MM,
            y: v.y * MIL_TO_MM,
            diameter: v.diameter * MIL_TO_MM,
            holeDiameter: v.holeDiameter * MIL_TO_MM,
            net: v.net
          });
        } catch (e) {}
      }
    } catch (e) {}

    // Pads
    try {
      var pads = await eda.pcb_PrimitivePad.getAll();
      captureSample('Pad', pads);
      for (var i = 0; i < pads.length; i++) {
        var p = pads[i];
        try {
          result.pads.push({
            type: "PAD",
            id: p.primitiveId,
            x: p.x * MIL_TO_MM,
            y: p.y * MIL_TO_MM,
            padWidth: p.pad[1] * MIL_TO_MM,
            padHeight: p.pad[2] * MIL_TO_MM,
            hole: p.hole ? {
              shape: p.hole[0],
              width: p.hole[1] * MIL_TO_MM,
              height: p.hole[2] * MIL_TO_MM
            } : null,
            layer: p.layer,
            net: p.net || "",
            padNumber: p.padNumber
          });
        } catch (e) {}
      }
    } catch (e) {}

    // ── Parse complexPolygon format used by Pour and Fill ──
    // Format: array of numbers + optional string commands
    // Pour: [x0, y0, "L", x1, y1, x2, y2, ...] → pairs of coords, skip string commands
    // Fill with "R": ["R", x1, y1, x2, y2, rx, ry] → rectangle
    function parseComplexPolygon(cp) {
      if (!cp || !cp.polygon || !Array.isArray(cp.polygon)) return null;
      var poly = cp.polygon;
      var points = [];
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      // Check for "R" rectangle: ["R", x1, y1, x2, y2, ...]
      if (poly.length >= 5 && poly[0] === 'R') {
        var rx1 = poly[1] * MIL_TO_MM, ry1 = poly[2] * MIL_TO_MM;
        var rx2 = poly[3] * MIL_TO_MM, ry2 = poly[4] * MIL_TO_MM;
        points = [
          { x: rx1, y: ry1 }, { x: rx2, y: ry1 },
          { x: rx2, y: ry2 }, { x: rx1, y: ry2 }
        ];
        minX = Math.min(rx1, rx2); minY = Math.min(ry1, ry2);
        maxX = Math.max(rx1, rx2); maxY = Math.max(ry1, ry2);
      } else {
        // General polygon: pairs of numbers, skip string commands
        var nums = [];
        for (var pi = 0; pi < poly.length; pi++) {
          if (typeof poly[pi] === 'number') nums.push(poly[pi]);
        }
        for (var pi = 0; pi + 1 < nums.length; pi += 2) {
          var px = nums[pi] * MIL_TO_MM;
          var py = nums[pi + 1] * MIL_TO_MM;
          points.push({ x: px, y: py });
          if (px < minX) minX = px; if (px > maxX) maxX = px;
          if (py < minY) minY = py; if (py > maxY) maxY = py;
        }
      }

      if (points.length < 3) return null;

      // Compute area via shoelace formula
      var area = 0;
      for (var ai = 0; ai < points.length; ai++) {
        var aj = (ai + 1) % points.length;
        area += points[ai].x * points[aj].y;
        area -= points[aj].x * points[ai].y;
      }
      area = Math.abs(area) / 2;

      return {
        outlinePoints: points,
        bounds: { minX: minX, minY: minY, maxX: maxX, maxY: maxY },
        boundsWidth: maxX - minX,
        boundsHeight: maxY - minY,
        areaMm2: area
      };
    }

    // ── Extract board outline ──
    var boardOutlinePoints = [];
    var boardOutlineDebug = {};
    try {
      // Find board outline layer by name
      var boardOutlineLayerId = null;
      for (var blid in result.apiLayerNames) {
        var lname = result.apiLayerNames[blid].toLowerCase();
        if (lname.indexOf('boardoutline') !== -1 || lname.indexOf('board outline') !== -1 ||
            lname.indexOf('板框') !== -1 || lname.indexOf('边框') !== -1) {
          boardOutlineLayerId = Number(blid);
          break;
        }
      }
      boardOutlineDebug.detectedLayer = boardOutlineLayerId;
      boardOutlineDebug.detectedLayerName = boardOutlineLayerId ? result.apiLayerNames[boardOutlineLayerId] : null;

      if (boardOutlineLayerId !== null) {
        // Collect lines on outline layer
        var olLines = [];
        try {
          var allLn = await eda.pcb_PrimitiveLine.getAll();
          for (var lni = 0; lni < allLn.length; lni++) {
            if (allLn[lni].layer === boardOutlineLayerId) {
              olLines.push({ startX: allLn[lni].startX, startY: allLn[lni].startY,
                endX: allLn[lni].endX, endY: allLn[lni].endY, id: allLn[lni].primitiveId });
            }
          }
        } catch(e) {}
        boardOutlineDebug.linesOnLayer = olLines.length;

        // Collect polylines on outline layer
        var olPolylines = [];
        try {
          if (eda.pcb_PrimitivePolyline && typeof eda.pcb_PrimitivePolyline.getAll === 'function') {
            var allPl = await eda.pcb_PrimitivePolyline.getAll();
            for (var pli = 0; pli < allPl.length; pli++) {
              if (allPl[pli].layer === boardOutlineLayerId) olPolylines.push(allPl[pli]);
            }
          }
        } catch(e) {}
        boardOutlineDebug.polylinesOnLayer = olPolylines.length;

        // Strategy 1: Polyline polygon
        if (boardOutlinePoints.length === 0 && olPolylines.length > 0) {
          for (var bpli = 0; bpli < olPolylines.length; bpli++) {
            var polyProp = olPolylines[bpli].polygon;
            var polyObj = null;
            try {
              if (typeof polyProp === 'string') polyObj = JSON.parse(polyProp);
              else if (typeof polyProp === 'object') polyObj = polyProp;
            } catch(e) {}
            if (!polyObj || !polyObj.polygon || !Array.isArray(polyObj.polygon)) continue;
            var poly = polyObj.polygon;
            if (poly[0] === 'R' && poly.length >= 5) {
              var bx = poly[1] * MIL_TO_MM, by = poly[2] * MIL_TO_MM;
              var bw = poly[3] * MIL_TO_MM, bh = poly[4] * MIL_TO_MM;
              boardOutlinePoints = [
                { x: bx, y: by - bh }, { x: bx + bw, y: by - bh },
                { x: bx + bw, y: by }, { x: bx, y: by }
              ];
            } else {
              var bNums = [];
              for (var bni = 0; bni < poly.length; bni++) {
                if (typeof poly[bni] === 'number') bNums.push(poly[bni]);
              }
              var bPts = [];
              for (var bni2 = 0; bni2 + 1 < bNums.length; bni2 += 2) {
                bPts.push({ x: bNums[bni2] * MIL_TO_MM, y: bNums[bni2 + 1] * MIL_TO_MM });
              }
              if (bPts.length >= 3) boardOutlinePoints = bPts;
            }
            if (boardOutlinePoints.length >= 3) { boardOutlineDebug.method = 'polyline'; break; }
          }
        }

        // Strategy 2: Chain line segments
        if (boardOutlinePoints.length === 0 && olLines.length >= 3) {
          var olSegs = [];
          for (var oli2 = 0; oli2 < olLines.length; oli2++) {
            var ol2 = olLines[oli2];
            olSegs.push({ x1: ol2.startX * MIL_TO_MM, y1: ol2.startY * MIL_TO_MM,
              x2: ol2.endX * MIL_TO_MM, y2: ol2.endY * MIL_TO_MM });
          }
          var usedSegs = new Array(olSegs.length);
          var chain = [{ x: olSegs[0].x1, y: olSegs[0].y1 }, { x: olSegs[0].x2, y: olSegs[0].y2 }];
          usedSegs[0] = true;
          var EPS = 0.01;
          for (var iter = 0; iter < olSegs.length; iter++) {
            var lastPt = chain[chain.length - 1];
            var found = false;
            for (var si = 0; si < olSegs.length; si++) {
              if (usedSegs[si]) continue;
              var s = olSegs[si];
              if (Math.abs(s.x1 - lastPt.x) + Math.abs(s.y1 - lastPt.y) < EPS) {
                chain.push({ x: s.x2, y: s.y2 }); usedSegs[si] = true; found = true; break;
              } else if (Math.abs(s.x2 - lastPt.x) + Math.abs(s.y2 - lastPt.y) < EPS) {
                chain.push({ x: s.x1, y: s.y1 }); usedSegs[si] = true; found = true; break;
              }
            }
            if (!found) break;
          }
          if (chain.length >= 3) {
            var fp = chain[0], lp = chain[chain.length - 1];
            if (Math.abs(fp.x - lp.x) + Math.abs(fp.y - lp.y) < EPS) chain.pop();
          }
          if (chain.length >= 3) { boardOutlinePoints = chain; boardOutlineDebug.method = 'lines'; }
        }

        // Strategy 3: getPrimitivesBBox fallback
        if (boardOutlinePoints.length === 0) {
          try {
            if (eda.pcb_Primitive && typeof eda.pcb_Primitive.getPrimitivesBBox === 'function') {
              var primIds = [];
              olLines.forEach(function(l) { primIds.push(l.id); });
              olPolylines.forEach(function(p) { if (p.primitiveId) primIds.push(p.primitiveId); });
              if (primIds.length > 0) {
                var bbox = await eda.pcb_Primitive.getPrimitivesBBox(primIds);
                if (bbox) {
                  var bMinX = bbox.minX * MIL_TO_MM, bMinY = bbox.minY * MIL_TO_MM;
                  var bMaxX = bbox.maxX * MIL_TO_MM, bMaxY = bbox.maxY * MIL_TO_MM;
                  boardOutlinePoints = [
                    { x: bMinX, y: bMinY }, { x: bMaxX, y: bMinY },
                    { x: bMaxX, y: bMaxY }, { x: bMinX, y: bMaxY }
                  ];
                  boardOutlineDebug.method = 'bbox';
                }
              }
            }
          } catch(e) {}
        }

        if (!boardOutlineDebug.method) boardOutlineDebug.method = 'none';
        boardOutlineDebug.finalPoints = boardOutlinePoints.length;
      }
    } catch(e) { boardOutlineDebug.error = e.message || String(e); }
    result.boardOutline = boardOutlinePoints.length >= 3 ? boardOutlinePoints : null;
    result._debugApis.boardOutlineDebug = boardOutlineDebug;

    // ── Sutherland-Hodgman polygon clipping ──
    function clipPolygon(subjectPts, clipPts) {
      if (!clipPts || clipPts.length < 3) return subjectPts;
      var output = subjectPts.slice();
      for (var ci = 0; ci < clipPts.length && output.length > 0; ci++) {
        var input = output;
        output = [];
        var edgeA = clipPts[ci];
        var edgeB = clipPts[(ci + 1) % clipPts.length];
        for (var ii = 0; ii < input.length; ii++) {
          var cur = input[ii];
          var prev = input[(ii + input.length - 1) % input.length];
          var curInside = crossProduct(edgeA, edgeB, cur) >= 0;
          var prevInside = crossProduct(edgeA, edgeB, prev) >= 0;
          if (curInside) {
            if (!prevInside) output.push(intersect(prev, cur, edgeA, edgeB));
            output.push(cur);
          } else if (prevInside) {
            output.push(intersect(prev, cur, edgeA, edgeB));
          }
        }
      }
      return output;
    }
    function crossProduct(a, b, p) {
      return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    }
    function intersect(p1, p2, p3, p4) {
      var x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
      var x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
      var denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(denom) < 1e-12) return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
      var t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
      return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
    }

    // Copper zones (pour)
    try {
      var pours = await eda.pcb_PrimitivePour.getAll();
      captureSample('Pour', pours);

      for (var i = 0; i < pours.length; i++) {
        try {
          var pour = pours[i];
          if (!isCopperLayer(pour.layer)) continue;
          var zoneEntry = {
            type: "ZONE",
            subType: "Pour",
            id: pour.primitiveId,
            net: pour.net,
            layer: pour.layer
          };

          var parsed = parseComplexPolygon(pour.complexPolygon);
          // Store raw polygon data for debug
          try {
            if (pour.complexPolygon && pour.complexPolygon.polygon) {
              var rawPoly = pour.complexPolygon.polygon;
              zoneEntry._rawPoly = rawPoly.slice(0, 12);
            }
          } catch(e) {}
          try { if (pour.x !== undefined) zoneEntry._rawX = pour.x; } catch(e) {}
          try { if (pour.y !== undefined) zoneEntry._rawY = pour.y; } catch(e) {}
          try {
            if (pour.bounds) {
              zoneEntry._rawBounds = JSON.parse(JSON.stringify(pour.bounds));
            }
          } catch(e) {}
          if (parsed) {
            var pts = parsed.outlinePoints;

            // Clip to board outline if available
            if (boardOutlinePoints.length >= 3 && pts.length >= 3) {
              var clipped = clipPolygon(pts, boardOutlinePoints);
              if (clipped.length >= 3) {
                pts = clipped;
                // Recompute bounds and area
                var cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
                var cArea = 0;
                for (var cpi = 0; cpi < pts.length; cpi++) {
                  if (pts[cpi].x < cMinX) cMinX = pts[cpi].x;
                  if (pts[cpi].x > cMaxX) cMaxX = pts[cpi].x;
                  if (pts[cpi].y < cMinY) cMinY = pts[cpi].y;
                  if (pts[cpi].y > cMaxY) cMaxY = pts[cpi].y;
                  var cnext = (cpi + 1) % pts.length;
                  cArea += pts[cpi].x * pts[cnext].y;
                  cArea -= pts[cnext].x * pts[cpi].y;
                }
                cArea = Math.abs(cArea) / 2;
                parsed = {
                  outlinePoints: pts,
                  bounds: { minX: cMinX, minY: cMinY, maxX: cMaxX, maxY: cMaxY },
                  boundsWidth: cMaxX - cMinX,
                  boundsHeight: cMaxY - cMinY,
                  areaMm2: cArea
                };
              }
            }

            zoneEntry.outlinePoints = parsed.outlinePoints;
            zoneEntry.bounds = parsed.bounds;
            zoneEntry.boundsWidth = parsed.boundsWidth;
            zoneEntry.boundsHeight = parsed.boundsHeight;
            zoneEntry.areaMm2 = parsed.areaMm2;
          }

          if (!zoneEntry.bounds) {
            try {
              if (pour.bounds) {
                var b = pour.bounds;
                zoneEntry.bounds = {
                  minX: (b.minX !== undefined ? b.minX : b.x) * MIL_TO_MM,
                  minY: (b.minY !== undefined ? b.minY : b.y) * MIL_TO_MM,
                  maxX: (b.maxX !== undefined ? b.maxX : (b.x + b.width)) * MIL_TO_MM,
                  maxY: (b.maxY !== undefined ? b.maxY : (b.y + b.height)) * MIL_TO_MM
                };
                zoneEntry.boundsWidth = Math.abs(zoneEntry.bounds.maxX - zoneEntry.bounds.minX);
                zoneEntry.boundsHeight = Math.abs(zoneEntry.bounds.maxY - zoneEntry.bounds.minY);
              }
            } catch(e) {}
          }

          if (!zoneEntry.areaMm2) {
            try { if (pour.area) zoneEntry.areaMm2 = pour.area * MIL_TO_MM * MIL_TO_MM; } catch(e) {}
          }
          try { if (pour.width) zoneEntry.width = pour.width * MIL_TO_MM; } catch(e) {}

          if (zoneEntry.bounds) result.zones.push(zoneEntry);
        } catch (e) {}
      }
    } catch (e) {}

    // Copper fills (pcb_PrimitiveFill)
    try {
      var fills = await eda.pcb_PrimitiveFill.getAll();
      captureSample('Fill', fills);
      for (var i = 0; i < fills.length; i++) {
        try {
          var fill = fills[i];
          if (!isCopperLayer(fill.layer)) continue;
          var fillEntry = {
            type: "ZONE",
            subType: "Fill",
            id: fill.primitiveId,
            net: fill.net || '',
            layer: fill.layer
          };
          var parsed = parseComplexPolygon(fill.complexPolygon);
          // Store raw polygon data for debug
          try {
            if (fill.complexPolygon && fill.complexPolygon.polygon) {
              var rawPoly = fill.complexPolygon.polygon;
              fillEntry._rawPoly = rawPoly.slice(0, 12);
            }
          } catch(e) {}
          try { if (fill.x !== undefined) fillEntry._rawX = fill.x; } catch(e) {}
          try { if (fill.y !== undefined) fillEntry._rawY = fill.y; } catch(e) {}
          try {
            if (fill.bounds) {
              fillEntry._rawBounds = JSON.parse(JSON.stringify(fill.bounds));
            }
          } catch(e) {}
          if (parsed) {
            var pts = parsed.outlinePoints;

            // Clip to board outline if available
            if (boardOutlinePoints.length >= 3 && pts.length >= 3) {
              var clipped = clipPolygon(pts, boardOutlinePoints);
              if (clipped.length >= 3) {
                pts = clipped;
                var cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
                var cArea = 0;
                for (var cpi = 0; cpi < pts.length; cpi++) {
                  if (pts[cpi].x < cMinX) cMinX = pts[cpi].x;
                  if (pts[cpi].x > cMaxX) cMaxX = pts[cpi].x;
                  if (pts[cpi].y < cMinY) cMinY = pts[cpi].y;
                  if (pts[cpi].y > cMaxY) cMaxY = pts[cpi].y;
                  var cnext = (cpi + 1) % pts.length;
                  cArea += pts[cpi].x * pts[cnext].y;
                  cArea -= pts[cnext].x * pts[cpi].y;
                }
                cArea = Math.abs(cArea) / 2;
                parsed = {
                  outlinePoints: pts,
                  bounds: { minX: cMinX, minY: cMinY, maxX: cMaxX, maxY: cMaxY },
                  boundsWidth: cMaxX - cMinX,
                  boundsHeight: cMaxY - cMinY,
                  areaMm2: cArea
                };
              }
            }

            fillEntry.outlinePoints = parsed.outlinePoints;
            fillEntry.bounds = parsed.bounds;
            fillEntry.boundsWidth = parsed.boundsWidth;
            fillEntry.boundsHeight = parsed.boundsHeight;
            fillEntry.areaMm2 = parsed.areaMm2;
          }
          if (fillEntry.bounds) result.zones.push(fillEntry);
        } catch (e) {}
      }
    } catch (e) {}

    // ── Try additional APIs for copper regions ──
    var extraApis = [
      'pcb_PrimitiveSolidRegion',
      'pcb_PrimitiveRegion',
      'pcb_PrimitivePolygon',
      'pcb_PrimitiveCopper',
      'pcb_PrimitiveCopperArea',
      'pcb_PrimitiveCircle',
      'pcb_PrimitiveRect',
      'pcb_PrimitiveTrack',
      'pcb_PrimitiveShape'
    ];
    for (var eai = 0; eai < extraApis.length; eai++) {
      var apiName = extraApis[eai];
      try {
        var apiObj = eda[apiName];
        if (apiObj && typeof apiObj.getAll === 'function') {
          var items = await apiObj.getAll();
          result._debugApis[apiName] = { available: true, count: items ? items.length : 0 };
          if (items && items.length > 0) {
            captureSample(apiName, items);
            // If items have layer+bounds/points → treat copper ones as zones
            for (var xi = 0; xi < items.length; xi++) {
              try {
                var it = items[xi];
                if (!it.layer) continue;
                if (!isCopperLayer(it.layer)) continue;
                var ze = { type: 'ZONE', subType: apiName, id: it.primitiveId || (apiName + '_' + xi), net: it.net || '', layer: it.layer };
                // Try complexPolygon first (same format as Pour/Fill)
                var eparsed = parseComplexPolygon(it.complexPolygon);
                if (eparsed) {
                  ze.outlinePoints = eparsed.outlinePoints;
                  ze.bounds = eparsed.bounds;
                  ze.boundsWidth = eparsed.boundsWidth;
                  ze.boundsHeight = eparsed.boundsHeight;
                  ze.areaMm2 = eparsed.areaMm2;
                }
                // Fallback: bounds
                if (!ze.bounds && it.bounds) {
                  var ib = it.bounds;
                  ze.bounds = {
                    minX: (ib.minX !== undefined ? ib.minX : ib.x) * MIL_TO_MM,
                    minY: (ib.minY !== undefined ? ib.minY : ib.y) * MIL_TO_MM,
                    maxX: (ib.maxX !== undefined ? ib.maxX : (ib.x + ib.width)) * MIL_TO_MM,
                    maxY: (ib.maxY !== undefined ? ib.maxY : (ib.y + ib.height)) * MIL_TO_MM
                  };
                  ze.boundsWidth = Math.abs(ze.bounds.maxX - ze.bounds.minX);
                  ze.boundsHeight = Math.abs(ze.bounds.maxY - ze.bounds.minY);
                }
                // Fallback: points / outlinePoints
                if (!ze.outlinePoints) {
                var pts = it.outlinePoints || it.points || it.contour;
                if (pts && pts.length > 0) {
                  ze.outlinePoints = [];
                  var pMinX = Infinity, pMinY = Infinity, pMaxX = -Infinity, pMaxY = -Infinity;
                  for (var pi2 = 0; pi2 < pts.length; pi2++) {
                    var px = (pts[pi2].x !== undefined ? pts[pi2].x : pts[pi2][0]) * MIL_TO_MM;
                    var py = (pts[pi2].y !== undefined ? pts[pi2].y : pts[pi2][1]) * MIL_TO_MM;
                    ze.outlinePoints.push({ x: px, y: py });
                    if (px < pMinX) pMinX = px; if (px > pMaxX) pMaxX = px;
                    if (py < pMinY) pMinY = py; if (py > pMaxY) pMaxY = py;
                  }
                  if (!ze.bounds && pMinX !== Infinity) {
                    ze.bounds = { minX: pMinX, minY: pMinY, maxX: pMaxX, maxY: pMaxY };
                    ze.boundsWidth = pMaxX - pMinX;
                    ze.boundsHeight = pMaxY - pMinY;
                  }
                }
                } // end if !ze.outlinePoints
                // area
                if (!ze.areaMm2 && it.area) ze.areaMm2 = it.area * MIL_TO_MM * MIL_TO_MM;
                if (ze.bounds) result.zones.push(ze);
              } catch(e) {}
            }
          }
        } else {
          result._debugApis[apiName] = { available: false };
        }
      } catch(e) {
        result._debugApis[apiName] = { available: false, error: e && e.message ? e.message : String(e) };
      }
    }

    // ── Attach holes to each zone (vias + THT pads with different net) ──
    function pointInPoly(px, py, pts) {
      var inside = false;
      for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        var xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
    }
    for (var zhi = 0; zhi < result.zones.length; zhi++) {
      var zz = result.zones[zhi];
      var zholes = [];
      var zpts = zz.outlinePoints;
      if (!zpts || zpts.length < 3) { zz.holes = zholes; continue; }
      // Vias with different net
      for (var vi2 = 0; vi2 < result.vias.length; vi2++) {
        var vv = result.vias[vi2];
        if (vv.net === zz.net) continue;
        if (pointInPoly(vv.x, vv.y, zpts)) {
          zholes.push({ x: vv.x, y: vv.y, diameter: vv.diameter });
        }
      }
      // THT pads (layer 12 = Multi-Layer) with hole and different net
      for (var pi3 = 0; pi3 < result.pads.length; pi3++) {
        var pp = result.pads[pi3];
        if (!pp.hole || pp.hole.width <= 0) continue;
        if (pp.net === zz.net) continue;
        if (pointInPoly(pp.x, pp.y, zpts)) {
          zholes.push({ x: pp.x, y: pp.y, diameter: Math.max(pp.padWidth, pp.padHeight) });
        }
      }
      zz.holes = zholes;
    }

    // ── Attach trace obstacles to each zone (lines/arcs on same layer, different net) ──
    for (var zti = 0; zti < result.zones.length; zti++) {
      var zt = result.zones[zti];
      var ztObs = [];
      var ztpts = zt.outlinePoints;
      if (!ztpts || ztpts.length < 3) { zt.traceObstacles = ztObs; continue; }
      var zb = zt.bounds;
      // Lines on same layer with different net overlapping zone bounds
      for (var li2 = 0; li2 < result.lines.length; li2++) {
        var ll = result.lines[li2];
        if (ll.layer !== zt.layer) continue;
        if (ll.net === zt.net) continue;
        var margin = ll.width / 2 + 2;
        var lMinX = Math.min(ll.startX, ll.endX) - margin;
        var lMaxX = Math.max(ll.startX, ll.endX) + margin;
        var lMinY = Math.min(ll.startY, ll.endY) - margin;
        var lMaxY = Math.max(ll.startY, ll.endY) + margin;
        if (lMaxX < zb.minX || lMinX > zb.maxX || lMaxY < zb.minY || lMinY > zb.maxY) continue;
        ztObs.push({ x1: ll.startX, y1: ll.startY, x2: ll.endX, y2: ll.endY, width: ll.width, net: ll.net });
      }
      // Arcs on same layer with different net — use subdivided segments if available
      for (var ai2 = 0; ai2 < result.arcs.length; ai2++) {
        var aa = result.arcs[ai2];
        if (aa.layer !== zt.layer) continue;
        if (aa.net === zt.net) continue;
        var margin2 = aa.width / 2 + 2;
        if (aa.arcSegments && aa.arcSegments.length > 0) {
          for (var asi = 0; asi < aa.arcSegments.length; asi++) {
            var as = aa.arcSegments[asi];
            var asMinX = Math.min(as.x1, as.x2) - margin2;
            var asMaxX = Math.max(as.x1, as.x2) + margin2;
            var asMinY = Math.min(as.y1, as.y2) - margin2;
            var asMaxY = Math.max(as.y1, as.y2) + margin2;
            if (asMaxX < zb.minX || asMinX > zb.maxX || asMaxY < zb.minY || asMinY > zb.maxY) continue;
            ztObs.push({ x1: as.x1, y1: as.y1, x2: as.x2, y2: as.y2, width: aa.width, net: aa.net });
          }
        } else {
          var aMinX = Math.min(aa.startX, aa.endX) - margin2;
          var aMaxX = Math.max(aa.startX, aa.endX) + margin2;
          var aMinY = Math.min(aa.startY, aa.endY) - margin2;
          var aMaxY = Math.max(aa.startY, aa.endY) + margin2;
          if (aMaxX < zb.minX || aMinX > zb.maxX || aMaxY < zb.minY || aMinY > zb.maxY) continue;
          ztObs.push({ x1: aa.startX, y1: aa.startY, x2: aa.endX, y2: aa.endY, width: aa.width, net: aa.net });
        }
      }
      zt.traceObstacles = ztObs;
    }

    // ── Attach SMD pad obstacles to each zone (pads without holes on same layer, different net) ──
    for (var zpi = 0; zpi < result.zones.length; zpi++) {
      var zp = result.zones[zpi];
      var zpObs = [];
      var zppts = zp.outlinePoints;
      if (!zppts || zppts.length < 3) { zp.padObstacles = zpObs; continue; }
      var zpb = zp.bounds;
      for (var pi4 = 0; pi4 < result.pads.length; pi4++) {
        var sp = result.pads[pi4];
        if (sp.hole && sp.hole.width > 0) continue; // THT pads already handled as holes
        if (sp.layer !== zp.layer) continue; // SMD pad must be on same layer
        if (sp.net === zp.net) continue; // different net only
        var pw2 = sp.padWidth / 2, ph2 = sp.padHeight / 2;
        if (sp.x + pw2 < zpb.minX || sp.x - pw2 > zpb.maxX ||
            sp.y + ph2 < zpb.minY || sp.y - ph2 > zpb.maxY) continue;
        if (!pointInPoly(sp.x, sp.y, zppts)) continue;
        zpObs.push({ x: sp.x, y: sp.y, width: sp.padWidth, height: sp.padHeight, net: sp.net });
      }
      zp.padObstacles = zpObs;
    }

    return result;
  }

  return __toCommonJS(src_exports);
})();
