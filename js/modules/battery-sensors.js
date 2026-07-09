/** Battery API + sensores vs UA mobile */

import { finding, finalizeResult, parseUserAgent, withTimeout } from '../utils.js?v3';

async function readBattery() {
  if (!navigator.getBattery) return { available: false };
  try {
    const b = await navigator.getBattery();
    return {
      available: true,
      charging: b.charging,
      chargingTime: b.chargingTime,
      dischargingTime: b.dischargingTime,
      level: b.level,
    };
  } catch (e) {
    return { available: true, error: String(e.message || e) };
  }
}

function sensorSupport() {
  return {
    DeviceMotionEvent: typeof DeviceMotionEvent !== 'undefined',
    DeviceOrientationEvent: typeof DeviceOrientationEvent !== 'undefined',
    Accelerometer: typeof Accelerometer !== 'undefined',
    Gyroscope: typeof Gyroscope !== 'undefined',
  };
}

export async function run() {
  const findings = [];
  const ua = parseUserAgent();
  const battery = await withTimeout(readBattery(), 2000, { available: !!navigator.getBattery, error: 'timeout' });
  const sensors = sensorSupport();
  const raw = { battery, sensors, isMobile: ua.isMobile, os: ua.os };

  // Fake battery classic: level exactly 1, charging true, chargingTime 0 forever (common headless mock)
  if (battery.available && !battery.error) {
    if (
      battery.level === 1 &&
      battery.charging === true &&
      (battery.chargingTime === 0 || battery.chargingTime === Infinity) &&
      battery.dischargingTime === Infinity
    ) {
      findings.push(
        finding(
          'battery-perfect',
          'medium',
          'Battery "perfeita" (mock comum)',
          `level=${battery.level} charging=${battery.charging}`,
          -7,
          ['HEADLESS', 'BAD_FP'],
          0.65
        )
      );
    }
    // level outside 0-1
    if (typeof battery.level === 'number' && (battery.level < 0 || battery.level > 1)) {
      findings.push(
        finding(
          'battery-invalid',
          'high',
          'Battery.level invalido',
          String(battery.level),
          -12,
          ['BAD_FP'],
          0.95
        )
      );
    }
  }

  // Desktop with battery API is ok (laptops). Mobile UA without any motion APIs is slightly odd on real phones
  if (ua.isMobile && !sensors.DeviceMotionEvent && !sensors.DeviceOrientationEvent) {
    findings.push(
      finding(
        'sensors-mobile-missing',
        'medium',
        'UA mobile sem DeviceMotion/Orientation',
        'Telefone real geralmente expoe essas APIs (mesmo sem permissao)',
        -8,
        ['BAD_FP'],
        0.7
      )
    );
  }

  // getBattery hooked
  if (navigator.getBattery) {
    try {
      const s = Function.prototype.toString.call(navigator.getBattery);
      if (!/\[native code\]/.test(s)) {
        findings.push(
          finding(
            'battery-hook',
            'high',
            'getBattery nao nativo',
            '',
            -14,
            ['PROTOTYPE_LIE'],
            0.9
          )
        );
      }
    } catch {
      /* ignore */
    }
  }

  return finalizeResult('battery-sensors', 'Battery & Sensors', findings, raw);
}
