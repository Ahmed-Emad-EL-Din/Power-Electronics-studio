import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';

let dom: JSDOM;
let React: typeof import('react');
let act: typeof import('react').act;
let createRoot: typeof import('react-dom/client').createRoot;
let App: typeof import('./App').default;
let ErrorBoundary: typeof import('./components/ErrorBoundary').ErrorBoundary;
let InteractiveChart: typeof import('./components/InteractiveChart').InteractiveChart;

function setupDomEnvironment() {
  dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: 'http://localhost:3000/',
    pretendToBeVisual: true,
  });

  const win = dom.window as unknown as Window & typeof globalThis;
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: win.document, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: win.localStorage, configurable: true });
  Object.defineProperty(globalThis, 'HTMLElement', { value: win.HTMLElement, configurable: true });
  Object.defineProperty(globalThis, 'SVGElement', { value: win.SVGElement, configurable: true });
  Object.defineProperty(globalThis, 'Element', { value: win.Element, configurable: true });
  Object.defineProperty(globalThis, 'Node', { value: win.Node, configurable: true });
  Object.defineProperty(globalThis, 'MouseEvent', { value: win.MouseEvent, configurable: true });
  Object.defineProperty(globalThis, 'KeyboardEvent', { value: win.KeyboardEvent, configurable: true });
  Object.defineProperty(globalThis, 'getComputedStyle', { value: win.getComputedStyle, configurable: true });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });

  win.matchMedia = (query: string) =>
    ({
      matches: query.includes('dark') ? false : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;

  win.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  win.HTMLElement.prototype.scrollIntoView = () => {};
  if (!win.URL.createObjectURL) {
    win.URL.createObjectURL = () => 'blob:mock';
    win.URL.revokeObjectURL = () => {};
  }
  win.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
  win.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

async function flushAsync(ms = 60) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

function findButtonByText(container: ParentNode, text: string): HTMLButtonElement | undefined {
  const buttons = Array.from(container.querySelectorAll('button'));
  return buttons.find((b) => (b.textContent || '').replace(/\s+/g, ' ').trim().includes(text));
}

function assertAllButtonsAccessible(container: ParentNode, contextLabel: string) {
  const buttons = Array.from(container.querySelectorAll('button'));
  assert.ok(buttons.length > 0, `${contextLabel}: expected rendered buttons`);
  for (const btn of buttons) {
    const label = (
      btn.getAttribute('aria-label') ||
      btn.getAttribute('title') ||
      btn.textContent ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim();
    assert.ok(label.length > 0, `${contextLabel}: found unlabeled button: ${btn.outerHTML.slice(0, 120)}`);
    const typeAttr = btn.getAttribute('type');
    assert.ok(
      typeAttr === 'button' || typeAttr === 'submit' || typeAttr === 'reset',
      `${contextLabel}: button "${label}" should declare explicit type attribute (got "${typeAttr}")`
    );
  }
}

describe('Power Electronics Studio — Automated UI, Button, Theme & Code-Splitting Suite', () => {
  before(async () => {
    registerHooks({
      load(url, context, nextLoad) {
        if (url.endsWith('.css')) {
          return { format: 'module', shortCircuit: true, source: 'export default {};' };
        }
        return nextLoad(url, context);
      },
    });
    setupDomEnvironment();
    React = await import('react');
    act = React.act;
    ({ createRoot } = await import('react-dom/client'));
    ({ default: App } = await import('./App'));
    ({ ErrorBoundary } = await import('./components/ErrorBoundary'));
    ({ InteractiveChart } = await import('./components/InteractiveChart'));
  });

  after(() => {
    dom?.window.close();
  });

  it('index.html includes zero-flash theme script, inline SVG favicon, and instant boot shell', () => {
    const html = fs.readFileSync(path.resolve('index.html'), 'utf8');
    assert.ok(html.includes('pe-studio-theme-mode'), 'missing synchronous theme boot key');
    assert.ok(html.includes('<link rel="icon" type="image/svg+xml"'), 'missing inline SVG favicon');
    assert.ok(html.includes('class="pe-boot-shell"'), 'missing instant first-paint boot shell');
  });

  it('src/index.css keeps light-mode overrides unlayered and scopes .text-white inversion away from solid accent buttons', () => {
    const css = fs.readFileSync(path.resolve('src/index.css'), 'utf8');
    assert.ok(
      css.includes(':where(html:not(.dark))'),
      'expected unlayered :where(html:not(.dark)) overrides'
    );
    assert.ok(
      !css.includes('@layer base {\n  :where(html:not(.dark))'),
      'light-mode overrides must not be trapped inside @layer base'
    );
    assert.ok(
      css.includes(':where(.bg-slate-900, .bg-slate-900\\/95, .bg-slate-900\\/90, .bg-slate-900\\/80, .bg-slate-950, .bg-slate-950\\/95, .bg-slate-950\\/90) :where(.text-white)'),
      'expected .text-white inversion to be scoped strictly to dark slate containers'
    );
  });

  it('ErrorBoundary catches child crash and recovers cleanly on Retry View click', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    let shouldCrash = true;

    const FlakyPanel = () => {
      if (shouldCrash) {
        throw new Error('Simulated solver NaN crash');
      }
      return React.createElement('div', { 'data-testid': 'recovered-panel' }, 'Recovered OK');
    };

    const origError = console.error;
    console.error = () => {};
    try {
      await act(async () => {
        root.render(
          React.createElement(ErrorBoundary, {
            name: 'Test Panel',
            children: React.createElement(FlakyPanel),
          })
        );
      });

      const alertEl = host.querySelector('[role="alert"]');
      assert.ok(alertEl, 'expected ErrorBoundary fallback alert');
      assert.ok(alertEl.textContent?.includes('Simulated solver NaN crash'));

      shouldCrash = false;
      const retryBtn = findButtonByText(host, 'Retry View');
      assert.ok(retryBtn, 'expected Retry View button');

      await act(async () => {
        retryBtn.click();
      });

      assert.ok(host.querySelector('[data-testid="recovered-panel"]'), 'expected recovered child after Retry View');
    } finally {
      console.error = origError;
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it('InteractiveChart renders light/dark plot canvas, toggles Log X & Zoom Out cleanly', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    const sampleData = [
      { f_kHz: 50, eff_pct: 94.2, Ploss_W: 18.5 },
      { f_kHz: 100, eff_pct: 96.4, Ploss_W: 11.2 },
      { f_kHz: 200, eff_pct: 95.8, Ploss_W: 13.1 },
    ];

    await act(async () => {
      root.render(
        React.createElement(InteractiveChart, {
          title: 'Test Sweep',
          xKey: 'f_kHz',
          xLabel: 'Frequency',
          xUnit: 'kHz',
          data: sampleData,
          series: [
            { key: 'eff_pct', name: 'Efficiency', unit: '%', color: '#10b981', axis: 'left' },
            { key: 'Ploss_W', name: 'Loss', unit: 'W', color: '#f59e0b', axis: 'right' },
          ],
        })
      );
    });

    assertAllButtonsAccessible(host, 'InteractiveChart');

    const plotRect = host.querySelector('svg rect');
    assert.ok(plotRect, 'expected SVG plot rect');
    const rectClass = plotRect.getAttribute('class') || '';
    assert.ok(
      rectClass.includes('fill-slate-50') && rectClass.includes('dark:fill-[#090d16]'),
      `expected theme-aware SVG plot background classes, got "${rectClass}"`
    );

    const m1m2Btn = findButtonByText(host, 'M1..M2');
    assert.ok(m1m2Btn, 'expected M1..M2 differential cursor button');
    await act(async () => {
      m1m2Btn.click();
    });
    assert.ok((host.textContent || '').includes('Δ(M2 − M1)'), 'expected M1..M2 differential bar to render Δ(M2 − M1) readout');

    const zoomOutBtn = findButtonByText(host, 'Zoom Out');
    assert.ok(zoomOutBtn, 'expected Zoom Out button');
    await act(async () => {
      zoomOutBtn.click();
    });

    const zoomInBtn = findButtonByText(host, 'In');
    assert.ok(zoomInBtn, 'expected In zoom button');
    await act(async () => {
      zoomInBtn.click();
    });

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('Full <App /> renders in Light & Dark modes, toggles theme, lazy-loads workbenches, and verifies Capacitor + Report buttons', async () => {
    window.localStorage.clear();
    window.localStorage.setItem('pe-studio-theme-mode', 'light');
    document.documentElement.classList.remove('dark');

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(App));
    });
    await flushAsync(80);

    // 1. Light mode baseline + Report button contrast check
    assert.equal(document.documentElement.classList.contains('dark'), false, 'should start in light mode');
    const reportBtn = findButtonByText(host, 'Report');
    assert.ok(reportBtn, 'expected Report button in header');
    assert.ok(
      reportBtn.className.includes('bg-blue-600') && reportBtn.className.includes('text-white'),
      `Report button must keep bg-blue-600 + text-white in light mode, got "${reportBtn.className}"`
    );
    assertAllButtonsAccessible(host, 'App Light Mode (DC-DC Schematic)');

    // 2. Toggle theme Light -> Dark -> System
    const themeBtn = host.querySelector('button[aria-label*="Theme:"]') as HTMLButtonElement | null;
    assert.ok(themeBtn, 'expected Theme toggle button');
    await act(async () => {
      themeBtn.click();
    });
    await flushAsync(30);
    assert.equal(document.documentElement.classList.contains('dark'), true, 'clicking Light theme toggle should activate dark mode');
    assertAllButtonsAccessible(host, 'App Dark Mode (DC-DC Schematic)');

    // Toggle back to Light via two clicks (dark -> system -> light)
    await act(async () => {
      themeBtn.click();
    });
    await act(async () => {
      themeBtn.click();
    });
    await flushAsync(30);
    assert.equal(document.documentElement.classList.contains('dark'), false, 'should return to light mode');

    // 3. Navigate DC-DC Passives -> Capacitors (lazy AllCapacitorsDesigner + CapacitorBankAnalyzer)
    const passivesGroupBtn = findButtonByText(host, 'Passives & EMI');
    assert.ok(passivesGroupBtn, 'expected Passives & EMI group button');
    await act(async () => {
      passivesGroupBtn.click();
    });
    await flushAsync(80);

    const capTabBtn = findButtonByText(host, 'Capacitors');
    assert.ok(capTabBtn, 'expected Capacitors sub-tab');
    await act(async () => {
      capTabBtn.click();
    });
    await flushAsync(150);

    assert.equal(host.querySelector('[role="alert"]'), null, 'Capacitors lazy load must not trip ErrorBoundary');
    const bodyText = host.textContent || '';
    assert.ok(!bodyText.includes('ΜF') && !bodyText.includes('KHZ'), 'SI unit casing must not uppercase µF/kHz');
    assert.ok(bodyText.includes('µF') && bodyText.includes('kHz'), 'expected lowercase SI units µF and kHz');

    // Click "+ Add Parallel Branch" inside AllCapacitorsDesigner
    const addBranchBtn = findButtonByText(host, 'Add Parallel Branch');
    assert.ok(addBranchBtn, 'expected Add Parallel Branch button in AllCapacitorsDesigner');
    const branchRowsBefore = host.querySelectorAll('tbody tr').length;
    await act(async () => {
      addBranchBtn.click();
    });
    await flushAsync(30);
    const branchRowsAfter = host.querySelectorAll('tbody tr').length;
    assert.ok(branchRowsAfter >= branchRowsBefore + 1, 'Add Branch should insert a capacitor branch row');

    // Switch to CapacitorBankAnalyzer ("Output & Bus Ripple Stress Lab") and exercise chart tabs
    const stressLabBtn = findButtonByText(host, 'Output & Bus Ripple Stress Lab');
    assert.ok(stressLabBtn, 'expected Output & Bus Ripple Stress Lab button');
    await act(async () => {
      stressLabBtn.click();
    });
    await flushAsync(150);

    assert.equal(host.querySelector('[role="alert"]'), null, 'CapacitorBankAnalyzer lazy load must not trip ErrorBoundary');
    assertAllButtonsAccessible(host, 'CapacitorBankAnalyzer');
    for (const tabLabel of ['RMS Ripple vs. Load', 'L10 Life vs. Temperature', 'Bank Impedance |Z(f)|']) {
      const tab = findButtonByText(host, tabLabel);
      assert.ok(tab, `expected segmented chart tab "${tabLabel}"`);
      await act(async () => {
        tab.click();
      });
    }

    // 4. Lazy-load AC-DC PFC Workbench and Small-Signal Lab
    const acdcBtn = findButtonByText(host, 'AC-DC PFC');
    assert.ok(acdcBtn, 'expected AC-DC PFC domain button');
    await act(async () => {
      acdcBtn.click();
    });
    await flushAsync(150);
    assert.equal(host.querySelector('[role="alert"]'), null, 'AC-DC Workbench lazy load must not trip ErrorBoundary');
    assertAllButtonsAccessible(host, 'AC-DC Workbench');

    const smallSignalBtn = findButtonByText(host, 'Small-Signal');
    assert.ok(smallSignalBtn, 'expected Small-Signal domain button');
    await act(async () => {
      smallSignalBtn.click();
    });
    await flushAsync(150);
    assert.equal(host.querySelector('[role="alert"]'), null, 'Small-Signal Lab lazy load must not trip ErrorBoundary');

    // 5. Open Lazy DesignReportModal via Report button
    await act(async () => {
      reportBtn.click();
    });
    for (let i = 0; i < 20; i++) {
      if (host.querySelector('[aria-label="Engineering Design Report Book"]')) break;
      await flushAsync(50);
    }
    assert.equal(host.querySelector('[role="alert"]'), null, 'DesignReportModal lazy load must not trip ErrorBoundary');
    const reportDialog = host.querySelector('[aria-label="Engineering Design Report Book"]');
    assert.ok(reportDialog, 'expected lazy DesignReportModal dialog to appear after clicking Report');
    assert.ok(
      (reportDialog.textContent || '').includes('Engineering Design Book'),
      'expected DesignReportModal heading text'
    );
    assertAllButtonsAccessible(reportDialog, 'DesignReportModal');

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
