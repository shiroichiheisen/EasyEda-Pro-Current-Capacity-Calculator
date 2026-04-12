// ═══════════════════════════════════════
// IPC-2221B Current Capacity Calculator
// ═══════════════════════════════════════
// Formula: I = k × ΔT^0.44 × A^0.725
// Where:
//   I = max current (A)
//   k = 0.048 (external/outer layers), 0.024 (internal layers)
//   ΔT = temperature rise above ambient (°C)
//   A = cross-sectional area (mil²) = width(mil) × thickness(mil)

var CurrentCalc = (function() {

  // JLCPCB standard copper thicknesses
  var JLCPCB_PRESETS = {
    '2L-1.6mm': {
      label: '2 Layer 1.6mm (1oz outer)',
      layers: 2,
      outerCopperOz: 1,
      innerCopperOz: 0,
      outerCopperMm: 0.035,
      innerCopperMm: 0
    },
    '2L-1.6mm-2oz': {
      label: '2 Layer 1.6mm (2oz outer)',
      layers: 2,
      outerCopperOz: 2,
      innerCopperOz: 0,
      outerCopperMm: 0.070,
      innerCopperMm: 0
    },
    '4L-1.6mm': {
      label: '4 Layer 1.6mm (1oz outer, 0.5oz inner)',
      layers: 4,
      outerCopperOz: 1,
      innerCopperOz: 0.5,
      outerCopperMm: 0.035,
      innerCopperMm: 0.0175
    },
    '4L-1.6mm-2oz': {
      label: '4 Layer 1.6mm (2oz outer, 1oz inner)',
      layers: 4,
      outerCopperOz: 2,
      innerCopperOz: 1,
      outerCopperMm: 0.070,
      innerCopperMm: 0.035
    },
    '6L-1.6mm': {
      label: '6 Layer 1.6mm (1oz outer, 0.5oz inner)',
      layers: 6,
      outerCopperOz: 1,
      innerCopperOz: 0.5,
      outerCopperMm: 0.035,
      innerCopperMm: 0.0175
    }
  };

  var MM_TO_MIL = 1 / 0.0254;

  /**
   * Calculate max current using IPC-2221B
   * @param {number} widthMm - trace width in mm
   * @param {number} thicknessMm - copper thickness in mm
   * @param {number} deltaT - temperature rise in °C
   * @param {boolean} isInternal - true for internal layers
   * @returns {number} max current in Amps
   */
  function calcMaxCurrent(widthMm, thicknessMm, deltaT, isInternal) {
    var widthMil = widthMm * MM_TO_MIL;
    var thickMil = thicknessMm * MM_TO_MIL;
    var area = widthMil * thickMil; // mil²
    if (area <= 0 || deltaT <= 0) return 0;
    var k = isInternal ? 0.024 : 0.048;
    return k * Math.pow(deltaT, 0.44) * Math.pow(area, 0.725);
  }

  /**
   * Calculate required width for a target current
   * @param {number} targetAmps - desired current in A
   * @param {number} thicknessMm - copper thickness in mm
   * @param {number} deltaT - temperature rise in °C
   * @param {boolean} isInternal - true for internal layers
   * @returns {number} required width in mm
   */
  function calcWidthForCurrent(targetAmps, thicknessMm, deltaT, isInternal) {
    if (targetAmps <= 0 || thicknessMm <= 0 || deltaT <= 0) return 0;
    var k = isInternal ? 0.024 : 0.048;
    // I = k * dT^0.44 * A^0.725
    // A = (I / (k * dT^0.44))^(1/0.725)
    var A = Math.pow(targetAmps / (k * Math.pow(deltaT, 0.44)), 1 / 0.725);
    var thickMil = thicknessMm * MM_TO_MIL;
    var widthMil = A / thickMil;
    return widthMil * 0.0254; // convert to mm
  }

  /**
   * Get temperature rise for a given current
   * @param {number} currentAmps - current in A
   * @param {number} widthMm - trace width in mm
   * @param {number} thicknessMm - copper thickness in mm
   * @param {boolean} isInternal - true for internal layers
   * @returns {number} temperature rise in °C
   */
  function calcTempRise(currentAmps, widthMm, thicknessMm, isInternal) {
    var widthMil = widthMm * MM_TO_MIL;
    var thickMil = thicknessMm * MM_TO_MIL;
    var area = widthMil * thickMil;
    if (area <= 0 || currentAmps <= 0) return 0;
    var k = isInternal ? 0.024 : 0.048;
    // I = k * dT^0.44 * A^0.725
    // dT = (I / (k * A^0.725))^(1/0.44)
    return Math.pow(currentAmps / (k * Math.pow(area, 0.725)), 1 / 0.44);
  }

  /**
   * Compute resistance of a trace segment
   * @param {number} lengthMm - trace length in mm
   * @param {number} widthMm - trace width in mm
   * @param {number} thicknessMm - copper thickness in mm
   * @param {number} tempC - conductor temperature in °C
   * @returns {number} resistance in ohms
   */
  function calcResistance(lengthMm, widthMm, thicknessMm, tempC) {
    if (widthMm <= 0 || thicknessMm <= 0 || lengthMm <= 0) return 0;
    // Copper resistivity at 20°C: 1.724e-8 Ω·m
    // Temperature coefficient: 3.93e-3 /°C
    var rho20 = 1.724e-5; // Ω·mm (converted from Ω·m)
    var alpha = 3.93e-3;
    var rho = rho20 * (1 + alpha * (tempC - 20));
    var area = widthMm * thicknessMm; // mm²
    return rho * lengthMm / area;
  }

  /**
   * Voltage drop across a trace
   */
  function calcVoltageDrop(currentAmps, resistance) {
    return currentAmps * resistance;
  }

  /**
   * Power dissipation in a trace
   */
  function calcPowerDissipation(currentAmps, resistance) {
    return currentAmps * currentAmps * resistance;
  }

  /**
   * Classify layer as internal or external
   */
  function isInternalLayer(layerId, copperLayerCount) {
    if (!copperLayerCount || copperLayerCount <= 2) {
      // 2-layer board: layer 1 = Top, layer 2 = Bottom, both external
      return false;
    }
    // Multi-layer: first and last copper layers are external
    // EasyEDA layer IDs: 1=Top, 2=Bottom, 3=Inner1, 4=Inner2, ...
    return layerId !== 1 && layerId !== 2;
  }

  return {
    JLCPCB_PRESETS: JLCPCB_PRESETS,
    MM_TO_MIL: MM_TO_MIL,
    calcMaxCurrent: calcMaxCurrent,
    calcWidthForCurrent: calcWidthForCurrent,
    calcTempRise: calcTempRise,
    calcResistance: calcResistance,
    calcVoltageDrop: calcVoltageDrop,
    calcPowerDissipation: calcPowerDissipation,
    isInternalLayer: isInternalLayer
  };
})();
